extends RefCounted

const PROBE_NAME := "ipc_round_trip"
const TestProbeScript = preload("res://scripts/test_probe.gd")


func run(kirie: GdKirie, tree: SceneTree, test_name: String) -> String:
	var probe: KirieIntegrationProbe = TestProbeScript.new(kirie, tree)
	probe.reset()

	print("[Kirie][test] create_webview probe=%s" % PROBE_NAME)
	kirie.create_webview()

	var failure_reason := await probe.wait_for_webview_ready(PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	print("[Kirie][test] load_url probe=%s" % PROBE_NAME)
	kirie.load_url(_probe_url(PROBE_NAME, test_name))

	failure_reason = await probe.wait_for_message("web_ready", PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	(
		kirie
		. send_ipc_message(
			{
				"type": "godot_ready",
				"payload":
				{
					"probe": PROBE_NAME,
					"test": test_name,
				},
			}
		)
	)

	return await probe.wait_for_message("web_ack", PROBE_NAME)


func _probe_url(probe_name: String, test_name: String) -> String:
	return (
		"res://web/probe.html?probe=%s&test=%s"
		% [
			probe_name.uri_encode(),
			test_name.uri_encode(),
		]
	)
