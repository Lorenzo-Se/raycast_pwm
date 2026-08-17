import { execFile } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 30000;

const SEARCH_PATHS = [`${homedir()}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode?: number,
    readonly stderr?: string,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export async function resolveBinary(name: string, customPath?: string): Promise<string | undefined> {
  if (customPath) {
    if (existsSync(customPath)) {
      return customPath;
    }
    return undefined;
  }

  for (const dir of SEARCH_PATHS) {
    const fullPath = `${dir}/${name}`;
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/which", [name], { timeout: 5000 });
    const path = stdout.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // which failed — binary not in PATH
  }

  return undefined;
}

export async function runCli(
  binary: string,
  args: string[],
  options?: { env?: Record<string, string>; timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      env: { ...process.env, ...options?.env },
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr?.trim()) {
      // Some CLIs write warnings to stderr; only treat as error if stdout is empty
      if (!stdout?.trim()) {
        throw new CliError(stderr.trim(), undefined, stderr);
      }
    }

    return stdout.trim();
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    const execError = error as { code?: number | string; stderr?: string; message?: string };
    const stderr = execError.stderr?.toString().trim();
    const message = stderr || execError.message || "CLI command failed";
    const exitCode = typeof execError.code === "number" ? execError.code : undefined;
    throw new CliError(message, exitCode, stderr);
  }
}

export function parseJson<T>(stdout: string): T {
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new CliError(`Failed to parse CLI JSON output: ${stdout.slice(0, 200)}`);
  }
}
