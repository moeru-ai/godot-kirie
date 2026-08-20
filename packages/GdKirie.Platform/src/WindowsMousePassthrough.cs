using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Godot;
using Windows.Win32;
using Windows.Win32.Foundation;
using Windows.Win32.UI.WindowsAndMessaging;

namespace GdKirie.Platform;

[SupportedOSPlatform("windows5.0")]
internal static class WindowsMousePassthrough
{
    public static void Set(Window window, bool enabled)
    {
        var handle = (nint)DisplayServer.WindowGetNativeHandle(
            DisplayServer.HandleType.WindowHandle,
            window.GetWindowId());
        if (handle == nint.Zero)
        {
            throw new InvalidOperationException("Godot did not provide a native HWND for the host window.");
        }

        var nativeWindow = new HWND(handle);
        Marshal.SetLastPInvokeError(0);
        var currentStyle = PInvoke.GetWindowLong(nativeWindow, WINDOW_LONG_PTR_INDEX.GWL_EXSTYLE);
        var error = Marshal.GetLastPInvokeError();
        if (currentStyle == 0 && error != 0)
        {
            throw new Win32Exception(error);
        }

        var style = enabled
            ? currentStyle | (int)(WINDOW_EX_STYLE.WS_EX_LAYERED | WINDOW_EX_STYLE.WS_EX_TRANSPARENT)
            : currentStyle & ~(int)WINDOW_EX_STYLE.WS_EX_TRANSPARENT;
        Marshal.SetLastPInvokeError(0);
        var previousStyle = PInvoke.SetWindowLong(nativeWindow, WINDOW_LONG_PTR_INDEX.GWL_EXSTYLE, style);
        error = Marshal.GetLastPInvokeError();
        if (previousStyle == 0 && error != 0)
        {
            throw new Win32Exception(error);
        }

        if (!PInvoke.SetWindowPos(
                nativeWindow,
                default,
                0,
                0,
                0,
                0,
                SET_WINDOW_POS_FLAGS.SWP_FRAMECHANGED
                    | SET_WINDOW_POS_FLAGS.SWP_NOMOVE
                    | SET_WINDOW_POS_FLAGS.SWP_NOSIZE
                    | SET_WINDOW_POS_FLAGS.SWP_NOZORDER
                    | SET_WINDOW_POS_FLAGS.SWP_NOACTIVATE))
        {
            throw new Win32Exception(Marshal.GetLastPInvokeError());
        }
    }
}
