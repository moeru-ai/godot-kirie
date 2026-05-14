using System.Text.Json;
using System.Text.Json.Serialization;
using Eventa;

namespace GdKirie.EventaAdapter.Tests;

public sealed partial class KirieEventaAdapterTests
{
    [Fact]
    public void Emit_SendsOutboundEventOverTextIpc()
    {
        using var fixture = CreateFixture();
        var moved = new EventDefinition<MovePayload>("player:move");
        fixture.Registry.RegisterEvent(moved, TestJsonContext.Default.MovePayload);

        fixture.Handle.Context.Emit(moved, new MovePayload(10, 20));

        using var document = JsonDocument.Parse(Assert.Single(fixture.Transport.SentMessages));
        Assert.Equal("player:move", document.RootElement.GetProperty("type").GetString());
        Assert.Equal(10, document.RootElement.GetProperty("payload").GetProperty("body").GetProperty("x").GetInt32());
        Assert.Equal(20, document.RootElement.GetProperty("payload").GetProperty("body").GetProperty("y").GetInt32());
    }

    [Fact]
    public void InboundText_DispatchesRegisteredEvent()
    {
        using var fixture = CreateFixture();
        var moved = new EventDefinition<MovePayload>("player:move");
        fixture.Registry.RegisterEvent(moved, TestJsonContext.Default.MovePayload);
        MovePayload? received = null;

        using var _ = fixture.Handle.Context.Subscribe(moved, envelope => received = envelope.Body);

        fixture.Transport.Receive(
            """
            {"type":"player:move","payload":{"body":{"x":7,"y":9}}}
            """);

        Assert.Equal(new MovePayload(7, 9), received);
    }

    [Fact]
    public void InboundText_DoesNotEchoRemoteDispatch()
    {
        using var fixture = CreateFixture();
        var moved = new EventDefinition<MovePayload>("player:move");
        fixture.Registry.RegisterEvent(moved, TestJsonContext.Default.MovePayload);

        fixture.Transport.Receive(
            """
            {"type":"player:move","payload":{"body":{"x":7,"y":9}}}
            """);

        Assert.Empty(fixture.Transport.SentMessages);
    }

    [Fact]
    public async Task InvokeAsync_ResolvesSuffixedRemoteResponse()
    {
        using var fixture = CreateFixture();
        var lookup = new InvokeEventDefinition<UserResponse, UserRequest>("user:lookup");
        fixture.Registry.RegisterInvoke(
            lookup,
            TestJsonContext.Default.UserResponse,
            TestJsonContext.Default.UserRequest);

        var client = fixture.Handle.Context.CreateInvokeClient(lookup);
        var pending = client.InvokeAsync(new UserRequest("alice"), TestContext.Current.CancellationToken);
        var request = ReadLastMessage(fixture.Transport);
        var invokeId = request.RootElement
            .GetProperty("payload")
            .GetProperty("body")
            .GetProperty("invokeId")
            .GetString();

        fixture.Transport.Receive(
            $$"""
            {
              "type": "user:lookup-receive-{{invokeId}}",
              "payload": {
                "body": {
                  "invokeId": "{{invokeId}}",
                  "content": {
                    "id": "user-1"
                  }
                }
              }
            }
            """);

        Assert.Equal(new UserResponse("user-1"), await pending);
    }

    [Fact]
    public async Task InvokeAsync_RejectsSuffixedRemoteError()
    {
        using var fixture = CreateFixture();
        var lookup = new InvokeEventDefinition<UserResponse, UserRequest>("user:lookup");
        fixture.Registry.RegisterInvoke(
            lookup,
            TestJsonContext.Default.UserResponse,
            TestJsonContext.Default.UserRequest);

        var client = fixture.Handle.Context.CreateInvokeClient(lookup);
        var pending = client.InvokeAsync(new UserRequest("alice"), TestContext.Current.CancellationToken);
        var request = ReadLastMessage(fixture.Transport);
        var invokeId = request.RootElement
            .GetProperty("payload")
            .GetProperty("body")
            .GetProperty("invokeId")
            .GetString();

        fixture.Transport.Receive(
            $$"""
            {
              "type": "user:lookup-receive-error-{{invokeId}}",
              "payload": {
                "body": {
                  "invokeId": "{{invokeId}}",
                  "content": {
                    "error": {
                      "name": "Error",
                      "message": "boom"
                    }
                  }
                }
              }
            }
            """);

        var error = await Assert.ThrowsAsync<KirieEventaRemoteException>(async () => await pending);
        Assert.Equal("boom", error.Message);
        Assert.Equal("Error", error.RemoteName);
    }

    [Fact]
    public async Task InboundInvokeRequest_SendsHandlerResponseWithSuffixedType()
    {
        using var fixture = CreateFixture();
        var lookup = new InvokeEventDefinition<UserResponse, UserRequest>("user:lookup");
        fixture.Registry.RegisterInvoke(
            lookup,
            TestJsonContext.Default.UserResponse,
            TestJsonContext.Default.UserRequest);

        using var _ = fixture.Handle.Context.RegisterInvokeHandler(
            lookup,
            (request, _) => Task.FromResult(new UserResponse($"{request.Name}-id")));

        fixture.Transport.Receive(
            """
            {"type":"user:lookup-send","payload":{"body":{"invokeId":"invoke-1","content":{"name":"alice"}}}}
            """);

        await WaitForSentMessage(fixture.Transport, TestContext.Current.CancellationToken);
        using var response = ReadLastMessage(fixture.Transport);
        Assert.Equal("user:lookup-receive-invoke-1", response.RootElement.GetProperty("type").GetString());
        Assert.Equal(
            "alice-id",
            response.RootElement
                .GetProperty("payload")
                .GetProperty("body")
                .GetProperty("content")
                .GetProperty("id")
                .GetString());
    }

    [Fact]
    public async Task InboundInvokeRequest_SendsHandlerErrorWithSuffixedType()
    {
        using var fixture = CreateFixture();
        var lookup = new InvokeEventDefinition<UserResponse, UserRequest>("user:lookup");
        fixture.Registry.RegisterInvoke(
            lookup,
            TestJsonContext.Default.UserResponse,
            TestJsonContext.Default.UserRequest);

        using var _ = fixture.Handle.Context.RegisterInvokeHandler<UserResponse, UserRequest>(
            lookup,
            (UserRequest _, CancellationToken _) =>
                Task.FromException<UserResponse>(new InvalidOperationException("boom")));

        fixture.Transport.Receive(
            """
            {"type":"user:lookup-send","payload":{"body":{"invokeId":"invoke-1","content":{"name":"alice"}}}}
            """);

        await WaitForSentMessage(fixture.Transport, TestContext.Current.CancellationToken);
        using var response = ReadLastMessage(fixture.Transport);
        Assert.Equal("user:lookup-receive-error-invoke-1", response.RootElement.GetProperty("type").GetString());
        Assert.Equal(
            "boom",
            response.RootElement
                .GetProperty("payload")
                .GetProperty("body")
                .GetProperty("content")
                .GetProperty("error")
                .GetProperty("message")
                .GetString());
    }

    [Fact]
    public void InboundText_ReportsMalformedJson()
    {
        using var fixture = CreateFixture();

        fixture.Transport.Receive("{");

        var error = Assert.Single(fixture.Errors);
        Assert.Contains("Failed to parse", error.Message, StringComparison.Ordinal);
        Assert.Equal("{", error.RawMessage);
    }

    [Fact]
    public void InboundText_ReportsUnknownType()
    {
        using var fixture = CreateFixture();

        fixture.Transport.Receive(
            """
            {"type":"missing:event","payload":{"body":{}}}
            """);

        var error = Assert.Single(fixture.Errors);
        Assert.Contains("unregistered", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void InboundText_ReportsBadPayload()
    {
        using var fixture = CreateFixture();
        var moved = new EventDefinition<MovePayload>("player:move");
        fixture.Registry.RegisterEvent(moved, TestJsonContext.Default.MovePayload);

        fixture.Transport.Receive(
            """
            {"type":"player:move","payload":{"body":{"x":"bad","y":9}}}
            """);

        Assert.Single(fixture.Errors);
    }

    [Fact]
    public void Dispose_UnsubscribesFromTransport()
    {
        var fixture = CreateFixture();
        var moved = new EventDefinition<MovePayload>("player:move");
        fixture.Registry.RegisterEvent(moved, TestJsonContext.Default.MovePayload);
        fixture.Handle.Dispose();

        fixture.Transport.Receive(
            """
            {"type":"player:move","payload":{"body":{"x":1,"y":2}}}
            """);

        Assert.Empty(fixture.Errors);
        Assert.Empty(fixture.Transport.SentMessages);
    }

    private static Fixture CreateFixture()
    {
        var registry = new KirieEventaJsonRegistry();
        var transport = new FakeKirieTextTransport();
        var handle = KirieEventa.CreateContext(transport, registry);
        var errors = new List<KirieEventaError>();
        handle.Adapter.Error += errors.Add;
        return new Fixture(registry, transport, handle, errors);
    }

    private static JsonDocument ReadLastMessage(FakeKirieTextTransport transport)
    {
        var message = transport.SentMessages.LastOrDefault();
        Assert.NotNull(message);
        return JsonDocument.Parse(message);
    }

    private static async Task WaitForSentMessage(
        FakeKirieTextTransport transport,
        CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(5);
        while (transport.SentMessages.Count == 0 && DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(10, cancellationToken);
        }

        Assert.NotEmpty(transport.SentMessages);
    }

    private sealed record MovePayload(int X, int Y);

    private sealed record UserRequest(string Name);

    private sealed record UserResponse(string Id);

    private sealed record Fixture(
        KirieEventaJsonRegistry Registry,
        FakeKirieTextTransport Transport,
        KirieEventaContextHandle Handle,
        List<KirieEventaError> Errors) : IDisposable
    {
        public void Dispose()
        {
            Handle.Dispose();
        }
    }

    private sealed class FakeKirieTextTransport : IKirieTextTransport
    {
        public event Action<string>? TextReceived;

        public List<string> SentMessages { get; } = [];

        public void SendText(string message)
        {
            SentMessages.Add(message);
        }

        public void Receive(string message)
        {
            TextReceived?.Invoke(message);
        }
    }

    [JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
    [JsonSerializable(typeof(MovePayload))]
    [JsonSerializable(typeof(UserRequest))]
    [JsonSerializable(typeof(UserResponse))]
    private sealed partial class TestJsonContext : JsonSerializerContext;
}
