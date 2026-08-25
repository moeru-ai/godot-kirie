namespace GdKirie.Platform;

internal interface IGlobalShortcutBackend : IDisposable
{
    IDisposable Register(GlobalShortcut shortcut, Action<string> onKeyEvent);
}
