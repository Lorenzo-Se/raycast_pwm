# External Adapter Template

Reference third-party adapter for the Password Managers Raycast extension.

## Setup

1. Copy this folder to your external adapters directory:

```bash
mkdir -p ~/.config/raycast-pwm/adapters
cp -R examples/external-adapter/template ~/.config/raycast-pwm/adapters/template
```

2. In Raycast extension preferences, set **External Adapters Directory** to:

```text
~/.config/raycast-pwm/adapters
```

3. Open **Search Passwords** and select **Template External (Mock)** from the manager dropdown.

## Manifest (`pwm-adapter.json`)

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique adapter ID |
| `name` | yes | Display name in the UI |
| `command` | yes | Executable path relative to this folder or absolute |
| `capabilities` | no | Optional methods beyond the required protocol methods |
| `env` | no | Extra environment variables for the adapter process |

Optional capabilities:

- `listItems`
- `getUrl`
- `getItemAvailability`
- `openInManager`

Required protocol methods (always invoked by the host):

- `isAvailable`
- `searchItems`
- `getPassword`
- `getUsername`
- `getEmail`
- `getTotp`

## Protocol v1

Each invocation starts a new adapter process. The host writes one JSON line to stdin and expects one JSON line on stdout.

### Request

```json
{
  "protocolVersion": 1,
  "method": "searchItems",
  "params": { "query": "github" }
}
```

### Success response

```json
{
  "ok": true,
  "result": {
    "items": [
      {
        "id": "mock-github",
        "title": "GitHub",
        "subtitle": "Personal",
        "username": "devuser",
        "email": "dev@example.com",
        "url": "https://github.com",
        "hasTotp": true,
        "managerId": "template-external"
      }
    ]
  }
}
```

### Error response

```json
{
  "ok": false,
  "error": { "message": "Not logged in" }
}
```

### Method reference

| method | params | result |
|--------|--------|--------|
| `isAvailable` | `{}` | `{ "status": { "ok": true } }` or `{ "status": { "ok": false, "reason": "..." } }` |
| `listItems` | `{}` | `{ "items": VaultItem[] }` |
| `searchItems` | `{ "query": string }` | `{ "items": VaultItem[] }` |
| `getPassword` | `{ "item": VaultItem }` | `{ "value": string }` |
| `getUsername` / `getEmail` / `getTotp` / `getUrl` | `{ "item": VaultItem }` | `{ "value"?: string }` |
| `getItemAvailability` | `{ "item": VaultItem }` | `ItemAvailability` object as `result` |
| `openInManager` | `{ "item": VaultItem }` | `{}` |

### VaultItem fields

- `id` (string, required)
- `title` (string, required)
- `subtitle` (string, optional)
- `username` (string, optional)
- `email` (string, optional)
- `url` (string, optional)
- `hasTotp` (boolean, optional)
- `managerId` (string, optional — host normalizes this to the manifest `id`)

## Security

- The extension only executes commands referenced in user-configured adapter folders.
- Adapter code runs in a separate process with user permissions, not as extension code.
- Install only adapters from sources you trust.

## Language support

Any language works as long as the script:

1. Reads one JSON request from stdin
2. Writes one JSON response to stdout
3. Is executable directly or is a `.js`/`.mjs` file runnable via Node
