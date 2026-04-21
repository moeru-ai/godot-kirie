package ai.moeru.kirie.android

import android.webkit.JavascriptInterface

class KirieJavascriptBridge(
    private val onIpcMessage: (messageJson: String) -> Unit,
    private val onIpcError: (message: String) -> Unit,
) {

    @JavascriptInterface
    fun postMessage(messageJson: String?) {
        if (messageJson == null) {
            onIpcError("Received null IPC message from JavaScript")
            return
        }

        onIpcMessage(messageJson)
    }

    companion object {
        const val BRIDGE_NAME = "KirieAndroidBridge"
    }
}
