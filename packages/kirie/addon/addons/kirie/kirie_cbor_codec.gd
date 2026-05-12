class_name KirieCborCodec
extends RefCounted

const MAJOR_UINT := 0
const MAJOR_NEGINT := 1
const MAJOR_BYTES := 2
const MAJOR_TEXT := 3
const MAJOR_ARRAY := 4
const MAJOR_MAP := 5
const MAJOR_SIMPLE := 7

static func encode_text(value: String) -> PackedByteArray:
	var payload := value.to_utf8_buffer()
	return _encode_header(MAJOR_TEXT, payload.size()) + payload

static func encode_bytes(value: PackedByteArray) -> PackedByteArray:
	return _encode_header(MAJOR_BYTES, value.size()) + value

static func encode_data(value: Variant) -> PackedByteArray:
	return _encode_value(value)

static func try_decode_text(packet: PackedByteArray) -> Dictionary:
	var decoded := _try_decode(packet)
	if not decoded["ok"]:
		return decoded

	if typeof(decoded["value"]) != TYPE_STRING:
		return {"ok": false, "error": "expected CBOR text string"}

	return decoded

static func try_decode_bytes(packet: PackedByteArray) -> Dictionary:
	var decoded := _try_decode(packet)
	if not decoded["ok"]:
		return decoded

	if typeof(decoded["value"]) != TYPE_PACKED_BYTE_ARRAY:
		return {"ok": false, "error": "expected CBOR byte string"}

	return decoded

static func try_decode_data(packet: PackedByteArray) -> Dictionary:
	var decoded := _try_decode(packet)
	if not decoded["ok"]:
		return decoded

	if typeof(decoded["value"]) == TYPE_PACKED_BYTE_ARRAY:
		return {"ok": false, "error": "CBOR byte strings belong to the binary lane"}

	return decoded

static func _try_decode(packet: PackedByteArray) -> Dictionary:
	var reader := CborReader.new(packet)
	var value := reader.read_value()
	if not reader.ok:
		return {"ok": false, "error": reader.error}

	if reader.offset != packet.size():
		return {"ok": false, "error": "trailing bytes"}

	return {"ok": true, "value": value}

static func _encode_value(value: Variant) -> PackedByteArray:
	match typeof(value):
		TYPE_NIL:
			return PackedByteArray([0xf6])
		TYPE_BOOL:
			return PackedByteArray([0xf5 if value else 0xf4])
		TYPE_INT:
			return _encode_int(value)
		TYPE_FLOAT:
			return _encode_float64(value)
		TYPE_STRING:
			return encode_text(value)
		TYPE_ARRAY:
			return _encode_array(value)
		TYPE_DICTIONARY:
			return _encode_dictionary(value)
		_:
			push_error("Unsupported Kirie CBOR data type: %s" % type_string(typeof(value)))
			return PackedByteArray([0xf6])

static func _encode_int(value: int) -> PackedByteArray:
	if value >= 0:
		return _encode_uint(MAJOR_UINT, value)

	return _encode_uint(MAJOR_NEGINT, -1 - value)

static func _encode_array(value: Array) -> PackedByteArray:
	var packet := _encode_header(MAJOR_ARRAY, value.size())
	for item in value:
		packet.append_array(_encode_value(item))

	return packet

static func _encode_dictionary(value: Dictionary) -> PackedByteArray:
	var packet := _encode_header(MAJOR_MAP, value.size())
	for key in value:
		if typeof(key) != TYPE_STRING:
			push_error("Kirie CBOR data maps only support string keys")
			return PackedByteArray([0xf6])

		packet.append_array(encode_text(key))
		packet.append_array(_encode_value(value[key]))

	return packet

static func _encode_float64(value: float) -> PackedByteArray:
	var little_endian := PackedByteArray()
	little_endian.resize(8)
	little_endian.encode_double(0, value)
	var packet := PackedByteArray([0xfb])
	for index in range(7, -1, -1):
		packet.append(little_endian[index])

	return packet

static func _encode_header(major: int, length: int) -> PackedByteArray:
	return _encode_uint(major, length)

static func _encode_uint(major: int, value: int) -> PackedByteArray:
	if value < 24:
		return PackedByteArray([(major << 5) | value])

	if value <= 0xff:
		return PackedByteArray([(major << 5) | 24, value])

	if value <= 0xffff:
		return PackedByteArray([(major << 5) | 25, value >> 8, value])

	if value <= 0xffffffff:
		return PackedByteArray([(major << 5) | 26, value >> 24, value >> 16, value >> 8, value])

	return PackedByteArray([
		(major << 5) | 27,
		value >> 56,
		value >> 48,
		value >> 40,
		value >> 32,
		value >> 24,
		value >> 16,
		value >> 8,
		value,
	])


class CborReader:
	var bytes: PackedByteArray
	var offset := 0
	var ok := true
	var error := ""

	func _init(packet: PackedByteArray) -> void:
		bytes = packet

	func read_value() -> Variant:
		if not _ensure_available(1):
			return null

		var initial := _read_byte()
		var major := initial >> 5
		var additional := initial & 0x1f
		var value = null

		match major:
			KirieCborCodec.MAJOR_UINT:
				value = _read_uint(additional)
			KirieCborCodec.MAJOR_NEGINT:
				value = -1 - _read_uint(additional)
			KirieCborCodec.MAJOR_BYTES:
				value = _read_bytes(additional)
			KirieCborCodec.MAJOR_TEXT:
				value = _read_text(additional)
			KirieCborCodec.MAJOR_ARRAY:
				value = _read_array(additional)
			KirieCborCodec.MAJOR_MAP:
				value = _read_map(additional)
			KirieCborCodec.MAJOR_SIMPLE:
				value = _read_simple(additional)
			_:
				_fail("unsupported CBOR major type")

		return value

	func _read_array(additional: int) -> Array:
		var count := _read_uint(additional)
		var value := []
		for _index in count:
			if not ok:
				return value

			value.append(read_value())

		return value

	func _read_map(additional: int) -> Dictionary:
		var count := _read_uint(additional)
		var value := {}
		for _index in count:
			if not ok:
				return value

			var key := read_value()
			if typeof(key) != TYPE_STRING:
				_fail("CBOR map keys must be strings")
				return value

			value[key] = read_value()

		return value

	func _read_bytes(additional: int) -> PackedByteArray:
		var length := _read_uint(additional)
		if not _ensure_available(length):
			return PackedByteArray()

		var value := bytes.slice(offset, offset + length)
		offset += length
		return value

	func _read_text(additional: int) -> String:
		return _read_bytes(additional).get_string_from_utf8()

	func _read_simple(additional: int) -> Variant:
		match additional:
			20:
				return false
			21:
				return true
			22:
				return null
			27:
				return _read_float64()
			_:
				_fail("unsupported CBOR simple value")
				return null

	func _read_float64() -> float:
		if not _ensure_available(8):
			return 0.0

		var little_endian := PackedByteArray()
		little_endian.resize(8)
		for index in 8:
			little_endian[7 - index] = bytes[offset + index]

		offset += 8
		return little_endian.decode_double(0)

	func _read_uint(additional: int) -> int:
		if additional < 24:
			return additional

		match additional:
			24:
				return _read_fixed(1)
			25:
				return _read_fixed(2)
			26:
				return _read_fixed(4)
			27:
				return _read_fixed(8)
			_:
				_fail("indefinite CBOR values are not supported")
				return 0

	func _read_fixed(byte_count: int) -> int:
		if not _ensure_available(byte_count):
			return 0

		var value := 0
		for index in byte_count:
			value = (value << 8) | bytes[offset + index]

		offset += byte_count
		return value

	func _read_byte() -> int:
		var value := bytes[offset]
		offset += 1
		return value

	func _ensure_available(byte_count: int) -> bool:
		if offset + byte_count <= bytes.size():
			return true

		_fail("unexpected end of CBOR data")
		return false

	func _fail(message: String) -> void:
		if not ok:
			return

		ok = false
		error = message
