package ai.moeru.kirie.android

import android.app.Activity
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class KirieWebViewManager(
    private val activityProvider: () -> Activity?,
    private val onWebViewReady: () -> Unit,
    private val onTextPacket: (bytes: ByteArray) -> Unit,
    private val onBinaryPacket: (bytes: ByteArray) -> Unit,
    private val onDataPacket: (bytes: ByteArray) -> Unit,
    private val onIpcError: (message: String) -> Unit,
) {
    private var webView: WebView? = null
    private var textReplyProxy: JavaScriptReplyProxy? = null
    private var binaryReplyProxy: JavaScriptReplyProxy? = null
    private var dataReplyProxy: JavaScriptReplyProxy? = null

    fun createWebView(initialUrl: String?) {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot create WebView because the host activity is not available")
            return
        }

        runOnUiThread {
            val existingWebView = webView
            if (existingWebView != null) {
                if (!initialUrl.isNullOrBlank()) {
                    loadResolvedUrl(existingWebView, initialUrl)
                }
                return@runOnUiThread
            }

            val rootView = activity.findViewById<ViewGroup>(android.R.id.content).rootView as FrameLayout
            val createdWebView = WebView(activity)

            createdWebView.layoutParams =
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            createdWebView.setBackgroundColor(Color.TRANSPARENT)
            createdWebView.settings.javaScriptEnabled = true
            createdWebView.settings.domStorageEnabled = true

            val runtimeConfig = KirieRuntimeConfig.from(activity)
            if (runtimeConfig.enableWebInspector) {
                WebView.setWebContentsDebuggingEnabled(true)
            }

            if (!installMessageChannels(createdWebView)) {
                return@runOnUiThread
            }
            if (!installRuntimeScript(createdWebView)) {
                return@runOnUiThread
            }

            createdWebView.webViewClient =
                DebugTlsBypassWebViewClient(
                    serverUrl = initialUrl,
                    allowTlsBypass = runtimeConfig.allowTlsBypass,
                    assetRequestHandler = KirieAssetRequestHandler(activity.assets),
                )

            rootView.addView(createdWebView)
            webView = createdWebView
            onWebViewReady()

            if (!initialUrl.isNullOrBlank()) {
                loadResolvedUrl(createdWebView, initialUrl)
            }
        }
    }

    fun destroyWebView() {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot destroy WebView because the host activity is not available")
            return
        }

        runOnUiThread {
            val existingWebView = webView ?: return@runOnUiThread
            webView = null
            textReplyProxy = null
            binaryReplyProxy = null
            dataReplyProxy = null
            existingWebView.stopLoading()
            existingWebView.removeFromSuperview()
            existingWebView.destroy()
        }
    }

    fun loadUrl(url: String) {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot load URL because the host activity is not available")
            return
        }

        runOnUiThread {
            val existingWebView = webView
            if (existingWebView == null) {
                onIpcError("Cannot load URL because the WebView does not exist")
                return@runOnUiThread
            }

            loadResolvedUrl(existingWebView, url)
        }
    }

    fun loadHtmlString(
        html: String,
        baseUrl: String?,
    ) {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot load HTML string because the host activity is not available")
            return
        }

        runOnUiThread {
            val existingWebView = webView
            if (existingWebView == null) {
                onIpcError("Cannot load HTML string because the WebView does not exist")
                return@runOnUiThread
            }

            existingWebView.loadDataWithBaseURL(baseUrl, html, "text/html", "utf-8", null)
        }
    }

    fun sendTextPacket(bytes: ByteArray) = sendBytes(bytes, textReplyProxy, "text")

    fun sendBinaryPacket(bytes: ByteArray) = sendBytes(bytes, binaryReplyProxy, "binary")

    fun sendDataPacket(bytes: ByteArray) = sendBytes(bytes, dataReplyProxy, "data")

    private fun sendBytes(
        bytes: ByteArray,
        replyProxy: JavaScriptReplyProxy?,
        channelName: String,
    ) {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot send $channelName because the host activity is not available")
            return
        }

        runOnUiThread {
            if (replyProxy == null) {
                onIpcError("Cannot send $channelName because the WebView $channelName channel is not ready")
                return@runOnUiThread
            }

            replyProxy.postMessage(bytes)
        }
    }

    private fun runOnUiThread(block: () -> Unit) {
        val activity = activityProvider() ?: return
        activity.runOnUiThread(block)
    }

    private fun loadResolvedUrl(
        webView: WebView,
        url: String,
    ) {
        val resolvedUrl =
            try {
                KirieUrlResolver.resolveForWebView(url)
            } catch (error: IllegalArgumentException) {
                onIpcError(error.message ?: "Cannot load URL: $url")
                return
            }

        webView.loadUrl(resolvedUrl)
    }

    private fun installMessageChannels(webView: WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            onIpcError("Android WebView does not support WebMessageListener")
            return false
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
            onIpcError("Android WebView does not support ArrayBuffer messages")
            return false
        }

        val origins = setOf("*")
        installBytesChannel(webView, TEXT_CHANNEL, origins, { textReplyProxy = it }, onTextPacket)
        installBytesChannel(webView, BINARY_CHANNEL, origins, { binaryReplyProxy = it }, onBinaryPacket)
        installBytesChannel(webView, DATA_CHANNEL, origins, { dataReplyProxy = it }, onDataPacket)
        return true
    }

    private fun installRuntimeScript(webView: WebView): Boolean {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            onIpcError("Android WebView does not support document-start scripts")
            return false
        }

        WebViewCompat.addDocumentStartJavaScript(webView, KIRIE_RUNTIME_SCRIPT, setOf("*"))
        return true
    }

    private fun installBytesChannel(
        webView: WebView,
        name: String,
        origins: Set<String>,
        setReplyProxy: (JavaScriptReplyProxy) -> Unit,
        onMessage: (ByteArray) -> Unit,
    ) = WebViewCompat.addWebMessageListener(webView, name, origins) { _, message, _, isMainFrame, replyProxy ->
        if (!isMainFrame) {
            return@addWebMessageListener
        }
        setReplyProxy(replyProxy)
        if (message.type != WebMessageCompat.TYPE_ARRAY_BUFFER) {
            onIpcError("Received non-binary message on $name")
            return@addWebMessageListener
        }
        val packet = message.arrayBuffer
        if (packet.isEmpty()) {
            return@addWebMessageListener
        }
        onMessage(packet)
    }

    private fun WebView.removeFromSuperview() {
        val parentViewGroup = parent as? ViewGroup ?: return
        parentViewGroup.removeView(this)
    }

    companion object {
        private const val TEXT_CHANNEL = "KirieTextChannel"
        private const val BINARY_CHANNEL = "KirieBinaryChannel"
        private const val DATA_CHANNEL = "KirieDataChannel"
        private val KIRIE_RUNTIME_SCRIPT =
            """
            (() => {
              globalThis.kirie ??= {};
              globalThis.kirie.platform = {
                os: "android",
                backend: "webview",
              };
            })();
            """.trimIndent()
    }
}
