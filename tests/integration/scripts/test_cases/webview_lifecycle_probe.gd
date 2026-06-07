extends RefCounted

const DESTROY_SETTLE_SECONDS := 0.4
const TestProbeScript = preload("res://scripts/test_probe.gd")


func run(kirie: Object, tree: SceneTree, test_name: String) -> String:
	var probe: KirieIntegrationProbe = TestProbeScript.new(kirie, tree)

	var failure_reason := await _run_probe(kirie, probe, "first_create", test_name)
	if failure_reason != "":
		return failure_reason

	print("[Kirie][test] destroy_webview after first probe")
	kirie.destroy_webview()
	await tree.create_timer(DESTROY_SETTLE_SECONDS).timeout

	return await _run_probe(kirie, probe, "second_create", test_name)


func _run_probe(
	kirie: Object,
	probe: KirieIntegrationProbe,
	probe_name: String,
	test_name: String,
) -> String:
	probe.reset()

	print("[Kirie][test] create_webview probe=%s" % probe_name)
	kirie.create_webview()

	var failure_reason := await probe.wait_for_webview_ready(probe_name)
	if failure_reason != "":
		return failure_reason

	print("[Kirie][test] load_url probe=%s" % probe_name)
	kirie.load_url(_probe_url(probe_name, test_name))

	failure_reason = await probe.wait_for_data_message("web_ready", probe_name)
	if failure_reason != "":
		return failure_reason

	(
		kirie
		. send_data(
			{
				"type": "godot_ready",
				"payload":
				{
					"probe": probe_name,
					"test": test_name,
				},
			}
		)
	)

	return await probe.wait_for_data_message("web_ack", probe_name)


func _probe_url(probe_name: String, test_name: String) -> String:
	return (
		"res://web/?probe=%s&test=%s"
		% [
			probe_name.uri_encode(),
			test_name.uri_encode(),
		]
	)
