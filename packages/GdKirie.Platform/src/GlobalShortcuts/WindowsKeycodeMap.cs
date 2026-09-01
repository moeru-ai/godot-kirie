using System.Runtime.Versioning;
using Godot;

namespace GdKirie.Platform;

[SupportedOSPlatform("windows10.0")]
internal static class WindowsKeycodeMap
{
    private static readonly (Key PhysicalKey, WindowsKeycode Keycode)[] Keys =
    [
        (Key.Escape, new(0x01)),
        (Key.Key1, new(0x02)),
        (Key.Key2, new(0x03)),
        (Key.Key3, new(0x04)),
        (Key.Key4, new(0x05)),
        (Key.Key5, new(0x06)),
        (Key.Key6, new(0x07)),
        (Key.Key7, new(0x08)),
        (Key.Key8, new(0x09)),
        (Key.Key9, new(0x0A)),
        (Key.Key0, new(0x0B)),
        (Key.Minus, new(0x0C)),
        (Key.Equal, new(0x0D)),
        (Key.Backspace, new(0x0E)),
        (Key.Tab, new(0x0F)),
        (Key.Q, new(0x10)),
        (Key.W, new(0x11)),
        (Key.E, new(0x12)),
        (Key.R, new(0x13)),
        (Key.T, new(0x14)),
        (Key.Y, new(0x15)),
        (Key.U, new(0x16)),
        (Key.I, new(0x17)),
        (Key.O, new(0x18)),
        (Key.P, new(0x19)),
        (Key.Bracketleft, new(0x1A)),
        (Key.Bracketright, new(0x1B)),
        (Key.Enter, new(0x1C)),
        (Key.A, new(0x1E)),
        (Key.S, new(0x1F)),
        (Key.D, new(0x20)),
        (Key.F, new(0x21)),
        (Key.G, new(0x22)),
        (Key.H, new(0x23)),
        (Key.J, new(0x24)),
        (Key.K, new(0x25)),
        (Key.L, new(0x26)),
        (Key.Semicolon, new(0x27)),
        (Key.Apostrophe, new(0x28)),
        (Key.Quoteleft, new(0x29)),
        (Key.Backslash, new(0x2B)),
        (Key.Z, new(0x2C)),
        (Key.X, new(0x2D)),
        (Key.C, new(0x2E)),
        (Key.V, new(0x2F)),
        (Key.B, new(0x30)),
        (Key.N, new(0x31)),
        (Key.M, new(0x32)),
        (Key.Comma, new(0x33)),
        (Key.Period, new(0x34)),
        (Key.Slash, new(0x35)),
        (Key.KpMultiply, new(0x37)),
        (Key.Space, new(0x39)),
        (Key.Capslock, new(0x3A)),
        (Key.F1, new(0x3B)),
        (Key.F2, new(0x3C)),
        (Key.F3, new(0x3D)),
        (Key.F4, new(0x3E)),
        (Key.F5, new(0x3F)),
        (Key.F6, new(0x40)),
        (Key.F7, new(0x41)),
        (Key.F8, new(0x42)),
        (Key.F9, new(0x43)),
        (Key.F10, new(0x44)),
        (Key.Numlock, new(0x45)),
        (Key.Kp7, new(0x47)),
        (Key.Kp8, new(0x48)),
        (Key.Kp9, new(0x49)),
        (Key.KpSubtract, new(0x4A)),
        (Key.Kp4, new(0x4B)),
        (Key.Kp5, new(0x4C)),
        (Key.Kp6, new(0x4D)),
        (Key.KpAdd, new(0x4E)),
        (Key.Kp1, new(0x4F)),
        (Key.Kp2, new(0x50)),
        (Key.Kp3, new(0x51)),
        (Key.Kp0, new(0x52)),
        (Key.KpPeriod, new(0x53)),
        (Key.F11, new(0x57)),
        (Key.F12, new(0x58)),
        (Key.KpEnter, new(0x1C, Extended: true)),
        (Key.KpDivide, new(0x35, Extended: true)),
        (Key.Home, new(0x47, Extended: true)),
        (Key.Up, new(0x48, Extended: true)),
        (Key.Pageup, new(0x49, Extended: true)),
        (Key.Left, new(0x4B, Extended: true)),
        (Key.Right, new(0x4D, Extended: true)),
        (Key.End, new(0x4F, Extended: true)),
        (Key.Down, new(0x50, Extended: true)),
        (Key.Pagedown, new(0x51, Extended: true)),
        (Key.Insert, new(0x52, Extended: true)),
        (Key.Delete, new(0x53, Extended: true)),
        (Key.Menu, new(0x5D, Extended: true)),
        (Key.Volumemute, new(0x20, Extended: true)),
        (Key.Volumedown, new(0x2E, Extended: true)),
        (Key.Volumeup, new(0x30, Extended: true)),
    ];

    public static WindowsKeycode Resolve(Key logicalKey)
    {
        foreach (var (physicalKey, keycode) in Keys)
        {
            if (DisplayServer.KeyboardGetKeycodeFromPhysical(physicalKey) == logicalKey)
            {
                return keycode;
            }
        }

        throw new ArgumentOutOfRangeException(
            nameof(logicalKey),
            logicalKey,
            "The Godot logical key cannot be registered as a Windows global shortcut.");
    }
}

internal readonly record struct WindowsKeycode(uint ScanCode, bool Extended = false);
