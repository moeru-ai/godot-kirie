package ai.moeru.kirie.android

import android.util.Log
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import com.fasterxml.jackson.dataformat.cbor.CBORFactory
import org.godotengine.godot.Dictionary
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
            SIGNAL_TEXT_RECEIVED,
            SIGNAL_BINARY_RECEIVED,
            SIGNAL_DATA_RECEIVED,
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
    fun sendText(message: String) {
        webViewManager.sendTextPacket(cborMapper.writeValueAsBytes(message))
    }

    @UsedByGodot
    fun sendBinary(bytes: ByteArray) {
        webViewManager.sendBinaryPacket(cborMapper.writeValueAsBytes(bytes))
    }

    @UsedByGodot
    fun sendData(value: Any?) {
        webViewManager.sendDataPacket(cborMapper.writeValueAsBytes(value.toJsonNode()))
    }

    @UsedByGodot
    fun getLaunchOption(key: String): String = activity?.intent?.getStringExtra(key).orEmpty()

    private fun handleWebViewReady() {
        emitSignal(SIGNAL_WEBVIEW_READY)
    }

    private fun handleTextPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_TEXT_RECEIVED, cborMapper.readValue(bytes, String::class.java))
    }

    private fun handleBinaryPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_BINARY_RECEIVED, cborMapper.readValue(bytes, ByteArray::class.java))
    }

    private fun handleDataPacket(bytes: ByteArray) {
        emitSignal(SIGNAL_DATA_RECEIVED, cborMapper.readTree(bytes).toGodotVariant())
    }

    private fun handleIpcError(message: String) {
        Log.e(pluginName, "ipc_error message=$message")
        emitSignal(SIGNAL_IPC_ERROR, message)
    }

    companion object {
        private val cborMapper = ObjectMapper(CBORFactory())

        private val SIGNAL_WEBVIEW_READY = SignalInfo("webview_ready")
        private val SIGNAL_TEXT_RECEIVED = SignalInfo("text_received", String::class.java)
        private val SIGNAL_BINARY_RECEIVED = SignalInfo("binary_received", ByteArray::class.java)
        private val SIGNAL_DATA_RECEIVED = SignalInfo("data_received", Any::class.java)
        private val SIGNAL_IPC_ERROR = SignalInfo("ipc_error", String::class.java)
    }
}

private fun Any?.toJsonNode(): JsonNode {
    val nodeFactory = JsonNodeFactory.instance
    return when (this) {
        null -> nodeFactory.nullNode()
        is Boolean -> nodeFactory.booleanNode(this)
        is String -> nodeFactory.textNode(this)
        is Byte -> nodeFactory.numberNode(this.toInt())
        is Short -> nodeFactory.numberNode(this.toInt())
        is Int -> nodeFactory.numberNode(this)
        is Long -> nodeFactory.numberNode(this)
        is Float -> nodeFactory.numberNode(this.toDouble())
        is Double -> nodeFactory.numberNode(this)
        is Dictionary -> toJsonObject()
        is Map<*, *> -> toJsonObject()
        is Array<*> -> toJsonArray()
        is Iterable<*> -> toJsonArray()
        else -> throw IllegalArgumentException("Unsupported Kirie data type: ${this::class.java.name}")
    }
}

private fun Dictionary.toJsonObject(): JsonNode {
    val node = JsonNodeFactory.instance.objectNode()
    for (key in keys) {
        require(key is String) { "Kirie data maps only support string keys" }
        node.set<JsonNode>(key, this[key].toJsonNode())
    }
    return node
}

private fun Map<*, *>.toJsonObject(): JsonNode {
    val node = JsonNodeFactory.instance.objectNode()
    for ((key, value) in this) {
        require(key is String) { "Kirie data maps only support string keys" }
        node.set<JsonNode>(key, value.toJsonNode())
    }
    return node
}

private fun Array<*>.toJsonArray(): JsonNode {
    val node = JsonNodeFactory.instance.arrayNode()
    for (item in this) {
        node.add(item.toJsonNode())
    }
    return node
}

private fun Iterable<*>.toJsonArray(): JsonNode {
    val node = JsonNodeFactory.instance.arrayNode()
    for (item in this) {
        node.add(item.toJsonNode())
    }
    return node
}

private fun JsonNode.toGodotVariant(): Any? =
    when {
        isNull -> {
            null
        }

        isBoolean -> {
            booleanValue()
        }

        isTextual -> {
            textValue()
        }

        isIntegralNumber -> {
            longValue().toGodotInteger()
        }

        isFloatingPointNumber -> {
            doubleValue()
        }

        isArray -> {
            val items = ArrayList<Any?>()
            for (item in this) {
                items.add(item.toGodotVariant())
            }
            items.toTypedArray()
        }

        isObject -> {
            val dictionary = Dictionary()
            for (property in properties()) {
                dictionary[property.key] = property.value.toGodotVariant()
            }
            dictionary
        }

        else -> {
            throw IllegalArgumentException("Unsupported Kirie data node: ${nodeType.name}")
        }
    }

private fun Long.toGodotInteger(): Any =
    if (this in Int.MIN_VALUE..Int.MAX_VALUE) {
        toInt()
    } else {
        this
    }
