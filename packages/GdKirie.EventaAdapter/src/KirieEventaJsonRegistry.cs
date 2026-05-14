using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Eventa;

namespace GdKirie.EventaAdapter;

/// <summary>
/// Holds the explicit JSON metadata required to mirror Eventa payloads over Kirie text IPC.
/// </summary>
public sealed class KirieEventaJsonRegistry
{
    private readonly Dictionary<string, Registration> _registrations = new(StringComparer.Ordinal);
    private readonly List<string> _invokeResponseEventIds = [];

    /// <summary>
    /// Registers a normal Eventa event for Kirie text transport.
    /// </summary>
    public KirieEventaJsonRegistry RegisterEvent<TPayload>(
        EventDefinition<TPayload> eventDefinition,
        JsonTypeInfo<TPayload> payloadJsonTypeInfo)
    {
        ArgumentNullException.ThrowIfNull(eventDefinition);
        ArgumentNullException.ThrowIfNull(payloadJsonTypeInfo);

        AddRegistration(new EventRegistration<TPayload>(eventDefinition, payloadJsonTypeInfo));
        return this;
    }

    /// <summary>
    /// Registers the unary request and response events derived from one Eventa invoke definition.
    /// </summary>
    public KirieEventaJsonRegistry RegisterInvoke<TResponse, TRequest>(
        InvokeEventDefinition<TResponse, TRequest> eventDefinition,
        JsonTypeInfo<TResponse> responseJsonTypeInfo,
        JsonTypeInfo<TRequest> requestJsonTypeInfo)
    {
        ArgumentNullException.ThrowIfNull(eventDefinition);
        ArgumentNullException.ThrowIfNull(responseJsonTypeInfo);
        ArgumentNullException.ThrowIfNull(requestJsonTypeInfo);

        AddRegistration(new SendPayloadRegistration<TRequest>(
            new EventDefinition<SendPayload<TRequest>>(eventDefinition.SendEventId),
            requestJsonTypeInfo));
        AddRegistration(new ReceivePayloadRegistration<TResponse>(
            new EventDefinition<ReceivePayload<TResponse>>(eventDefinition.ReceiveEventId),
            responseJsonTypeInfo));
        AddRegistration(new ReceiveErrorPayloadRegistration(
            new EventDefinition<ReceiveErrorPayload>(eventDefinition.ReceiveErrorId)));
        AddRegistration(new AbortPayloadRegistration(
            new EventDefinition<AbortPayload>(eventDefinition.SendAbortId)));

        _invokeResponseEventIds.Add(eventDefinition.ReceiveEventId);
        _invokeResponseEventIds.Add(eventDefinition.ReceiveErrorId);

        return this;
    }

    internal bool TryCreateOutboundMessage(
        string eventId,
        object envelope,
        out KirieEventaWireMessage message,
        out Exception? error)
    {
        message = null!;
        error = null;

        if (!_registrations.TryGetValue(eventId, out var registration))
        {
            return false;
        }

        try
        {
            message = registration.CreateOutboundMessage(envelope);
            return true;
        }
        catch (Exception exception)
        {
            error = exception;
            return false;
        }
    }

    internal bool TryDispatchInbound(
        string wireType,
        JsonElement body,
        IEventContext context,
        out Exception? error)
    {
        error = null;
        var eventId = ResolveInboundEventId(wireType, body);

        if (!_registrations.TryGetValue(eventId, out var registration))
        {
            return false;
        }

        try
        {
            registration.DispatchInbound(context, body);
            return true;
        }
        catch (Exception exception)
        {
            error = exception;
            return false;
        }
    }

    private void AddRegistration(Registration registration)
    {
        _registrations.Add(registration.EventId, registration);
    }

    private string ResolveInboundEventId(string wireType, JsonElement body)
    {
        if (_registrations.ContainsKey(wireType))
        {
            return wireType;
        }

        if (!TryReadInvokeId(body, out var invokeId))
        {
            return wireType;
        }

        foreach (var responseEventId in _invokeResponseEventIds)
        {
            if (StringComparer.Ordinal.Equals(wireType, $"{responseEventId}-{invokeId}"))
            {
                return responseEventId;
            }
        }

        return wireType;
    }

    private static bool TryReadInvokeId(JsonElement body, out string invokeId)
    {
        invokeId = string.Empty;

        if (body.ValueKind is not JsonValueKind.Object
            || !body.TryGetProperty("invokeId", out var invokeIdElement)
            || invokeIdElement.ValueKind is not JsonValueKind.String)
        {
            return false;
        }

        invokeId = invokeIdElement.GetString() ?? string.Empty;
        return invokeId.Length > 0;
    }

    private static JsonElement SerializeToElement<T>(T value, JsonTypeInfo<T> typeInfo)
    {
        return JsonSerializer.SerializeToElement(value, typeInfo);
    }

    private abstract class Registration(string eventId)
    {
        public string EventId { get; } = eventId;

        public abstract KirieEventaWireMessage CreateOutboundMessage(object envelope);

        public abstract void DispatchInbound(IEventContext context, JsonElement body);
    }

    private sealed class EventRegistration<TPayload>(
        EventDefinition<TPayload> eventDefinition,
        JsonTypeInfo<TPayload> payloadJsonTypeInfo) : Registration(eventDefinition.Id)
    {
        public override KirieEventaWireMessage CreateOutboundMessage(object envelope)
        {
            var typedEnvelope = (EventEnvelope<TPayload>)envelope;
            return new KirieEventaWireMessage(EventId, SerializeToElement(typedEnvelope.Body, payloadJsonTypeInfo));
        }

        public override void DispatchInbound(IEventContext context, JsonElement body)
        {
            var payload = body.Deserialize(payloadJsonTypeInfo);
            context.Emit(eventDefinition, payload!, KirieEventaRemoteDispatchOptions.Instance);
        }
    }

    private sealed class SendPayloadRegistration<TRequest>(
        EventDefinition<SendPayload<TRequest>> eventDefinition,
        JsonTypeInfo<TRequest> requestJsonTypeInfo) : Registration(eventDefinition.Id)
    {
        public override KirieEventaWireMessage CreateOutboundMessage(object envelope)
        {
            var typedEnvelope = (EventEnvelope<SendPayload<TRequest>>)envelope;
            return new KirieEventaWireMessage(
                EventId,
                WriteInvokeContent(typedEnvelope.Body.InvokeId, typedEnvelope.Body.Content, requestJsonTypeInfo));
        }

        public override void DispatchInbound(IEventContext context, JsonElement body)
        {
            var payload = new SendPayload<TRequest>(
                ReadRequiredString(body, "invokeId"),
                ReadRequiredProperty(body, "content").Deserialize(requestJsonTypeInfo)!);
            context.Emit(eventDefinition, payload, KirieEventaRemoteDispatchOptions.Instance);
        }
    }

    private sealed class ReceivePayloadRegistration<TResponse>(
        EventDefinition<ReceivePayload<TResponse>> eventDefinition,
        JsonTypeInfo<TResponse> responseJsonTypeInfo) : Registration(eventDefinition.Id)
    {
        public override KirieEventaWireMessage CreateOutboundMessage(object envelope)
        {
            var typedEnvelope = (EventEnvelope<ReceivePayload<TResponse>>)envelope;
            return new KirieEventaWireMessage(
                $"{EventId}-{typedEnvelope.Body.InvokeId}",
                WriteInvokeContent(typedEnvelope.Body.InvokeId, typedEnvelope.Body.Content, responseJsonTypeInfo));
        }

        public override void DispatchInbound(IEventContext context, JsonElement body)
        {
            var payload = new ReceivePayload<TResponse>(
                ReadRequiredString(body, "invokeId"),
                ReadRequiredProperty(body, "content").Deserialize(responseJsonTypeInfo)!);
            context.Emit(eventDefinition, payload, KirieEventaRemoteDispatchOptions.Instance);
        }
    }

    private sealed class ReceiveErrorPayloadRegistration(
        EventDefinition<ReceiveErrorPayload> eventDefinition) : Registration(eventDefinition.Id)
    {
        public override KirieEventaWireMessage CreateOutboundMessage(object envelope)
        {
            var typedEnvelope = (EventEnvelope<ReceiveErrorPayload>)envelope;
            return new KirieEventaWireMessage(
                $"{EventId}-{typedEnvelope.Body.InvokeId}",
                WriteInvokeError(typedEnvelope.Body.InvokeId, typedEnvelope.Body.Error));
        }

        public override void DispatchInbound(IEventContext context, JsonElement body)
        {
            var payload = new ReceiveErrorPayload(
                ReadRequiredString(body, "invokeId"),
                ReadRemoteException(body));
            context.Emit(eventDefinition, payload, KirieEventaRemoteDispatchOptions.Instance);
        }
    }

    private sealed class AbortPayloadRegistration(
        EventDefinition<AbortPayload> eventDefinition) : Registration(eventDefinition.Id)
    {
        public override KirieEventaWireMessage CreateOutboundMessage(object envelope)
        {
            var typedEnvelope = (EventEnvelope<AbortPayload>)envelope;
            return new KirieEventaWireMessage(EventId, WriteAbortPayload(typedEnvelope.Body));
        }

        public override void DispatchInbound(IEventContext context, JsonElement body)
        {
            var reason = body.TryGetProperty("reason", out var reasonElement)
                && reasonElement.ValueKind is JsonValueKind.String
                    ? reasonElement.GetString()
                    : null;
            context.Emit(
                eventDefinition,
                new AbortPayload(ReadRequiredString(body, "invokeId"), reason),
                KirieEventaRemoteDispatchOptions.Instance);
        }
    }

    private static JsonElement WriteInvokeContent<TContent>(
        string invokeId,
        TContent content,
        JsonTypeInfo<TContent> contentJsonTypeInfo)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("invokeId", invokeId);
            writer.WritePropertyName("content");
            JsonSerializer.Serialize(writer, content, contentJsonTypeInfo);
            writer.WriteEndObject();
        }

        return JsonDocument.Parse(stream.ToArray()).RootElement.Clone();
    }

    private static JsonElement WriteInvokeError(string invokeId, Exception error)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("invokeId", invokeId);
            writer.WritePropertyName("content");
            writer.WriteStartObject();
            writer.WritePropertyName("error");
            writer.WriteStartObject();
            writer.WriteString("name", error.GetType().Name);
            writer.WriteString("message", error.Message);
            writer.WriteEndObject();
            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        return JsonDocument.Parse(stream.ToArray()).RootElement.Clone();
    }

    private static JsonElement WriteAbortPayload(AbortPayload payload)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("invokeId", payload.InvokeId);
            if (payload.Reason is not null)
            {
                writer.WriteString("reason", payload.Reason);
            }

            writer.WriteEndObject();
        }

        return JsonDocument.Parse(stream.ToArray()).RootElement.Clone();
    }

    private static Exception ReadRemoteException(JsonElement body)
    {
        if (body.TryGetProperty("content", out var content)
            && content.ValueKind is JsonValueKind.Object
            && content.TryGetProperty("error", out var error)
            && error.ValueKind is JsonValueKind.Object)
        {
            var message = error.TryGetProperty("message", out var messageElement)
                && messageElement.ValueKind is JsonValueKind.String
                    ? messageElement.GetString()
                    : null;
            var name = error.TryGetProperty("name", out var nameElement)
                && nameElement.ValueKind is JsonValueKind.String
                    ? nameElement.GetString()
                    : null;

            return new KirieEventaRemoteException(
                string.IsNullOrEmpty(message) ? "Remote Eventa invoke failed." : message,
                name);
        }

        return new KirieEventaRemoteException("Remote Eventa invoke failed.");
    }

    private static JsonElement ReadRequiredProperty(JsonElement element, string propertyName)
    {
        if (element.ValueKind is JsonValueKind.Object && element.TryGetProperty(propertyName, out var property))
        {
            return property;
        }

        throw new JsonException($"Missing required property '{propertyName}'.");
    }

    private static string ReadRequiredString(JsonElement element, string propertyName)
    {
        var property = ReadRequiredProperty(element, propertyName);
        if (property.ValueKind is JsonValueKind.String)
        {
            return property.GetString() ?? string.Empty;
        }

        throw new JsonException($"Property '{propertyName}' must be a string.");
    }
}
