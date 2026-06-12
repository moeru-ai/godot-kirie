extends Control

const PAGE_URL := "res://src-web/dist/index.html"

var _kirie := GdKirie.new()
var _log_lines: PackedStringArray = PackedStringArray()
var _startup_url := PAGE_URL

@onready var _url_input: LineEdit = $VBoxContainer/UrlInput
@onready var _status_label: Label = $VBoxContainer/StatusLabel
@onready var _log_label: Label = $VBoxContainer/LogLabel


func _ready() -> void:
	_kirie.webview_ready.connect(_on_webview_ready)
	_kirie.text_received.connect(_on_text_received)
	_kirie.ipc_error.connect(_on_ipc_error)
	_startup_url = _resolve_startup_url()
	_url_input.text = _startup_url

	if not _kirie.is_available():
		_set_status("Status: Kirie singleton not available on this platform")
		_append_log("Kirie singleton is not available")
		return

	_set_status("Status: Kirie singleton available")
	_append_log("Kirie singleton detected")
	_create_app_webview()


func _resolve_startup_url() -> String:
	if OS.get_environment("KIRIE_DEV") != "1":
		return PAGE_URL

	var web_url := OS.get_environment("KIRIE_WEB_URL").strip_edges()
	if web_url == "":
		return PAGE_URL

	_append_log("KIRIE_WEB_URL detected %s" % web_url)
	return web_url


func _create_app_webview() -> void:
	if not _kirie.is_available():
		return

	_set_status("Status: creating app WebView")
	_append_log("create_webview initial_url=%s" % _startup_url)
	var options := {"initial_url": _startup_url}
	_kirie.create_webview(options)


func _on_webview_ready() -> void:
	_set_status("Status: WebView ready")
	_append_log("signal webview_ready")


func _on_text_received(message_text: String) -> void:
	_append_log("signal text_received %s" % message_text)

	var message: Variant = JSON.parse_string(message_text)
	if typeof(message) != TYPE_DICTIONARY:
		return

	var message_type := str(message.get("type", ""))
	if message_type == "web_ready":
		_set_status("Status: received web_ready")
		var reply := {
			"type": "godot_ready",
			"payload":
			{
				"message": "Hello from Godot",
			},
		}
		_kirie.send_text(JSON.stringify(reply))
		return


func _on_ipc_error(error: String) -> void:
	_set_status("Status: IPC error")
	_append_log("signal ipc_error %s" % error)


func _append_log(line: String) -> void:
	_log_lines.append(line)
	while _log_lines.size() > 10:
		_log_lines.remove_at(0)

	_log_label.text = "Log:\n" + "\n".join(_log_lines)
	print(line)


func _set_status(text: String) -> void:
	_status_label.text = text
