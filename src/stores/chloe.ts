import { create } from "zustand";
import { toast } from "sonner";
import {
  CHLOE_BOT_FALLBACK,
  fetchChloeBotProfile,
  fetchChloeQuota,
  fetchChloeSystemPrompt,
  sendChloeChat,
  type ChloeBotProfile,
  type ChloeQuota,
} from "../lib/chloeApi";
import {
  executeChloeAction,
  toastChloeActionResult,
} from "../lib/chloeActionExec";
import {
  actionFromRealtimeFrame,
  confirmChloeAction,
  denyChloeAction,
  listChloePendingActions,
  reportChloeActionResult,
  type ChloePendingAction,
} from "../lib/chloeActionsApi";
import { localAssistantChat } from "../lib/localAssistant";
import { logger } from "../lib/logger";
import { useSettingsStore } from "./settings";

const executedActionIds = new Set<string>();

export type ChloeMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  createdAt: string;
  failed?: boolean;
};

type ChloeStore = {
  open: boolean;
  draft: string;
  webSearch: boolean;
  busy: boolean;
  messages: ChloeMessage[];
  quota: ChloeQuota | null;
  error: string | null;
  systemPrompt: string | null;
  bot: ChloeBotProfile;
  pendingActions: ChloePendingAction[];
  actionBusyId: string | null;
  setOpen: (open: boolean) => void;
  setDraft: (draft: string) => void;
  setWebSearch: (web: boolean) => void;
  refreshQuota: () => Promise<void>;
  ensureSystemPrompt: () => Promise<string>;
  refreshBot: () => Promise<void>;
  refreshPendingActions: () => Promise<void>;
  confirmPendingAction: (actionId: string) => Promise<void>;
  denyPendingAction: (actionId: string) => Promise<void>;
  handleRealtimeAction: (frame: unknown) => Promise<void>;
  send: () => Promise<void>;
};

const FALLBACK_SYSTEM =
  "You are Chloe, the CultForge launcher assistant. Be concise, practical, and helpful with Minecraft builds, mods, crashes, and CultForge.";

function buildLocalHistory(
  messages: ChloeMessage[],
  systemPrompt: string,
): {
  role: "system" | "user" | "assistant";
  content: string;
}[] {
  const out: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  for (const message of messages) {
    if (message.failed) continue;
    if (message.role === "system") continue;
    out.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.body,
    });
  }
  return out;
}

export const useChloeStore = create<ChloeStore>((set, get) => ({
  open: false,
  draft: "",
  webSearch: false,
  busy: false,
  messages: [
    {
      id: "welcome",
      role: "system",
      body: "Chloe can help with CultForge, builds, and Minecraft troubleshooting. In Settings you can use CultForge Chloe or your own Gemini / OpenAI key (keyring only). Sensitive launcher actions will ask you to Confirm or Deny here.",
      createdAt: new Date().toISOString(),
    },
  ],
  quota: null,
  error: null,
  systemPrompt: null,
  bot: { ...CHLOE_BOT_FALLBACK },
  pendingActions: [],
  actionBusyId: null,
  setOpen: (open) => {
    set({ open, error: null });
    if (open) {
      void get().refreshQuota();
      void get().ensureSystemPrompt();
      void get().refreshBot();
      void get().refreshPendingActions();
    }
  },
  setDraft: (draft) => set({ draft }),
  setWebSearch: (webSearch) => set({ webSearch }),
  refreshBot: async () => {
    try {
      const bot = await fetchChloeBotProfile();
      set({ bot });
    } catch (err) {
      logger.debug(
        `Chloe bot profile: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
  refreshQuota: async () => {
    const provider = useSettingsStore.getState().settings.assistantProvider;
    if (provider !== "cultforge") {
      set({ quota: null });
      return;
    }
    try {
      const quota = await fetchChloeQuota();
      set({ quota, error: null });
    } catch (err) {
      logger.debug(
        `Chloe quota: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
  ensureSystemPrompt: async () => {
    const existing = get().systemPrompt;
    if (existing?.trim()) return existing;
    try {
      const remote = await fetchChloeSystemPrompt();
      set({ systemPrompt: remote.prompt });
      return remote.prompt;
    } catch (err) {
      logger.debug(
        `Chloe system prompt: ${err instanceof Error ? err.message : String(err)}`,
      );
      set({ systemPrompt: FALLBACK_SYSTEM });
      return FALLBACK_SYSTEM;
    }
  },
  refreshPendingActions: async () => {
    try {
      const pendingActions = await listChloePendingActions();
      set({ pendingActions });
    } catch (err) {
      logger.debug(
        `Chloe pending actions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },
  handleRealtimeAction: async (frame) => {
    const obj =
      frame && typeof frame === "object"
        ? (frame as Record<string, unknown>)
        : null;
    const type = String(obj?.type ?? "");
    const action = actionFromRealtimeFrame(frame);
    if (!action) {
      if (type === "chloe.action.pending") void get().refreshPendingActions();
      return;
    }

    if (type === "chloe.action.pending") {
      const existing = get().pendingActions.some((row) => row.id === action.id);
      set({
        pendingActions: [
          action,
          ...get().pendingActions.filter((row) => row.id !== action.id),
        ],
      });
      if (!existing && !get().open) {
        toast.message("Chloe needs confirmation", {
          description: action.title,
        });
      }
      return;
    }

    if (type === "chloe.action.local") {
      try {
        const exec = await executeChloeAction(action);
        toastChloeActionResult(action, exec);
        if (exec.closeDrawer) set({ open: false });
      } catch (err) {
        logger.debug(
          `Chloe local action: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return;
    }

    if (type === "chloe.action.execute") {
      const sidecarOwned = new Set([
        "set_launcher_pref",
        "read_launcher_activity",
        "list_local_builds",
        "list_local_mods",
      ]);
      if (sidecarOwned.has(action.type)) {
        set({
          pendingActions: get().pendingActions.filter((row) => row.id !== action.id),
        });
        return;
      }
      if (executedActionIds.has(action.id) || get().actionBusyId === action.id) {
        return;
      }
      executedActionIds.add(action.id);
      set({ actionBusyId: action.id });
      try {
        const exec = await executeChloeAction(action);
        try {
          await reportChloeActionResult(action.id, exec);
        } catch (err) {
          logger.debug(
            `Chloe WS execute result: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        toastChloeActionResult(action, exec);
        set({
          pendingActions: get().pendingActions.filter((row) => row.id !== action.id),
          ...(exec.closeDrawer ? { open: false } : {}),
        });
      } catch (err) {
        logger.debug(
          `Chloe WS execute: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        set({ actionBusyId: null });
      }
    }
  },
  confirmPendingAction: async (actionId) => {
    const action = get().pendingActions.find((row) => row.id === actionId);
    if (!action || get().actionBusyId) return;

    set({ actionBusyId: actionId, error: null });
    try {
      const confirmed = await confirmChloeAction(actionId);
      const merged: ChloePendingAction = {
        ...action,
        type: confirmed.tool || action.type,
        payload: { ...action.payload, ...confirmed.args },
        title: action.title,
      };

      const shouldExecuteLocal =
        confirmed.executeLocal === true ||
        (confirmed.executeLocal == null &&
          [
            "open_launcher",
            "open_settings",
            "open_discord",
            "open_store",
            "open_builds",
            "open_guilds",
            "open_mods",
            "open_downloads",
            "open_friends",
            "set_launcher_pref",
            "read_launcher_activity",
            "list_local_builds",
            "list_local_mods",
            "launch",
            "launch_build",
            "backup",
            "create_backup",
            "open_folder",
            "deep_link",
            "nav",
          ].includes(merged.type));

      if (!shouldExecuteLocal) {
        executedActionIds.add(actionId);
        set({
          messages: [
            ...get().messages,
            {
              id: `act-${Date.now()}`,
              role: "system",
              body:
                confirmed.reply ||
                `Confirmed **${action.title}** (handled by CultForge).`,
              createdAt: new Date().toISOString(),
            },
          ],
          pendingActions: get().pendingActions.filter((row) => row.id !== actionId),
        });
        return;
      }

      executedActionIds.add(actionId);
      let exec;
      try {
        exec = await executeChloeAction(merged);
      } catch (err) {
        exec = {
          ok: false,
          message: err instanceof Error ? err.message : "Local action failed",
        };
      }

      try {
        await reportChloeActionResult(actionId, exec);
      } catch (err) {
        logger.debug(
          `Chloe action result report: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      toastChloeActionResult(merged, exec);
      set({
        messages: [
          ...get().messages,
          {
            id: `act-${Date.now()}`,
            role: "system",
            body: exec.ok
              ? `Confirmed **${action.title}**: ${exec.message}`
              : `Confirmed **${action.title}**, but local run failed: ${exec.message}`,
            createdAt: new Date().toISOString(),
            failed: !exec.ok,
          },
        ],
        pendingActions: get().pendingActions.filter((row) => row.id !== actionId),
        ...(exec.closeDrawer ? { open: false } : {}),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not confirm action";
      set({ error: message });
    } finally {
      set({ actionBusyId: null });
      void get().refreshPendingActions();
    }
  },
  denyPendingAction: async (actionId) => {
    const action = get().pendingActions.find((row) => row.id === actionId);
    if (!action || get().actionBusyId) return;

    set({ actionBusyId: actionId, error: null });
    try {
      await denyChloeAction(actionId);
      set({
        messages: [
          ...get().messages,
          {
            id: `deny-${Date.now()}`,
            role: "system",
            body: `Denied **${action.title}**.`,
            createdAt: new Date().toISOString(),
          },
        ],
        pendingActions: get().pendingActions.filter((row) => row.id !== actionId),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not deny action";
      set({ error: message });
    } finally {
      set({ actionBusyId: null });
      void get().refreshPendingActions();
    }
  },
  send: async () => {
    const { draft, webSearch, busy, messages } = get();
    const text = draft.trim();
    if (!text || busy) return;

    const userMsg: ChloeMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      body: text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMsg];
    set({
      busy: true,
      draft: "",
      error: null,
      messages: nextMessages,
    });

    try {
      const settings = useSettingsStore.getState().settings;
      const provider = settings.assistantProvider;
      let replyText = "";

      if (provider === "gemini" || provider === "openai") {
        const systemPrompt = await get().ensureSystemPrompt();
        replyText = await localAssistantChat({
          provider,
          model: settings.assistantModel.trim() || undefined,
          baseUrl:
            provider === "openai"
              ? settings.assistantBaseUrl.trim() || undefined
              : undefined,
          messages: buildLocalHistory(nextMessages, systemPrompt),
        });
      } else {
        const reply = await sendChloeChat({ message: text, web: webSearch });
        replyText = reply.reply;
        void get().refreshQuota();
        if (reply.needsConfirm || reply.actionId) {
          void get().refreshPendingActions();
        }
      }

      set({
        messages: [
          ...get().messages,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            body: replyText,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      void get().refreshPendingActions();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Chloe request failed";
      set({
        error: message,
        messages: [
          ...get().messages,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            body: message,
            createdAt: new Date().toISOString(),
            failed: true,
          },
        ],
      });
    } finally {
      set({ busy: false });
    }
  },
}));
