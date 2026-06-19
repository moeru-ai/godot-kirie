extends RefCounted

const PROBE_NAMES := ["multi_node_a", "multi_node_b"]
const KirieNodeScript = preload("res://addons/kirie/kirie_node.gd")
const TestProbeScript = preload("res://scripts/test_probe.gd")


func run(_kirie: Object, tree: SceneTree, test_name: String) -> String:
	var nodes: Array[KirieNode] = []
	var probes: Array[KirieIntegrationProbe] = []

	for probe_name in PROBE_NAMES:
		var node: KirieNode = KirieNodeScript.new()
		node.auto_create = false
		node.size = tree.root.get_visible_rect().size
		tree.root.add_child.call_deferred(node)
		await tree.process_frame

		var probe: KirieIntegrationProbe = TestProbeScript.new(node, tree)
		nodes.append(node)
		probes.append(probe)

		probe.reset()
		var url := "res://src-web/dist/?probe=%s&test=%s" % [
			probe_name.uri_encode(),
			test_name.uri_encode(),
		]
		node.create_webview({"initial_url": url})

		var failure_reason := await probe.wait_for_webview_ready(probe_name)
		if failure_reason == "":
			failure_reason = await probe.wait_for_data_message("web_ready", probe_name)
		if failure_reason != "":
			return _cleanup(nodes, failure_reason)

	var payload := "godot_text:%s:%s" % [PROBE_NAMES[0], test_name]
	var expected_echo := "web_text_echo:%s" % payload
	nodes[0].send_text(payload)

	var failure_reason := await probes[0].wait_for_text_message(
		expected_echo,
		PROBE_NAMES[0]
	)
	if failure_reason == "":
		await tree.create_timer(0.5).timeout
		if probes[1].has_text_message(expected_echo):
			failure_reason = "Text echo for %s also reached %s" % PROBE_NAMES

	return _cleanup(nodes, failure_reason)


func _cleanup(nodes: Array[KirieNode], result: String) -> String:
	for node in nodes:
		node.queue_free()

	return result
