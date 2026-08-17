# Password Managers (Raycast Extension)

Raycast-Extension mit generalisiertem CLI-Adapter-System für Password Manager. Jeder Manager wird in einer eigenen Datei unter `src/adapters/` implementiert.

## Features

- Suchen und Auflisten von Vault-Einträgen
- Passwort, Username und TOTP kopieren
- Direkt einfügen in die aktive App (Paste)
- Multi-Manager-Umschalter in der Suche
- Template-Adapter mit Mock-Daten für Entwicklung ohne echte CLI

## Entwicklung

```bash
npm install
npm run dev
```

Öffne Raycast → **Developer** → den laufenden Dev-Mode-Extension nutzen → **Search Passwords**.

### Extension-Einstellungen

| Einstellung | Beschreibung |
|-------------|--------------|
| Default Manager ID | Adapter-ID für Standard-Manager (z. B. `template`) |
| CLI Path Overrides (JSON) | `{"1password": "/opt/homebrew/bin/op"}` |
| Close window after copying | Raycast nach Copy schließen |
| Show paste actions | Paste-Aktionen im Action Panel anzeigen |

## Neuen Password Manager hinzufügen

Siehe [src/adapters/README.md](src/adapters/README.md).

Kurzversion:

1. `src/adapters/<manager>.ts` mit `PasswordManagerAdapter` anlegen
2. In `src/adapters/index.ts` registrieren
3. Optional CLI-Pfad in Extension-Einstellungen setzen

## Projektstruktur

```
src/
├── search-passwords.tsx   # Haupt-Command (UI)
├── types.ts               # Adapter-Interface
├── registry.ts            # Adapter-Registry
├── adapters/
│   ├── index.ts           # Adapter-Liste
│   ├── template.ts        # Referenz + Mock-Daten
│   └── README.md
└── utils/
    └── cli.ts             # CLI-Hilfsfunktionen
```

## Lizenz

MIT
