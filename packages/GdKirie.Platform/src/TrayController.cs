using System.Text.Json.Serialization;
using Godot;

namespace GdKirie.Platform;

/// <summary>Serializable status-indicator configuration.</summary>
/// <param name="Icon">Imported Godot texture resource path.</param>
/// <param name="Tooltip">Native tooltip text.</param>
/// <param name="Visible">Whether the indicator is visible.</param>
public sealed record TrayConfiguration(string Icon, string Tooltip = "", bool Visible = true);

/// <summary>One item in a serializable popup-menu tree.</summary>
/// <param name="Id">Caller-owned ID unique across the tree.</param>
/// <param name="Text">Displayed item text.</param>
/// <param name="Type">Godot menu item type.</param>
/// <param name="Icon">Optional imported texture resource path.</param>
/// <param name="Accelerator">Optional Godot <see cref="Key"/> value.</param>
/// <param name="Disabled">Whether activation is disabled.</param>
/// <param name="Checked">Whether a check or radio item is checked.</param>
/// <param name="State">Initial multistate value.</param>
/// <param name="MaxStates">Number of multistate values.</param>
/// <param name="Tooltip">Item tooltip text.</param>
/// <param name="Indent">Item indentation level.</param>
/// <param name="Children">Items below a submenu.</param>
public sealed record TrayMenuItem(
    string Id,
    string Text,
    string Type = "item",
    string? Icon = null,
    long Accelerator = 0,
    bool Disabled = false,
    bool Checked = false,
    int State = 0,
    int MaxStates = 0,
    string Tooltip = "",
    int Indent = 0,
    TrayMenuItem[]? Children = null)
{
    /// <summary>Optional C#-only texture, preferred over <see cref="Icon"/>.</summary>
    [JsonIgnore]
    public Texture2D? Texture { get; init; }
}

/// <summary>Mutable properties for one existing tray menu item.</summary>
/// <param name="Id">Caller-owned item ID.</param>
/// <param name="Text">Replacement text.</param>
/// <param name="Icon">Replacement imported texture path.</param>
/// <param name="Accelerator">Replacement Godot <see cref="Key"/> value.</param>
/// <param name="Disabled">Replacement disabled state.</param>
/// <param name="Checked">Replacement checked state.</param>
/// <param name="State">Replacement multistate value.</param>
/// <param name="MaxStates">Replacement multistate count.</param>
/// <param name="Tooltip">Replacement tooltip.</param>
/// <param name="Indent">Replacement indentation.</param>
/// <param name="ClearIcon">Whether to remove the current icon.</param>
public sealed record TrayMenuItemUpdate(
    string Id,
    string? Text = null,
    string? Icon = null,
    long? Accelerator = null,
    bool? Disabled = null,
    bool? Checked = null,
    int? State = null,
    int? MaxStates = null,
    string? Tooltip = null,
    int? Indent = null,
    bool ClearIcon = false)
{
    /// <summary>Optional C#-only replacement texture.</summary>
    [JsonIgnore]
    public Texture2D? Texture { get; init; }
}

/// <summary>Owns one Godot status indicator and its popup menus.</summary>
public sealed class TrayController : IDisposable
{
    private readonly Window _window;
    private readonly Action<TrayMenuItemActivatedPayload> _emitItemActivated;
    private readonly Action<TrayPressedPayload> _emitPressed;
    private readonly Dictionary<string, (PopupMenu Menu, int Index)> _items = [];
    private readonly Dictionary<long, string> _stableIds = [];
    private StatusIndicator? _indicator;
    private PopupMenu? _menu;
    private int _nextNativeId = 1;
    private bool _disposed;

    internal TrayController(
        Window window,
        Action<TrayMenuItemActivatedPayload> emitItemActivated,
        Action<TrayPressedPayload> emitPressed)
    {
        _window = window;
        _emitItemActivated = emitItemActivated;
        _emitPressed = emitPressed;
    }

    /// <summary>Raised with the stable ID of an activated menu item.</summary>
    public event Action<string>? ItemActivated;

    /// <summary>Raised when Godot reports a status-indicator press.</summary>
    public event Action<long, Vector2I>? Pressed;

    /// <summary>Creates or updates the indicator from a resource reference.</summary>
    public void Configure(TrayConfiguration configuration) =>
        Configure(LoadTexture(configuration.Icon), configuration.Tooltip, configuration.Visible);

    /// <summary>Creates or updates the indicator from a Godot texture.</summary>
    public void Configure(Texture2D icon, string tooltip = "", bool visible = true)
    {
        ArgumentNullException.ThrowIfNull(icon);
        EnsureCreated();
        _indicator!.Icon = icon;
        _indicator.Tooltip = tooltip;
        _indicator.Visible = visible;
    }

    /// <summary>Replaces the complete popup-menu tree.</summary>
    public void SetMenu(IReadOnlyList<TrayMenuItem> items)
    {
        ArgumentNullException.ThrowIfNull(items);
        EnsureCreated();
        _menu!.Clear(true);
        _items.Clear();
        _stableIds.Clear();
        BuildMenu(_menu, items);
        _indicator!.Menu = items.Count == 0 ? new NodePath() : _indicator.GetPathTo(_menu);
    }

    /// <summary>Updates mutable properties of one item.</summary>
    public void UpdateItem(TrayMenuItemUpdate update)
    {
        ArgumentNullException.ThrowIfNull(update);
        EnsureMainThread();
        if (!_items.TryGetValue(update.Id, out var item))
        {
            throw new KeyNotFoundException($"Tray menu item '{update.Id}' does not exist.");
        }

        var (menu, index) = item;
        if (update.Text is not null) menu.SetItemText(index, update.Text);
        if (update.Accelerator is not null) menu.SetItemAccelerator(index, (Key)update.Accelerator);
        if (update.Disabled is not null) menu.SetItemDisabled(index, update.Disabled.Value);
        if (update.Checked is not null) menu.SetItemChecked(index, update.Checked.Value);
        if (update.State is not null) menu.SetItemMultistate(index, update.State.Value);
        if (update.MaxStates is not null) menu.SetItemMultistateMax(index, update.MaxStates.Value);
        if (update.Tooltip is not null) menu.SetItemTooltip(index, update.Tooltip);
        if (update.Indent is not null) menu.SetItemIndent(index, update.Indent.Value);
        if (update.ClearIcon) menu.SetItemIcon(index, null);
        else if (update.Texture is not null) menu.SetItemIcon(index, update.Texture);
        else if (update.Icon is not null) menu.SetItemIcon(index, LoadTexture(update.Icon));
    }

    /// <summary>Destroys the indicator and menu while keeping this controller reusable.</summary>
    public void Destroy()
    {
        EnsureMainThread();
        if (_indicator is null) return;

        _indicator.Visible = false;
        _indicator.Pressed -= OnPressed;
        _menu!.IdPressed -= OnItemPressed;
        _indicator.QueueFree();
        _indicator = null;
        _menu = null;
        _items.Clear();
        _stableIds.Clear();
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (_disposed) return;
        Destroy();
        _disposed = true;
        ItemActivated = null;
        Pressed = null;
    }

    private void EnsureCreated()
    {
        EnsureMainThread();
        if (_indicator is not null) return;
        if (!OperatingSystem.IsMacOS() && !OperatingSystem.IsWindows())
        {
            throw new PlatformNotSupportedException("System trays are supported on macOS and Windows.");
        }

        _menu = new PopupMenu { Name = "Menu" };
        _menu.IdPressed += OnItemPressed;
        _indicator = new StatusIndicator { Name = "KirieSystemTray", Visible = false };
        _indicator.Pressed += OnPressed;
        _indicator.AddChild(_menu);
        _window.CallDeferred(Node.MethodName.AddChild, _indicator);
    }

    private void BuildMenu(PopupMenu menu, IReadOnlyList<TrayMenuItem> items)
    {
        foreach (var item in items)
        {
            if (string.IsNullOrWhiteSpace(item.Id) || _items.ContainsKey(item.Id))
            {
                throw new ArgumentException($"Tray menu item ID '{item.Id}' must be non-empty and unique.");
            }

            var nativeId = _nextNativeId++;
            var accelerator = (Key)item.Accelerator;
            switch (item.Type)
            {
                case "item": menu.AddItem(item.Text, nativeId, accelerator); break;
                case "check": menu.AddCheckItem(item.Text, nativeId, accelerator); break;
                case "radio": menu.AddRadioCheckItem(item.Text, nativeId, accelerator); break;
                case "multistate": menu.AddMultistateItem(item.Text, item.MaxStates, item.State, nativeId, accelerator); break;
                case "separator": menu.AddSeparator(item.Text, nativeId); break;
                case "submenu":
                    var submenu = new PopupMenu { Name = $"Submenu{nativeId}" };
                    submenu.IdPressed += OnItemPressed;
                    BuildMenu(submenu, item.Children ?? []);
                    menu.AddSubmenuNodeItem(item.Text, submenu, nativeId);
                    break;
                default: throw new ArgumentException($"Unknown tray menu item type '{item.Type}'.");
            }

            var index = menu.ItemCount - 1;
            _items.Add(item.Id, (menu, index));
            _stableIds.Add(nativeId, item.Id);
            var texture = item.Texture ?? (item.Icon is null ? null : LoadTexture(item.Icon));
            if (texture is not null) menu.SetItemIcon(index, texture);
            if (item.Disabled) menu.SetItemDisabled(index, true);
            if (item.Checked) menu.SetItemChecked(index, true);
            if (item.Tooltip.Length > 0) menu.SetItemTooltip(index, item.Tooltip);
            if (item.Indent != 0) menu.SetItemIndent(index, item.Indent);
        }
    }

    private void OnItemPressed(long nativeId)
    {
        if (!_stableIds.TryGetValue(nativeId, out var stableId)) return;
        try { ItemActivated?.Invoke(stableId); }
        finally { _emitItemActivated(new TrayMenuItemActivatedPayload(stableId)); }
    }

    private void OnPressed(long mouseButton, Vector2I position)
    {
        try { Pressed?.Invoke(mouseButton, position); }
        finally { _emitPressed(new TrayPressedPayload(mouseButton, position.X, position.Y)); }
    }

    private static Texture2D LoadTexture(string path)
    {
        if (!path.StartsWith("res://", StringComparison.Ordinal))
        {
            throw new ArgumentException("Tray texture paths must use res:// resources.");
        }

        return GD.Load<Texture2D>(path)
            ?? throw new ArgumentException($"Tray texture '{path}' could not be loaded.");
    }

    private void EnsureMainThread()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!GodotThread.IsMainThread())
        {
            throw new InvalidOperationException("System tray operations must run on Godot's main thread.");
        }
    }
}
