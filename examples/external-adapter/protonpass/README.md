# Proton Pass External Adapter

External reference adapter for [Proton Pass CLI](https://protonpass.github.io/pass-cli/). Implements the same logic as the built-in `protonpass` adapter in `src/adapters/protonpass.ts`, but runs as a separate process via the external adapter protocol.

The built-in **Proton Pass** adapter remains registered in the extension. This external adapter uses id `protonpass-external` so both can coexist.

## Setup

1. Copy this folder to your external adapters directory:

```bash
mkdir -p ~/.config/raycast-pwm/adapters
cp -R examples/external-adapter/protonpass ~/.config/raycast-pwm/adapters/protonpass
```

2. In Raycast extension preferences, set **External Adapters Directory** to:

```text
~/.config/raycast-pwm/adapters
```

3. Install and authenticate Proton Pass CLI:

```bash
pass-cli login
pass-cli session create-lock   # optional: 6-digit lock code for idle protection
```

4. Open **Search Passwords** and select **Proton Pass (External)** from the manager dropdown.

When the CLI session is locked, Raycast shows a **PIN** field (6 digits). Unlock uses `pass-cli session unlock`.

## CLI path override

If `pass-cli` is not in a standard PATH location, set `PASS_CLI_PATH` in `pwm-adapter.json`:

```json
{
  "env": {
    "PASS_CLI_PATH": "/opt/homebrew/bin/pass-cli"
  }
}
```

On Windows:

```json
{
  "env": {
    "PASS_CLI_PATH": "%LOCALAPPDATA%\\Programs\\pass-cli\\pass-cli.exe"
  }
}
```

## Default manager

To use this adapter as default, set **Default Manager Override** in extension preferences to:

```text
protonpass-external
```

## Protocol

See [src/adapters/README.md](../../../src/adapters/README.md) for the external adapter protocol and session lifecycle.
