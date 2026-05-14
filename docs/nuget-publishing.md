# NuGet Publishing

`GdKirie.EventaAdapter` is the .NET package for Eventa over Kirie text IPC. It
is separate from addon zip publishing and browser-side npm publishing.

The package targets `net10.0` only because the upstream Eventa .NET package
targets `net10.0`. Projects targeting `net8.0` or `net9.0` should expect
restore or build failures when referencing the adapter. .NET 8 LTS reaches end
of support on 2026-11-10, so Kirie does not add a compatibility layer that
copies Eventa protocol logic around the upstream target framework.

## Local Validation

Restore, build, test, and pack the .NET workspace:

```sh
mise x -- dotnet restore GdKirie.slnx
mise x -- dotnet build GdKirie.slnx --configuration Release
mise x -- dotnet test --solution GdKirie.slnx --configuration Release --no-build
mise x -- dotnet pack packages/GdKirie.EventaAdapter/GdKirie.EventaAdapter.csproj --configuration Release --no-build
```

The package includes a NuGet `contentFiles` source bridge that connects the
addon-shipped `KirieClient.cs` to the adapter without placing Eventa source in
`addons/kirie`.

The repository `global.json` opts `dotnet test` into
Microsoft.Testing.Platform, which is required for this xUnit v3 test project on
.NET 10 SDKs.
