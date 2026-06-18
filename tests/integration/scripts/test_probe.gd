class_name KirieIntegrationProbe
extends RefCounted

const PROBE_INDEX_HTML_PATH := "res://src-web/dist/index.html"
const DEFAULT_TEST_TIMEOUT_SECONDS := 12.0
const IOS_TEST_TIMEOUT_SECONDS := 30.0

var _kirie: Object
var _binary_messages: Array[PackedByteArray] = []
var _data_messages: Array[Dictionary] = []
var _probe_error := ""
var _text_messages: Array[String] = []
var _tree: SceneTree
var _webview_is_ready := false


func _init(kirie: Object, tree: SceneTree) -> void:
	_kirie = kirie
	_tree = tree

	_kirie.webview_ready.connect(_on_webview_ready)
	_kirie.text_received.connect(_on_text_received)
	_kirie.binary_received.connect(_on_binary_received)
	_kirie.data_received.connect(_on_data_received)
	_kirie.ipc_error.connect(_on_ipc_error)


func reset() -> void:
	_binary_messages.clear()
	_data_messages.clear()
	_probe_error = ""
	_text_messages.clear()
	_webview_is_ready = false


func read_probe_index_html() -> String:
	if not FileAccess.file_exists(PROBE_INDEX_HTML_PATH):
		_probe_error = "Missing probe index HTML: %s" % PROBE_INDEX_HTML_PATH
		print("[Kirie][ERROR] %s" % _probe_error)
		return ""

	return FileAccess.get_file_as_string(PROBE_INDEX_HTML_PATH)


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


func wait_for_data_message(message_type: String, probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		if _has_data_message(message_type, probe_name):
			return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for data %s during %s; observed messages=%s"
		% [
			timeout_seconds,
			message_type,
			probe_name,
			_observed_messages_description(),
		]
	)


func wait_for_data_echo(expected: Variant, probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		if _has_data_echo(expected):
			return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for data echo during %s; expected=%s observed=%s"
		% [
			timeout_seconds,
			probe_name,
			str(expected),
			_observed_messages_description(),
		]
	)


func wait_for_text_message(expected: String, probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		if expected in _text_messages:
			return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for text echo during %s; expected=%s observed=%s"
		% [
			timeout_seconds,
			probe_name,
			expected,
			_observed_messages_description(),
		]
	)


func wait_for_binary_message(expected: PackedByteArray, probe_name: String) -> String:
	var timeout_seconds := _test_timeout_seconds()
	var deadline := Time.get_ticks_msec() + int(timeout_seconds * 1000.0)
	while Time.get_ticks_msec() < deadline:
		if _probe_error != "":
			return _probe_error

		for bytes in _binary_messages:
			if bytes == expected:
				return ""

		await _tree.process_frame

	return (
		"Timed out after %.1fs waiting for binary echo during %s; expected_size=%d observed=%s"
		% [
			timeout_seconds,
			probe_name,
			expected.size(),
			_observed_messages_description(),
		]
	)


func has_text_message(expected: String) -> bool:
	return expected in _text_messages


func _has_data_message(message_type: String, probe_name: String) -> bool:
	for message in _data_messages:
		if str(message.get("type", "")) != message_type:
			continue

		var payload: Variant = message.get("payload", {})
		if typeof(payload) != TYPE_DICTIONARY:
			continue

		var payload_dictionary := payload as Dictionary
		if str(payload_dictionary.get("probe", "")) == probe_name:
			return true

	return false


func _has_data_echo(expected: Variant) -> bool:
	for message in _data_messages:
		if str(message.get("type", "")) != "data_echo":
			continue

		if not message.has("payload"):
			continue

		if _data_values_equal(message["payload"], expected):
			return true

	return false


func _data_values_equal(left: Variant, right: Variant) -> bool:
	var left_type := typeof(left)
	var right_type := typeof(right)
	if left_type != right_type:
		return false

	if left_type == TYPE_ARRAY:
		return _data_arrays_equal(left, right)

	if left_type == TYPE_DICTIONARY:
		return _data_dictionaries_equal(left, right)

	return left == right


func _data_arrays_equal(left: Array, right: Array) -> bool:
	if left.size() != right.size():
		return false

	for index in left.size():
		if not _data_values_equal(left[index], right[index]):
			return false

	return true


func _data_dictionaries_equal(left: Dictionary, right: Dictionary) -> bool:
	if left.size() != right.size():
		return false

	for key: Variant in left.keys():
		if not right.has(key):
			return false

		if not _data_values_equal(left[key], right[key]):
			return false

	return true


func _observed_messages_description() -> String:
	return (
		"data=%s text=%s binary_sizes=%s"
		% [
			JSON.stringify(_data_messages),
			JSON.stringify(_text_messages),
			JSON.stringify(_binary_message_sizes()),
		]
	)


func _binary_message_sizes() -> Array[int]:
	var sizes: Array[int] = []
	for bytes in _binary_messages:
		sizes.append(bytes.size())

	return sizes


func _test_timeout_seconds() -> float:
	if OS.get_name() == "iOS":
		return IOS_TEST_TIMEOUT_SECONDS

	return DEFAULT_TEST_TIMEOUT_SECONDS


func _on_webview_ready() -> void:
	_webview_is_ready = true
	print("[Kirie][test] signal webview_ready")


func _on_text_received(message: String) -> void:
	print("[Kirie][test] signal text_received: %s" % message)
	_text_messages.append(message)


func _on_binary_received(bytes: PackedByteArray) -> void:
	print("[Kirie][test] signal binary_received bytes=%d" % bytes.size())
	_binary_messages.append(bytes)


func _on_data_received(value: Variant) -> void:
	var val_type := typeof(value)
	if val_type != TYPE_DICTIONARY:
		print(
			(
				"[Kirie][WARNING] Ignored data_received payload because type %d is not TYPE_DICTIONARY"
				% val_type
			)
		)
		return

	var message := value as Dictionary
	_data_messages.append(message)


func _on_ipc_error(error: String) -> void:
	_probe_error = error
	print("[Kirie][ERROR][test] signal ipc_error: %s" % error)
