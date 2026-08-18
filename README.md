# Password Managers (Raycast Extension)

Raycast-Extension mit generalisiertem CLI-Adapter-System für Password Manager. Built-in-Adapter liegen unter `src/adapters/`, Third-Party-Adapter können per Stdio-Protokoll extern hinzugefügt werden.

## Features

- Suchen und Auflisten von Vault-Einträgen
- Passwort, Username und TOTP kopieren
- Direkt einfügen in die aktive App (Paste)
- Multi-Manager-Umschalter in der Suche
- PIN-Entsperrung für Proton Pass (6-stellige Session-PIN)
- Externe Third-Party-Adapter über konfigurierbaren Ordner

## Entwicklung

```bash
npm install
npm run dev
```

Öffne Raycast → **Developer** → den laufenden Dev-Mode-Extension nutzen → **Search Passwords**.

### Extension-Einstellungen

| Einstellung                          | Beschreibung                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Default Manager                      | Built-in-Adapter im Dropdown (oder Auto)                                                                                       |
| Default Manager Override             | Adapter-ID für externe Adapter als Default                                                                                     |
| External Adapters Directory          | Ordner mit Third-Party-Adaptern, z. B. `~/.config/raycast-pwm/adapters`                                                        |
| CLI Path Overrides (JSON)            | macOS: `{"1password": "/opt/homebrew/bin/op"}` · Windows: `{"protonpass": "%LOCALAPPDATA%\\Programs\\pass-cli\\pass-cli.exe"}` |
| Close window after copying           | Raycast nach Copy schließen                                                                                                    |
| Auto-copy TOTP after password action | TOTP nach 5 Sekunden automatisch kopieren                                                                                      |

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
cp -R examples/external-adapter/protonpass ~/.config/raycast-pwm/adapters/protonpass
```

2. In Raycast **External Adapters Directory** setzen: `~/.config/raycast-pwm/adapters`

3. Pro Adapter einen Unterordner mit `pwm-adapter.json` + Script

Protokoll und Auth: [src/adapters/README.md](src/adapters/README.md)

Referenz-Adapter: [examples/external-adapter/protonpass](examples/external-adapter/protonpass/README.md), [examples/external-adapter/threepass](examples/external-adapter/threepass/README.md)

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
│   ├── protonpass.ts
│   └── README.md
└── utils/
    ├── cli.ts
    └── paths.ts

examples/external-adapter/protonpass/  # Proton Pass CLI (extern)
examples/external-adapter/threepass/   # ThreePass (extern, persistent + Master-PW)
```

## Lizenz

MIT
