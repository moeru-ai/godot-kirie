package ai.moeru.kirie.android

import android.util.Log
import org.godotengine.godot.Godot
import org.godotengine.godot.plugin.GodotPlugin
import org.godotengine.godot.plugin.UsedByGodot

class KirieAndroidPlugin(godot: Godot) : GodotPlugin(godot) {

    private val webViewManager by lazy {
        KirieWebViewManager(
            activityProvider = { activity },
            onIpcMessage = ::handleIpcMessage,
            onIpcError = ::handleIpcError,
        )
    }

    override fun getPluginName(): String = BuildConfig.GODOT_PLUGIN_NAME

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
    fun sendIpcMessage(messageJson: String) {
        webViewManager.sendIpcMessage(messageJson)
    }

    private fun handleIpcMessage(messageJson: String) {
        Log.d(pluginName, "ipc_message_received message=$messageJson")
        // TODO: Register and emit Godot plugin signals once the bridge surface is finalized.
    }

    private fun handleIpcError(message: String) {
        Log.e(pluginName, "ipc_error message=$message")
        // TODO: Register and emit Godot plugin signals once the bridge surface is finalized.
    }
}
