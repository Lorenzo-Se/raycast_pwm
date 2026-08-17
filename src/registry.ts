import { getPreferenceValues } from "@raycast/api";

import { adapters } from "./adapters";
import type { AdapterStatus, CliPathOverrides, PasswordManagerAdapter } from "./types";
import { resolveBinary } from "./utils/cli";

export function getAdapters(): PasswordManagerAdapter[] {
  return adapters;
}

export function getAdapter(id: string): PasswordManagerAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

export function parseCliPathOverrides(raw: string | undefined): CliPathOverrides {
  if (!raw?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as CliPathOverrides;
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function getCliPathOverride(adapterId: string): string | undefined {
  const preferences = getPreferenceValues<{ cliPathOverrides?: string }>();
  const overrides = parseCliPathOverrides(preferences.cliPathOverrides);
  return overrides[adapterId];
}

export async function checkAdapterAvailability(adapter: PasswordManagerAdapter): Promise<AdapterStatus> {
  const customPath = getCliPathOverride(adapter.id);
  const binary = await resolveBinary(adapter.cliBinary, customPath);

  if (!binary && adapter.id !== "template") {
    const hint = customPath
      ? `Configured path not found: ${customPath}`
      : `CLI "${adapter.cliBinary}" not found. Set path in extension preferences.`;
    return { ok: false, reason: hint };
  }

  return adapter.isAvailable();
}

export async function getAvailableAdapters(): Promise<
  Array<{ adapter: PasswordManagerAdapter; status: AdapterStatus }>
> {
  const results = await Promise.all(
    adapters.map(async (adapter) => ({
      adapter,
      status: await checkAdapterAvailability(adapter),
    })),
  );

  return results;
}

export function resolveManagerId(
  preferredId: string | undefined,
  availableAdapters: PasswordManagerAdapter[],
  allAdapters: PasswordManagerAdapter[],
): string | undefined {
  const preferred = preferredId?.trim();

  if (!preferred || preferred === "auto") {
    return availableAdapters[0]?.id;
  }

  const normalizedPreferred = preferred.toLowerCase().replace(/[\s_-]+/g, "");

  const matchedAdapter =
    allAdapters.find((adapter) => adapter.id === preferred) ??
    allAdapters.find((adapter) => adapter.id.toLowerCase() === normalizedPreferred) ??
    allAdapters.find((adapter) => adapter.name.toLowerCase().replace(/[\s_-]+/g, "") === normalizedPreferred);

  if (matchedAdapter) {
    return matchedAdapter.id;
  }

  return availableAdapters[0]?.id;
}

export function getDefaultAdapterId(availableIds: string[], preferredId?: string): string | undefined {
  const preferences = getPreferenceValues<{ defaultManagerId?: string }>();
  const availableAdapters = adapters.filter((adapter) => availableIds.includes(adapter.id));
  return resolveManagerId(preferredId ?? preferences.defaultManagerId, availableAdapters, adapters);
}
