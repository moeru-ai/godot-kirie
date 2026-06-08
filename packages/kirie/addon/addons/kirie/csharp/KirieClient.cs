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
    private readonly long _viewId;

    public event Action? WebViewReady;
    public event Action<string>? TextReceived;
    public event Action<byte[]>? BinaryReceived;
    public event Action<Variant>? DataReceived;
    public event Action<string>? IpcError;

    public KirieClient()
    {
        _viewId = (long)GetInstanceId();
        _webViewReadyCallable = Callable.From<long>(OnPluginWebViewReady);
        _textReceivedCallable = Callable.From<long, string>(OnPluginTextReceived);
        _binaryReceivedCallable = Callable.From<long, byte[]>(OnPluginBinaryReceived);
        _dataReceivedCallable = Callable.From<long, Variant>(OnPluginDataReceived);
        _ipcErrorCallable = Callable.From<long, string>(OnPluginIpcError);

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
        _pluginSingleton!.Call("createWebView", _viewId, initialUrl);
    }

    public void DestroyWebView()
    {
        if (!EnsurePluginSingleton(nameof(DestroyWebView)))
        {
            return;
        }

        GD.Print("[Kirie][cs] destroy_webview");
        _pluginSingleton!.Call("destroyWebView", _viewId);
    }

    public void LoadUrl(string url)
    {
        if (!EnsurePluginSingleton(nameof(LoadUrl)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_url url={url}");
        _pluginSingleton!.Call("loadUrl", _viewId, url);
    }

    public void LoadHtmlString(string html, string baseUrl = "")
    {
        if (!EnsurePluginSingleton(nameof(LoadHtmlString)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] load_html_string bytes={html.Length} base_url={baseUrl}");
        _pluginSingleton!.Call("loadHtmlString", _viewId, html, baseUrl);
    }

    public void SendText(string message)
    {
        if (!EnsurePluginSingleton(nameof(SendText)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_text bytes={message.Length}");
        _pluginSingleton!.Call("sendText", _viewId, message);
    }

    public void SendBinary(byte[] bytes)
    {
        if (!EnsurePluginSingleton(nameof(SendBinary)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_binary bytes={bytes.Length}");
        _pluginSingleton!.Call("sendBinary", _viewId, bytes);
    }

    public void SendData(Variant value)
    {
        if (!EnsurePluginSingleton(nameof(SendData)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_data {value}");
        // Android plugin methods are registered by concrete JVM parameter type.
        // Godot does not expose a Kotlin-side Variant parameter type, and JVM Object
        // parameters do not reliably carry Variant containers. Use Godot's supported
        // Dictionary conversion path as a private carrier, then unwrap on Android
        // before CBOR encoding.
        switch (value.VariantType)
        {
            case Variant.Type.Nil:
            case Variant.Type.Bool:
            case Variant.Type.Int:
            case Variant.Type.Float:
            case Variant.Type.String:
            case Variant.Type.Array:
            case Variant.Type.Dictionary:
                break;
            default:
                GD.PushError($"Unsupported Kirie data type: {value.VariantType}");
                return;
        }

        _pluginSingleton!.Call(
            "sendData",
            _viewId,
            new Godot.Collections.Dictionary
            {
                ["value"] = value,
            });
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

    private void OnPluginWebViewReady(long viewId)
    {
        if (viewId != _viewId)
            return;

        GD.Print("[Kirie][cs] signal webview_ready");
        WebViewReady?.Invoke();
    }

    private void OnPluginTextReceived(long viewId, string message)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal text_received {message}");
        TextReceived?.Invoke(message);
    }

    private void OnPluginBinaryReceived(long viewId, byte[] bytes)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal binary_received bytes={bytes.Length}");
        BinaryReceived?.Invoke(bytes);
    }

    private void OnPluginDataReceived(long viewId, Variant value)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal data_received {value}");
        DataReceived?.Invoke(value);
    }

    private void OnPluginIpcError(long viewId, string error)
    {
        if (viewId != _viewId)
            return;

        GD.Print($"[Kirie][cs] signal ipc_error {error}");
        IpcError?.Invoke(error);
    }
}
