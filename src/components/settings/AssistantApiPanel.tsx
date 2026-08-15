import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  clearAssistantSecret,
  getSecretStatus,
  setAssistantSecret,
  type AssistantSecretSlot,
  type SecretStatus,
} from "../../lib/localAssistant";
import { useSettingsStore } from "../../stores/settings";
import type { AssistantProvider } from "../../stores/settings";
import { CfSelect } from "../ui/CfSelect";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {children}
    </div>
  );
}

const PROVIDERS: { id: AssistantProvider; label: string; hint: string }[] = [
  {
    id: "cultforge",
    label: "CultForge Chloe",
    hint: "Uses CultForge servers (web-search quota applies).",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    hint: "Your Gemini API key stays in the Windows keyring.",
  },
  {
    id: "openai",
    label: "OpenAI-compatible",
    hint: "OpenAI or any compatible base URL. Key stays in the keyring.",
  },
];

function slotFor(provider: AssistantProvider): AssistantSecretSlot | null {
  if (provider === "gemini") return "assistant.gemini";
  if (provider === "openai") return "assistant.openai";
  return null;
}

export function AssistantApiPanel() {
  const draft = useSettingsStore((s) => s.draft);
  const setDraft = useSettingsStore((s) => s.setDraft);
  const [status, setStatus] = useState<SecretStatus>({
    gemini: false,
    openai: false,
  });
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getSecretStatus());
    } catch {
      setStatus({ gemini: false, openai: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const slot = slotFor(draft.assistantProvider);
  const hasKey =
    draft.assistantProvider === "gemini"
      ? status.gemini
      : draft.assistantProvider === "openai"
        ? status.openai
        : false;

  const onSaveKey = async () => {
    if (!slot) return;
    const value = apiKeyDraft.trim();
    if (!value) {
      toast.error("Paste an API key first");
      return;
    }
    setBusy(true);
    try {
      await setAssistantSecret(slot, value);
      setApiKeyDraft("");
      toast.success("API key saved to OS keyring", {
        description: "Never uploaded to CultForge.",
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save key");
    } finally {
      setBusy(false);
    }
  };

  const onClearKey = async () => {
    if (!slot) return;
    if (!window.confirm("Remove the saved API key from this device’s keyring?")) {
      return;
    }
    setBusy(true);
    try {
      await clearAssistantSecret(slot);
      toast.message("API key removed from keyring");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-3">
      <div>
        <div className="text-[13px] text-text-primary font-medium">
          Chloe / assistant backend
        </div>
        <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
          Optional: bring your own Gemini or OpenAI-compatible key. Keys are
          stored only in the OS keyring on this PC — never sent to CultForge
          servers.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Provider</FieldLabel>
        <CfSelect
          value={draft.assistantProvider}
          onChange={(value) =>
            setDraft({
              assistantProvider: value as AssistantProvider,
            })
          }
          options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
          aria-label="Assistant provider"
        />
        <p className="text-[10px] text-text-disabled">
          {PROVIDERS.find((p) => p.id === draft.assistantProvider)?.hint}
        </p>
      </div>

      {draft.assistantProvider !== "cultforge" && (
        <>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Model</FieldLabel>
            <input
              type="text"
              value={draft.assistantModel}
              onChange={(e) => setDraft({ assistantModel: e.target.value })}
              placeholder={
                draft.assistantProvider === "gemini"
                  ? "gemini-2.0-flash"
                  : "gpt-4o-mini"
              }
              className="w-full min-w-0 px-3 py-2.5 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
            />
          </div>

          {draft.assistantProvider === "openai" && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Base URL</FieldLabel>
              <input
                type="url"
                value={draft.assistantBaseUrl}
                onChange={(e) => setDraft({ assistantBaseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full min-w-0 px-3 py-2.5 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <FieldLabel>API key (keyring)</FieldLabel>
            <p className="text-[10px] text-text-disabled">
              Status: {hasKey ? "saved on this device" : "not set"}
            </p>
            <input
              type="password"
              autoComplete="off"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder={hasKey ? "••••••••  (paste to replace)" : "Paste API key"}
              className="w-full min-w-0 px-3 py-2.5 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !apiKeyDraft.trim()}
                onClick={() => void onSaveKey()}
                className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-primary-base/30 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save to keyring"}
              </button>
              <button
                type="button"
                disabled={busy || !hasKey}
                onClick={() => void onClearKey()}
                className="px-3.5 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-muted hover:text-text-primary cursor-pointer disabled:opacity-50"
              >
                Remove key
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
