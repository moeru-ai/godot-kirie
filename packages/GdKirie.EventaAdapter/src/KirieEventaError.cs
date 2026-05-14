namespace GdKirie.EventaAdapter;

/// <summary>
/// Describes an adapter-level transport or serialization failure.
/// </summary>
public sealed record KirieEventaError(
    string Message,
    Exception? Exception = null,
    string? RawMessage = null);
