package ai.moeru.kirie.android

import android.util.Log
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.SignalInfo
import org.godotengine.godot.plugin.UsedByGodot

class KirieAndroidPlugin(
    godot: Godot,
) : GodotPlugin(godot) {
    private val webViewManager by lazy {
        KirieWebViewManager(
            activityProvider = { activity },
            onWebViewReady = ::handleWebViewReady,
            onTextPacket = ::handleTextPacket,
            onBinaryPacket = ::handleBinaryPacket,
            onDataPacket = ::handleDataPacket,
            onIpcError = ::handleIpcError,
        )
    }

    override fun getPluginName(): String = BuildConfig.GODOT_PLUGIN_NAME

    override fun getPluginSignals(): Set<SignalInfo> =
        setOf(
            SIGNAL_WEBVIEW_READY,
            SIGNAL_TEXT_PACKET_RECEIVED,
            SIGNAL_BINARY_PACKET_RECEIVED,
            SIGNAL_DATA_PACKET_RECEIVED,
            SIGNAL_IPC_ERROR,
        )

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
    fun loadHtmlString(
        html: String,
        baseUrl: String,
    ) {
        webViewManager.loadHtmlString(html, baseUrl.ifBlank { null })
    }

    @UsedByGodot
    fun sendTextPacket(bytes: ByteArray) {
        webViewManager.sendTextPacket(bytes)
    }

    @UsedByGodot
    fun sendBinaryPacket(bytes: ByteArray) {
        webViewManager.sendBinaryPacket(bytes)
    }

    @UsedByGodot
    fun sendDataPacket(bytes: ByteArray) {
        webViewManager.sendDataPacket(bytes)
    }

    @UsedByGodot
    fun getLaunchOption(key: String): String = activity?.intent?.getStringExtra(key).orEmpty()

    private fun handleWebViewReady() {
        emitSignal(SIGNAL_WEBVIEW_READY)
    }

    private fun handleTextPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_TEXT_PACKET_RECEIVED, bytes)
    }

    private fun handleBinaryPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_BINARY_PACKET_RECEIVED, bytes)
    }

    private fun handleDataPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_DATA_PACKET_RECEIVED, bytes)
    }

    private fun handleIpcError(message: String) {
        Log.e(pluginName, "ipc_error message=$message")
        emitSignal(SIGNAL_IPC_ERROR, message)
    }

    companion object {
        private val SIGNAL_WEBVIEW_READY = SignalInfo("webview_ready")
        private val SIGNAL_TEXT_PACKET_RECEIVED = SignalInfo("text_packet_received", ByteArray::class.java)
        private val SIGNAL_BINARY_PACKET_RECEIVED = SignalInfo("binary_packet_received", ByteArray::class.java)
        private val SIGNAL_DATA_PACKET_RECEIVED = SignalInfo("data_packet_received", ByteArray::class.java)
        private val SIGNAL_IPC_ERROR = SignalInfo("ipc_error", String::class.java)
    }
}
