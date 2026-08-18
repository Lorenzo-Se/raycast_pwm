export interface VaultItem {
  id: string;
  title: string;
  subtitle?: string;
  username?: string;
  email?: string;
  url?: string;
  hasTotp?: boolean;
  managerId: string;
}

export interface ItemAvailability {
  hasUrl: boolean;
  url?: string;
  hasEmail: boolean;
  hasUsername: boolean;
  hasTotp: boolean;
  hasPassword: boolean;
}

export type AdapterStatus = { ok: true } | { ok: false; reason: string };

export interface PasswordManagerAdapter {
  readonly id: string;
  readonly name: string;
  readonly cliBinary: string;

  isAvailable(): Promise<AdapterStatus>;

  /** Full item list for local filtering. UI caches this per session when implemented. */
  listItems?(): Promise<VaultItem[]>;

  searchItems(query: string): Promise<VaultItem[]>;

  getPassword(item: VaultItem): Promise<string>;
  getUsername(item: VaultItem): Promise<string | undefined>;
  getEmail(item: VaultItem): Promise<string | undefined>;
  getTotp(item: VaultItem): Promise<string | undefined>;

  getUrl?(item: VaultItem): Promise<string | undefined>;
  openInManager?(item: VaultItem): Promise<void>;
  getItemAvailability?(item: VaultItem): Promise<ItemAvailability>;
}

export interface CliRunOptions {
  args?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CliPathOverrides {
  [adapterId: string]: string;
}
