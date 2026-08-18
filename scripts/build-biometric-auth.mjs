import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "swift", "BiometricAuth", "main.swift");
const outputDir = join(root, "assets");
const output = join(outputDir, "BiometricAuth");

if (process.platform !== "darwin") {
  console.log("Skipping BiometricAuth helper (macOS only).");
  process.exit(0);
}

const compiler = spawnSync("xcrun", ["--find", "swiftc"], { encoding: "utf8" });
if (compiler.status !== 0 || !compiler.stdout.trim()) {
  console.warn("swiftc not found; Touch ID helper will be unavailable.");
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

const result = spawnSync(
  "xcrun",
  ["swiftc", "-parse-as-library", "-O", "-o", output, source],
  { encoding: "utf8" },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "Failed to compile BiometricAuth helper");
  process.exit(result.status ?? 1);
}

chmodSync(output, 0o755);
console.log(`Compiled ${output}`);
