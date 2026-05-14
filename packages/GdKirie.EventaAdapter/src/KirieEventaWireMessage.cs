using System.Text;
using System.Text.Json;

namespace GdKirie.EventaAdapter;

internal sealed class KirieEventaWireMessage(string type, JsonElement body)
{
    public string Type { get; } = type;

    public JsonElement Body { get; } = body;

    public string ToJson()
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("id", Guid.NewGuid().ToString("N"));
            writer.WriteString("type", Type);
            writer.WritePropertyName("payload");
            writer.WriteStartObject();
            writer.WriteString("id", Type);
            writer.WritePropertyName("body");
            Body.WriteTo(writer);
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }
}
