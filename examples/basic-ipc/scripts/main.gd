extends Control

const PAGE_URL := "res://web/dist/index.html"
const PROBE_PAGE_URL := "res://web/dist/index.html?mode=probe"

var _kirie := GdKirie.new()
var _log_lines: PackedStringArray = PackedStringArray()
var _probe_pending := false
var _webview_is_ready := false

@onready var _url_input: LineEdit = $VBoxContainer/UrlInput
@onready var _status_label: Label = $VBoxContainer/StatusLabel
@onready var _log_label: Label = $VBoxContainer/LogLabel


func _ready() -> void:
	_kirie.webview_ready.connect(_on_webview_ready)
	_kirie.text_received.connect(_on_text_received)
	_kirie.binary_received.connect(_on_binary_received)
	_kirie.data_received.connect(_on_data_received)
	_kirie.ipc_error.connect(_on_ipc_error)

	if not _kirie.is_available():
		_set_status("Status: Kirie singleton not available on this platform")
		_append_log("Kirie singleton is not available")
		return

	_set_status("Status: Kirie singleton available")
	_append_log("Kirie singleton detected")


func _on_create_button_pressed() -> void:
	if not _kirie.is_available():
		return

	var url := _url_input.text.strip_edges()
	_set_status("Status: creating WebView")
	_append_log("create_webview initial_url=%s" % url)
	_kirie.create_webview({
		"initial_url": url,
	})


func _on_probe_button_pressed() -> void:
	if not _kirie.is_available():
		return

	_probe_pending = true
	_set_status("Status: starting probe")
	_append_log("run_probe")

	if _webview_is_ready:
		_load_probe_page()
		return

	_kirie.create_webview()


func _on_destroy_button_pressed() -> void:
	if not _kirie.is_available():
		return

	_probe_pending = false
	_webview_is_ready = false
	_set_status("Status: destroying WebView")
	_append_log("destroy_webview")
	_kirie.destroy_webview()


func _on_send_button_pressed() -> void:
	_send_test_message()


func _on_webview_ready() -> void:
	_webview_is_ready = true
	_set_status("Status: WebView ready")
	_append_log("signal webview_ready")

	if _probe_pending:
		_load_probe_page()


func _on_text_received(message: String) -> void:
	_append_log("signal text_received %s" % message)

	if message == "web_ready":
		_set_status("Status: received web_ready")
		_kirie.send_text("godot_ready")
		return

	if message == "web_ack":
		_probe_pending = false
		_set_status("Status: probe passed")


func _on_binary_received(bytes: PackedByteArray) -> void:
	_append_log("signal binary_received bytes=%d" % bytes.size())


func _on_data_received(value: Variant) -> void:
	_append_log("signal data_received %s" % str(value))


func _on_ipc_error(error: String) -> void:
	_probe_pending = false
	_set_status("Status: IPC error")
	_append_log("signal ipc_error %s" % error)


func _send_test_message() -> void:
	if not _kirie.is_available():
		return

	_append_log("send_text godot_ping")
	_kirie.send_text("godot_ping")
	_kirie.send_binary(PackedByteArray([75, 105, 114, 105, 101]))
	_kirie.send_data({
		"source": "godot",
	})


func _load_probe_page() -> void:
	_set_status("Status: loading probe page")
	_append_log("load_url %s" % PROBE_PAGE_URL)
	_kirie.load_url(PROBE_PAGE_URL)


func _append_log(line: String) -> void:
	_log_lines.append(line)
	while _log_lines.size() > 10:
		_log_lines.remove_at(0)

	_log_label.text = "Log:\n" + "\n".join(_log_lines)
	print(line)


func _set_status(text: String) -> void:
	_status_label.text = text
