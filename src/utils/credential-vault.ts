import { execFileSync } from "child_process";
import { existsSync, chmodSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { getPreferenceValues } from "@raycast/api";

export type ExtensionSessionState = "disabled" | "empty" | "active" | "locked";

const DEFAULT_SESSION_TIMEOUT_MINUTES = 15;
const MIN_SESSION_TIMEOUT_MINUTES = 1;
const MAX_SESSION_TIMEOUT_MINUTES = 1440;
const GLOBAL_VAULT_KEY = "__raycastPwmExtensionSession";

type SessionPreferences = {
  enableExtensionSession?: boolean;
  persistCredentialsInKeychain?: boolean;
  sessionTimeoutMinutes?: string;
};

type SessionListener = () => void;

interface VaultRuntime {
  credentialsByAdapter: Map<string, Record<string, string>>;
  listeners: Set<SessionListener>;
  locked: boolean;
  lastActivityAt: number;
  expiryTimer: ReturnType<typeof setTimeout> | undefined;
  hydrated: boolean;
}

interface PersistedVault {
  scopePid: number;
  locked: boolean;
  lastActivityAt: number;
  credentials: Record<string, Record<string, string>>;
}

function processName(pid: number): string {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return "";
  }

  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function parentPid(pid: number): number | undefined {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    return undefined;
  }

  try {
    const parsed = Number.parseInt(
      execFileSync("ps", ["-p", String(pid), "-o", "ppid="], { encoding: "utf8" }).trim(),
      10,
    );
    return Number.isFinite(parsed) && parsed > 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getRaycastProcessId(): number {
  let pid = process.ppid;
  for (let index = 0; index < 10 && pid > 1; index++) {
    const name = processName(pid);
    if (/(^|\/)Raycast$/i.test(name) || /Raycast\.exe$/i.test(name)) {
      return pid;
    }

    const next = parentPid(pid);
    if (!next || next === pid) {
      break;
    }
    pid = next;
  }

  return process.ppid;
}

function snapshotPath(scopePid: number): string {
  return join(tmpdir(), `raycast-pwm-session-${scopePid}.json`);
}

function runtime(): VaultRuntime {
  const globalState = globalThis as typeof globalThis & { [GLOBAL_VAULT_KEY]?: VaultRuntime };
  if (!globalState[GLOBAL_VAULT_KEY]) {
    globalState[GLOBAL_VAULT_KEY] = {
      credentialsByAdapter: new Map(),
      listeners: new Set(),
      locked: false,
      lastActivityAt: 0,
      expiryTimer: undefined,
      hydrated: false,
    };
  }

  const state = globalState[GLOBAL_VAULT_KEY];
  if (!state.hydrated) {
    state.hydrated = true;
    restoreSnapshot(state);
  }

  return state;
}

function restoreSnapshot(state: VaultRuntime): void {
  const scopePid = getRaycastProcessId();
  const path = snapshotPath(scopePid);

  if (!isProcessAlive(scopePid) || !existsSync(path)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PersistedVault;
    if (parsed.scopePid !== scopePid || typeof parsed.lastActivityAt !== "number") {
      unlinkSync(path);
      return;
    }

    state.locked = parsed.locked === true;
    state.lastActivityAt = parsed.lastActivityAt;
    state.credentialsByAdapter = new Map(
      Object.entries(parsed.credentials ?? {}).filter(([, value]) => value && typeof value === "object"),
    );
  } catch {
    try {
      unlinkSync(path);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

function persistSnapshot(): void {
  const state = runtime();
  const scopePid = getRaycastProcessId();
  const path = snapshotPath(scopePid);

  if (state.credentialsByAdapter.size === 0) {
    try {
      if (existsSync(path)) {
        unlinkSync(path);
      }
    } catch {
      // Ignore cleanup failures.
    }
    return;
  }

  const payload: PersistedVault = {
    scopePid,
    locked: state.locked,
    lastActivityAt: state.lastActivityAt,
    credentials: Object.fromEntries(state.credentialsByAdapter),
  };

  try {
    writeFileSync(path, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
    chmodSync(path, 0o600);
  } catch {
    // Persistence is best-effort; RAM still works within this process.
  }
}

export function parseSessionTimeoutMinutes(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? String(DEFAULT_SESSION_TIMEOUT_MINUTES), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SESSION_TIMEOUT_MINUTES;
  }

  return Math.min(MAX_SESSION_TIMEOUT_MINUTES, Math.max(MIN_SESSION_TIMEOUT_MINUTES, parsed));
}

function preferences(): SessionPreferences {
  return getPreferenceValues<SessionPreferences>();
}

export function isExtensionSessionEnabled(): boolean {
  return preferences().enableExtensionSession !== false;
}

export function isKeychainPersistEnabled(): boolean {
  return preferences().persistCredentialsInKeychain === true;
}

export function getExtensionSessionTimeoutMs(): number {
  return parseSessionTimeoutMinutes(preferences().sessionTimeoutMinutes) * 60_000;
}

function cloneCredentials(credentials: Record<string, string>): Record<string, string> {
  return { ...credentials };
}

function notifySessionListeners(): void {
  for (const listener of runtime().listeners) {
    listener();
  }
}

function clearExpiryTimer(): void {
  const state = runtime();
  if (state.expiryTimer !== undefined) {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = undefined;
  }
}

function scheduleExpiryTimer(): void {
  clearExpiryTimer();

  const state = runtime();
  if (
    !isExtensionSessionEnabled() ||
    state.locked ||
    state.credentialsByAdapter.size === 0 ||
    state.lastActivityAt === 0
  ) {
    return;
  }

  const remainingMs = getExtensionSessionTimeoutMs() - (Date.now() - state.lastActivityAt);
  state.expiryTimer = setTimeout(
    () => {
      runtime().expiryTimer = undefined;
      lockExtensionSessionIfExpired();
    },
    Math.max(0, remainingMs),
  );
}

export function subscribeToExtensionSession(listener: SessionListener): () => void {
  const state = runtime();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function rememberCredentials(adapterId: string, credentials: Record<string, string>): void {
  if (!isExtensionSessionEnabled()) {
    return;
  }

  const state = runtime();
  state.credentialsByAdapter.set(adapterId, cloneCredentials(credentials));
  state.locked = false;
  state.lastActivityAt = Date.now();
  persistSnapshot();
  scheduleExpiryTimer();
  notifySessionListeners();
}

export function hasRememberedCredentials(adapterId: string): boolean {
  return runtime().credentialsByAdapter.has(adapterId);
}

export function peekCredentials(adapterId: string): Record<string, string> | undefined {
  if (getExtensionSessionState() !== "active") {
    return undefined;
  }

  const stored = runtime().credentialsByAdapter.get(adapterId);
  return stored ? cloneCredentials(stored) : undefined;
}

export function lockExtensionSession(): void {
  const state = runtime();
  if (!isExtensionSessionEnabled() || state.credentialsByAdapter.size === 0 || state.locked) {
    return;
  }

  state.locked = true;
  clearExpiryTimer();
  persistSnapshot();
  notifySessionListeners();
}

export function unlockExtensionSessionAfterPresence(): void {
  const state = runtime();
  if (state.credentialsByAdapter.size === 0) {
    return;
  }

  state.locked = false;
  state.lastActivityAt = Date.now();
  persistSnapshot();
  scheduleExpiryTimer();
  notifySessionListeners();
}

export function clearRememberedCredentials(adapterId?: string): void {
  const state = runtime();
  if (adapterId) {
    state.credentialsByAdapter.delete(adapterId);
  } else {
    state.credentialsByAdapter.clear();
  }

  if (state.credentialsByAdapter.size === 0) {
    state.locked = false;
    state.lastActivityAt = 0;
    clearExpiryTimer();
  }

  persistSnapshot();
  notifySessionListeners();
}

export function markSessionActivity(): void {
  if (lockExtensionSessionIfExpired()) {
    return;
  }

  const state = runtime();
  if (!isExtensionSessionEnabled() || state.locked || state.credentialsByAdapter.size === 0) {
    return;
  }

  state.lastActivityAt = Date.now();
  persistSnapshot();
  scheduleExpiryTimer();
}

export function isExtensionSessionExpired(): boolean {
  const state = runtime();
  if (
    !isExtensionSessionEnabled() ||
    state.locked ||
    state.credentialsByAdapter.size === 0 ||
    state.lastActivityAt === 0
  ) {
    return false;
  }

  return Date.now() - state.lastActivityAt >= getExtensionSessionTimeoutMs();
}

export function lockExtensionSessionIfExpired(): boolean {
  if (!isExtensionSessionExpired()) {
    return false;
  }

  lockExtensionSession();
  return true;
}

export function getExtensionSessionState(): ExtensionSessionState {
  if (!isExtensionSessionEnabled()) {
    return "disabled";
  }

  const state = runtime();
  if (state.credentialsByAdapter.size === 0) {
    return "empty";
  }

  if (state.locked || isExtensionSessionExpired()) {
    return "locked";
  }

  return "active";
}
