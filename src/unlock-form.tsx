import { Action, ActionPanel, Form, Icon, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";

import { adapterNeedsAuth } from "./registry";
import type { AdapterStatus, AuthRequirements, PasswordManagerAdapter } from "./types";

const FALLBACK_REQUIREMENTS: AuthRequirements = {
  fields: [{ id: "password", label: "Passwort", type: "password" }],
};

export function UnlockForm({
  adapter,
  adapterStatuses,
  activeManagerId,
  preferredManagerId,
  onManagerChange,
  onUnlocked,
  onActivity,
}: {
  adapter: PasswordManagerAdapter;
  adapterStatuses: Array<{ adapter: PasswordManagerAdapter; status: AdapterStatus }>;
  activeManagerId: string;
  preferredManagerId?: string;
  onManagerChange: (managerId: string) => void;
  onUnlocked: () => void;
  onActivity: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: requirements, isLoading: isLoadingRequirements } = usePromise(
    async (adapterId: string) => {
      const selected = adapterStatuses.find((entry) => entry.adapter.id === adapterId)?.adapter;
      if (!selected?.getAuthRequirements) {
        return FALLBACK_REQUIREMENTS;
      }

      try {
        const loaded = await selected.getAuthRequirements();
        return loaded.fields.length > 0 ? loaded : FALLBACK_REQUIREMENTS;
      } catch {
        return FALLBACK_REQUIREMENTS;
      }
    },
    [adapter.id],
  );

  const fields = requirements?.fields ?? FALLBACK_REQUIREMENTS.fields;
  const availableAdapters = adapterStatuses.filter((entry) => entry.status.ok).map((entry) => entry.adapter);
  const lockedAdapters = adapterStatuses.filter((entry) => adapterNeedsAuth(entry.status));
  const unavailableAdapters = adapterStatuses.filter((entry) => !entry.status.ok && !adapterNeedsAuth(entry.status));

  async function handleSubmit(values: Record<string, string>): Promise<void> {
    if (!adapter.authenticate) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unlock failed",
        message: "Adapter does not support authentication",
      });
      return;
    }

    onActivity();
    setIsSubmitting(true);

    const credentials: Record<string, string> = {};
    for (const field of fields) {
      credentials[field.id] = values[field.id] ?? "";
    }

    try {
      const status = await adapter.authenticate(credentials);
      if (status.ok) {
        onUnlocked();
        return;
      }

      await showToast({
        style: Toast.Style.Failure,
        title: "Unlock failed",
        message: status.reason,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unlock failed",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      navigationTitle={adapter.name}
      isLoading={isLoadingRequirements || isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Unlock" icon={Icon.LockUnlocked} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {preferredManagerId ? (
        <Form.Dropdown id="manager" title="Password Manager" value={activeManagerId} onChange={onManagerChange}>
          {availableAdapters.length > 0 && (
            <Form.Dropdown.Section title="Available">
              {availableAdapters.map((entry) => (
                <Form.Dropdown.Item key={entry.id} title={entry.name} value={entry.id} />
              ))}
            </Form.Dropdown.Section>
          )}
          {lockedAdapters.length > 0 && (
            <Form.Dropdown.Section title="Locked">
              {lockedAdapters.map((entry) => (
                <Form.Dropdown.Item key={entry.adapter.id} title={entry.adapter.name} value={entry.adapter.id} />
              ))}
            </Form.Dropdown.Section>
          )}
          {unavailableAdapters.length > 0 && (
            <Form.Dropdown.Section title="Unavailable">
              {unavailableAdapters.map((entry) => (
                <Form.Dropdown.Item key={entry.adapter.id} title={entry.adapter.name} value={entry.adapter.id} />
              ))}
            </Form.Dropdown.Section>
          )}
        </Form.Dropdown>
      ) : null}
      {fields.map((field) =>
        field.type === "text" ? (
          <Form.TextField key={field.id} id={field.id} title={field.label} />
        ) : (
          <Form.PasswordField key={field.id} id={field.id} title={field.label} />
        ),
      )}
    </Form>
  );
}
