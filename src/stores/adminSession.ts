import { create } from "zustand";
import {
  adminStepUp,
  fetchAdminCatalog,
  fetchAdminWhoami,
  type AdminCatalogEntry,
  type AdminStepUpHints,
} from "../lib/adminApi";
import {
  groupCatalogEntries,
} from "../lib/adminCatalog";
import { ClientHttpError } from "../lib/client";
import { logger } from "../lib/logger";

type AdminSessionStore = {
  isPlatformAdmin: boolean | null;
  capabilityActive: boolean;
  capabilityExpiresAt: number | null;
  stepUpHints: AdminStepUpHints | null;
  catalog: AdminCatalogEntry[] | null;
  groupedCatalog: Record<string, AdminCatalogEntry[]> | null;
  loadingWhoami: boolean;
  loadingCatalog: boolean;
  stepUpError: string | null;
  refreshWhoami: () => Promise<void>;
  stepUp: () => Promise<boolean>;
  loadCatalog: () => Promise<void>;
  clearAdminSession: () => void;
  handleCapabilityUnauthorized: () => void;
};

function stepUpFailureMessage(err: unknown): string {
  if (err instanceof ClientHttpError) {
    const lower = err.message.toLowerCase();
    if (
      lower.includes("session") ||
      lower.includes("10 minute") ||
      lower.includes("recent") ||
      lower.includes("oauth") ||
      lower.includes("re-login") ||
      lower.includes("log in")
    ) {
      return `${err.message} Sign out, sign in via OAuth again, then open Admin right away.`;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Admin step-up failed. Sign out, sign in via OAuth again, then retry.";
}

export const useAdminSessionStore = create<AdminSessionStore>((set, get) => ({
  isPlatformAdmin: null,
  capabilityActive: false,
  capabilityExpiresAt: null,
  stepUpHints: null,
  catalog: null,
  groupedCatalog: null,
  loadingWhoami: false,
  loadingCatalog: false,
  stepUpError: null,

  refreshWhoami: async () => {
    set({ loadingWhoami: true });
    try {
      const { whoami, local, hints } = await fetchAdminWhoami();
      set({
        isPlatformAdmin: Boolean(whoami.admin),
        capabilityActive: local.capability_active,
        capabilityExpiresAt: local.capability_expires_at,
        stepUpHints: hints,
        loadingWhoami: false,
        stepUpError: null,
      });
    } catch (err) {
      logger.debug(
        `Admin whoami skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      set({
        isPlatformAdmin: false,
        capabilityActive: false,
        capabilityExpiresAt: null,
        stepUpHints: null,
        loadingWhoami: false,
      });
    }
  },

  stepUp: async () => {
    const hints = get().stepUpHints;
    if (hints && !hints.sessionFreshEnough) {
      const message =
        "Session is too old for admin step-up. Sign out, sign in via OAuth, then try again.";
      set({ stepUpError: message });
      return false;
    }
    set({ stepUpError: null });
    try {
      const local = await adminStepUp();
      set({
        capabilityActive: local.capability_active,
        capabilityExpiresAt: local.capability_expires_at,
        stepUpError: null,
      });
      if (local.capability_active) {
        await get().loadCatalog();
      }
      return local.capability_active;
    } catch (err) {
      const message = stepUpFailureMessage(err);
      set({
        capabilityActive: false,
        capabilityExpiresAt: null,
        stepUpError: message,
      });
      return false;
    }
  },

  loadCatalog: async () => {
    if (!get().capabilityActive && get().isPlatformAdmin !== true) return;
    set({ loadingCatalog: true });
    try {
      const { entries } = await fetchAdminCatalog();
      set({
        catalog: entries,
        groupedCatalog: groupCatalogEntries(entries),
        loadingCatalog: false,
      });
    } catch (err) {
      logger.warn(
        `Admin catalog load failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      set({ loadingCatalog: false });
    }
  },

  clearAdminSession: () => {
    set({
      isPlatformAdmin: null,
      capabilityActive: false,
      capabilityExpiresAt: null,
      stepUpHints: null,
      catalog: null,
      groupedCatalog: null,
      stepUpError: null,
    });
  },

  handleCapabilityUnauthorized: () => {
    set({
      capabilityActive: false,
      capabilityExpiresAt: null,
      catalog: null,
      groupedCatalog: null,
      stepUpError: "Admin capability expired. Step up again to continue.",
    });
  },
}));
