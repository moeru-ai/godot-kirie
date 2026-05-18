class_name GdKirie
extends Object

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value: Variant)
signal ipc_error(error: String)

const PLUGIN_SINGLETON_NAME := "Kirie"

var _plugin_singleton = null


func _init() -> void:
	if Engine.has_singleton(PLUGIN_SINGLETON_NAME):
		_plugin_singleton = Engine.get_singleton(PLUGIN_SINGLETON_NAME)
		print("[Kirie][gd] platform singleton detected")
		_connect_plugin_signals()
		return

	print("[Kirie][gd] platform singleton unavailable")


func create_webview(options: Dictionary = {}) -> void:
	if not _ensure_plugin_singleton("create_webview"):
		return

	var initial_url := ""
	if options.has("initial_url"):
		initial_url = str(options["initial_url"])

	print("[Kirie][gd] create_webview initial_url=%s" % initial_url)
	_plugin_singleton.createWebView(initial_url)


func destroy_webview() -> void:
	if not _ensure_plugin_singleton("destroy_webview"):
		return

	print("[Kirie][gd] destroy_webview")
	_plugin_singleton.destroyWebView()


func load_url(url: String) -> void:
	if not _ensure_plugin_singleton("load_url"):
		return

	print("[Kirie][gd] load_url url=%s" % url)
	_plugin_singleton.loadUrl(url)


func load_html_string(html: String, base_url: String = "") -> void:
	if not _ensure_plugin_singleton("load_html_string"):
		return

	print("[Kirie][gd] load_html_string bytes=%d base_url=%s" % [html.length(), base_url])
	_plugin_singleton.loadHtmlString(html, base_url)


func send_text(message: String) -> void:
	if not _ensure_plugin_singleton("send_text"):
		return

	print("[Kirie][gd] send_text bytes=%d" % message.length())
	_plugin_singleton.sendText(message)


func send_binary(bytes: PackedByteArray) -> void:
	if not _ensure_plugin_singleton("send_binary"):
		return

	print("[Kirie][gd] send_binary bytes=%d" % bytes.size())
	_plugin_singleton.sendBinary(bytes)


func send_data(value: Variant) -> void:
	if not _ensure_plugin_singleton("send_data"):
		return

	print("[Kirie][gd] send_data %s" % str(value))
	# Android plugin methods are registered by concrete JVM parameter type.
	# Godot does not expose a Kotlin-side Variant parameter type, and JVM Object
	# parameters do not reliably carry Variant containers. Use Godot's supported
	# Dictionary conversion path as a private carrier, then unwrap on Android
	# before CBOR encoding.
	var value_type := typeof(value)
	if value_type not in [
		TYPE_NIL,
		TYPE_BOOL,
		TYPE_INT,
		TYPE_FLOAT,
		TYPE_STRING,
		TYPE_ARRAY,
		TYPE_DICTIONARY,
	]:
		push_error("Unsupported Kirie data type: %s" % type_string(value_type))
		return

	_plugin_singleton.sendData({"value": value})


func get_launch_option(key: String) -> String:
	if not _ensure_plugin_singleton("get_launch_option"):
		return ""

	var value := str(_plugin_singleton.getLaunchOption(key))
	print("[Kirie][gd] get_launch_option key=%s value=%s" % [key, value])
	return value


func is_available() -> bool:
	return _plugin_singleton != null


func _connect_plugin_signals() -> void:
	if _plugin_singleton == null:
		return

	if OS.get_name() == "iOS":
		print("[Kirie][gd] registering iOS callbacks")
		var webview_ready_callback := Callable(self, "_on_plugin_webview_ready")
		var text_received_callback := Callable(self, "_on_plugin_text_received")
		var ipc_error_callback := Callable(self, "_on_plugin_ipc_error")
		_plugin_singleton.registerCallbacks(
			webview_ready_callback, text_received_callback, ipc_error_callback
		)
		return

	if _plugin_singleton.has_signal(&"webview_ready"):
		print("[Kirie][gd] connecting Android webview_ready signal")
		_plugin_singleton.webview_ready.connect(_on_plugin_webview_ready)

	if _plugin_singleton.has_signal(&"text_received"):
		print("[Kirie][gd] connecting Android text_received signal")
		_plugin_singleton.text_received.connect(_on_plugin_text_received)

	if _plugin_singleton.has_signal(&"binary_received"):
		print("[Kirie][gd] connecting Android binary_received signal")
		_plugin_singleton.binary_received.connect(_on_plugin_binary_received)

	if _plugin_singleton.has_signal(&"data_received"):
		print("[Kirie][gd] connecting Android data_received signal")
		_plugin_singleton.data_received.connect(_on_plugin_data_received)

	if _plugin_singleton.has_signal(&"ipc_error"):
		print("[Kirie][gd] connecting Android ipc_error signal")
		_plugin_singleton.ipc_error.connect(_on_plugin_ipc_error)


func _ensure_plugin_singleton(method_name: String) -> bool:
	if _plugin_singleton != null:
		return true

	var error := "Kirie platform singleton is not available for %s()" % method_name
	push_warning(error)
	ipc_error.emit(error)
	return false


func _on_plugin_webview_ready() -> void:
	print("[Kirie][gd] signal webview_ready")
	webview_ready.emit()


func _on_plugin_text_received(message: String) -> void:
	print("[Kirie][gd] signal text_received %s" % message)
	text_received.emit(message)


func _on_plugin_binary_received(bytes: PackedByteArray) -> void:
	print("[Kirie][gd] signal binary_received bytes=%d" % bytes.size())
	binary_received.emit(bytes)


func _on_plugin_data_received(value: Variant) -> void:
	print("[Kirie][gd] signal data_received %s" % str(value))
	data_received.emit(value)


func _on_plugin_ipc_error(error: String) -> void:
	print("[Kirie][gd] signal ipc_error %s" % error)
	ipc_error.emit(error)
