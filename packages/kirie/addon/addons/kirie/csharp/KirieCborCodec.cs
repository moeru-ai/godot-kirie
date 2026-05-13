#nullable enable

using System;
using System.Buffers.Binary;
using System.Collections;
using System.Collections.Generic;
using System.Text;

public sealed class KirieCborException : Exception
{
    public KirieCborException(string message)
        : base(message)
    {
    }
}

public static class KirieCborCodec
{
    private const int MajorUint = 0;
    private const int MajorNegInt = 1;
    private const int MajorBytes = 2;
    private const int MajorText = 3;
    private const int MajorArray = 4;
    private const int MajorMap = 5;
    private const int MajorSimple = 7;

    private const int MajorShift = 5;
    private const int AdditionalMask = 0x1f;
    private const int AdditionalOneByte = 24;
    private const int AdditionalTwoBytes = 25;
    private const int AdditionalFourBytes = 26;
    private const int AdditionalEightBytes = 27;
    private const int AdditionalIndefinite = 31;

    private const int SimpleFalse = 20;
    private const int SimpleTrue = 21;
    private const int SimpleNull = 22;
    private const int SimpleFloat16 = 25;
    private const int SimpleFloat32 = 26;
    private const int SimpleFloat64 = 27;

    private const long MaxSafeInteger = 9_007_199_254_740_991L;
    private const long MinSafeInteger = -9_007_199_254_740_991L;
    private const int MaxDepth = 64;

    public static byte[] EncodeText(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var payload = Encoding.UTF8.GetBytes(value);
        var writer = new Writer();
        writer.WriteHead(MajorText, (ulong)payload.Length);
        writer.WriteBytes(payload);
        return writer.ToArray();
    }

    public static string DecodeText(byte[] packet)
    {
        ArgumentNullException.ThrowIfNull(packet);
        var value = Decode(packet);
        if (value is string text)
        {
            return text;
        }

        throw new KirieCborException("expected CBOR text string");
    }

    public static byte[] EncodeBytes(byte[] value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var writer = new Writer();
        writer.WriteHead(MajorBytes, (ulong)value.Length);
        writer.WriteBytes(value);
        return writer.ToArray();
    }

    public static byte[] DecodeBytes(byte[] packet)
    {
        ArgumentNullException.ThrowIfNull(packet);
        var value = Decode(packet);
        if (value is byte[] bytes)
        {
            return bytes;
        }

        throw new KirieCborException("expected CBOR byte string");
    }

    public static byte[] EncodeData(object? value)
    {
        var writer = new Writer();
        WriteDataValue(writer, value, 0, new HashSet<object>(ReferenceEqualityComparer.Instance));
        return writer.ToArray();
    }

    public static object? DecodeData(byte[] packet)
    {
        ArgumentNullException.ThrowIfNull(packet);
        var value = Decode(packet);
        ValidateDataValue(value);
        return value;
    }

    private static object? Decode(byte[] packet)
    {
        var reader = new Reader(packet);
        var value = reader.ReadValue(0);
        if (reader.Offset == packet.Length)
        {
            return value;
        }

        throw new KirieCborException("trailing bytes");
    }

    private static void WriteDataValue(
        Writer writer,
        object? value,
        int depth,
        HashSet<object> seenContainers
    )
    {
        EnsureDepth(depth);
        switch (value)
        {
            case null:
                writer.WriteInitial(MajorSimple, SimpleNull);
                return;
            case bool boolValue:
                writer.WriteInitial(MajorSimple, boolValue ? SimpleTrue : SimpleFalse);
                return;
            case string stringValue:
                writer.WriteText(stringValue);
                return;
            case byte[]:
                throw new KirieCborException("CBOR byte strings belong to the binary lane");
            case sbyte or byte or short or ushort or int or uint or long or ulong:
                writer.WriteInteger(ToSafeInteger(value));
                return;
            case float floatValue:
                writer.WriteFloat64(floatValue);
                return;
            case double doubleValue:
                writer.WriteFloat64(doubleValue);
                return;
            case decimal:
                throw new KirieCborException("Unsupported Kirie CBOR data type: decimal");
            case IReadOnlyDictionary<string, object?> dictionary:
                writer.WriteDictionary(dictionary, depth, seenContainers);
                return;
            case IDictionary dictionary:
                writer.WriteDictionary(dictionary, depth, seenContainers);
                return;
            case IReadOnlyCollection<object?> collection:
                writer.WriteArray(collection, depth, seenContainers);
                return;
            case ICollection collection:
                writer.WriteArray(collection, depth, seenContainers);
                return;
            case IEnumerable:
                throw new KirieCborException("Kirie CBOR data arrays must be bounded collections");
            default:
                throw new KirieCborException($"Unsupported Kirie CBOR data type: {value.GetType().FullName}");
        }
    }

    private static void EnsureDepth(int depth)
    {
        if (depth <= MaxDepth)
        {
            return;
        }

        throw new KirieCborException("Kirie CBOR nesting is too deep");
    }

    private static void EnterContainer(HashSet<object> seenContainers, object container)
    {
        if (seenContainers.Add(container))
        {
            return;
        }

        throw new KirieCborException("Kirie CBOR data must not contain cyclic references");
    }

    private static void LeaveContainer(HashSet<object> seenContainers, object container)
    {
        seenContainers.Remove(container);
    }

    private static IEnumerable<object?> ReadCollectionItems(ICollection collection)
    {
        foreach (var item in collection)
        {
            yield return item;
        }
    }

    private static int CollectionCount(ICollection collection) => collection.Count;

    private static IEnumerable<object?> ReadCollectionItems(IReadOnlyCollection<object?> collection)
    {
        foreach (var item in collection)
        {
            yield return item;
        }
    }

    private static int CollectionCount(IReadOnlyCollection<object?> collection) => collection.Count;

    private static void ValidateDataValue(object? value, int depth)
    {
        EnsureDepth(depth);
        switch (value)
        {
            case null:
            case bool:
            case string:
            case long:
            case double doubleValue when double.IsFinite(doubleValue):
                return;
            case double:
                throw new KirieCborException("Kirie CBOR data numbers must be finite");
            case byte[]:
                throw new KirieCborException("CBOR byte strings belong to the binary lane");
            case object?[] array:
                foreach (var item in array)
                {
                    ValidateDataValue(item, depth + 1);
                }
                return;
            case Dictionary<string, object?> dictionary:
                foreach (var item in dictionary.Values)
                {
                    ValidateDataValue(item, depth + 1);
                }
                return;
            default:
                throw new KirieCborException($"Unsupported Kirie CBOR data type: {value.GetType().FullName}");
        }
    }

    private static long ToSafeInteger(object value)
    {
        var integer = value switch
        {
            sbyte typed => typed,
            byte typed => typed,
            short typed => typed,
            ushort typed => typed,
            int typed => typed,
            uint typed => typed,
            long typed => typed,
            ulong typed when typed <= (ulong)MaxSafeInteger => (long)typed,
            ulong => throw new KirieCborException("Kirie CBOR data integers must fit the JavaScript safe integer range"),
            _ => throw new KirieCborException($"Unsupported Kirie CBOR data type: {value.GetType().FullName}"),
        };

        if (integer is < MinSafeInteger or > MaxSafeInteger)
        {
            throw new KirieCborException("Kirie CBOR data integers must fit the JavaScript safe integer range");
        }

        return integer;
    }

    private static void ValidateDataValue(object? value)
    {
        ValidateDataValue(value, 0);
    }

    private sealed class Writer
    {
        private readonly List<byte> _bytes = new();

        public byte[] ToArray() => _bytes.ToArray();

        public void WriteInitial(int major, int additional)
        {
            _bytes.Add((byte)((major << MajorShift) | additional));
        }

        public void WriteHead(int major, ulong value)
        {
            if (value < AdditionalOneByte)
            {
                WriteInitial(major, (int)value);
                return;
            }

            if (value <= byte.MaxValue)
            {
                WriteInitial(major, AdditionalOneByte);
                _bytes.Add((byte)value);
                return;
            }

            if (value <= ushort.MaxValue)
            {
                WriteInitial(major, AdditionalTwoBytes);
                _bytes.Add((byte)(value >> 8));
                _bytes.Add((byte)value);
                return;
            }

            if (value <= uint.MaxValue)
            {
                WriteInitial(major, AdditionalFourBytes);
                _bytes.Add((byte)(value >> 24));
                _bytes.Add((byte)(value >> 16));
                _bytes.Add((byte)(value >> 8));
                _bytes.Add((byte)value);
                return;
            }

            WriteInitial(major, AdditionalEightBytes);
            _bytes.Add((byte)(value >> 56));
            _bytes.Add((byte)(value >> 48));
            _bytes.Add((byte)(value >> 40));
            _bytes.Add((byte)(value >> 32));
            _bytes.Add((byte)(value >> 24));
            _bytes.Add((byte)(value >> 16));
            _bytes.Add((byte)(value >> 8));
            _bytes.Add((byte)value);
        }

        public void WriteBytes(byte[] bytes)
        {
            _bytes.AddRange(bytes);
        }

        public void WriteText(string value)
        {
            var payload = Encoding.UTF8.GetBytes(value);
            WriteHead(MajorText, (ulong)payload.Length);
            WriteBytes(payload);
        }

        public void WriteInteger(long value)
        {
            if (value >= 0)
            {
                WriteHead(MajorUint, (ulong)value);
                return;
            }

            WriteHead(MajorNegInt, (ulong)(-1 - value));
        }

        public void WriteFloat64(double value)
        {
            if (!double.IsFinite(value))
            {
                throw new KirieCborException("Kirie CBOR data numbers must be finite");
            }

            Span<byte> buffer = stackalloc byte[8];
            BinaryPrimitives.WriteInt64BigEndian(buffer, BitConverter.DoubleToInt64Bits(value));
            WriteInitial(MajorSimple, SimpleFloat64);
            foreach (var item in buffer)
            {
                _bytes.Add(item);
            }
        }

        public void WriteArray(ICollection collection, int depth, HashSet<object> seenContainers)
        {
            EnterContainer(seenContainers, collection);
            try
            {
                WriteHead(MajorArray, (ulong)CollectionCount(collection));
                foreach (var item in ReadCollectionItems(collection))
                {
                    WriteDataValue(this, item, depth + 1, seenContainers);
                }
            }
            finally
            {
                LeaveContainer(seenContainers, collection);
            }
        }

        public void WriteArray(
            IReadOnlyCollection<object?> collection,
            int depth,
            HashSet<object> seenContainers
        )
        {
            EnterContainer(seenContainers, collection);
            try
            {
                WriteHead(MajorArray, (ulong)CollectionCount(collection));
                foreach (var item in ReadCollectionItems(collection))
                {
                    WriteDataValue(this, item, depth + 1, seenContainers);
                }
            }
            finally
            {
                LeaveContainer(seenContainers, collection);
            }
        }

        public void WriteDictionary(
            IDictionary dictionary,
            int depth,
            HashSet<object> seenContainers
        )
        {
            EnterContainer(seenContainers, dictionary);
            try
            {
                WriteHead(MajorMap, (ulong)dictionary.Count);
                foreach (DictionaryEntry entry in dictionary)
                {
                    if (entry.Key is not string key)
                    {
                        throw new KirieCborException("Kirie CBOR data maps only support string keys");
                    }

                    WriteText(key);
                    WriteDataValue(this, entry.Value, depth + 1, seenContainers);
                }
            }
            finally
            {
                LeaveContainer(seenContainers, dictionary);
            }
        }

        public void WriteDictionary(
            IReadOnlyDictionary<string, object?> dictionary,
            int depth,
            HashSet<object> seenContainers
        )
        {
            EnterContainer(seenContainers, dictionary);
            try
            {
                WriteHead(MajorMap, (ulong)dictionary.Count);
                foreach (var (key, value) in dictionary)
                {
                    WriteText(key);
                    WriteDataValue(this, value, depth + 1, seenContainers);
                }
            }
            finally
            {
                LeaveContainer(seenContainers, dictionary);
            }
        }
    }

    private sealed class Reader
    {
        private static readonly UTF8Encoding StrictUtf8 = new(false, true);
        private readonly byte[] _bytes;

        public Reader(byte[] bytes)
        {
            _bytes = bytes;
        }

        public int Offset { get; private set; }

        public object? ReadValue(int depth)
        {
            EnsureDepth(depth);
            EnsureAvailable(1);
            var initial = ReadByte();
            var major = initial >> MajorShift;
            var additional = initial & AdditionalMask;

            return major switch
            {
                MajorUint => ReadUnsignedDataInteger(additional),
                MajorNegInt => ReadNegativeDataInteger(additional),
                MajorBytes => ReadBytes(additional),
                MajorText => ReadText(additional),
                MajorArray => ReadArray(additional, depth),
                MajorMap => ReadMap(additional, depth),
                MajorSimple => ReadSimple(additional),
                _ => throw new KirieCborException("unsupported CBOR major type"),
            };
        }

        private long ReadUnsignedDataInteger(int additional)
        {
            var value = ReadUnsigned(additional);
            if (value <= (ulong)MaxSafeInteger)
            {
                return (long)value;
            }

            throw new KirieCborException("Kirie CBOR data integers must fit the JavaScript safe integer range");
        }

        private long ReadNegativeDataInteger(int additional)
        {
            var value = ReadUnsigned(additional);
            if (value > (ulong)MaxSafeInteger - 1)
            {
                throw new KirieCborException("Kirie CBOR data integers must fit the JavaScript safe integer range");
            }

            return -1 - (long)value;
        }

        private byte[] ReadBytes(int additional)
        {
            var length = ReadLength(additional);
            EnsureAvailable(length);
            var value = new byte[length];
            Array.Copy(_bytes, Offset, value, 0, length);
            Offset += length;
            return value;
        }

        private string ReadText(int additional)
        {
            try
            {
                return StrictUtf8.GetString(ReadBytes(additional));
            }
            catch (DecoderFallbackException error)
            {
                throw new KirieCborException($"invalid CBOR UTF-8 text: {error.Message}");
            }
        }

        private object?[] ReadArray(int additional, int depth)
        {
            var count = ReadLength(additional);
            if (count > _bytes.Length - Offset)
            {
                throw new KirieCborException("unexpected end of CBOR data");
            }

            var value = new object?[count];
            for (var index = 0; index < count; index++)
            {
                value[index] = ReadValue(depth + 1);
            }

            return value;
        }

        private Dictionary<string, object?> ReadMap(int additional, int depth)
        {
            var count = ReadLength(additional);
            if (count > (_bytes.Length - Offset) / 2)
            {
                throw new KirieCborException("unexpected end of CBOR data");
            }

            var value = new Dictionary<string, object?>(count, StringComparer.Ordinal);
            for (var index = 0; index < count; index++)
            {
                if (ReadValue(depth + 1) is not string key)
                {
                    throw new KirieCborException("CBOR map keys must be strings");
                }

                if (value.ContainsKey(key))
                {
                    throw new KirieCborException("CBOR map contains duplicate string keys");
                }

                value[key] = ReadValue(depth + 1);
            }

            return value;
        }

        private object? ReadSimple(int additional)
        {
            return additional switch
            {
                SimpleFalse => false,
                SimpleTrue => true,
                SimpleNull => null,
                SimpleFloat16 => ReadFloat16(),
                SimpleFloat32 => ReadFloat32(),
                SimpleFloat64 => ReadFloat64(),
                _ => throw new KirieCborException("unsupported CBOR simple value"),
            };
        }

        private double ReadFloat16()
        {
            var bits = (ushort)ReadFixed(2);
            var sign = (bits & 0x8000) == 0 ? 1.0 : -1.0;
            var exponent = (bits >> 10) & 0x1f;
            var fraction = bits & 0x03ff;

            if (exponent == 0)
            {
                return sign * Math.Pow(2.0, -14.0) * (fraction / 1024.0);
            }

            if (exponent == 0x1f)
            {
                return fraction == 0 ? sign * double.PositiveInfinity : double.NaN;
            }

            return sign * Math.Pow(2.0, exponent - 15.0) * (1.0 + fraction / 1024.0);
        }

        private double ReadFloat32()
        {
            var bits = unchecked((int)ReadFixed(4));
            return BitConverter.Int32BitsToSingle(bits);
        }

        private double ReadFloat64()
        {
            var bits = unchecked((long)ReadFixed(8));
            return BitConverter.Int64BitsToDouble(bits);
        }

        private int ReadLength(int additional)
        {
            var value = ReadUnsigned(additional);
            if (value <= int.MaxValue)
            {
                return (int)value;
            }

            throw new KirieCborException("CBOR length is too large");
        }

        private ulong ReadUnsigned(int additional)
        {
            if (additional < AdditionalOneByte)
            {
                return (ulong)additional;
            }

            return additional switch
            {
                AdditionalOneByte => ReadFixed(1),
                AdditionalTwoBytes => ReadFixed(2),
                AdditionalFourBytes => ReadFixed(4),
                AdditionalEightBytes => ReadFixed(8),
                AdditionalIndefinite => throw new KirieCborException("indefinite CBOR values are not supported"),
                _ => throw new KirieCborException("reserved CBOR additional information"),
            };
        }

        private ulong ReadFixed(int byteCount)
        {
            EnsureAvailable(byteCount);
            var value = 0UL;
            for (var index = 0; index < byteCount; index++)
            {
                value = (value << 8) | _bytes[Offset + index];
            }

            Offset += byteCount;
            return value;
        }

        private byte ReadByte()
        {
            return _bytes[Offset++];
        }

        private void EnsureAvailable(int byteCount)
        {
            if (Offset + byteCount <= _bytes.Length)
            {
                return;
            }

            throw new KirieCborException("unexpected end of CBOR data");
        }
    }
}
