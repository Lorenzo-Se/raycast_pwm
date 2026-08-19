import { environment } from "@raycast/api";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const SERVICE_PREFIX = "raycast-pwm:";
const ACCOUNT = "credentials";
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRIEVE_TIMEOUT_MS = 90_000;

function isDarwin(): boolean {
  return process.platform === "darwin";
}

function serviceName(adapterId: string): string {
  return `${SERVICE_PREFIX}${adapterId}`;
}

function helperPath(): string | undefined {
  if (!isDarwin()) {
    return undefined;
  }

  const candidates = [
    join(environment.assetsPath, "BiometricAuth"),
    join(__dirname, "..", "..", "assets", "BiometricAuth"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCanceledError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return message.includes("canceled") || message.includes("cancelled");
}

function parseCredentials(secret: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(secret);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const credentials: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        credentials[key] = value;
      }
    }

    return Object.keys(credentials).length > 0 ? credentials : null;
  } catch {
    return null;
  }
}

interface HelperResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}

function invokeHelper(payload: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const binary = helperPath();
  if (!binary) {
    return Promise.reject(new Error("BiometricAuth helper is not available"));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("BiometricAuth helper timed out"));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      try {
        const response = JSON.parse(stdout.trim()) as HelperResponse;
        if (!response.ok) {
          reject(new Error(response.error || "BiometricAuth helper failed"));
          return;
        }
        resolve(response.result);
      } catch {
        reject(new Error(stderr.trim() || "BiometricAuth helper returned invalid output"));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

export async function isTouchIdAvailable(): Promise<boolean> {
  if (!helperPath()) {
    return false;
  }

  try {
    return (await invokeHelper({ op: "isAvailable" })) === true;
  } catch {
    return false;
  }
}

export async function hasStoredCredentials(adapterId: string): Promise<boolean> {
  if (!helperPath()) {
    return false;
  }

  try {
    return (await invokeHelper({ op: "has", service: serviceName(adapterId), account: ACCOUNT })) === true;
  } catch {
    return false;
  }
}

export async function confirmPresence(): Promise<boolean> {
  if (!helperPath()) {
    return false;
  }

  try {
    return (await invokeHelper({ op: "authenticate" }, RETRIEVE_TIMEOUT_MS)) === true;
  } catch (error) {
    if (isCanceledError(error)) {
      return false;
    }

    return false;
  }
}

export async function unlockWithTouchId(adapterId: string): Promise<Record<string, string> | null> {
  if (!helperPath()) {
    return null;
  }

  try {
    const secret = await invokeHelper(
      { op: "retrieve", service: serviceName(adapterId), account: ACCOUNT },
      RETRIEVE_TIMEOUT_MS,
    );
    return typeof secret === "string" ? parseCredentials(secret) : null;
  } catch (error) {
    if (isCanceledError(error)) {
      return null;
    }

    return null;
  }
}

export async function storeCredentialsForTouchId(
  adapterId: string,
  credentials: Record<string, string>,
): Promise<void> {
  if (!helperPath()) {
    return;
  }

  await invokeHelper({
    op: "store",
    service: serviceName(adapterId),
    account: ACCOUNT,
    secret: JSON.stringify(credentials),
  });
}

export async function clearStoredCredentials(adapterId: string): Promise<void> {
  if (!helperPath()) {
    return;
  }

  await invokeHelper({ op: "delete", service: serviceName(adapterId), account: ACCOUNT });
}
