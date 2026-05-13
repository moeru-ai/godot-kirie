extends SceneTree

const CborCodecProbeScript = preload("res://scripts/test_cases/cbor_codec_probe.gd")


func _init() -> void:
	var failure_reason := CborCodecProbeScript.run_fixtures()
	if failure_reason == "":
		print("KIRIE_CBOR_CODEC_SMOKE_PASS")
		quit(0)
		return

	print("KIRIE_CBOR_CODEC_SMOKE_FAIL %s" % failure_reason)
	quit(1)
