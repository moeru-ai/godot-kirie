extends RefCounted

const PROBE_NAME := "ipc_round_trip"
const TestProbeScript = preload("res://scripts/test_probe.gd")


func run(kirie: Object, tree: SceneTree, test_name: String) -> String:
	var probe: KirieIntegrationProbe = TestProbeScript.new(kirie, tree)
	probe.reset()

	print("[Kirie][test] create_webview probe=%s" % PROBE_NAME)
	kirie.create_webview()

	var failure_reason := await probe.wait_for_webview_ready(PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	print("[Kirie][test] load_url probe=%s" % PROBE_NAME)
	kirie.load_url(_probe_url(PROBE_NAME, test_name))

	failure_reason = await probe.wait_for_data_message("web_ready", PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	var text_payload := "godot_text:%s:%s" % [PROBE_NAME, test_name]
	kirie.send_text(text_payload)

	failure_reason = await probe.wait_for_text_message(
		"web_text_echo:%s" % text_payload, PROBE_NAME
	)
	if failure_reason != "":
		return failure_reason

	var binary_payload := PackedByteArray([0, 1, 2, 127, 128, 255])
	kirie.send_binary(binary_payload)

	failure_reason = await probe.wait_for_binary_message(binary_payload, PROBE_NAME)
	if failure_reason != "":
		return failure_reason

	for data_payload: Variant in [42, ["array-root", 7, null, {"nested": true}], null]:
		kirie.send_data(data_payload)

		failure_reason = await probe.wait_for_data_echo(data_payload, PROBE_NAME)
		if failure_reason != "":
			return failure_reason

	(
		kirie
		. send_data(
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

	return await probe.wait_for_data_message("web_ack", PROBE_NAME)


func _probe_url(probe_name: String, test_name: String) -> String:
	return (
		"res://src-web/dist/?probe=%s&test=%s"
		% [
			probe_name.uri_encode(),
			test_name.uri_encode(),
		]
	)
