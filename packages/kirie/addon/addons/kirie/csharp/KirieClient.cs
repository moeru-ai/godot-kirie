#nullable enable

using System;
using Godot;

public partial class KirieClient : GodotObject
{
    public const string PluginSingletonName = "Kirie";

    private readonly Callable _webViewReadyCallable;
    private readonly Callable _textReceivedCallable;
    private readonly Callable _binaryReceivedCallable;
    private readonly Callable _dataReceivedCallable;
    private readonly Callable _ipcErrorCallable;

    private readonly GodotObject? _pluginSingleton;

    public event Action? WebViewReady;
    public event Action<string>? TextReceived;
    public event Action<byte[]>? BinaryReceived;
    public event Action<Variant>? DataReceived;
    public event Action<string>? IpcError;

    public KirieClient()
    {
        _webViewReadyCallable = Callable.From(OnPluginWebViewReady);
        _textReceivedCallable = Callable.From<string>(OnPluginTextReceived);
        _binaryReceivedCallable = Callable.From<byte[]>(OnPluginBinaryReceived);
        _dataReceivedCallable = Callable.From<Variant>(OnPluginDataReceived);
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

    public void SendText(string message)
    {
        if (!EnsurePluginSingleton(nameof(SendText)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_text bytes={message.Length}");
        _pluginSingleton!.Call("sendText", message);
    }

    public void SendBinary(byte[] bytes)
    {
        if (!EnsurePluginSingleton(nameof(SendBinary)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_binary bytes={bytes.Length}");
        _pluginSingleton!.Call("sendBinary", bytes);
    }

    public void SendData(Variant value)
    {
        if (!EnsurePluginSingleton(nameof(SendData)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_data {value}");
        _pluginSingleton!.Call("sendData", value);
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
                _textReceivedCallable,
                _ipcErrorCallable
            );
            return;
        }

        ConnectPluginSignal("webview_ready", _webViewReadyCallable);
        ConnectPluginSignal("text_received", _textReceivedCallable);
        ConnectPluginSignal("binary_received", _binaryReceivedCallable);
        ConnectPluginSignal("data_received", _dataReceivedCallable);
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

    private void OnPluginTextReceived(string message)
    {
        GD.Print($"[Kirie][cs] signal text_received {message}");
        TextReceived?.Invoke(message);
    }

    private void OnPluginBinaryReceived(byte[] bytes)
    {
        GD.Print($"[Kirie][cs] signal binary_received bytes={bytes.Length}");
        BinaryReceived?.Invoke(bytes);
    }

    private void OnPluginDataReceived(Variant value)
    {
        GD.Print($"[Kirie][cs] signal data_received {value}");
        DataReceived?.Invoke(value);
    }

    private void OnPluginIpcError(string error)
    {
        GD.Print($"[Kirie][cs] signal ipc_error {error}");
        IpcError?.Invoke(error);
    }
}
