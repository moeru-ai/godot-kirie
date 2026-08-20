using Eventa;
using Godot;

namespace GdKirie.Platform;

/// <summary>
/// Owns the Platform Eventa registrations for one Godot host window.
/// </summary>
public sealed class GdKiriePlatformHost : IDisposable
{
    private readonly Window _window;
    private readonly List<IDisposable> _registrations = [];
    private bool _windowsPointerPassthrough;
    private bool _disposed;

    internal GdKiriePlatformHost(IEventContext context, Window window)
    {
        _window = window;
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.BeginMove,
            (EmptyPayload _, CancellationToken _) =>
            {
                _window.StartDrag();
                return Task.FromResult(new EmptyPayload());
            }));
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.BeginResize,
            (edge, _) =>
            {
                _window.StartResize(ToGodotEdge(edge));
                return Task.FromResult(new EmptyPayload());
            }));
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.Center,
            (EmptyPayload _, CancellationToken _) =>
            {
                _window.MoveToCenter();
                return Task.FromResult(new EmptyPayload());
            }));
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.GetPointerPosition,
            (EmptyPayload _, CancellationToken _) => Task.FromResult(GetPointerPosition())));
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.SetAlwaysOnTop,
            (enabled, _) =>
            {
                _window.AlwaysOnTop = enabled;
                return Task.FromResult(new EmptyPayload());
            }));
        _registrations.Add(context.RegisterInvokeHandler(
            PlatformEvents.SetPointerPassthrough,
            (enabled, _) =>
            {
                SetPointerPassthrough(enabled);
                return Task.FromResult(new EmptyPayload());
            }));

        _window.TreeExiting += Dispose;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        if (!GodotThread.IsMainThread())
        {
            throw new InvalidOperationException("GdKiriePlatformHost.Dispose must run on Godot's main thread.");
        }

        _disposed = true;
        _window.TreeExiting -= Dispose;

        Exception? restorationError = null;
        try
        {
            if (_windowsPointerPassthrough && OperatingSystem.IsWindowsVersionAtLeast(5))
            {
                WindowsMousePassthrough.Set(_window, false);
            }
        }
        catch (Exception error)
        {
            restorationError = error;
        }

        foreach (var registration in _registrations)
        {
            registration.Dispose();
        }

        _registrations.Clear();
        if (restorationError is not null)
        {
            System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(restorationError).Throw();
        }
    }

    private PointerPositionPayload GetPointerPosition()
    {
        var relativePosition = DisplayServer.MouseGetPosition() - _window.Position;
        var size = _window.Size;
        return new PointerPositionPayload(
            relativePosition.X,
            relativePosition.Y,
            relativePosition.X >= 0
                && relativePosition.Y >= 0
                && relativePosition.X < size.X
                && relativePosition.Y < size.Y);
    }

    private void SetPointerPassthrough(bool enabled)
    {
        if (OperatingSystem.IsWindowsVersionAtLeast(5))
        {
            WindowsMousePassthrough.Set(_window, enabled);
            _windowsPointerPassthrough = enabled;
            return;
        }

        _window.MousePassthrough = enabled;
    }

    private static DisplayServer.WindowResizeEdge ToGodotEdge(string edge)
    {
        return edge switch
        {
            "top" => DisplayServer.WindowResizeEdge.Top,
            "right" => DisplayServer.WindowResizeEdge.Right,
            "bottom" => DisplayServer.WindowResizeEdge.Bottom,
            "left" => DisplayServer.WindowResizeEdge.Left,
            "top-left" => DisplayServer.WindowResizeEdge.TopLeft,
            "top-right" => DisplayServer.WindowResizeEdge.TopRight,
            "bottom-left" => DisplayServer.WindowResizeEdge.BottomLeft,
            "bottom-right" => DisplayServer.WindowResizeEdge.BottomRight,
            _ => throw new ArgumentOutOfRangeException(nameof(edge), edge, "Unknown host-window resize edge."),
        };
    }

}
