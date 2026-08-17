import type { PasswordManagerAdapter } from "../types";
import { protonPassAdapter } from "./protonpass";
import { templateAdapter } from "./template";
// import { onePasswordAdapter } from "./1password";

export const adapters: PasswordManagerAdapter[] = [
  templateAdapter,
  protonPassAdapter,
  // onePasswordAdapter,
];
