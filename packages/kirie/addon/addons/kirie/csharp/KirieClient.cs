#nullable enable

using System;
using Godot;

public partial class KirieClient : GodotObject
{
    public const string PluginSingletonName = "Kirie";

    private readonly Callable _webViewReadyCallable;
    private readonly Callable _textPacketReceivedCallable;
    private readonly Callable _binaryPacketReceivedCallable;
    private readonly Callable _dataPacketReceivedCallable;
    private readonly Callable _ipcErrorCallable;

    private readonly GodotObject? _pluginSingleton;

    public event Action? WebViewReady;
    public event Action<byte[]>? TextPacketReceived;
    public event Action<byte[]>? BinaryPacketReceived;
    public event Action<byte[]>? DataPacketReceived;
    public event Action<string>? TextReceived;
    public event Action<byte[]>? BinaryReceived;
    public event Action<object?>? DataReceived;
    public event Action<string>? IpcError;

    public KirieClient()
    {
        _webViewReadyCallable = Callable.From(OnPluginWebViewReady);
        _textPacketReceivedCallable = Callable.From<byte[]>(OnPluginTextPacketReceived);
        _binaryPacketReceivedCallable = Callable.From<byte[]>(OnPluginBinaryPacketReceived);
        _dataPacketReceivedCallable = Callable.From<byte[]>(OnPluginDataPacketReceived);
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
        ArgumentNullException.ThrowIfNull(message);
        SendTextPacket(KirieCborCodec.EncodeText(message));
    }

    public void SendBinary(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        SendBinaryPacket(KirieCborCodec.EncodeBytes(bytes));
    }

    public void SendData(object? value)
    {
        try
        {
            SendDataPacket(KirieCborCodec.EncodeData(value));
        }
        catch (KirieCborException error)
        {
            OnPluginIpcError($"CBOR data encode failed: {error.Message}");
        }
    }

    public void SendTextPacket(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (!EnsurePluginSingleton(nameof(SendTextPacket)))
        {
            return;
        }

        if (!EnsureNonEmptyPacket(bytes, nameof(SendTextPacket)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_text_packet bytes={bytes.Length}");
        _pluginSingleton!.Call("sendTextPacket", bytes);
    }

    public void SendBinaryPacket(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (!EnsurePluginSingleton(nameof(SendBinaryPacket)))
        {
            return;
        }

        if (!EnsureNonEmptyPacket(bytes, nameof(SendBinaryPacket)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_binary_packet bytes={bytes.Length}");
        _pluginSingleton!.Call("sendBinaryPacket", bytes);
    }

    public void SendDataPacket(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (!EnsurePluginSingleton(nameof(SendDataPacket)))
        {
            return;
        }

        if (!EnsureNonEmptyPacket(bytes, nameof(SendDataPacket)))
        {
            return;
        }

        GD.Print($"[Kirie][cs] send_data_packet bytes={bytes.Length}");
        _pluginSingleton!.Call("sendDataPacket", bytes);
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
                _textPacketReceivedCallable,
                _binaryPacketReceivedCallable,
                _dataPacketReceivedCallable,
                _ipcErrorCallable
            );
            return;
        }

        ConnectPluginSignal("webview_ready", _webViewReadyCallable);
        ConnectPluginSignal("text_packet_received", _textPacketReceivedCallable);
        ConnectPluginSignal("binary_packet_received", _binaryPacketReceivedCallable);
        ConnectPluginSignal("data_packet_received", _dataPacketReceivedCallable);
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

    private bool EnsureNonEmptyPacket(byte[] bytes, string methodName)
    {
        if (bytes.Length > 0)
        {
            return true;
        }

        var error = $"Kirie cannot send an empty CBOR packet from {methodName}()";
        GD.PushWarning(error);
        IpcError?.Invoke(error);
        return false;
    }

    private void OnPluginWebViewReady()
    {
        GD.Print("[Kirie][cs] signal webview_ready");
        WebViewReady?.Invoke();
    }

    private void OnPluginTextPacketReceived(byte[] bytes)
    {
        GD.Print($"[Kirie][cs] signal text_packet_received bytes={bytes.Length}");
        TextPacketReceived?.Invoke(bytes);
        try
        {
            TextReceived?.Invoke(KirieCborCodec.DecodeText(bytes));
        }
        catch (KirieCborException error)
        {
            OnPluginIpcError($"CBOR text decode failed: {error.Message}");
        }
    }

    private void OnPluginBinaryPacketReceived(byte[] bytes)
    {
        GD.Print($"[Kirie][cs] signal binary_packet_received bytes={bytes.Length}");
        BinaryPacketReceived?.Invoke(bytes);
        try
        {
            BinaryReceived?.Invoke(KirieCborCodec.DecodeBytes(bytes));
        }
        catch (KirieCborException error)
        {
            OnPluginIpcError($"CBOR binary decode failed: {error.Message}");
        }
    }

    private void OnPluginDataPacketReceived(byte[] bytes)
    {
        GD.Print($"[Kirie][cs] signal data_packet_received bytes={bytes.Length}");
        DataPacketReceived?.Invoke(bytes);
        try
        {
            DataReceived?.Invoke(KirieCborCodec.DecodeData(bytes));
        }
        catch (KirieCborException error)
        {
            OnPluginIpcError($"CBOR data decode failed: {error.Message}");
        }
    }

    private void OnPluginIpcError(string error)
    {
        GD.Print($"[Kirie][cs] signal ipc_error {error}");
        IpcError?.Invoke(error);
    }
}
