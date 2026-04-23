package ai.moeru.kirie.android

import android.util.Log
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

class KirieAndroidPlugin(godot: Godot) : GodotPlugin(godot) {

    private val webViewManager by lazy {
        KirieWebViewManager(
            activityProvider = { activity },
            onWebViewReady = ::handleWebViewReady,
            onIpcMessage = ::handleIpcMessage,
            onIpcError = ::handleIpcError,
        )
    }

    override fun getPluginName(): String = BuildConfig.GODOT_PLUGIN_NAME

    override fun getPluginSignals(): Set<SignalInfo> {
        return setOf(
            SIGNAL_WEBVIEW_READY,
            SIGNAL_IPC_MESSAGE_RECEIVED,
            SIGNAL_IPC_ERROR,
        )
    }

    @UsedByGodot
    fun createWebView(initialUrl: String) {
        webViewManager.createWebView(initialUrl.ifBlank { null })
    }

    @UsedByGodot
    fun destroyWebView() {
        webViewManager.destroyWebView()
    }

    @UsedByGodot
    fun loadUrl(url: String) {
        webViewManager.loadUrl(url)
    }

    @UsedByGodot
    fun loadHtmlString(html: String, baseUrl: String) {
        webViewManager.loadHtmlString(html, baseUrl.ifBlank { null })
    }

    @UsedByGodot
    fun sendIpcMessage(messageJson: String) {
        webViewManager.sendIpcMessage(messageJson)
    }

    private fun handleWebViewReady() {
        emitSignal(SIGNAL_WEBVIEW_READY)
    }

    private fun handleIpcMessage(messageJson: String) {
        Log.d(pluginName, "ipc_message_received message=$messageJson")
        emitSignal(SIGNAL_IPC_MESSAGE_RECEIVED, messageJson)
    }

    private fun handleIpcError(message: String) {
        Log.e(pluginName, "ipc_error message=$message")
        emitSignal(SIGNAL_IPC_ERROR, message)
    }

    companion object {
        private val SIGNAL_WEBVIEW_READY = SignalInfo("webview_ready")
        private val SIGNAL_IPC_MESSAGE_RECEIVED = SignalInfo("ipc_message_received", String::class.java)
        private val SIGNAL_IPC_ERROR = SignalInfo("ipc_error", String::class.java)
    }
}
