using System.Text.Json.Serialization;
using Eventa;

namespace GdKirie.Platform;

internal sealed record EmptyPayload;

internal sealed record PointerPositionPayload(
    int X,
    int Y,
    bool Inside);

internal static class PlatformEvents
{
    private const string Prefix = "kirie:platform:host-window";

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> BeginMove =
        new($"{Prefix}:begin-move");

    public static readonly InvokeEventDefinition<EmptyPayload, string> BeginResize =
        new($"{Prefix}:begin-resize");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> Center =
        new($"{Prefix}:center");

    public static readonly InvokeEventDefinition<PointerPositionPayload, EmptyPayload> GetPointerPosition =
        new($"{Prefix}:get-pointer-position");

    public static readonly InvokeEventDefinition<EmptyPayload, bool> SetAlwaysOnTop =
        new($"{Prefix}:set-always-on-top");

    public static readonly InvokeEventDefinition<EmptyPayload, bool> SetPointerPassthrough =
        new($"{Prefix}:set-pointer-passthrough");
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(EmptyPayload))]
[JsonSerializable(typeof(bool))]
[JsonSerializable(typeof(string))]
[JsonSerializable(typeof(PointerPositionPayload))]
internal sealed partial class PlatformJsonContext : JsonSerializerContext;
