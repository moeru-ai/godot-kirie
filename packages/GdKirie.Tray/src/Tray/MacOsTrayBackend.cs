using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using Godot;

namespace GdKirie.Tray;

// ADR-0011: Kirie owns the macOS status item so it can set NSImage.isTemplate.
// See docs/decisions/0011-own-macos-status-items-for-template-icons.md.
internal sealed partial class MacOsTrayBackend(Action<string> itemActivated)
{
    private const string ObjectiveCLibrary = "/usr/lib/libobjc.A.dylib";
    private const double SquareStatusItemLength = -2;
    private const long ImageOnly = 1;
    private const long ImageScaleProportionallyUpOrDown = 3;
    private const ulong StatusItemMouseDownMask = (1UL << 1) | (1UL << 3) | (1UL << 25);
    private static readonly Dictionary<nint, MacOsTrayBackend> CallbackTargets = [];

    private readonly Dictionary<string, (Rid Menu, int Index)> _items = [];
    private readonly List<Rid> _menus = [];
    private readonly Callable _menuCallback = Callable.From<Variant>(tag =>
    {
        var id = tag.AsString();
        // Let Godot run its deferred menu-close callback before handlers can free the menu RID.
        // https://github.com/godotengine/godot/issues/123936
        Callable.From(() => itemActivated(id)).CallDeferred();
    });
    private nint _statusBar;
    private nint _statusItem;
    private nint _button;
    private nint _callbackTarget;
    private Rid _menu;

    public void Configure(Texture2D icon, string tooltip, bool visible, bool iconAsTemplate)
    {
        EnsureCreated();

        var nativeImage = CreateNativeImage(icon, iconAsTemplate);
        try
        {
            SendVoidPointer(_button, Selectors.SetImage, nativeImage);
        }
        finally
        {
            SendVoid(nativeImage, Selectors.Release);
        }

        var nativeTooltip = CreateNSString(tooltip);
        SendVoidPointer(_button, Selectors.SetToolTip, nativeTooltip);
        SendVoidBool(_statusItem, Selectors.SetVisible, visible ? (byte)1 : (byte)0);
    }

    public void SetMenu(IReadOnlyList<TrayMenuItem> items)
    {
        EnsureCreated();
        FreeMenus();

        if (items.Count == 0)
        {
            return;
        }

        _menu = CreateMenu();
        BuildMenu(_menu, items);
    }

    public void UpdateItem(TrayMenuItemUpdate update)
    {
        if (!_items.TryGetValue(update.Id, out var item))
        {
            throw new KeyNotFoundException($"Tray menu item '{update.Id}' does not exist.");
        }

        var (menu, index) = item;
        if (update.Text is not null) NativeMenu.SetItemText(menu, index, update.Text);
        if (update.Accelerator is not null) NativeMenu.SetItemAccelerator(menu, index, (Key)update.Accelerator);
        if (update.Disabled is not null) NativeMenu.SetItemDisabled(menu, index, update.Disabled.Value);
        if (update.Checked is not null) NativeMenu.SetItemChecked(menu, index, update.Checked.Value);
        if (update.State is not null) NativeMenu.SetItemState(menu, index, update.State.Value);
        if (update.MaxStates is not null) NativeMenu.SetItemMaxStates(menu, index, update.MaxStates.Value);
        if (update.Tooltip is not null) NativeMenu.SetItemTooltip(menu, index, update.Tooltip);
        if (update.Indent is not null) NativeMenu.SetItemIndentationLevel(menu, index, update.Indent.Value);
        if (update.ClearIcon) NativeMenu.SetItemIcon(menu, index, null!);
        else if (update.Texture is not null) NativeMenu.SetItemIcon(menu, index, update.Texture);
        else if (update.Icon is not null) NativeMenu.SetItemIcon(menu, index, TrayController.LoadTexture(update.Icon));
    }

    public void Destroy()
    {
        FreeMenus();
        if (_statusItem == nint.Zero)
        {
            return;
        }

        SendVoidPointer(_button, Selectors.SetTarget, nint.Zero);
        SendVoidPointer(_button, Selectors.SetAction, nint.Zero);
        SendVoidPointer(_button, Selectors.SetImage, nint.Zero);

        CallbackTargets.Remove(_callbackTarget);

        SendVoidPointer(_statusBar, Selectors.RemoveStatusItem, _statusItem);
        SendVoid(_callbackTarget, Selectors.Release);
        SendVoid(_statusItem, Selectors.Release);
        _statusBar = nint.Zero;
        _statusItem = nint.Zero;
        _button = nint.Zero;
        _callbackTarget = nint.Zero;
    }

    private void EnsureCreated()
    {
        if (_statusItem != nint.Zero)
        {
            return;
        }

        _statusBar = SendPointer(GetClass("NSStatusBar"), Selectors.SystemStatusBar);
        _statusItem = SendDouble(_statusBar, Selectors.StatusItemWithLength, SquareStatusItemLength);
        if (_statusItem != nint.Zero)
        {
            _statusItem = SendPointer(_statusItem, Selectors.Retain);
        }

        _button = SendPointer(_statusItem, Selectors.Button);
        if (_statusBar == nint.Zero || _statusItem == nint.Zero || _button == nint.Zero)
        {
            if (_statusBar != nint.Zero && _statusItem != nint.Zero)
            {
                SendVoidPointer(_statusBar, Selectors.RemoveStatusItem, _statusItem);
                SendVoid(_statusItem, Selectors.Release);
            }

            _statusBar = nint.Zero;
            _statusItem = nint.Zero;
            _button = nint.Zero;
            throw new InvalidOperationException("AppKit failed to create the system tray status item.");
        }

        _callbackTarget = SendPointer(CallbackClass.Value, Selectors.New);
        if (_callbackTarget == nint.Zero)
        {
            SendVoidPointer(_statusBar, Selectors.RemoveStatusItem, _statusItem);
            SendVoid(_statusItem, Selectors.Release);
            _statusBar = nint.Zero;
            _statusItem = nint.Zero;
            _button = nint.Zero;
            throw new InvalidOperationException("AppKit failed to create the system tray callback target.");
        }

        CallbackTargets.Add(_callbackTarget, this);

        SendVoidPointer(_button, Selectors.SetTarget, _callbackTarget);
        SendVoidPointer(_button, Selectors.SetAction, Selectors.StatusItemActivated);
        SendIntegerUnsignedInteger(_button, Selectors.SendActionOn, (nuint)StatusItemMouseDownMask);
        SendVoidPointer(_button, Selectors.SetImagePosition, (nint)ImageOnly);
        SendVoidPointer(_button, Selectors.SetImageScaling, (nint)ImageScaleProportionallyUpOrDown);
        SendVoidBool(_statusItem, Selectors.SetVisible, 0);
    }

    private void BuildMenu(Rid menu, IReadOnlyList<TrayMenuItem> items)
    {
        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.Id) || _items.ContainsKey(item.Id))
            {
                throw new ArgumentException($"Tray menu item ID '{item.Id}' must be non-empty and unique.");
            }

            var accelerator = (Key)item.Accelerator;
            int index;
            switch (item.Type)
            {
                case "item":
                    index = NativeMenu.AddItem(
                        menu,
                        item.Text,
                        _menuCallback,
                        _menuCallback,
                        item.Id,
                        accelerator);
                    break;
                case "check":
                    index = NativeMenu.AddCheckItem(
                        menu,
                        item.Text,
                        _menuCallback,
                        _menuCallback,
                        item.Id,
                        accelerator);
                    break;
                case "radio":
                    index = NativeMenu.AddRadioCheckItem(
                        menu,
                        item.Text,
                        _menuCallback,
                        _menuCallback,
                        item.Id,
                        accelerator);
                    break;
                case "multistate":
                    index = NativeMenu.AddMultistateItem(
                        menu,
                        item.Text,
                        item.MaxStates,
                        item.State,
                        _menuCallback,
                        _menuCallback,
                        item.Id,
                        accelerator);
                    break;
                case "separator":
                    index = NativeMenu.AddSeparator(menu);
                    if (item.Text.Length > 0)
                    {
                        NativeMenu.SetItemText(menu, index, item.Text);
                    }

                    break;
                case "submenu":
                    var submenu = CreateMenu();
                    BuildMenu(submenu, item.Children ?? []);
                    index = NativeMenu.AddSubmenuItem(menu, item.Text, submenu, item.Id);
                    break;
                default:
                    throw new ArgumentException($"Unknown tray menu item type '{item.Type}'.");
            }

            _items.Add(item.Id, (menu, index));
            var texture = item.Texture ?? (item.Icon is null ? null : TrayController.LoadTexture(item.Icon));
            if (texture is not null) NativeMenu.SetItemIcon(menu, index, texture);
            if (item.Disabled) NativeMenu.SetItemDisabled(menu, index, true);
            if (item.Checked) NativeMenu.SetItemChecked(menu, index, true);
            if (item.Tooltip.Length > 0) NativeMenu.SetItemTooltip(menu, index, item.Tooltip);
            if (item.Indent != 0) NativeMenu.SetItemIndentationLevel(menu, index, item.Indent);
        }
    }

    private Rid CreateMenu()
    {
        var menu = NativeMenu.CreateMenu();
        if (!menu.IsValid)
        {
            throw new InvalidOperationException("Godot failed to create a native popup menu.");
        }

        _menus.Add(menu);
        return menu;
    }

    private void FreeMenus()
    {
        for (var index = _menus.Count - 1; index >= 0; index--)
        {
            NativeMenu.FreeMenu(_menus[index]);
        }

        _menus.Clear();
        _items.Clear();
        _menu = default;
    }

    private void ShowMenu()
    {
        if (_menu.IsValid)
        {
            NativeMenu.Popup(_menu, DisplayServer.MouseGetPosition());
        }
    }

    private static unsafe nint CreateNativeImage(Texture2D texture, bool iconAsTemplate)
    {
        using var image = texture.GetImage();
        if (image.IsCompressed())
        {
            var error = image.Decompress();
            if (error != Error.Ok)
            {
                throw new InvalidOperationException($"Godot failed to decompress the tray icon image: {error}.");
            }
        }

        var png = image.SavePngToBuffer();
        if (png.Length == 0)
        {
            throw new InvalidOperationException("Godot failed to encode the tray icon as PNG.");
        }

        fixed (byte* bytes = png)
        {
            var data = SendPointerSize(
                GetClass("NSData"),
                Selectors.DataWithBytesLength,
                (nint)bytes,
                (nuint)png.Length);
            var allocatedImage = SendPointer(GetClass("NSImage"), Selectors.Alloc);
            var nativeImage = SendPointerPointer(allocatedImage, Selectors.InitWithData, data);
            if (nativeImage == nint.Zero)
            {
                throw new InvalidOperationException("AppKit failed to decode the tray icon PNG.");
            }

            SendVoidBool(nativeImage, Selectors.SetTemplate, iconAsTemplate ? (byte)1 : (byte)0);
            return nativeImage;
        }
    }

    private static nint CreateNSString(string value)
    {
        var utf8 = Marshal.StringToCoTaskMemUTF8(value);
        try
        {
            return SendPointerPointer(GetClass("NSString"), Selectors.StringWithUtf8String, utf8);
        }
        finally
        {
            Marshal.FreeCoTaskMem(utf8);
        }
    }

    private static nint GetClass(string name)
    {
        var nativeClass = ObjectiveCGetClass(name);
        return nativeClass != nint.Zero
            ? nativeClass
            : throw new InvalidOperationException($"Objective-C class '{name}' is unavailable.");
    }

    private static unsafe nint CreateCallbackClass()
    {
        var className = $"GdKirieTrayTarget_{Guid.NewGuid():N}";
        var callbackClass = ObjectiveCAllocateClassPair(GetClass("NSObject"), className, 0);
        if (callbackClass == nint.Zero)
        {
            throw new InvalidOperationException("Objective-C failed to allocate the tray callback class.");
        }

        var implementation = (nint)(delegate* unmanaged[Cdecl]<nint, nint, nint, void>)&HandleStatusItemActivated;
        if (ClassAddMethod(callbackClass, Selectors.StatusItemActivated, implementation, "v@:@") == 0)
        {
            ObjectiveCDisposeClassPair(callbackClass);
            throw new InvalidOperationException("Objective-C failed to add the tray callback method.");
        }

        ObjectiveCRegisterClassPair(callbackClass);
        return callbackClass;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void HandleStatusItemActivated(nint self, nint selector, nint sender)
    {
        try
        {
            CallbackTargets.TryGetValue(self, out var backend);
            backend?.ShowMenu();
        }
        catch (Exception error)
        {
            GD.PushError($"Failed to show the macOS tray menu: {error}");
        }
    }

    private static class CallbackClass
    {
        internal static readonly nint Value = CreateCallbackClass();
    }

    private static class Selectors
    {
        internal static readonly nint Alloc = RegisterSelector("alloc");
        internal static readonly nint Button = RegisterSelector("button");
        internal static readonly nint DataWithBytesLength = RegisterSelector("dataWithBytes:length:");
        internal static readonly nint InitWithData = RegisterSelector("initWithData:");
        internal static readonly nint New = RegisterSelector("new");
        internal static readonly nint Release = RegisterSelector("release");
        internal static readonly nint Retain = RegisterSelector("retain");
        internal static readonly nint RemoveStatusItem = RegisterSelector("removeStatusItem:");
        internal static readonly nint SendActionOn = RegisterSelector("sendActionOn:");
        internal static readonly nint SetAction = RegisterSelector("setAction:");
        internal static readonly nint SetImage = RegisterSelector("setImage:");
        internal static readonly nint SetImagePosition = RegisterSelector("setImagePosition:");
        internal static readonly nint SetImageScaling = RegisterSelector("setImageScaling:");
        internal static readonly nint SetTarget = RegisterSelector("setTarget:");
        internal static readonly nint SetTemplate = RegisterSelector("setTemplate:");
        internal static readonly nint SetToolTip = RegisterSelector("setToolTip:");
        internal static readonly nint SetVisible = RegisterSelector("setVisible:");
        internal static readonly nint StatusItemActivated = RegisterSelector("kirieStatusItemActivated:");
        internal static readonly nint StatusItemWithLength = RegisterSelector("statusItemWithLength:");
        internal static readonly nint StringWithUtf8String = RegisterSelector("stringWithUTF8String:");
        internal static readonly nint SystemStatusBar = RegisterSelector("systemStatusBar");

        private static nint RegisterSelector(string name)
        {
            var selector = SelectorRegisterName(name);
            return selector != nint.Zero
                ? selector
                : throw new InvalidOperationException($"Objective-C selector '{name}' is unavailable.");
        }
    }

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_getClass", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint ObjectiveCGetClass(string name);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "sel_registerName", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint SelectorRegisterName(string name);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_allocateClassPair", StringMarshalling = StringMarshalling.Utf8)]
    private static partial nint ObjectiveCAllocateClassPair(nint superclass, string name, nuint extraBytes);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_disposeClassPair")]
    private static partial void ObjectiveCDisposeClassPair(nint nativeClass);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_registerClassPair")]
    private static partial void ObjectiveCRegisterClassPair(nint nativeClass);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "class_addMethod", StringMarshalling = StringMarshalling.Utf8)]
    private static partial byte ClassAddMethod(nint nativeClass, nint selector, nint implementation, string types);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendPointer(nint receiver, nint selector);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendPointerPointer(nint receiver, nint selector, nint value);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendPointerSize(nint receiver, nint selector, nint bytes, nuint length);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendDouble(nint receiver, nint selector, double value);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial nint SendIntegerUnsignedInteger(nint receiver, nint selector, nuint value);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoid(nint receiver, nint selector);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoidPointer(nint receiver, nint selector, nint value);

    [LibraryImport(ObjectiveCLibrary, EntryPoint = "objc_msgSend")]
    private static partial void SendVoidBool(nint receiver, nint selector, byte value);

}
