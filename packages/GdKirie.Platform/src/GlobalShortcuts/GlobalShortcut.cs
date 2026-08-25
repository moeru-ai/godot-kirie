using Godot;

namespace GdKirie.Platform;

internal readonly record struct GlobalShortcut(
    Key Keycode,
    bool ShiftPressed,
    bool AltPressed,
    bool CtrlPressed,
    bool MetaPressed)
{
    public static GlobalShortcut FromPayload(GlobalShortcutPayload payload)
    {
        var ctrlPressed = payload.CtrlPressed;
        var metaPressed = payload.MetaPressed;
        if (payload.CommandOrControlAutoremap)
        {
            if (OperatingSystem.IsMacOS())
            {
                metaPressed = true;
            }
            else
            {
                ctrlPressed = true;
            }
        }

        return new GlobalShortcut(
            (Key)payload.Keycode,
            payload.ShiftPressed,
            payload.AltPressed,
            ctrlPressed,
            metaPressed);
    }
}
