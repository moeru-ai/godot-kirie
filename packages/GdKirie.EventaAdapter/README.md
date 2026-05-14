# GdKirie.EventaAdapter

Eventa adapter for Kirie C# projects over Kirie text IPC.

This package targets `net10.0` only because the upstream `Eventa` package
targets `net10.0`. Projects targeting `net8.0` or `net9.0` should expect restore
or build failures when referencing this package.

## Usage

Create a `KirieEventaJsonRegistry`, explicitly register each event or unary
invoke payload with `System.Text.Json` source-generated metadata, then create a
context with a Kirie text transport.

The package includes a NuGet `contentFiles` source bridge for addon-shipped
`KirieClient.cs`, exposing `KirieClient.CreateEventaContext(...)`.

Eventa messages are serialized as JSON text over Kirie's text IPC lane. Kirie
core remains a low-level WebView and IPC bridge and does not learn Eventa
semantics.
