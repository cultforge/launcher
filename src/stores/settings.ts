import { create } from "zustand";
import { getPreference, setPreference } from "../lib/persistentStore";

export type AssistantProvider = "cultforge" | "gemini" | "openai";

export type LauncherSettings = {
  lobbyMusicOnLaunch: boolean;
  reduceMotion: boolean;
  notifyUpdates: boolean;
  notifyFriends: boolean;
  personalDiscordSource: string;
  downloadsPath: string;
  javaDefault: string;
  closeOnLaunch: boolean;
  /** Non-secret: which assistant backend Chloe uses. */
  assistantProvider: AssistantProvider;
  /** Non-secret model id for Gemini / OpenAI-compatible. */
  assistantModel: string;
  /** Non-secret OpenAI-compatible base URL. */
  assistantBaseUrl: string;
};

export const DEFAULT_SETTINGS: LauncherSettings = {
  lobbyMusicOnLaunch: true,
  reduceMotion: false,
  notifyUpdates: true,
  notifyFriends: true,
  personalDiscordSource: "",
  downloadsPath: "C:/Games/CultForge/downloads",
  javaDefault: "21",
  closeOnLaunch: false,
  assistantProvider: "cultforge",
  assistantModel: "",
  assistantBaseUrl: "https://api.openai.com/v1",
};

const SETTINGS_KEY = "launcher.settings";

function asAssistantProvider(value: unknown): AssistantProvider {
  if (value === "gemini" || value === "openai" || value === "cultforge") {
    return value;
  }
  return DEFAULT_SETTINGS.assistantProvider;
}

function mergeSettings(raw: unknown): LauncherSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    lobbyMusicOnLaunch:
      typeof obj.lobbyMusicOnLaunch === "boolean"
        ? obj.lobbyMusicOnLaunch
        : DEFAULT_SETTINGS.lobbyMusicOnLaunch,
    reduceMotion:
      typeof obj.reduceMotion === "boolean"
        ? obj.reduceMotion
        : DEFAULT_SETTINGS.reduceMotion,
    notifyUpdates:
      typeof obj.notifyUpdates === "boolean"
        ? obj.notifyUpdates
        : DEFAULT_SETTINGS.notifyUpdates,
    notifyFriends:
      typeof obj.notifyFriends === "boolean"
        ? obj.notifyFriends
        : DEFAULT_SETTINGS.notifyFriends,
    personalDiscordSource:
      typeof obj.personalDiscordSource === "string"
        ? obj.personalDiscordSource
        : DEFAULT_SETTINGS.personalDiscordSource,
    downloadsPath:
      typeof obj.downloadsPath === "string" && obj.downloadsPath.trim()
        ? obj.downloadsPath
        : DEFAULT_SETTINGS.downloadsPath,
    javaDefault:
      typeof obj.javaDefault === "string" && obj.javaDefault.trim()
        ? obj.javaDefault
        : DEFAULT_SETTINGS.javaDefault,
    closeOnLaunch:
      typeof obj.closeOnLaunch === "boolean"
        ? obj.closeOnLaunch
        : DEFAULT_SETTINGS.closeOnLaunch,
    assistantProvider: asAssistantProvider(obj.assistantProvider),
    assistantModel:
      typeof obj.assistantModel === "string"
        ? obj.assistantModel
        : DEFAULT_SETTINGS.assistantModel,
    assistantBaseUrl:
      typeof obj.assistantBaseUrl === "string" && obj.assistantBaseUrl.trim()
        ? obj.assistantBaseUrl
        : DEFAULT_SETTINGS.assistantBaseUrl,
  };
}

type SettingsStore = {
  hydrated: boolean;
  settings: LauncherSettings;
  draft: LauncherSettings;
  hydrate: () => Promise<void>;
  setDraft: (patch: Partial<LauncherSettings>) => void;
  save: () => void;
  reset: () => void;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  hydrated: false,
  settings: { ...DEFAULT_SETTINGS },
  draft: { ...DEFAULT_SETTINGS },
  hydrate: async () => {
    const saved = await getPreference<unknown>(SETTINGS_KEY);
    const merged = mergeSettings(saved);
    set({ settings: merged, draft: { ...merged }, hydrated: true });
  },
  setDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
  save: () => {
    const next = { ...get().draft };
    set({ settings: next });
    void setPreference(SETTINGS_KEY, next);
  },
  reset: () => {
    const next = { ...DEFAULT_SETTINGS };
    set({ draft: next, settings: next });
    void setPreference(SETTINGS_KEY, next);
  },
}));
