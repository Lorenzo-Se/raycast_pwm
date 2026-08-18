#!/usr/bin/env node

const { execFile, spawn } = require("child_process");
const { existsSync } = require("fs");
const { homedir, platform } = require("os");
const readline = require("readline");
const { join } = require("path");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const ADAPTER_ID = "protonpass-external";
const CLI_BINARY = "pass-cli";
const ITEM_ID_SEPARATOR = "::";
const DEFAULT_TIMEOUT_MS = 30_000;
const SESSION_LOCKED_PATTERN = /session is locked/i;
const LOCK_CODE_READ_ERROR_PATTERN =
  /reading lock code|prompting for password|device not configured|operation not supported on socket/i;
const UNLOCK_PROMPT_DELAY_MS = 1_000;
const PIN_PATTERN = /^\d{6}$/;
const isWindows = platform() === "win32";

function getSearchPaths() {
  if (isWindows) {
    const paths = [];
    const localAppData = process.env.LOCALAPPDATA;
    const appData = process.env.APPDATA;

    if (localAppData) {
      paths.push(join(localAppData, "Programs", "pass-cli"));
      paths.push(join(localAppData, "Programs"));
    }

    if (appData) {
      paths.push(join(appData, "npm"));
    }

    return paths;
  }

  return [`${homedir()}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
}

function getCandidateNames(name) {
  if (isWindows && !name.toLowerCase().endsWith(".exe")) {
    return [name, `${name}.exe`];
  }

  return [name];
}

async function findInPath(name) {
  if (isWindows) {
    for (const candidate of getCandidateNames(name)) {
      try {
        const { stdout } = await execFileAsync("where.exe", [candidate], { timeout: 5000 });
        const match = stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && existsSync(line));

        if (match) {
          return match;
        }
      } catch {
        // binary not in PATH
      }
    }

    return undefined;
  }

  try {
    const { stdout } = await execFileAsync("/usr/bin/which", [name], { timeout: 5000 });
    const path = stdout.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch {
    // binary not in PATH
  }

  return undefined;
}

function sendSuccess(result, id) {
  const payload = { ok: true, result };
  if (id !== undefined) {
    payload.id = id;
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sendError(message, id) {
  const payload = { ok: false, error: { message } };
  if (id !== undefined) {
    payload.id = id;
  }
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function isValidPin(pin) {
  return PIN_PATTERN.test(String(pin ?? "").trim());
}

function isSessionLockedMessage(message) {
  return SESSION_LOCKED_PATTERN.test(String(message));
}

function isLockCodePromptError(message) {
  return LOCK_CODE_READ_ERROR_PATTERN.test(String(message));
}

function isWrongPinError(message) {
  if (isLockCodePromptError(message)) {
    return false;
  }

  return /SessionLocked/i.test(String(message)) || /unlock.*session/i.test(String(message));
}

async function runShellCommand(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`CLI timed out after ${DEFAULT_TIMEOUT_MS}ms`));
      }
    }, DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `CLI exited with code ${code ?? "unknown"}`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function runUnlockCommand(binary, pin) {
  if (platform() === "darwin" || platform() === "linux") {
    const delaySeconds = UNLOCK_PROMPT_DELAY_MS / 1_000;
    const command =
      platform() === "darwin"
        ? `(sleep ${delaySeconds}; printf '%s\\n' "$PASS_CLI_PIN") | script -q /dev/null "$PASS_CLI_BIN" session unlock`
        : `(sleep ${delaySeconds}; printf '%s\\n' "$PASS_CLI_PIN") | script -q -c "$PASS_CLI_BIN session unlock" /dev/null`;

    await runShellCommand(command, {
      PASS_CLI_BIN: binary,
      PASS_CLI_PIN: pin,
    });
    return;
  }

  throw new Error(
    "PIN-Entsperrung ist auf dieser Plattform nicht automatisiert. Führe im Terminal aus: pass-cli session unlock",
  );
}

async function resolveBinary() {
  const customPath = process.env.PASS_CLI_PATH?.trim();
  if (customPath) {
    return existsSync(customPath) ? customPath : undefined;
  }

  for (const dir of getSearchPaths()) {
    for (const candidate of getCandidateNames(CLI_BINARY)) {
      const fullPath = join(dir, candidate);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return findInPath(CLI_BINARY);
}

async function runCli(binary, args) {
  try {
    const { stdout, stderr } = await execFileAsync(binary, args, {
      env: process.env,
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });

    if (stderr?.trim() && !stdout?.trim()) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    throw new Error(stderr || error.message || "CLI command failed");
  }
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse CLI JSON output: ${stdout.slice(0, 200)}`);
  }
}

async function getBinary() {
  return resolveBinary();
}

async function runPassCli(args) {
  const binary = await getBinary();
  if (!binary) {
    throw new Error("pass-cli not found");
  }
  return runCli(binary, args);
}

function encodeItemId(shareId, itemId) {
  return `${shareId}${ITEM_ID_SEPARATOR}${itemId}`;
}

function parseItemId(id) {
  const separatorIndex = id.indexOf(ITEM_ID_SEPARATOR);
  if (separatorIndex === -1) {
    throw new Error(`Invalid item ID: ${id}`);
  }

  const shareId = id.slice(0, separatorIndex);
  const itemId = id.slice(separatorIndex + ITEM_ID_SEPARATOR.length);

  if (!shareId || !itemId) {
    throw new Error(`Invalid item ID: ${id}`);
  }

  return { shareId, itemId };
}

function toSecretUri(shareId, itemId, field) {
  return `pass://${shareId}/${itemId}/${field}`;
}

async function viewField(shareId, itemId, field) {
  const value = await runPassCli(["item", "view", toSecretUri(shareId, itemId, field)]);
  return value || undefined;
}

async function viewFieldSafe(shareId, itemId, field) {
  try {
    return await viewField(shareId, itemId, field);
  } catch {
    return undefined;
  }
}

async function listVaults() {
  const stdout = await runPassCli(["vault", "list", "--output", "json"]);
  const data = parseJson(stdout);
  return data.vaults ?? [];
}

async function listItemsInVault(shareId) {
  const baseArgs = ["item", "list", "--share-id", shareId, "--filter-type", "login", "--output", "json"];

  try {
    const stdout = await runPassCli([...baseArgs, "--show-secrets"]);
    const data = parseJson(stdout);
    return data.items ?? [];
  } catch {
    try {
      const stdout = await runPassCli(baseArgs);
      const data = parseJson(stdout);
      return data.items ?? [];
    } catch {
      return [];
    }
  }
}

function isLoginItem(item) {
  if (item.item_type?.toLowerCase() === "login") {
    return true;
  }

  return Boolean(item.content?.content?.Login);
}

function isActiveItem(item) {
  if (!item.state) {
    return true;
  }

  return item.state.toLowerCase() === "active";
}

function extractTotpHint(login) {
  if (!login || !("totp" in login)) {
    return undefined;
  }

  const totp = login.totp;
  if (totp === null || totp === undefined || totp === "") {
    return false;
  }

  return true;
}

function extractLoginFields(item) {
  const login = item.content?.content?.Login;
  if (!login) {
    return {};
  }

  const url = login.urls?.find((entry) => entry.trim())?.trim() || login.url?.trim() || undefined;
  const hasTotp = extractTotpHint(login);

  return {
    username: login.username?.trim() || undefined,
    email: login.email?.trim() || undefined,
    url,
    hasTotp,
  };
}

function resolveItemTitle(item) {
  return item.content?.title?.trim() || item.title?.trim() || "Untitled";
}

async function loadAllItems() {
  const vaults = await listVaults();
  const vaultNames = new Map(vaults.map((vault) => [vault.share_id, vault.name]));

  const itemLists = await Promise.all(vaults.map((vault) => listItemsInVault(vault.share_id)));

  const results = [];

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    const items = itemLists[i];

    for (const item of items) {
      if (!isLoginItem(item) || !isActiveItem(item)) {
        continue;
      }

      const shareId = item.share_id ?? vault.share_id;
      const vaultName = vaultNames.get(shareId) ?? vault.name;
      const title = resolveItemTitle(item);
      const login = extractLoginFields(item);

      results.push({
        id: encodeItemId(shareId, item.id),
        title,
        subtitle: vaultName,
        username: login.username,
        email: login.email,
        url: login.url,
        ...(login.hasTotp !== undefined ? { hasTotp: login.hasTotp } : {}),
        managerId: ADAPTER_ID,
      });
    }
  }

  return results.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

function matchesQuery(item, query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [item.title, item.subtitle, item.username, item.email]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(normalized));
}

function filterVaultItems(items, query) {
  const filtered = items.filter((item) => matchesQuery(item, query));
  return filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

async function getPassCliInfo(binary) {
  const stdout = await runCli(binary, ["info", "--output", "json"]);
  return parseJson(stdout);
}

async function isPassCliSessionLocked(binary) {
  try {
    await runCli(binary, ["vault", "list", "--output", "json"]);
    return false;
  } catch (error) {
    return isSessionLockedMessage(error instanceof Error ? error.message : String(error));
  }
}

async function unlockPassCliSession(binary, pin) {
  const normalizedPin = String(pin ?? "").trim();
  if (!isValidPin(normalizedPin)) {
    throw new Error("PIN muss 6 Ziffern haben.");
  }

  await runUnlockCommand(binary, normalizedPin);

  if (await isPassCliSessionLocked(binary)) {
    throw new Error("PIN falsch.");
  }
}

async function checkAvailability() {
  const binary = await getBinary();
  if (!binary) {
    return {
      ok: false,
      reason: "pass-cli not found. Install from https://protonpass.github.io/pass-cli/",
    };
  }

  try {
    await getPassCliInfo(binary);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Not logged in. Run pass-cli login to authenticate.",
    };
  }

  if (await isPassCliSessionLocked(binary)) {
    return {
      ok: false,
      reason: "Session gesperrt. Bitte 6-stellige PIN eingeben.",
      needsAuth: true,
    };
  }

  return { ok: true };
}

function getAuthRequirements() {
  return {
    requirements: {
      fields: [{ id: "pin", label: "PIN", type: "pin" }],
    },
  };
}

async function authenticate(params) {
  const binary = await getBinary();
  if (!binary) {
    return { status: { ok: false, reason: "pass-cli not found. Install from https://protonpass.github.io/pass-cli/" } };
  }

  const pin = params?.credentials?.pin ?? "";
  if (!isValidPin(pin)) {
    return { status: { ok: false, reason: "PIN muss 6 Ziffern haben.", needsAuth: true } };
  }

  try {
    await unlockPassCliSession(binary, pin);
    return { status: { ok: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "PIN falsch." || isWrongPinError(message)) {
      return { status: { ok: false, reason: "PIN falsch.", needsAuth: true } };
    }

    if (isLockCodePromptError(message)) {
      return {
        status: {
          ok: false,
          reason: "PIN-Eingabe nicht möglich. Entsperre die Session im Terminal mit: pass-cli session unlock",
          needsAuth: true,
        },
      };
    }

    return { status: { ok: false, reason: message, needsAuth: true } };
  }
}

async function getItemAvailability(item) {
  const { shareId, itemId } = parseItemId(item.id);
  const [url, email, username, totp, password] = await Promise.all([
    item.url ? item.url : viewFieldSafe(shareId, itemId, "url"),
    item.email ? item.email : viewFieldSafe(shareId, itemId, "email"),
    item.username ? item.username : viewFieldSafe(shareId, itemId, "username"),
    viewFieldSafe(shareId, itemId, "totp"),
    viewFieldSafe(shareId, itemId, "password"),
  ]);

  return {
    hasUrl: Boolean(url),
    url,
    hasEmail: Boolean(email),
    hasUsername: Boolean(username),
    hasTotp: Boolean(totp),
    hasPassword: Boolean(password),
  };
}

async function handleRequest(request) {
  if (request.protocolVersion !== 1) {
    throw new Error(`Unsupported protocol version: ${request.protocolVersion}`);
  }

  switch (request.method) {
    case "isAvailable":
      return { status: await checkAvailability() };

    case "getAuthRequirements":
      return getAuthRequirements();

    case "authenticate":
      return await authenticate(request.params);

    case "listItems":
      return { items: await loadAllItems() };

    case "searchItems":
      return { items: filterVaultItems(await loadAllItems(), request.params?.query) };

    case "getPassword": {
      const item = request.params?.item;
      const { shareId, itemId } = parseItemId(item.id);
      const password = await viewField(shareId, itemId, "password");
      if (!password) {
        throw new Error(`Password not available for: ${item.title}`);
      }
      return { value: password };
    }

    case "getUsername": {
      const item = request.params?.item;
      if (item.username) {
        return { value: item.username };
      }
      const { shareId, itemId } = parseItemId(item.id);
      return { value: await viewField(shareId, itemId, "username") };
    }

    case "getEmail": {
      const item = request.params?.item;
      if (item.email) {
        return { value: item.email };
      }
      const { shareId, itemId } = parseItemId(item.id);
      return { value: await viewField(shareId, itemId, "email") };
    }

    case "getTotp": {
      const item = request.params?.item;
      const { shareId, itemId } = parseItemId(item.id);
      return { value: await viewFieldSafe(shareId, itemId, "totp") };
    }

    case "getUrl": {
      const item = request.params?.item;
      if (item.url) {
        return { value: item.url };
      }
      const { shareId, itemId } = parseItemId(item.id);
      return { value: await viewFieldSafe(shareId, itemId, "url") };
    }

    case "getItemAvailability":
      return await getItemAvailability(request.params?.item);

    case "openInManager":
      return {};

    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

async function handleLine(line) {
  if (!String(line).trim()) {
    return;
  }

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    sendError("Invalid JSON request");
    return;
  }

  try {
    const result = await handleRequest(request);
    sendSuccess(result, request.id);
  } catch (error) {
    sendError(error instanceof Error ? error.message : String(error), request.id);
  }
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  let queue = Promise.resolve();

  rl.on("line", (line) => {
    queue = queue.then(() => handleLine(line)).catch(() => undefined);
  });

  rl.on("close", () => {
    queue.finally(() => process.exit(process.exitCode ?? 0));
  });
}

main();
