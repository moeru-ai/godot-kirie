extends Node

const LAUNCH_TEST_OPTION := "kirie_test"
const TEST_CASE_PATH_TEMPLATE := "res://scripts/test_cases/%s.gd"
const GdKirieScript = preload("res://addons/kirie/gd_kirie.gd")

var _kirie := GdKirieScript.new()
var _test_name := ""
var _finished := false


func _ready() -> void:
	if not _kirie.is_available():
		_test_name = "unknown"
		_fail("Kirie singleton is not available")
		return

	_test_name = _resolve_test_name()
	if _test_name == "":
		_test_name = "unknown"
		_fail("Missing launch option: %s" % LAUNCH_TEST_OPTION)
		return

	print("KIRIE_TEST_START %s" % _test_name)

	var test_result: Variant = await _run_test_case(_kirie, get_tree(), _test_name)
	if typeof(test_result) != TYPE_STRING:
		_fail("Integration test did not return a failure reason string: %s" % _test_name)
		return

	var failure_reason := str(test_result).strip_edges()

	if _finished:
		return

	if failure_reason == "":
		_pass()
		return

	_fail(failure_reason)


func _resolve_test_name() -> String:
	var launch_test_name := _kirie.get_launch_option(LAUNCH_TEST_OPTION).strip_edges()
	if launch_test_name != "":
		return launch_test_name

	for arg in OS.get_cmdline_args() + OS.get_cmdline_user_args():
		if arg.begins_with("--kirie-test="):
			return arg.trim_prefix("--kirie-test=").strip_edges()

	return ""


func _run_test_case(kirie: Object, tree: SceneTree, test_name: String) -> Variant:
	var test_script_path := TEST_CASE_PATH_TEMPLATE % _test_name
	if not ResourceLoader.exists(test_script_path):
		_fail("Unknown integration test: %s" % _test_name)
		return "Unknown integration test: %s" % _test_name

	var test_script_resource: Resource = load(test_script_path)
	if not test_script_resource is Script:
		_fail("Integration test is not a script: %s" % _test_name)
		return "Integration test is not a script: %s" % _test_name

	var test_script := test_script_resource as Script
	var test_case: Object = test_script.new()
	if not test_case.has_method("run"):
		_fail("Integration test is missing run(kirie, tree, test_name): %s" % _test_name)
		return "Integration test is missing run(kirie, tree, test_name): %s" % _test_name

	return await Callable(test_case, "run").call(kirie, tree, test_name)


func _pass() -> void:
	if _finished:
		return

	_finished = true
	print("KIRIE_TEST_PASS %s" % _test_name)
	get_tree().quit(0)


func _fail(reason: String) -> void:
	if _finished:
		return

	_finished = true
	var clean_reason := reason.strip_edges()
	if clean_reason == "":
		clean_reason = "Unknown failure"

	print("KIRIE_TEST_FAIL %s %s" % [_test_name, clean_reason])
	get_tree().quit(1)
