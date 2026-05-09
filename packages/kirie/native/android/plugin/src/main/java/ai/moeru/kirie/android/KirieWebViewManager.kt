package ai.moeru.kirie.android

import android.app.Activity
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout

class KirieWebViewManager(
    private val activityProvider: () -> Activity?,
    private val onWebViewReady: () -> Unit,
    private val onIpcMessage: (messageJson: String) -> Unit,
    private val onIpcError: (message: String) -> Unit,
) {
    private var webView: WebView? = null

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
            val javascriptBridge =
                KirieJavascriptBridge(
                    onIpcMessage = onIpcMessage,
                    onIpcError = onIpcError,
                )

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

            createdWebView.addJavascriptInterface(javascriptBridge, KirieJavascriptBridge.BRIDGE_NAME)
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

    fun sendIpcMessage(messageJson: String) {
        val activity = activityProvider()
        if (activity == null) {
            onIpcError("Cannot send IPC message because the host activity is not available")
            return
        }

        runOnUiThread {
            val existingWebView = webView
            if (existingWebView == null) {
                onIpcError("Cannot send IPC message because the WebView does not exist")
                return@runOnUiThread
            }

            val script =
                """
                window.dispatchEvent(new CustomEvent("kirie:ipc-message", { detail: $messageJson }));
                """.trimIndent()

            existingWebView.evaluateJavascript(script, null)
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

    private fun WebView.removeFromSuperview() {
        val parentViewGroup = parent as? ViewGroup ?: return
        parentViewGroup.removeView(this)
    }
}
