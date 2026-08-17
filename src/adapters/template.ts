import { showToast, Toast } from "@raycast/api";

import type { AdapterStatus, ItemAvailability, PasswordManagerAdapter, VaultItem } from "../types";

/**
 * Template / reference adapter with mock data for development and testing.
 *
 * When implementing a real adapter, replace mock logic with CLI calls via runCli().
 *
 * Example CLIs:
 *
 * | Manager    | Binary   | List                                      | Password                              | Username              | TOTP                  | Auth                    |
 * |------------|----------|-------------------------------------------|---------------------------------------|-----------------------|-----------------------|-------------------------|
 * | 1Password  | op       | op item list --format json                | op read op://vault/item/password      | --field username      | op item get --otp     | op signin / app session |
 * | Bitwarden  | bw       | bw list items --search <query>            | bw get password <id>                  | bw get username <id>  | bw get totp <id>      | BW_SESSION env          |
 * | pass       | pass     | pass find <query>                         | pass show -c <path>                   | first line of show    | —                     | GPG key                 |
 * | Proton Pass| pass-cli | pass-cli item list --share-id <id> --output json | pass-cli item view pass://.../password | .../username or email | .../totp              | pass-cli login / info   |
 */

interface MockEntry {
  id: string;
  title: string;
  subtitle: string;
  username: string;
  email?: string;
  password: string;
  totp?: string;
  url?: string;
}

const MOCK_ENTRIES: MockEntry[] = [
  {
    id: "mock-github",
    title: "GitHub",
    subtitle: "Personal",
    username: "devuser",
    email: "dev@example.com",
    password: "mock-github-password",
    totp: "123456",
    url: "https://github.com",
  },
  {
    id: "mock-netflix",
    title: "Netflix",
    subtitle: "Family",
    username: "family",
    email: "family@example.com",
    password: "mock-netflix-password",
    url: "https://netflix.com",
  },
  {
    id: "mock-aws",
    title: "AWS Console",
    subtitle: "Work",
    username: "admin",
    email: "admin@company.com",
    password: "mock-aws-password",
    totp: "654321",
    url: "https://console.aws.amazon.com",
  },
];

function toVaultItem(entry: MockEntry): VaultItem {
  return {
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    username: entry.username,
    email: entry.email,
    url: entry.url,
    hasTotp: Boolean(entry.totp),
    managerId: templateAdapter.id,
  };
}

function findEntry(item: VaultItem): MockEntry | undefined {
  return MOCK_ENTRIES.find((e) => e.id === item.id);
}

export const templateAdapter: PasswordManagerAdapter = {
  id: "template",
  name: "Template (Mock)",
  cliBinary: "template-cli",

  async isAvailable(): Promise<AdapterStatus> {
    // Real adapter: check CLI exists and session is valid, e.g.:
    // const binary = await resolveBinary(this.cliBinary, customPath);
    // if (!binary) return { ok: false, reason: "CLI not found. Install ..." };
    // await runCli(binary, ["--version"]);
    return { ok: true };
  },

  async searchItems(query: string): Promise<VaultItem[]> {
    // Real adapter example (1Password):
    // const stdout = await runCli(binary, ["item", "list", "--format", "json"]);
    // const items = parseJson<OpItem[]>(stdout);
    // return items.filter(...).map(...)

    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? MOCK_ENTRIES.filter(
          (e) =>
            e.title.toLowerCase().includes(normalized) ||
            e.subtitle.toLowerCase().includes(normalized) ||
            e.username.toLowerCase().includes(normalized) ||
            e.email?.toLowerCase().includes(normalized),
        )
      : MOCK_ENTRIES;

    return filtered.map(toVaultItem);
  },

  async getPassword(item: VaultItem): Promise<string> {
    // Real adapter: runCli(binary, ["get", "password", item.id])
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }
    return entry.password;
  },

  async getUsername(item: VaultItem): Promise<string | undefined> {
    // Real adapter: runCli(binary, ["get", "username", item.id])
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }
    return entry.username;
  },

  async getEmail(item: VaultItem): Promise<string | undefined> {
    // Real adapter: runCli(binary, ["get", "email", item.id])
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }
    return entry.email;
  },

  async getTotp(item: VaultItem): Promise<string | undefined> {
    // Real adapter: runCli(binary, ["get", "totp", item.id])
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }
    return entry.totp;
  },

  async getUrl(item: VaultItem): Promise<string | undefined> {
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }
    return entry.url;
  },

  async getItemAvailability(item: VaultItem): Promise<ItemAvailability> {
    const entry = findEntry(item);
    if (!entry) {
      throw new Error(`Item not found: ${item.id}`);
    }

    return {
      hasUrl: Boolean(entry.url),
      url: entry.url,
      hasEmail: Boolean(entry.email),
      hasUsername: Boolean(entry.username),
      hasTotp: Boolean(entry.totp),
      hasPassword: Boolean(entry.password),
    };
  },

  async openInManager(item: VaultItem): Promise<void> {
    void item;
    await showToast({
      style: Toast.Style.Failure,
      title: "Not supported for template adapter",
    });
  },
};
