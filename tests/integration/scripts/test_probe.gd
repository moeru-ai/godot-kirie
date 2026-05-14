class_name KirieIntegrationProbe
extends RefCounted

const PROBE_HTML_PATH := "res://web/probe.html"
const DEFAULT_TEST_TIMEOUT_SECONDS := 12.0
const IOS_TEST_TIMEOUT_SECONDS := 30.0

var _kirie: GdKirie
var _messages: Array[Dictionary] = []
var _probe_error := ""
var _tree: SceneTree
var _webview_is_ready := false


func _init(kirie: GdKirie, tree: SceneTree) -> void:
	_kirie = kirie
	_tree = tree

	_kirie.webview_ready.connect(_on_webview_ready)
	_kirie.ipc_message_received.connect(_on_ipc_message_received)
	_kirie.ipc_error.connect(_on_ipc_error)


func reset() -> void:
	_messages.clear()
	_probe_error = ""
	_webview_is_ready = false


func read_probe_html() -> String:
	if not FileAccess.file_exists(PROBE_HTML_PATH):
		_probe_error = "Missing probe HTML: %s" % PROBE_HTML_PATH
		return ""

	return FileAccess.get_file_as_string(PROBE_HTML_PATH)


func failure_reason() -> String:
	return _probe_error


func wait_for_webview_ready(probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		if _webview_is_ready:
			return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for webview_ready during %s" % [timeout_seconds, probe_name]
	)


func wait_for_message(message_type: String, probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		if _has_message(message_type, probe_name):
			return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for %s during %s; observed messages=%s"
		% [
			timeout_seconds,
			message_type,
			probe_name,
			JSON.stringify(_messages),
		]
	)


func _has_message(message_type: String, probe_name: String) -> bool:
	for message in _messages:
		if str(message.get("type", "")) != message_type:
			continue

		var payload: Variant = message.get("payload", {})
		if typeof(payload) != TYPE_DICTIONARY:
			continue

		var payload_dictionary := payload as Dictionary
		if str(payload_dictionary.get("probe", "")) == probe_name:
			return true

	return false


func _test_timeout_seconds() -> float:
	if OS.get_name() == "iOS":
		return IOS_TEST_TIMEOUT_SECONDS

	return DEFAULT_TEST_TIMEOUT_SECONDS


func _on_webview_ready() -> void:
	_webview_is_ready = true
	print("[Kirie][test] signal webview_ready")


func _on_ipc_message_received(message: Variant) -> void:
	print("[Kirie][test] signal ipc_message_received %s" % JSON.stringify(message))

	if typeof(message) != TYPE_DICTIONARY:
		return

	var message_dictionary := message as Dictionary
	_messages.append(message_dictionary)


func _on_ipc_error(error: String) -> void:
	_probe_error = error
	print("[Kirie][test] signal ipc_error %s" % error)
