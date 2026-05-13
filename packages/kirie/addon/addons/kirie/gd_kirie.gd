class_name GdKirie
extends Object

signal webview_ready()
signal text_received(message: String)
signal binary_received(bytes: PackedByteArray)
signal data_received(value: Variant)
signal text_packet_received(bytes: PackedByteArray)
signal binary_packet_received(bytes: PackedByteArray)
signal data_packet_received(bytes: PackedByteArray)
signal ipc_error(error: String)

const PLUGIN_SINGLETON_NAME := "Kirie"
const KirieCborCodecScript := preload("res://addons/kirie/kirie_cbor_codec.gd")

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
	send_text_packet(KirieCborCodecScript.encode_text(message))


func send_binary(bytes: PackedByteArray) -> void:
	send_binary_packet(KirieCborCodecScript.encode_bytes(bytes))


func send_data(value: Variant) -> void:
	var encoded := KirieCborCodecScript.try_encode_data(value)
	if encoded["ok"]:
		send_data_packet(encoded["value"])
		return

	_on_plugin_ipc_error("CBOR data encode failed: %s" % encoded["error"])


func send_text_packet(bytes: PackedByteArray) -> void:
	if not _ensure_plugin_singleton("send_text_packet"):
		return

	if not _ensure_non_empty_packet(bytes, "send_text_packet"):
		return

	print("[Kirie][gd] send_text_packet bytes=%d" % bytes.size())
	_plugin_singleton.sendTextPacket(bytes)


func send_binary_packet(bytes: PackedByteArray) -> void:
	if not _ensure_plugin_singleton("send_binary_packet"):
		return

	if not _ensure_non_empty_packet(bytes, "send_binary_packet"):
		return

	print("[Kirie][gd] send_binary_packet bytes=%d" % bytes.size())
	_plugin_singleton.sendBinaryPacket(bytes)


func send_data_packet(bytes: PackedByteArray) -> void:
	if not _ensure_plugin_singleton("send_data_packet"):
		return

	if not _ensure_non_empty_packet(bytes, "send_data_packet"):
		return

	print("[Kirie][gd] send_data_packet bytes=%d" % bytes.size())
	_plugin_singleton.sendDataPacket(bytes)


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
		_plugin_singleton.registerCallbacks(
			Callable(self, "_on_plugin_webview_ready"),
			Callable(self, "_on_plugin_text_packet_received"),
			Callable(self, "_on_plugin_binary_packet_received"),
			Callable(self, "_on_plugin_data_packet_received"),
			Callable(self, "_on_plugin_ipc_error"),
		)
		return

	if _plugin_singleton.has_signal(&"webview_ready"):
		print("[Kirie][gd] connecting Android webview_ready signal")
		_plugin_singleton.webview_ready.connect(_on_plugin_webview_ready)

	if _plugin_singleton.has_signal(&"text_packet_received"):
		print("[Kirie][gd] connecting Android text_packet_received signal")
		_plugin_singleton.text_packet_received.connect(_on_plugin_text_packet_received)

	if _plugin_singleton.has_signal(&"binary_packet_received"):
		print("[Kirie][gd] connecting Android binary_packet_received signal")
		_plugin_singleton.binary_packet_received.connect(_on_plugin_binary_packet_received)

	if _plugin_singleton.has_signal(&"data_packet_received"):
		print("[Kirie][gd] connecting Android data_packet_received signal")
		_plugin_singleton.data_packet_received.connect(_on_plugin_data_packet_received)

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


func _ensure_non_empty_packet(bytes: PackedByteArray, method_name: String) -> bool:
	if not bytes.is_empty():
		return true

	var error := "Kirie cannot send an empty CBOR packet from %s()" % method_name
	push_warning(error)
	ipc_error.emit(error)
	return false


func _on_plugin_webview_ready() -> void:
	print("[Kirie][gd] signal webview_ready")
	webview_ready.emit()


func _on_plugin_text_packet_received(bytes: PackedByteArray) -> void:
	print("[Kirie][gd] signal text_packet_received bytes=%d" % bytes.size())
	text_packet_received.emit(bytes)
	var decoded := KirieCborCodecScript.try_decode_text(bytes)
	if decoded["ok"]:
		text_received.emit(decoded["value"])
		return

	_on_plugin_ipc_error("CBOR text decode failed: %s" % decoded["error"])


func _on_plugin_binary_packet_received(bytes: PackedByteArray) -> void:
	print("[Kirie][gd] signal binary_packet_received bytes=%d" % bytes.size())
	binary_packet_received.emit(bytes)
	var decoded := KirieCborCodecScript.try_decode_bytes(bytes)
	if decoded["ok"]:
		binary_received.emit(decoded["value"])
		return

	_on_plugin_ipc_error("CBOR binary decode failed: %s" % decoded["error"])


func _on_plugin_data_packet_received(bytes: PackedByteArray) -> void:
	print("[Kirie][gd] signal data_packet_received bytes=%d" % bytes.size())
	data_packet_received.emit(bytes)
	var decoded := KirieCborCodecScript.try_decode_data(bytes)
	if decoded["ok"]:
		data_received.emit(decoded["value"])
		return

	_on_plugin_ipc_error("CBOR data decode failed: %s" % decoded["error"])


func _on_plugin_ipc_error(error: String) -> void:
	print("[Kirie][gd] signal ipc_error %s" % error)
	ipc_error.emit(error)
