using System.Text.Json.Serialization;
using System.Threading;
using Eventa;
using GdKirie.EventaAdapter;
using Godot;

public sealed partial class EmbeddedWebBridge(KirieClient kirie) : IDisposable
{
    private const string PageUrl = "res://src-web/dist/index.html";

    private readonly EventDefinition<WebReadyPayload> _webReady = new("web:ready");
    private readonly EventDefinition<VerificationPayload> _webVerification = new("web:verification");
    private readonly EventDefinition<StatusPayload> _webStatusReceived = new("web:status-received");
    private readonly EventDefinition<StatusPayload> _godotStatus = new("godot:status");
    private readonly InvokeEventDefinition<EchoResponse, EchoRequest> _godotEcho = new("godot:echo");
    private readonly InvokeEventDefinition<EchoResponse, EchoRequest> _webEcho = new("web:echo");

    private readonly KirieClient _kirie = kirie;
    private readonly SynchronizationContext? _synchronizationContext = SynchronizationContext.Current;

    private KirieEventaContextHandle? _eventa;
    private InvokeClient<EchoResponse, EchoRequest>? _webEchoClient;
    private bool _receivedWebInvokeVerification;
    private bool _receivedWebInvokeResponse;
    private bool _receivedStatusEventAcknowledgement;
    private bool _disposed;

    public void Start()
    {
        if (!_kirie.IsAvailable)
        {
            Report("Kirie singleton unavailable");
            return;
        }

        var registry = new KirieEventaJsonRegistry()
            .RegisterEvent(_webReady, EmbeddedJsonContext.Default.WebReadyPayload)
            .RegisterEvent(_webVerification, EmbeddedJsonContext.Default.VerificationPayload)
            .RegisterEvent(_webStatusReceived, EmbeddedJsonContext.Default.StatusPayload)
            .RegisterEvent(_godotStatus, EmbeddedJsonContext.Default.StatusPayload)
            .RegisterInvoke(_godotEcho, EmbeddedJsonContext.Default.EchoResponse, EmbeddedJsonContext.Default.EchoRequest)
            .RegisterInvoke(_webEcho, EmbeddedJsonContext.Default.EchoResponse, EmbeddedJsonContext.Default.EchoRequest);

        _eventa = _kirie.CreateEventaContext(registry);

        _eventa.Adapter.Error += OnEventaError;

        _eventa.Context.Subscribe(_webReady, envelope => OnWebReady(envelope.Body));
        _eventa.Context.Subscribe(_webVerification, envelope => OnWebVerification(envelope.Body));
        _eventa.Context.Subscribe(_webStatusReceived, envelope => OnWebStatusReceived(envelope.Body));

        _eventa.Context.RegisterInvokeHandler(_godotEcho, (request, _) => Task.FromResult(new EchoResponse($"Godot received: {request.Message}")));
        _webEchoClient = _eventa.Context.CreateInvokeClient(_webEcho);

        _kirie.WebViewReady += OnWebViewReady;
        _kirie.IpcError += OnIpcError;

        Report("Creating Kirie WebView inside Godot host view…");

        _kirie.CreateWebView();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _kirie.WebViewReady -= OnWebViewReady;
        _kirie.IpcError -= OnIpcError;

        if (_eventa is not null)
        {
            _eventa.Adapter.Error -= OnEventaError;
            _eventa.Dispose();
        }

        _kirie.Dispose();
    }

    private void OnWebViewReady()
    {
        var pageUrl = PageUrl;

#if DEBUG

        var devPageUrl = _kirie.GetLaunchOption("kirie-web-url").Trim();
        if (devPageUrl.Length > 0)
        {
            pageUrl = devPageUrl;
        }

#endif

        Report($"Kirie WebView ready; loading {pageUrl}");
        _kirie.LoadUrl(pageUrl);
    }

    private void OnWebReady(WebReadyPayload payload)
    {
        Report($"Event received from WebView ({payload.Platform})");

        _eventa?.Context.Emit(_godotStatus, new StatusPayload("Godot emitted this Eventa event"));
        _ = InvokeWebEchoAsync();
    }

    private void OnWebVerification(VerificationPayload payload)
    {
        _receivedWebInvokeVerification = payload.Reply.Contains("Godot received", StringComparison.Ordinal);

        Report($"WebView invoked Godot: {payload.Reply}");
        CheckVerification();
    }

    private void OnWebStatusReceived(StatusPayload payload)
    {
        _receivedStatusEventAcknowledgement = payload.Message.Contains("Godot emitted", StringComparison.Ordinal);

        Report("WebView acknowledged the Godot status event");
        CheckVerification();
    }

    private async Task InvokeWebEchoAsync()
    {
        if (_webEchoClient is null)
        {
            return;
        }

        try
        {
            var response = await _webEchoClient.InvokeAsync(new EchoRequest("Hello from embedded Godot"));
            RunOnGodotThread(() =>
            {
                _receivedWebInvokeResponse = response.Reply.Contains("WebView received", StringComparison.Ordinal);

                Report($"Godot invoked WebView: {response.Reply}");
                CheckVerification();
            });
        }
        catch (Exception error)
        {
            RunOnGodotThread(() => Report($"Web invoke failed: {error.Message}"));
        }
    }

    private void CheckVerification()
    {
        if (
            !_receivedWebInvokeVerification ||
            !_receivedWebInvokeResponse ||
            !_receivedStatusEventAcknowledgement
        )
        {
            return;
        }

        Report("Kirie + Eventa events and invokes verified in both directions");
        GD.Print("KIRIE_VIEW_EMBED_EVENTA_PASS");
    }

    private void OnEventaError(KirieEventaError error)
    {
        Report($"Eventa error: {error.Message}");
    }

    private void OnIpcError(string error)
    {
        Report($"Kirie IPC error: {error}");
    }

    private void Report(string status)
    {
        GD.Print($"[BasicHostAppEmbedded] {status}");
    }

    private void RunOnGodotThread(Action action)
    {
        if (_synchronizationContext is null
            || ReferenceEquals(SynchronizationContext.Current, _synchronizationContext))
        {
            action();
            return;
        }

        _synchronizationContext.Post(_ => action(), null);
    }

    private sealed record WebReadyPayload(string Platform);

    private sealed record VerificationPayload(string Reply);

    private sealed record StatusPayload(string Message);

    private sealed record EchoRequest(string Message);

    private sealed record EchoResponse(string Reply);

    [JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
    [JsonSerializable(typeof(WebReadyPayload))]
    [JsonSerializable(typeof(VerificationPayload))]
    [JsonSerializable(typeof(StatusPayload))]
    [JsonSerializable(typeof(EchoRequest))]
    [JsonSerializable(typeof(EchoResponse))]
    private sealed partial class EmbeddedJsonContext : JsonSerializerContext;
}
