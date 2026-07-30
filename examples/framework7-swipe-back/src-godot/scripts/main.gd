extends Control

const PAGE_URL := "res://src-web/dist/index.html"
const DEV_WEB_URL_OPTION := "kirie-web-url"

var _kirie := GdKirie.new()
var _lines: PackedStringArray = PackedStringArray()

@onready var _status: Label = $Status


func _ready() -> void:
	_kirie.webview_ready.connect(func() -> void: _append_log("WebView ready"))
	_kirie.text_received.connect(_on_text_received)
	_kirie.ipc_error.connect(func(error: String) -> void: _append_log("IPC error: %s" % error))

	if not _kirie.is_available():
		_append_log("Kirie singleton is unavailable on this platform")
		return

	var startup_url := _resolve_startup_url()
	_append_log("Creating WebView: %s" % startup_url)
	_kirie.create_webview({"initial_url": startup_url})


func _exit_tree() -> void:
	if is_instance_valid(_kirie):
		_kirie.destroy_webview()
		_kirie.free()


func _resolve_startup_url() -> String:
	var native_value := _kirie.get_launch_option(DEV_WEB_URL_OPTION).strip_edges()
	if native_value != "":
		return native_value

	var option_prefix := "--%s=" % DEV_WEB_URL_OPTION
	for arg in OS.get_cmdline_args() + OS.get_cmdline_user_args():
		if arg.begins_with(option_prefix):
			return arg.trim_prefix(option_prefix).strip_edges()

	var environment_url := OS.get_environment("KIRIE_WEB_URL").strip_edges()
	if environment_url != "":
		return environment_url

	return PAGE_URL


func _on_text_received(message: String) -> void:
	_append_log("Web: %s" % message)


func _append_log(line: String) -> void:
	_lines.append(line)
	while _lines.size() > 12:
		_lines.remove_at(0)
	_status.text = "\n".join(_lines)
	print("[Framework7 swipe-back] %s" % line)
