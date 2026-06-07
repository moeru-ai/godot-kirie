class_name GdKirie
extends Object

signal webview_ready
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value: Variant)
signal ipc_error(error: String)

const PLUGIN_SINGLETON_NAME := "Kirie"
const GodotCefConfig = preload("res://addons/kirie/godot_cef_config.gd")
const GODOT_CEF_PRELOAD_SCRIPT := """
globalThis.kirie ??= {};
globalThis.kirie.platform = Object.freeze({
  os: %s,
  backend: "godot-cef",
});
"""

var _plugin_singleton = null
var _godot_cef_config: Dictionary = {}


func _init() -> void:
	if Engine.has_singleton(PLUGIN_SINGLETON_NAME):
		_plugin_singleton = Engine.get_singleton(PLUGIN_SINGLETON_NAME)
		print("[Kirie][gd] platform singleton detected")
		_connect_plugin_signals()
		return

	if _is_desktop_os():
		_initialize_desktop_cef_backend()
		return

	print("[Kirie][gd] platform singleton unavailable")


func create_webview(options: Dictionary = {}) -> void:
	if not _ensure_plugin_singleton("create_webview"):
		return

	var initial_url := ""
	if options.has("initial_url"):
		initial_url = str(options["initial_url"])

	print("[Kirie][gd] create_webview initial_url=%s" % initial_url)
	if _is_godot_cef_backend():
		_create_cef_webview(initial_url)
		return

	_plugin_singleton.createWebView(initial_url)


func destroy_webview() -> void:
	if not _ensure_plugin_singleton("destroy_webview"):
		return

	print("[Kirie][gd] destroy_webview")
	if _is_godot_cef_backend():
		_destroy_cef_webview()
		return

	_plugin_singleton.destroyWebView()


func load_url(url: String) -> void:
	if not _ensure_plugin_singleton("load_url"):
		return

	print("[Kirie][gd] load_url url=%s" % url)
	if _is_godot_cef_backend():
		_plugin_singleton.set("url", url)
		return

	_plugin_singleton.loadUrl(url)


func load_html_string(html: String, base_url: String = "") -> void:
	if not _ensure_plugin_singleton("load_html_string"):
		return

	print("[Kirie][gd] load_html_string bytes=%d base_url=%s" % [html.length(), base_url])
	if _is_godot_cef_backend():
		push_error("Kirie Godot CEF backend does not support load_html_string() yet")
		return

	_plugin_singleton.loadHtmlString(html, base_url)


func send_text(message: String) -> void:
	if not _ensure_plugin_singleton("send_text"):
		return

	print("[Kirie][gd] send_text bytes=%d" % message.length())
	if _is_godot_cef_backend():
		_plugin_singleton.call("send_ipc_message", message)
		return

	_plugin_singleton.sendText(message)


func send_binary(bytes: PackedByteArray) -> void:
	if not _ensure_plugin_singleton("send_binary"):
		return

	print("[Kirie][gd] send_binary bytes=%d" % bytes.size())
	if _is_godot_cef_backend():
		_plugin_singleton.call("send_ipc_binary_message", bytes)
		return

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
	if (
		value_type
		not in [
			TYPE_NIL,
			TYPE_BOOL,
			TYPE_INT,
			TYPE_FLOAT,
			TYPE_STRING,
			TYPE_ARRAY,
			TYPE_DICTIONARY,
		]
	):
		push_error("Unsupported Kirie data type: %s" % type_string(value_type))
		return

	if _is_godot_cef_backend():
		_plugin_singleton.call("send_ipc_data", value)
		return

	_plugin_singleton.sendData({"value": value})


func get_launch_option(key: String) -> String:
	if not _ensure_plugin_singleton("get_launch_option"):
		return ""

	if _is_godot_cef_backend():
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
			webview_ready_callback,
			text_received_callback,
			Callable(self, "_on_plugin_binary_received"),
			Callable(self, "_on_plugin_data_received"),
			ipc_error_callback
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


func _is_godot_cef_backend() -> bool:
	var cef_class_name := str(_godot_cef_config.get("class_name", ""))
	return (
		_plugin_singleton != null
		and cef_class_name != ""
		and _plugin_singleton.is_class(cef_class_name)
	)


func _initialize_desktop_cef_backend() -> void:
	_godot_cef_config = GodotCefConfig.load()
	var cef_class_name := str(_godot_cef_config["class_name"])
	if not ClassDB.class_exists(cef_class_name):
		var message := (
			"Kirie desktop backend requires Godot CEF %s. Install it with: %s %s"
			% [
				_godot_cef_config["version"],
				_godot_cef_config["setup_command"],
				ProjectSettings.globalize_path("res://"),
			]
		)
		push_error(message)
		var tree := Engine.get_main_loop() as SceneTree
		if tree != null:
			tree.quit(1)
		return

	var cef_backend := ClassDB.instantiate(cef_class_name) as Node
	if cef_backend == null:
		var error := "Failed to instantiate Godot CEF %s" % cef_class_name
		ipc_error.emit(error)
		return

	_plugin_singleton = cef_backend
	_plugin_singleton.name = "KirieCefWebView"
	var preload_script := GODOT_CEF_PRELOAD_SCRIPT % JSON.stringify(_desktop_platform_os())
	_set_cef_property_if_present("preload_script", preload_script)
	_set_cef_property_if_present("background_color", Color.TRANSPARENT)
	_connect_cef_signals()


func _is_desktop_os() -> bool:
	return OS.get_name() in ["macOS", "Windows", "Linux", "FreeBSD", "NetBSD", "OpenBSD", "BSD"]


func _create_cef_webview(initial_url: String) -> void:
	var browser := _plugin_singleton as Node
	if browser == null:
		var error := "Cannot create Godot CEF WebView because the desktop backend does not exist"
		ipc_error.emit(error)
		return

	if browser.get_parent() != null:
		if initial_url != "":
			browser.set("url", initial_url)
		call_deferred("_emit_cef_webview_ready")
		return

	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		var error := "Cannot create Godot CEF WebView because no scene tree is available"
		ipc_error.emit(error)
		return

	call_deferred("_add_cef_webview_to_scene", initial_url)


func _add_cef_webview_to_scene(initial_url: String) -> void:
	var browser := _plugin_singleton as Node
	if browser == null:
		return

	if browser.get_parent() == null:
		var tree := Engine.get_main_loop() as SceneTree
		if tree == null:
			var error := "Cannot create Godot CEF WebView because no scene tree is available"
			ipc_error.emit(error)
			return

		tree.root.add_child(browser)

	_configure_cef_layout()

	if initial_url != "":
		browser.set("url", initial_url)

	_emit_cef_webview_ready()


func _destroy_cef_webview() -> void:
	var browser := _plugin_singleton as Node
	if browser == null:
		return

	browser.queue_free()
	_plugin_singleton = null
	_initialize_desktop_cef_backend()


func _connect_cef_signals() -> void:
	if _plugin_singleton.has_signal(&"ipc_message"):
		_plugin_singleton.connect(&"ipc_message", _on_plugin_text_received)

	if _plugin_singleton.has_signal(&"ipc_binary_message"):
		_plugin_singleton.connect(&"ipc_binary_message", _on_plugin_binary_received)

	if _plugin_singleton.has_signal(&"ipc_data_message"):
		_plugin_singleton.connect(&"ipc_data_message", _on_plugin_data_received)

	if _plugin_singleton.has_signal(&"load_error"):
		_plugin_singleton.connect(&"load_error", _on_cef_load_error)

	if _plugin_singleton.has_signal(&"render_process_terminated"):
		_plugin_singleton.connect(&"render_process_terminated", _on_cef_render_process_terminated)


func _configure_cef_layout() -> void:
	if _plugin_singleton is Control:
		var control := _plugin_singleton as Control
		control.set_anchors_preset(Control.PRESET_FULL_RECT)
		control.offset_left = 0
		control.offset_top = 0
		control.offset_right = 0
		control.offset_bottom = 0
		return

	if _cef_backend_has_property("texture_size"):
		_plugin_singleton.set("texture_size", DisplayServer.window_get_size())


func _set_cef_property_if_present(property_name: String, value: Variant) -> void:
	if not _cef_backend_has_property(property_name):
		return

	_plugin_singleton.set(property_name, value)


func _cef_backend_has_property(property_name: String) -> bool:
	for property in _plugin_singleton.get_property_list():
		if str(property.get("name", "")) == property_name:
			return true

	return false


func _desktop_platform_os() -> String:
	match OS.get_name():
		"macOS":
			return "macos"
		"Windows":
			return "windows"
		_:
			return "linux"


func _emit_cef_webview_ready() -> void:
	if _plugin_singleton == null:
		return

	print("[Kirie][gd] signal webview_ready")
	webview_ready.emit()


func _on_cef_load_error(url: String, error_code: int, error_text: String) -> void:
	_on_plugin_ipc_error(
		(
			"Godot CEF failed to load %s: %s (%d)"
			% [
				url,
				error_text,
				error_code,
			]
		)
	)


func _on_cef_render_process_terminated(status: int, error_message: String) -> void:
	_on_plugin_ipc_error(
		(
			"Godot CEF render process terminated: %s (%d)"
			% [
				error_message,
				status,
			]
		)
	)


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
