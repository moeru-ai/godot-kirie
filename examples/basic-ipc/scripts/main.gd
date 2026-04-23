extends Control

const DEFAULT_OUTBOUND_MESSAGE := {
	"type": "godot_ping",
	"payload": {
		"source": "godot",
	},
}
const PROBE_BASE_URL := "https://kirie.test/"
const PAGE_HTML_PATH := "res://web/index.html"
const PROBE_MODE_SCRIPT := "<script>globalThis.__KIRIE_MODE__ = \"probe\";</script>"

@onready var _url_input: LineEdit = $VBoxContainer/UrlInput
@onready var _status_label: Label = $VBoxContainer/StatusLabel
@onready var _log_label: Label = $VBoxContainer/LogLabel

var _kirie := GdKirie.new()
var _log_lines: PackedStringArray = PackedStringArray()
var _probe_pending := false
var _webview_is_ready := false


func _ready() -> void:
	_kirie.webview_ready.connect(_on_webview_ready)
	_kirie.ipc_message_received.connect(_on_ipc_message_received)
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
		_load_probe_html()
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
		_load_probe_html()


func _on_ipc_message_received(message: Variant) -> void:
	_append_log("signal ipc_message_received %s" % JSON.stringify(message))

	if typeof(message) != TYPE_DICTIONARY:
		return

	var message_type := str(message.get("type", ""))
	if message_type == "web_ready":
		_set_status("Status: received web_ready")
		_kirie.send_ipc_message({
			"type": "godot_ready",
			"payload": {
				"message": "Hello from Godot",
			},
		})
		return

	if message_type == "web_ack":
		_probe_pending = false
		_set_status("Status: probe passed")


func _on_ipc_error(error: String) -> void:
	_set_status("Status: IPC error")
	_append_log("signal ipc_error %s" % error)


func _send_test_message() -> void:
	if not _kirie.is_available():
		return

	_append_log("send_ipc_message %s" % JSON.stringify(DEFAULT_OUTBOUND_MESSAGE))
	_kirie.send_ipc_message(DEFAULT_OUTBOUND_MESSAGE)


func _load_probe_html() -> void:
	var page_html := _build_probe_html()
	if page_html.is_empty():
		return

	_probe_pending = false
	_set_status("Status: loading probe HTML")
	_append_log("load_html_string probe")
	_kirie.load_html_string(page_html, PROBE_BASE_URL)


func _build_probe_html() -> String:
	var html_file := FileAccess.open(PAGE_HTML_PATH, FileAccess.READ)
	if html_file == null:
		var error := "Failed to open %s" % PAGE_HTML_PATH
		_set_status("Status: probe failed")
		_append_log(error)
		return ""

	var html := html_file.get_as_text()
	if html.is_empty():
		var error := "Probe page is empty: %s" % PAGE_HTML_PATH
		_set_status("Status: probe failed")
		_append_log(error)
		return ""

	if html.contains("</head>"):
		return html.replace("</head>", "%s\n</head>" % PROBE_MODE_SCRIPT)

	return "%s\n%s" % [PROBE_MODE_SCRIPT, html]


func _append_log(line: String) -> void:
	_log_lines.append(line)
	while _log_lines.size() > 10:
		_log_lines.remove_at(0)

	_log_label.text = "Log:\n" + "\n".join(_log_lines)


func _set_status(text: String) -> void:
	_status_label.text = text
