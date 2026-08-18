# Password Managers (Raycast Extension)

Raycast-Extension mit generalisiertem CLI-Adapter-System für Password Manager. Built-in-Adapter liegen unter `src/adapters/`, Third-Party-Adapter können per Stdio-Protokoll extern hinzugefügt werden.

## Features

- Suchen und Auflisten von Vault-Einträgen
- Passwort, Username und TOTP kopieren
- Direkt einfügen in die aktive App (Paste)
- Multi-Manager-Umschalter in der Suche
- Template-Adapter mit Mock-Daten für Entwicklung ohne echte CLI
- Externe Third-Party-Adapter über konfigurierbaren Ordner

## Entwicklung

```bash
npm install
npm run dev
```

Öffne Raycast → **Developer** → den laufenden Dev-Mode-Extension nutzen → **Search Passwords**.

### Extension-Einstellungen

| Einstellung | Beschreibung |
|-------------|--------------|
| Default Manager | Built-in-Adapter im Dropdown (oder Auto) |
| Default Manager Override | Adapter-ID für externe Adapter als Default |
| External Adapters Directory | Ordner mit Third-Party-Adaptern, z. B. `~/.config/raycast-pwm/adapters` |
| CLI Path Overrides (JSON) | macOS: `{"1password": "/opt/homebrew/bin/op"}` · Windows: `{"protonpass": "%LOCALAPPDATA%\\Programs\\pass-cli\\pass-cli.exe"}` |
| Close window after copying | Raycast nach Copy schließen |
| Auto-copy TOTP after password action | TOTP nach 5 Sekunden automatisch kopieren |

## Built-in Password Manager hinzufügen

Siehe [src/adapters/README.md](src/adapters/README.md).

Kurzversion:

1. `src/adapters/<manager>.ts` mit `PasswordManagerAdapter` anlegen
2. In `src/adapters/index.ts` registrieren
3. Optional CLI-Pfad in Extension-Einstellungen setzen

## Externe Adapter hinzufügen

1. Referenz kopieren:

```bash
mkdir -p ~/.config/raycast-pwm/adapters
cp -R examples/external-adapter/template ~/.config/raycast-pwm/adapters/template
```

2. In Raycast **External Adapters Directory** setzen: `~/.config/raycast-pwm/adapters`

3. Pro Adapter einen Unterordner mit `pwm-adapter.json` + Script

Vollständige Protokoll-Doku: [examples/external-adapter/template/README.md](examples/external-adapter/template/README.md)

Referenz-Adapter mit echter CLI-Integration: [examples/external-adapter/protonpass](examples/external-adapter/protonpass/README.md) (Proton Pass, parallel zum Built-in-Adapter).

## Projektstruktur

```
src/
├── search-passwords.tsx   # Haupt-Command (UI)
├── types.ts               # Adapter-Interface
├── registry.ts            # Adapter-Registry
├── registry/
│   └── load-external-adapters.ts
├── adapters/
│   ├── index.ts           # Built-in Adapter-Liste
│   ├── external-protocol.ts
│   ├── external-script-adapter.ts
│   ├── template.ts
│   └── README.md
└── utils/
    ├── cli.ts
    └── paths.ts

examples/external-adapter/template/  # Referenz-Third-Party-Adapter (Mock)
examples/external-adapter/protonpass/ # Proton Pass CLI (extern, parallel zum Built-in)
```

## Lizenz

MIT
