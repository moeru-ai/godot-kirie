extends RefCounted

const CborCodecScript = preload("res://addons/kirie/kirie_cbor_codec.gd")


func run(_kirie: GdKirie, _tree: SceneTree, _test_name: String) -> String:
	return run_fixtures()


static func run_fixtures() -> String:
	for fixture in _encoding_fixtures():
		var failure_reason := _expect_encoded(fixture["label"], fixture["actual"], fixture["hex"])
		if failure_reason != "":
			return failure_reason

	for fixture in _decoding_fixtures():
		var failure_reason := _expect_decoded(fixture["label"], fixture["actual"], fixture["expected"])
		if failure_reason != "":
			return failure_reason

	for fixture in _error_fixtures():
		var failure_reason := _expect_error(fixture["label"], fixture["actual"], fixture["error"])
		if failure_reason != "":
			return failure_reason

	for fixture in _encode_error_fixtures():
		var failure_reason := _expect_error(fixture["label"], fixture["actual"], fixture["error"])
		if failure_reason != "":
			return failure_reason

	return ""


static func _encoding_fixtures() -> Array[Dictionary]:
	return [
		{"label": "text short", "actual": CborCodecScript.encode_text("hi"), "hex": "626869"},
		{
			"label": "bytes short",
			"actual": CborCodecScript.encode_bytes(_bytes([1, 2, 3])),
			"hex": "43010203",
		},
		{"label": "null", "actual": CborCodecScript.encode_data(null), "hex": "f6"},
		{"label": "false", "actual": CborCodecScript.encode_data(false), "hex": "f4"},
		{"label": "true", "actual": CborCodecScript.encode_data(true), "hex": "f5"},
		{"label": "uint direct", "actual": CborCodecScript.encode_data(23), "hex": "17"},
		{"label": "uint 8-bit", "actual": CborCodecScript.encode_data(24), "hex": "1818"},
		{"label": "uint 16-bit", "actual": CborCodecScript.encode_data(256), "hex": "190100"},
		{
			"label": "uint max safe",
			"actual": CborCodecScript.encode_data(9007199254740991),
			"hex": "1b001fffffffffffff",
		},
		{"label": "negative direct", "actual": CborCodecScript.encode_data(-1), "hex": "20"},
		{"label": "negative 8-bit", "actual": CborCodecScript.encode_data(-25), "hex": "3818"},
		{
			"label": "negative min safe",
			"actual": CborCodecScript.encode_data(-9007199254740991),
			"hex": "3b001ffffffffffffe",
		},
		{"label": "array", "actual": CborCodecScript.encode_data([1, "a", false]), "hex": "83016161f4"},
		{"label": "map", "actual": CborCodecScript.encode_data({"a": 1}), "hex": "a1616101"},
		{"label": "float64", "actual": CborCodecScript.encode_data(1.5), "hex": "fb3ff8000000000000"},
	]


static func _decoding_fixtures() -> Array[Dictionary]:
	return [
		{
			"label": "decode text",
			"actual": CborCodecScript.try_decode_text(_hex("626869")),
			"expected": "hi",
		},
		{
			"label": "decode bytes",
			"actual": CborCodecScript.try_decode_bytes(_hex("43010203")),
			"expected": _bytes([1, 2, 3]),
		},
		{
			"label": "decode null",
			"actual": CborCodecScript.try_decode_data(_hex("f6")),
			"expected": null,
		},
		{
			"label": "decode false",
			"actual": CborCodecScript.try_decode_data(_hex("f4")),
			"expected": false,
		},
		{
			"label": "decode true",
			"actual": CborCodecScript.try_decode_data(_hex("f5")),
			"expected": true,
		},
		{
			"label": "decode uint",
			"actual": CborCodecScript.try_decode_data(_hex("190100")),
			"expected": 256,
		},
		{
			"label": "decode negative",
			"actual": CborCodecScript.try_decode_data(_hex("3818")),
			"expected": -25,
		},
		{
			"label": "decode array",
			"actual": CborCodecScript.try_decode_data(_hex("83016161f4")),
			"expected": [1, "a", false],
		},
		{
			"label": "decode map",
			"actual": CborCodecScript.try_decode_data(_hex("a1616101")),
			"expected": {"a": 1},
		},
		{
			"label": "decode float64",
			"actual": CborCodecScript.try_decode_data(_hex("fb3ff8000000000000")),
			"expected": 1.5,
		},
		{
			"label": "decode float32",
			"actual": CborCodecScript.try_decode_data(_hex("fa3fc00000")),
			"expected": 1.5,
		},
		{
			"label": "decode float16",
			"actual": CborCodecScript.try_decode_data(_hex("f93e00")),
			"expected": 1.5,
		},
	]


static func _error_fixtures() -> Array[Dictionary]:
	return [
		{
			"label": "trailing bytes",
			"actual": CborCodecScript.try_decode_data(_hex("0000")),
			"error": "trailing bytes",
		},
		{
			"label": "unexpected end",
			"actual": CborCodecScript.try_decode_text(_hex("62ff")),
			"error": "unexpected end of CBOR data",
		},
		{
			"label": "invalid utf8 text",
			"actual": CborCodecScript.try_decode_text(_hex("61ff")),
			"error": "invalid CBOR UTF-8 text",
		},
		{
			"label": "reserved additional information",
			"actual": CborCodecScript.try_decode_data(_hex("1c")),
			"error": "reserved CBOR additional information",
		},
		{
			"label": "indefinite length",
			"actual": CborCodecScript.try_decode_data(_hex("5f")),
			"error": "indefinite CBOR values are not supported",
		},
		{
			"label": "map key type",
			"actual": CborCodecScript.try_decode_data(_hex("a10102")),
			"error": "CBOR map keys must be strings",
		},
		{
			"label": "duplicate map key",
			"actual": CborCodecScript.try_decode_data(_hex("a2616101616102")),
			"error": "CBOR map contains duplicate string keys",
		},
		{
			"label": "text lane type",
			"actual": CborCodecScript.try_decode_text(_hex("01")),
			"error": "expected CBOR text string",
		},
		{
			"label": "unsafe unsigned integer",
			"actual": CborCodecScript.try_decode_data(_hex("1b0020000000000000")),
			"error": "Kirie CBOR data integers must fit the JavaScript safe integer range",
		},
		{
			"label": "unsafe negative integer",
			"actual": CborCodecScript.try_decode_data(_hex("3b001fffffffffffff")),
			"error": "Kirie CBOR data integers must fit the JavaScript safe integer range",
		},
		{
			"label": "oversized length",
			"actual": CborCodecScript.try_decode_bytes(_hex("5bffffffffffffffff")),
			"error": "CBOR length is too large",
		},
		{
			"label": "oversized array count",
			"actual": CborCodecScript.try_decode_data(_hex("9a7fffffff")),
			"error": "unexpected end of CBOR data",
		},
		{
			"label": "infinite float",
			"actual": CborCodecScript.try_decode_data(_hex("f97c00")),
			"error": "Kirie CBOR data numbers must be finite",
		},
		{
			"label": "nan float",
			"actual": CborCodecScript.try_decode_data(_hex("f97e00")),
			"error": "Kirie CBOR data numbers must be finite",
		},
		{
			"label": "data lane rejects bytes",
			"actual": CborCodecScript.try_decode_data(_hex("40")),
			"error": "CBOR byte strings belong to the binary lane",
		},
		{
			"label": "data lane rejects nested bytes",
			"actual": CborCodecScript.try_decode_data(_hex("a16562797465734101")),
			"error": "CBOR byte strings belong to the binary lane",
		},
		{
			"label": "decode deep array",
			"actual": CborCodecScript.try_decode_data(_nested_single_array_packet(65)),
			"error": "Kirie CBOR nesting is too deep",
		},
	]


static func _encode_error_fixtures() -> Array[Dictionary]:
	return [
		{
			"label": "encode non-string map key",
			"actual": CborCodecScript.try_encode_data({1: "one"}),
			"error": "Kirie CBOR data maps only support string keys",
		},
		{
			"label": "encode unsafe integer",
			"actual": CborCodecScript.try_encode_data(9007199254740992),
			"error": "Kirie CBOR data integers must fit the JavaScript safe integer range",
		},
		{
			"label": "encode infinite float",
			"actual": CborCodecScript.try_encode_data(INF),
			"error": "Kirie CBOR data numbers must be finite",
		},
		{
			"label": "encode deep array",
			"actual": CborCodecScript.try_encode_data(_nested_array(65)),
			"error": "Kirie CBOR nesting is too deep",
		},
	]


static func _expect_encoded(label: String, actual: PackedByteArray, expected_hex: String) -> String:
	var expected := _hex(expected_hex)
	if actual == expected:
		return ""

	return "%s encoded %s, expected %s" % [label, actual.hex_encode(), expected_hex]


static func _expect_decoded(label: String, actual: Dictionary, expected: Variant) -> String:
	if not actual["ok"]:
		return "%s failed: %s" % [label, actual["error"]]

	if actual["value"] == expected:
		return ""

	return "%s decoded %s, expected %s" % [label, str(actual["value"]), str(expected)]


static func _expect_error(label: String, actual: Dictionary, expected_error: String) -> String:
	if actual["ok"]:
		return "%s succeeded unexpectedly with %s" % [label, str(actual["value"])]

	if actual["error"] == expected_error:
		return ""

	return "%s failed with %s, expected %s" % [label, actual["error"], expected_error]


static func _hex(value: String) -> PackedByteArray:
	var bytes := PackedByteArray()
	for index in range(0, value.length(), 2):
		bytes.append(value.substr(index, 2).hex_to_int())

	return bytes


static func _bytes(value: Array[int]) -> PackedByteArray:
	var bytes := PackedByteArray()
	for item in value:
		bytes.append(item)

	return bytes


static func _nested_array(depth: int) -> Variant:
	var value: Variant = null
	for _index in depth:
		value = [value]

	return value


static func _nested_single_array_packet(depth: int) -> PackedByteArray:
	var bytes := PackedByteArray()
	for _index in depth:
		bytes.append(0x81)

	bytes.append(0xf6)
	return bytes
