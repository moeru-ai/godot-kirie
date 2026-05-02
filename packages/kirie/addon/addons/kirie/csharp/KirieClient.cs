#nullable enable

using System;
using Godot;

public partial class KirieClient : GodotObject
{
    public const string PluginSingletonName = "Kirie";

    private readonly Callable _webViewReadyCallable;
    private readonly Callable _ipcMessageReceivedCallable;
    private readonly Callable _ipcErrorCallable;

    private readonly GodotObject? _pluginSingleton;

    public event Action? WebViewReady;
    public event Action<Variant>? IpcMessageReceived;
    public event Action<string>? IpcError;

    public KirieClient()
    {
        _webViewReadyCallable = Callable.From(OnPluginWebViewReady);
        _ipcMessageReceivedCallable = Callable.From<string>(OnPluginIpcMessageReceived);
        _ipcErrorCallable = Callable.From<string>(OnPluginIpcError);

        if (!Engine.HasSingleton(PluginSingletonName))
        {
            GD.Print("[Kirie][cs] platform singleton unavailable");
            return;
        }

        _pluginSingleton = Engine.GetSingleton(PluginSingletonName);
        GD.Print("[Kirie][cs] platform singleton detected");
        ConnectPluginSignals();
    }

    public bool IsAvailable => _pluginSingleton is not null;

    public void CreateWebView(string initialUrl = "")
    {
        if (!EnsurePluginSingleton(nameof(CreateWebView)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] create_webview initial_url={initialUrl}");
        _pluginSingleton!.Call("createWebView", initialUrl);
    }

    public void DestroyWebView()
    {
        if (!EnsurePluginSingleton(nameof(DestroyWebView)))
        {
            return;
        }

        GD.Print("[Kirie][cs] destroy_webview");
        _pluginSingleton!.Call("destroyWebView");
    }

    public void LoadUrl(string url)
    {
        if (!EnsurePluginSingleton(nameof(LoadUrl)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_url url={url}");
        _pluginSingleton!.Call("loadUrl", url);
    }

    public void LoadHtmlString(string html, string baseUrl = "")
    {
        if (!EnsurePluginSingleton(nameof(LoadHtmlString)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_html_string bytes={html.Length} base_url={baseUrl}");
        _pluginSingleton!.Call("loadHtmlString", html, baseUrl);
    }

    public void SendIpcMessage(Variant message)
    {
        if (!EnsurePluginSingleton(nameof(SendIpcMessage)))
        {
            return;
        }

        var messageJson = Json.Stringify(message);
        GD.Print($"[Kirie][cs] send_ipc_message {messageJson}");
        _pluginSingleton!.Call("sendIpcMessage", messageJson);
    }

    public string GetLaunchOption(string key)
    {
        if (!EnsurePluginSingleton(nameof(GetLaunchOption)))
        {
            return string.Empty;
        }

        var value = _pluginSingleton!.Call("getLaunchOption", key).AsString();
        GD.Print($"[Kirie][cs] get_launch_option key={key} value={value}");
        return value;
    }

    private void ConnectPluginSignals()
    {
        if (_pluginSingleton == null)
        {
            return;
        }

        if (OS.GetName() == "iOS")
        {
            GD.Print("[Kirie][cs] registering iOS callbacks");
            _pluginSingleton.Call(
                "registerCallbacks",
                _webViewReadyCallable,
                _ipcMessageReceivedCallable,
                _ipcErrorCallable
            );
            return;
        }

        ConnectPluginSignal("webview_ready", _webViewReadyCallable);
        ConnectPluginSignal("ipc_message_received", _ipcMessageReceivedCallable);
        ConnectPluginSignal("ipc_error", _ipcErrorCallable);
    }

    private void ConnectPluginSignal(string signalName, Callable callback)
    {
        if (_pluginSingleton == null || !_pluginSingleton.HasSignal(signalName))
        {
            return;
        }

        _pluginSingleton.Connect(signalName, callback);
    }

    private bool EnsurePluginSingleton(string methodName)
    {
        if (_pluginSingleton != null)
        {
            return true;
        }

        var error = $"Kirie platform singleton is not available for {methodName}()";
        GD.PushWarning(error);
        IpcError?.Invoke(error);
        return false;
    }

    private void OnPluginWebViewReady()
    {
        GD.Print("[Kirie][cs] signal webview_ready");
        WebViewReady?.Invoke();
    }

    private void OnPluginIpcMessageReceived(string messageJson)
    {
        GD.Print($"[Kirie][cs] signal ipc_message_received raw={messageJson}");
        var parsedMessage = Json.ParseString(messageJson);
        if (parsedMessage.VariantType == Variant.Type.Nil && messageJson != "null")
        {
            IpcMessageReceived?.Invoke(messageJson);
            return;
        }

        IpcMessageReceived?.Invoke(parsedMessage);
    }

    private void OnPluginIpcError(string error)
    {
        GD.Print($"[Kirie][cs] signal ipc_error {error}");
        IpcError?.Invoke(error);
    }
}
