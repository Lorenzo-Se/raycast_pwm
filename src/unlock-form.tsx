import { Action, ActionPanel, Form, Icon, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";

import { isBiometricUnlockInProgress, setBiometricUnlockInProgress } from "./adapters/external-session";
import { adapterNeedsAuth } from "./registry";
import type { AdapterStatus, AuthRequirements, PasswordManagerAdapter } from "./types";
import {
  clearStoredCredentials,
  hasStoredCredentials,
  isTouchIdAvailable,
  storeCredentialsForTouchId,
  unlockWithTouchId,
} from "./utils/biometric-auth";

const FALLBACK_REQUIREMENTS: AuthRequirements = {
  fields: [{ id: "password", label: "Passwort", type: "password" }],
};

type TouchIdPreferences = {
  enableTouchIdReauth?: boolean;
  touchIdOnlyForReauth?: boolean;
};

export function UnlockForm({
  adapter,
  adapterStatuses,
  activeManagerId,
  preferredManagerId,
  isReauth,
  onManagerChange,
  onUnlocked,
  onActivity,
}: {
  adapter: PasswordManagerAdapter;
  adapterStatuses: Array<{ adapter: PasswordManagerAdapter; status: AdapterStatus }>;
  activeManagerId: string;
  preferredManagerId?: string;
  isReauth: boolean;
  onManagerChange: (managerId: string) => void;
  onUnlocked: () => void;
  onActivity: () => void;
}) {
  const preferences = getPreferenceValues<TouchIdPreferences>();
  const enableTouchIdReauth = preferences.enableTouchIdReauth === true;
  const touchIdOnlyForReauth = preferences.touchIdOnlyForReauth !== false;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoPromptedRef = useRef(false);

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

  const {
    data: touchIdState,
    isLoading: isLoadingTouchId,
    revalidate: revalidateTouchId,
  } = usePromise(
    async (adapterId: string, enabled: boolean, reauth: boolean, onlyForReauth: boolean) => {
      if (!enabled) {
        return { available: false, stored: false, eligible: false };
      }

      const available = await isTouchIdAvailable();
      const stored = available ? await hasStoredCredentials(adapterId) : false;
      return {
        available,
        stored,
        eligible: available && stored && (!onlyForReauth || reauth),
      };
    },
    [adapter.id, enableTouchIdReauth, isReauth, touchIdOnlyForReauth],
  );

  const fields = requirements?.fields ?? FALLBACK_REQUIREMENTS.fields;
  const availableAdapters = adapterStatuses.filter((entry) => entry.status.ok).map((entry) => entry.adapter);
  const lockedAdapters = adapterStatuses.filter((entry) => adapterNeedsAuth(entry.status));
  const unavailableAdapters = adapterStatuses.filter((entry) => !entry.status.ok && !adapterNeedsAuth(entry.status));
  const touchIdEligible = touchIdState?.eligible === true;
  const unlockWithStoredCredentialsRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    autoPromptedRef.current = false;
  }, [adapter.id]);

  useEffect(() => {
    if (!touchIdEligible || isSubmitting || autoPromptedRef.current || isBiometricUnlockInProgress()) {
      return;
    }

    autoPromptedRef.current = true;
    void unlockWithStoredCredentialsRef.current();
  }, [touchIdEligible, adapter.id, isSubmitting]);

  async function persistCredentialsAfterUnlock(credentials: Record<string, string>): Promise<void> {
    if (!enableTouchIdReauth) {
      try {
        await clearStoredCredentials(adapter.id);
      } catch {
        // Clearing is best-effort; a failed delete must not look like a failed unlock.
      }
      return;
    }

    try {
      await storeCredentialsForTouchId(adapter.id, credentials);
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Touch ID save failed",
        message: error instanceof Error ? error.message : "Session is unlocked. Retry Touch ID setup later.",
      });
    }
  }

  async function unlockWithStoredCredentials(): Promise<void> {
    if (!adapter.authenticate || isSubmitting) {
      return;
    }

    onActivity();
    setIsSubmitting(true);
    setBiometricUnlockInProgress(true);

    try {
      const credentials = await unlockWithTouchId(adapter.id);
      if (!credentials) {
        return;
      }

      const status = await adapter.authenticate(credentials);
      if (status.ok) {
        onUnlocked();
        return;
      }

      await clearStoredCredentials(adapter.id);
      await revalidateTouchId();
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
      setBiometricUnlockInProgress(false);
      setIsSubmitting(false);
    }
  }

  unlockWithStoredCredentialsRef.current = unlockWithStoredCredentials;

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
        await persistCredentialsAfterUnlock(credentials);
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

  async function handleForgetTouchId(): Promise<void> {
    try {
      await clearStoredCredentials(adapter.id);
      await revalidateTouchId();
      await showToast({ style: Toast.Style.Success, title: "Touch ID credentials removed" });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to remove Touch ID credentials",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return (
    <Form
      navigationTitle={adapter.name}
      isLoading={isLoadingRequirements || isLoadingTouchId || isSubmitting}
      actions={
        <ActionPanel>
          {touchIdEligible ? (
            <Action title="Unlock with Touch ID" icon={Icon.Fingerprint} onAction={unlockWithStoredCredentials} />
          ) : null}
          <Action.SubmitForm
            title={touchIdEligible ? "Enter Password/PIN" : "Unlock"}
            icon={Icon.LockUnlocked}
            onSubmit={handleSubmit}
          />
          {enableTouchIdReauth && touchIdState?.stored ? (
            <Action title="Forget Touch ID Credentials" icon={Icon.Trash} onAction={handleForgetTouchId} />
          ) : null}
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
      {touchIdEligible ? (
        <Form.Description text="Unlock with Touch ID from the action panel, or enter your password/PIN. The biometric prompt may dismiss Raycast; reopen Search Passwords after success." />
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
