using System.Text.Json.Serialization;
using Eventa;

namespace GdKirie.Tray;

internal sealed record EmptyPayload;

internal sealed record TrayMenuItemActivatedPayload(string Id);

internal static class TrayEvents
{
    private const string Prefix = "kirie:tray";

    public static readonly InvokeEventDefinition<EmptyPayload, TrayConfiguration> Configure =
        new($"{Prefix}:configure");

    public static readonly InvokeEventDefinition<EmptyPayload, TrayMenuItem[]> SetMenu =
        new($"{Prefix}:set-menu");

    public static readonly InvokeEventDefinition<EmptyPayload, TrayMenuItemUpdate> UpdateItem =
        new($"{Prefix}:update-item");

    public static readonly InvokeEventDefinition<EmptyPayload, EmptyPayload> Destroy =
        new($"{Prefix}:destroy");

    public static readonly EventDefinition<TrayMenuItemActivatedPayload> MenuItemActivated =
        new($"{Prefix}:menu-item-activated");
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(EmptyPayload))]
[JsonSerializable(typeof(TrayConfiguration))]
[JsonSerializable(typeof(TrayMenuItem[]))]
[JsonSerializable(typeof(TrayMenuItemUpdate))]
[JsonSerializable(typeof(TrayMenuItemActivatedPayload))]
internal sealed partial class TrayJsonContext : JsonSerializerContext;
