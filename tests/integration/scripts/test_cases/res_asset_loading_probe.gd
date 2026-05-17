extends RefCounted

const PROBE_NAME := "res_asset_loading"
const PROBE_URL := "res://web/?probe=res_asset_loading"
const TestProbeScript = preload("res://scripts/test_probe.gd")


func run(kirie: GdKirie, tree: SceneTree, test_name: String) -> String:
	var probe: KirieIntegrationProbe = TestProbeScript.new(kirie, tree)
	probe.reset()

	print("[Kirie][test] create_webview probe=%s" % PROBE_NAME)
	kirie.create_webview()

	var failure_reason := await probe.wait_for_webview_ready(PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	print("[Kirie][test] load_url probe=%s url=%s" % [PROBE_NAME, PROBE_URL])
	kirie.load_url(PROBE_URL)

	failure_reason = await probe.wait_for_data_message("web_ready", PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	kirie.send_data(
		{
			"type": "godot_ready",
			"payload":
			{
				"probe": PROBE_NAME,
				"test": test_name,
			},
		}
	)

	return await probe.wait_for_data_message("web_ack", PROBE_NAME)
