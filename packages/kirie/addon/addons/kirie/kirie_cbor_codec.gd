class_name KirieCborCodec
extends RefCounted

const MAJOR_UINT := 0
const MAJOR_NEGINT := 1
const MAJOR_BYTES := 2
const MAJOR_TEXT := 3
const MAJOR_ARRAY := 4
const MAJOR_MAP := 5
const MAJOR_SIMPLE := 7

# CBOR initial byte layout: top 3 bits are the major type, low 5 bits carry
# either a small value or the width of the following big-endian argument.
const MAJOR_SHIFT := 5
const ADDITIONAL_MASK := 0x1f
const ADDITIONAL_ONE_BYTE := 24
const ADDITIONAL_TWO_BYTES := 25
const ADDITIONAL_FOUR_BYTES := 26
const ADDITIONAL_EIGHT_BYTES := 27
const ADDITIONAL_INDEFINITE := 31

const SIMPLE_FALSE := 20
const SIMPLE_TRUE := 21
const SIMPLE_NULL := 22
const SIMPLE_FLOAT16 := 25
const SIMPLE_FLOAT32 := 26
const SIMPLE_FLOAT64 := 27
const MAX_SAFE_INTEGER := 9007199254740991
const MIN_SAFE_INTEGER := -9007199254740991
const MAX_LENGTH := 2147483647
const MAX_DEPTH := 64

static func encode_text(value: String) -> PackedByteArray:
	var payload := value.to_utf8_buffer()
	return _encode_header(MAJOR_TEXT, payload.size()) + payload

static func encode_bytes(value: PackedByteArray) -> PackedByteArray:
	return _encode_header(MAJOR_BYTES, value.size()) + value

static func encode_data(value: Variant) -> PackedByteArray:
	var encoded := try_encode_data(value)
	if encoded["ok"]:
		return encoded["value"]

	push_error(encoded["error"])
	return PackedByteArray()

static func try_encode_data(value: Variant) -> Dictionary:
	return _encode_value(value, 0)

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

	var validation_error := _validate_data_value(decoded["value"], 0)
	if validation_error != "":
		return {"ok": false, "error": validation_error}

	return decoded

static func _try_decode(packet: PackedByteArray) -> Dictionary:
	var reader := CborReader.new(packet)
	var value := reader.read_value(0)
	if not reader.ok:
		return {"ok": false, "error": reader.error}

	if reader.offset != packet.size():
		return {"ok": false, "error": "trailing bytes"}

	return {"ok": true, "value": value}

static func _encode_value(value: Variant, depth: int) -> Dictionary:
	if depth > MAX_DEPTH:
		return _encode_error("Kirie CBOR nesting is too deep")

	match typeof(value):
		TYPE_NIL:
			return _encoded(PackedByteArray([_initial_byte(MAJOR_SIMPLE, SIMPLE_NULL)]))
		TYPE_BOOL:
			return _encoded(PackedByteArray([
				_initial_byte(MAJOR_SIMPLE, SIMPLE_TRUE if value else SIMPLE_FALSE),
			]))
		TYPE_INT:
			return _encode_int(value)
		TYPE_FLOAT:
			return _encode_float64(value)
		TYPE_STRING:
			return _encoded(encode_text(value))
		TYPE_ARRAY:
			return _encode_array(value, depth)
		TYPE_DICTIONARY:
			return _encode_dictionary(value, depth)
		_:
			return _encode_error("Unsupported Kirie CBOR data type: %s" % type_string(typeof(value)))

static func _encode_int(value: int) -> Dictionary:
	if value < MIN_SAFE_INTEGER or value > MAX_SAFE_INTEGER:
		return _encode_error("Kirie CBOR data integers must fit the JavaScript safe integer range")

	if value >= 0:
		return _encode_uint(MAJOR_UINT, value)

	return _encode_uint(MAJOR_NEGINT, -1 - value)

static func _encode_array(value: Array, depth: int) -> Dictionary:
	var packet := _encode_header(MAJOR_ARRAY, value.size())
	for item in value:
		var encoded := _encode_value(item, depth + 1)
		if not encoded["ok"]:
			return encoded

		packet.append_array(encoded["value"])

	return _encoded(packet)

static func _encode_dictionary(value: Dictionary, depth: int) -> Dictionary:
	var packet := _encode_header(MAJOR_MAP, value.size())
	for key in value:
		if typeof(key) != TYPE_STRING:
			return _encode_error("Kirie CBOR data maps only support string keys")

		packet.append_array(encode_text(key))
		var encoded := _encode_value(value[key], depth + 1)
		if not encoded["ok"]:
			return encoded

		packet.append_array(encoded["value"])

	return _encoded(packet)

static func _encode_float64(value: float) -> Dictionary:
	if not _is_finite(value):
		return _encode_error("Kirie CBOR data numbers must be finite")

	var little_endian := PackedByteArray()
	little_endian.resize(8)
	little_endian.encode_double(0, value)
	var packet := PackedByteArray([_initial_byte(MAJOR_SIMPLE, SIMPLE_FLOAT64)])
	for index in range(7, -1, -1):
		packet.append(little_endian[index])

	return _encoded(packet)

static func _encode_header(major: int, length: int) -> PackedByteArray:
	return _encode_uint_bytes(major, length)

static func _encode_uint(major: int, value: int) -> Dictionary:
	return _encoded(_encode_uint_bytes(major, value))

static func _encode_uint_bytes(major: int, value: int) -> PackedByteArray:
	if value < ADDITIONAL_ONE_BYTE:
		return PackedByteArray([_initial_byte(major, value)])

	if value <= 0xff:
		return PackedByteArray([_initial_byte(major, ADDITIONAL_ONE_BYTE), value])

	if value <= 0xffff:
		return PackedByteArray([_initial_byte(major, ADDITIONAL_TWO_BYTES), value >> 8, value])

	if value <= 0xffffffff:
		return PackedByteArray([
			_initial_byte(major, ADDITIONAL_FOUR_BYTES),
			value >> 24,
			value >> 16,
			value >> 8,
			value,
		])

	return PackedByteArray([
		_initial_byte(major, ADDITIONAL_EIGHT_BYTES),
		value >> 56,
		value >> 48,
		value >> 40,
		value >> 32,
		value >> 24,
		value >> 16,
		value >> 8,
		value,
	])


static func _initial_byte(major: int, additional: int) -> int:
	return (major << MAJOR_SHIFT) | additional


static func _encoded(value: PackedByteArray) -> Dictionary:
	return {"ok": true, "value": value}


static func _encode_error(message: String) -> Dictionary:
	return {"ok": false, "error": message}


static func _validate_data_value(value: Variant, depth: int) -> String:
	if depth > MAX_DEPTH:
		return "Kirie CBOR nesting is too deep"

	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_STRING:
			return ""
		TYPE_INT:
			if value < MIN_SAFE_INTEGER or value > MAX_SAFE_INTEGER:
				return "Kirie CBOR data integers must fit the JavaScript safe integer range"

			return ""
		TYPE_FLOAT:
			if not _is_finite(value):
				return "Kirie CBOR data numbers must be finite"

			return ""
		TYPE_PACKED_BYTE_ARRAY:
			return "CBOR byte strings belong to the binary lane"
		TYPE_ARRAY:
			for item in value:
				var item_error := _validate_data_value(item, depth + 1)
				if item_error != "":
					return item_error

			return ""
		TYPE_DICTIONARY:
			for key in value:
				if typeof(key) != TYPE_STRING:
					return "CBOR map keys must be strings"

				var item_error := _validate_data_value(value[key], depth + 1)
				if item_error != "":
					return item_error

			return ""
		_:
			return "Unsupported Kirie CBOR data type: %s" % type_string(typeof(value))


static func _is_finite(value: float) -> bool:
	return not is_nan(value) and not is_inf(value)


class CborReader:
	var bytes: PackedByteArray
	var offset := 0
	var ok := true
	var error := ""

	func _init(packet: PackedByteArray) -> void:
		bytes = packet

	func read_value(depth: int) -> Variant:
		if depth > KirieCborCodec.MAX_DEPTH:
			_fail("Kirie CBOR nesting is too deep")
			return null

		if not _ensure_available(1):
			return null

		var initial := _read_byte()
		var major := initial >> KirieCborCodec.MAJOR_SHIFT
		var additional := initial & KirieCborCodec.ADDITIONAL_MASK
		var value = null

		match major:
			KirieCborCodec.MAJOR_UINT:
				value = _read_uint(additional)
			KirieCborCodec.MAJOR_NEGINT:
				value = _read_negint(additional)
			KirieCborCodec.MAJOR_BYTES:
				value = _read_bytes(additional)
			KirieCborCodec.MAJOR_TEXT:
				value = _read_text(additional)
			KirieCborCodec.MAJOR_ARRAY:
				value = _read_array(additional, depth)
			KirieCborCodec.MAJOR_MAP:
				value = _read_map(additional, depth)
			KirieCborCodec.MAJOR_SIMPLE:
				value = _read_simple(additional)
			_:
				_fail("unsupported CBOR major type")

		return value

	func _read_array(additional: int, depth: int) -> Array:
		var count := _read_length(additional)
		var value := []
		for _index in count:
			if not ok:
				return value

			value.append(read_value(depth + 1))

		return value

	func _read_map(additional: int, depth: int) -> Dictionary:
		var count := _read_length(additional)
		var value := {}
		for _index in count:
			if not ok:
				return value

			var key := read_value(depth + 1)
			if typeof(key) != TYPE_STRING:
				_fail("CBOR map keys must be strings")
				return value

			if value.has(key):
				_fail("CBOR map contains duplicate string keys")
				return value

			value[key] = read_value(depth + 1)

		return value

	func _read_bytes(additional: int) -> PackedByteArray:
		var length := _read_length(additional)
		if not _ensure_available(length):
			return PackedByteArray()

		var value := bytes.slice(offset, offset + length)
		offset += length
		return value

	func _read_text(additional: int) -> String:
		var payload := _read_bytes(additional)
		if not ok:
			return ""

		if not _is_valid_utf8(payload):
			_fail("invalid CBOR UTF-8 text")
			return ""

		return payload.get_string_from_utf8()

	func _read_simple(additional: int) -> Variant:
		var value: Variant = null
		match additional:
			KirieCborCodec.SIMPLE_FALSE:
				value = false
			KirieCborCodec.SIMPLE_TRUE:
				value = true
			KirieCborCodec.SIMPLE_NULL:
				value = null
			KirieCborCodec.SIMPLE_FLOAT16:
				value = _read_float16()
			KirieCborCodec.SIMPLE_FLOAT32:
				value = _read_float32()
			KirieCborCodec.SIMPLE_FLOAT64:
				value = _read_float64()
			_:
				_fail("unsupported CBOR simple value")

		return value

	func _read_float16() -> float:
		var bits := _read_fixed(2, 0xffff, "CBOR float16 bits are too large")
		var sign := 1.0
		if (bits & 0x8000) != 0:
			sign = -1.0

		var exponent := (bits >> 10) & 0x1f
		var fraction := bits & 0x03ff
		if exponent == 0:
			return sign * pow(2.0, -14.0) * (float(fraction) / 1024.0)

		if exponent == 0x1f:
			if fraction == 0:
				return sign * INF

			return NAN

		return sign * pow(2.0, float(exponent - 15)) * (1.0 + float(fraction) / 1024.0)

	func _read_float32() -> float:
		var bits := _read_fixed(4, 0xffffffff, "CBOR float32 bits are too large")
		var little_endian := PackedByteArray([
			bits & 0xff,
			(bits >> 8) & 0xff,
			(bits >> 16) & 0xff,
			(bits >> 24) & 0xff,
		])
		return little_endian.decode_float(0)

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
		return _read_uint_limited(
			additional,
			KirieCborCodec.MAX_SAFE_INTEGER,
			"Kirie CBOR data integers must fit the JavaScript safe integer range",
		)

	func _read_negint(additional: int) -> int:
		var value := _read_uint_limited(
			additional,
			KirieCborCodec.MAX_SAFE_INTEGER - 1,
			"Kirie CBOR data integers must fit the JavaScript safe integer range",
		)
		return -1 - value

	func _read_length(additional: int) -> int:
		return _read_uint_limited(additional, KirieCborCodec.MAX_LENGTH, "CBOR length is too large")

	func _read_uint_limited(additional: int, max_value: int, overflow_error: String) -> int:
		if additional < KirieCborCodec.ADDITIONAL_ONE_BYTE:
			if additional > max_value:
				_fail(overflow_error)
				return 0

			return additional

		var byte_count := 0
		match additional:
			KirieCborCodec.ADDITIONAL_ONE_BYTE:
				byte_count = 1
			KirieCborCodec.ADDITIONAL_TWO_BYTES:
				byte_count = 2
			KirieCborCodec.ADDITIONAL_FOUR_BYTES:
				byte_count = 4
			KirieCborCodec.ADDITIONAL_EIGHT_BYTES:
				byte_count = 8
			KirieCborCodec.ADDITIONAL_INDEFINITE:
				_fail("indefinite CBOR values are not supported")
				return 0
			_:
				_fail("reserved CBOR additional information")
				return 0

		return _read_fixed(byte_count, max_value, overflow_error)

	func _read_fixed(byte_count: int, max_value: int, overflow_error: String) -> int:
		if not _ensure_available(byte_count):
			return 0

		var value := 0
		for index in byte_count:
			value = (value << 8) | bytes[offset + index]
			if value > max_value:
				_fail(overflow_error)
				return 0

		offset += byte_count
		return value

	func _read_byte() -> int:
		var value := bytes[offset]
		offset += 1
		return value

	func _is_valid_utf8(payload: PackedByteArray) -> bool:
		var index := 0
		var valid := true
		while valid and index < payload.size():
			var byte0 := payload[index]
			if byte0 <= 0x7f:
				index += 1
				continue

			# Strict UTF-8 ranges: reject overlong encodings, surrogate code points,
			# and values past U+10FFFF instead of accepting replacement text.
			if byte0 >= 0xc2 and byte0 <= 0xdf:
				valid = _has_continuation_bytes(payload, index, 1)
				if valid:
					index += 2
				continue

			if byte0 == 0xe0:
				valid = (
					_has_continuation_range(payload, index + 1, 0xa0, 0xbf)
					and _has_continuation_bytes(payload, index + 1, 1)
				)
				if valid:
					index += 3
				continue

			if byte0 >= 0xe1 and byte0 <= 0xec:
				valid = _has_continuation_bytes(payload, index, 2)
				if valid:
					index += 3
				continue

			if byte0 == 0xed:
				valid = (
					_has_continuation_range(payload, index + 1, 0x80, 0x9f)
					and _has_continuation_bytes(payload, index + 1, 1)
				)
				if valid:
					index += 3
				continue

			if byte0 >= 0xee and byte0 <= 0xef:
				valid = _has_continuation_bytes(payload, index, 2)
				if valid:
					index += 3
				continue

			if byte0 == 0xf0:
				valid = (
					_has_continuation_range(payload, index + 1, 0x90, 0xbf)
					and _has_continuation_bytes(payload, index + 1, 2)
				)
				if valid:
					index += 4
				continue

			if byte0 >= 0xf1 and byte0 <= 0xf3:
				valid = _has_continuation_bytes(payload, index, 3)
				if valid:
					index += 4
				continue

			if byte0 == 0xf4:
				valid = (
					_has_continuation_range(payload, index + 1, 0x80, 0x8f)
					and _has_continuation_bytes(payload, index + 1, 2)
				)
				if valid:
					index += 4
				continue

			valid = false

		return valid

	func _has_continuation_range(
		payload: PackedByteArray,
		index: int,
		min_value: int,
		max_value: int,
	) -> bool:
		if index >= payload.size():
			return false

		var byte := payload[index]
		return byte >= min_value and byte <= max_value

	func _has_continuation_bytes(payload: PackedByteArray, start: int, count: int) -> bool:
		for offset_index in range(1, count + 1):
			var index := start + offset_index
			if index >= payload.size():
				return false

			var byte := payload[index]
			if byte < 0x80 or byte > 0xbf:
				return false

		return true

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
