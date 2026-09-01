namespace GdKirie.Platform;

internal sealed class WindowsShortcutMatcher
{
    private static readonly IReadOnlyList<WindowsShortcutTransition> EmptyTransitions =
        Array.Empty<WindowsShortcutTransition>();

    internal const uint VirtualKeyLeftShift = 0xA0;
    internal const uint VirtualKeyRightShift = 0xA1;
    internal const uint VirtualKeyLeftControl = 0xA2;
    internal const uint VirtualKeyRightControl = 0xA3;
    internal const uint VirtualKeyLeftAlt = 0xA4;
    internal const uint VirtualKeyRightAlt = 0xA5;
    internal const uint VirtualKeyLeftMeta = 0x5B;
    internal const uint VirtualKeyRightMeta = 0x5C;

    private readonly Dictionary<long, Shortcut> _shortcuts = [];
    private readonly HashSet<WindowsKeycode> _pressedKeys = [];
    private readonly HashSet<uint> _pressedModifiers = [];
    private readonly HashSet<long> _pressedShortcuts = [];

    public void Register(long id, WindowsKeycode keycode, GlobalShortcut shortcut)
    {
        _shortcuts.Add(id, new Shortcut(keycode, shortcut));
    }

    public void Unregister(long id)
    {
        _shortcuts.Remove(id);
        _pressedShortcuts.Remove(id);
    }

    public IReadOnlyList<WindowsShortcutTransition> Handle(
        WindowsKeycode keycode,
        uint virtualKey,
        bool pressed)
    {
        if (pressed)
        {
            if (IsModifier(virtualKey))
            {
                _pressedModifiers.Add(virtualKey);
                return EmptyTransitions;
            }

            if (!_pressedKeys.Add(keycode))
            {
                return EmptyTransitions;
            }

            var modifiers = CurrentModifiers;
            List<WindowsShortcutTransition>? transitions = null;
            foreach (var (id, shortcut) in _shortcuts)
            {
                if (shortcut.Keycode != keycode
                    || shortcut.Modifiers != modifiers
                    || !_pressedShortcuts.Add(id))
                {
                    continue;
                }

                transitions ??= [];
                transitions.Add(new WindowsShortcutTransition(id, "pressed"));
            }

            return transitions is null ? EmptyTransitions : transitions;
        }

        if (IsModifier(virtualKey))
        {
            _pressedModifiers.Remove(virtualKey);
            return EmptyTransitions;
        }

        _pressedKeys.Remove(keycode);
        List<WindowsShortcutTransition>? released = null;
        foreach (var (id, shortcut) in _shortcuts)
        {
            if (shortcut.Keycode != keycode || !_pressedShortcuts.Remove(id))
            {
                continue;
            }

            released ??= [];
            released.Add(new WindowsShortcutTransition(id, "released"));
        }

        return released is null ? EmptyTransitions : released;
    }

    public void SeedPressedModifier(uint virtualKey)
    {
        if (IsModifier(virtualKey))
        {
            _pressedModifiers.Add(virtualKey);
        }
    }

    public void Clear()
    {
        _pressedKeys.Clear();
        _pressedModifiers.Clear();
        _pressedShortcuts.Clear();
    }

    private ShortcutModifiers CurrentModifiers => new(
        IsEitherPressed(VirtualKeyLeftShift, VirtualKeyRightShift),
        IsEitherPressed(VirtualKeyLeftAlt, VirtualKeyRightAlt),
        IsEitherPressed(VirtualKeyLeftControl, VirtualKeyRightControl),
        IsEitherPressed(VirtualKeyLeftMeta, VirtualKeyRightMeta));

    private bool IsEitherPressed(uint left, uint right)
    {
        return _pressedModifiers.Contains(left) || _pressedModifiers.Contains(right);
    }

    private static bool IsModifier(uint virtualKey)
    {
        return virtualKey is VirtualKeyLeftShift
            or VirtualKeyRightShift
            or VirtualKeyLeftControl
            or VirtualKeyRightControl
            or VirtualKeyLeftAlt
            or VirtualKeyRightAlt
            or VirtualKeyLeftMeta
            or VirtualKeyRightMeta;
    }

    private readonly record struct Shortcut(WindowsKeycode Keycode, ShortcutModifiers Modifiers)
    {
        public Shortcut(WindowsKeycode keycode, GlobalShortcut shortcut)
            : this(
                keycode,
                new ShortcutModifiers(
                    shortcut.ShiftPressed,
                    shortcut.AltPressed,
                    shortcut.CtrlPressed,
                    shortcut.MetaPressed))
        {
        }
    }

    private readonly record struct ShortcutModifiers(bool Shift, bool Alt, bool Ctrl, bool Meta);
}

internal readonly record struct WindowsShortcutTransition(long RegistrationId, string State);
