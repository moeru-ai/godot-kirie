class_name GdKirie
extends Object

const PLUGIN_SINGLETON_NAME := "Kirie"

signal webview_ready()
signal ipc_message_received(message: Variant)
signal ipc_error(error: String)

var _plugin_singleton = null


func _init() -> void:
	if Engine.has_singleton(PLUGIN_SINGLETON_NAME):
		_plugin_singleton = Engine.get_singleton(PLUGIN_SINGLETON_NAME)
		_connect_plugin_signals()


func create_webview(options: Dictionary = {}) -> void:
	if not _ensure_plugin_singleton("create_webview"):
		return

	var initial_url := ""
	if options.has("initial_url"):
		initial_url = str(options["initial_url"])

	_plugin_singleton.createWebView(initial_url)


func destroy_webview() -> void:
	if not _ensure_plugin_singleton("destroy_webview"):
		return

	_plugin_singleton.destroyWebView()


func load_url(url: String) -> void:
	if not _ensure_plugin_singleton("load_url"):
		return

	_plugin_singleton.loadUrl(url)


func load_html_string(html: String, base_url: String = "") -> void:
	if not _ensure_plugin_singleton("load_html_string"):
		return

	_plugin_singleton.loadHtmlString(html, base_url)


func send_ipc_message(message: Variant) -> void:
	if not _ensure_plugin_singleton("send_ipc_message"):
		return

	_plugin_singleton.sendIpcMessage(JSON.stringify(message))


func is_available() -> bool:
	return _plugin_singleton != null


func _connect_plugin_signals() -> void:
	if _plugin_singleton == null:
		return

	if OS.get_name() == "iOS":
		_plugin_singleton.registerCallbacks(
			Callable(self, "_on_plugin_webview_ready"),
			Callable(self, "_on_plugin_ipc_message_received"),
			Callable(self, "_on_plugin_ipc_error"),
		)
		return

	if _plugin_singleton.has_signal(&"webview_ready"):
		_plugin_singleton.webview_ready.connect(_on_plugin_webview_ready)

	if _plugin_singleton.has_signal(&"ipc_message_received"):
		_plugin_singleton.ipc_message_received.connect(_on_plugin_ipc_message_received)

	if _plugin_singleton.has_signal(&"ipc_error"):
		_plugin_singleton.ipc_error.connect(_on_plugin_ipc_error)


func _ensure_plugin_singleton(method_name: String) -> bool:
	if _plugin_singleton != null:
		return true

	var error := "Kirie platform singleton is not available for %s()" % method_name
	push_warning(error)
	ipc_error.emit(error)
	return false


func _on_plugin_webview_ready() -> void:
	webview_ready.emit()


func _on_plugin_ipc_message_received(message_json: String) -> void:
	var parsed_message := JSON.parse_string(message_json)
	if parsed_message == null and message_json != "null":
		ipc_message_received.emit(message_json)
		return

	ipc_message_received.emit(parsed_message)


func _on_plugin_ipc_error(error: String) -> void:
	ipc_error.emit(error)
