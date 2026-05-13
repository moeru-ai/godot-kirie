using System;
using System.Collections.Generic;

static void Expect(bool condition, string label)
{
    if (!condition)
    {
        throw new Exception(label);
    }
}

static void ExpectBytes(byte[] actual, string expectedHex, string label)
{
    var actualHex = Convert.ToHexString(actual).ToLowerInvariant();
    if (actualHex != expectedHex)
    {
        throw new Exception($"{label} encoded {actualHex}, expected {expectedHex}");
    }
}

static void ExpectCborError(Action action, string expectedMessage, string label)
{
    try
    {
        action();
    }
    catch (KirieCborException error) when (error.Message.Contains(expectedMessage, StringComparison.Ordinal))
    {
        return;
    }

    throw new Exception($"{label} did not fail with {expectedMessage}");
}

static void ExpectArgumentNull(Action action, string label)
{
    try
    {
        action();
    }
    catch (ArgumentNullException)
    {
        return;
    }

    throw new Exception($"{label} did not fail with ArgumentNullException");
}

ExpectBytes(KirieCborCodec.EncodeText("hi"), "626869", "text");
Expect(KirieCborCodec.DecodeText(Convert.FromHexString("626869")) == "hi", "decode text");

ExpectBytes(KirieCborCodec.EncodeBytes(new byte[] { 1, 2, 3 }), "43010203", "bytes");
Expect(KirieCborCodec.DecodeBytes(Convert.FromHexString("43010203"))[2] == 3, "decode bytes");

ExpectBytes(KirieCborCodec.EncodeData(null), "f6", "null");
ExpectBytes(KirieCborCodec.EncodeData(false), "f4", "false");
ExpectBytes(KirieCborCodec.EncodeData(true), "f5", "true");
ExpectBytes(KirieCborCodec.EncodeData(9_007_199_254_740_991L), "1b001fffffffffffff", "max safe");
ExpectBytes(KirieCborCodec.EncodeData(-9_007_199_254_740_991L), "3b001ffffffffffffe", "min safe");
ExpectBytes(KirieCborCodec.EncodeData(1.5), "fb3ff8000000000000", "float64");

var packet = KirieCborCodec.EncodeData(new Dictionary<string, object?>
{
    ["ok"] = true,
    ["items"] = new object?[] { 1L, "two", null, 1.5 },
});
var decoded = (Dictionary<string, object?>)KirieCborCodec.DecodeData(packet)!;
Expect((bool)decoded["ok"]!, "decode data map");
Expect(((object?[])decoded["items"]!)[1] is "two", "decode data array");

Expect((double)KirieCborCodec.DecodeData(Convert.FromHexString("f93e00"))! == 1.5, "decode float16");
Expect((double)KirieCborCodec.DecodeData(Convert.FromHexString("fa3fc00000"))! == 1.5, "decode float32");

ExpectCborError(
    () => KirieCborCodec.EncodeData(new byte[] { 1 }),
    "CBOR byte strings belong to the binary lane",
    "encode data bytes"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(double.NaN),
    "Kirie CBOR data numbers must be finite",
    "encode nan"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(double.PositiveInfinity),
    "Kirie CBOR data numbers must be finite",
    "encode infinity"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(9_007_199_254_740_992L),
    "Kirie CBOR data integers must fit the JavaScript safe integer range",
    "encode unsafe integer"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(new Dictionary<object, object?> { [1] = "one" }),
    "Kirie CBOR data maps only support string keys",
    "encode non-string map key"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(LazyItems()),
    "Kirie CBOR data arrays must be bounded collections",
    "encode lazy enumerable"
);
ExpectCborError(
    () => KirieCborCodec.EncodeData(BuildNestedObjectArray(65)),
    "Kirie CBOR nesting is too deep",
    "encode deep array"
);

var cyclic = new object?[1];
cyclic[0] = cyclic;
ExpectCborError(
    () => KirieCborCodec.EncodeData(cyclic),
    "Kirie CBOR data must not contain cyclic references",
    "encode cyclic array"
);
ExpectCborError(
    () => KirieCborCodec.DecodeData(Convert.FromHexString("a2616101616102")),
    "CBOR map contains duplicate string keys",
    "duplicate map key"
);
ExpectCborError(
    () => KirieCborCodec.DecodeData(Convert.FromHexString("9a7fffffff")),
    "unexpected end of CBOR data",
    "oversized array count"
);
ExpectCborError(
    () => KirieCborCodec.DecodeText(Convert.FromHexString("61ff")),
    "invalid CBOR UTF-8 text",
    "invalid utf8 text"
);
ExpectCborError(
    () => KirieCborCodec.DecodeData(Convert.FromHexString("f97c00")),
    "Kirie CBOR data numbers must be finite",
    "infinite float"
);
ExpectCborError(
    () => KirieCborCodec.DecodeData(Convert.FromHexString("a16562797465734101")),
    "CBOR byte strings belong to the binary lane",
    "nested bytes"
);
ExpectCborError(
    () => KirieCborCodec.DecodeData(BuildNestedCborArray(65)),
    "Kirie CBOR nesting is too deep",
    "decode deep array"
);
ExpectArgumentNull(() => KirieCborCodec.EncodeText(null!), "encode null text");
ExpectArgumentNull(() => KirieCborCodec.EncodeBytes(null!), "encode null bytes");
ExpectArgumentNull(() => KirieCborCodec.DecodeData(null!), "decode null packet");

static IEnumerable<object?> LazyItems()
{
    yield return 1L;
}

static object?[] BuildNestedObjectArray(int depth)
{
    object? value = null;
    for (var index = 0; index < depth; index++)
    {
        value = new object?[] { value };
    }

    return (object?[])value!;
}

static byte[] BuildNestedCborArray(int depth)
{
    var bytes = new byte[depth + 1];
    Array.Fill<byte>(bytes, 0x81, 0, depth);
    bytes[depth] = 0xf6;
    return bytes;
}
