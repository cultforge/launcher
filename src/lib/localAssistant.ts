import { invoke } from "@tauri-apps/api/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export type AssistantSecretSlot = "assistant.gemini" | "assistant.openai";

export type SecretStatus = {
  gemini: boolean;
  openai: boolean;
};

export type LocalChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function getSecretStatus(): Promise<SecretStatus> {
  if (!isTauri()) return { gemini: false, openai: false };
  return invoke<SecretStatus>("secret_status");
}

export async function setAssistantSecret(
  slot: AssistantSecretSlot,
  value: string,
): Promise<void> {
  if (!isTauri()) throw new Error("Keyring requires the CultForge desktop app");
  await invoke("secret_set", { slot, value });
}

export async function clearAssistantSecret(
  slot: AssistantSecretSlot,
): Promise<void> {
  if (!isTauri()) throw new Error("Keyring requires the CultForge desktop app");
  await invoke("secret_clear", { slot });
}

/** Chat via local provider. API key is read from OS keyring inside Rust — never returned here. */
export async function localAssistantChat(opts: {
  provider: "gemini" | "openai";
  model?: string;
  baseUrl?: string;
  messages: LocalChatMessage[];
}): Promise<string> {
  if (!isTauri()) {
    throw new Error("Local assistant requires the CultForge desktop app");
  }
  return invoke<string>("local_assistant_chat", {
    request: {
      provider: opts.provider,
      model: opts.model || null,
      baseUrl: opts.baseUrl || null,
      messages: opts.messages,
    },
  });
}
