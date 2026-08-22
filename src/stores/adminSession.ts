import { create } from "zustand";
import {
  AdminClient,
  capabilityBadgeState,
  type AdminCatalogEntry,
  type AdminStepUpHints,
  type CapabilityBadgeState,
} from "../lib/adminClient";
import { groupCatalogEntries } from "../lib/adminCatalog";
import { ClientHttpError } from "../lib/client";
import { logger } from "../lib/logger";

type AdminSessionStore = {
  isPlatformAdmin: boolean | null;
  userId: string | null;
  handle: string | null;
  capabilityActive: boolean;
  capabilityExpiresAt: number | null;
  stepUpHints: AdminStepUpHints | null;
  catalog: AdminCatalogEntry[] | null;
  groupedCatalog: Record<string, AdminCatalogEntry[]> | null;
  loadingWhoami: boolean;
  loadingCatalog: boolean;
  stepUpError: string | null;
  badgeState: CapabilityBadgeState;
  refreshWhoami: () => Promise<void>;
  stepUp: () => Promise<boolean>;
  loadCatalog: () => Promise<void>;
  clearAdminSession: () => void;
  handleCapabilityUnauthorized: () => void;
  recomputeBadge: () => void;
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

function computeBadge(
  capabilityActive: boolean,
  capabilityExpiresAt: number | null,
  hints: AdminStepUpHints | null,
): CapabilityBadgeState {
  return capabilityBadgeState({
    capabilityActive,
    capabilityExpiresAt,
    sessionFreshEnough: hints?.sessionFreshEnough ?? null,
  });
}

export const useAdminSessionStore = create<AdminSessionStore>((set, get) => ({
  isPlatformAdmin: null,
  userId: null,
  handle: null,
  capabilityActive: false,
  capabilityExpiresAt: null,
  stepUpHints: null,
  catalog: null,
  groupedCatalog: null,
  loadingWhoami: false,
  loadingCatalog: false,
  stepUpError: null,
  badgeState: "needs_step_up",

  recomputeBadge: () => {
    const s = get();
    set({
      badgeState: computeBadge(
        s.capabilityActive,
        s.capabilityExpiresAt,
        s.stepUpHints,
      ),
    });
  },

  refreshWhoami: async () => {
    set({ loadingWhoami: true });
    try {
      const { whoami, local, hints } = await AdminClient.whoami();
      const userId =
        typeof whoami.user_id === "string"
          ? whoami.user_id
          : typeof whoami.userId === "string"
            ? whoami.userId
            : null;
      set({
        isPlatformAdmin: Boolean(whoami.admin),
        userId,
        handle: userId,
        capabilityActive: local.capability_active,
        capabilityExpiresAt: local.capability_expires_at,
        stepUpHints: hints,
        loadingWhoami: false,
        stepUpError: null,
        badgeState: computeBadge(
          local.capability_active,
          local.capability_expires_at,
          hints,
        ),
      });
    } catch (err) {
      logger.debug(
        `Admin whoami skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      set({
        isPlatformAdmin: false,
        userId: null,
        handle: null,
        capabilityActive: false,
        capabilityExpiresAt: null,
        stepUpHints: null,
        loadingWhoami: false,
        badgeState: "needs_step_up",
      });
    }
  },

  stepUp: async () => {
    const hints = get().stepUpHints;
    if (hints && !hints.sessionFreshEnough) {
      const message =
        "Session is too old for admin step-up. Sign out, sign in via OAuth, then try again.";
      set({
        stepUpError: message,
        badgeState: "relogin",
      });
      return false;
    }
    set({ stepUpError: null });
    try {
      const local = await AdminClient.stepUp();
      const nextHints = get().stepUpHints;
      set({
        capabilityActive: local.capability_active,
        capabilityExpiresAt: local.capability_expires_at,
        stepUpError: null,
        badgeState: computeBadge(
          local.capability_active,
          local.capability_expires_at,
          nextHints,
        ),
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
        badgeState: "expired",
      });
      return false;
    }
  },

  loadCatalog: async () => {
    if (!get().capabilityActive && get().isPlatformAdmin !== true) return;
    set({ loadingCatalog: true });
    try {
      const { entries } = await AdminClient.catalog();
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
      userId: null,
      handle: null,
      capabilityActive: false,
      capabilityExpiresAt: null,
      stepUpHints: null,
      catalog: null,
      groupedCatalog: null,
      stepUpError: null,
      badgeState: "needs_step_up",
    });
  },

  handleCapabilityUnauthorized: () => {
    set({
      capabilityActive: false,
      capabilityExpiresAt: null,
      catalog: null,
      groupedCatalog: null,
      stepUpError: "Admin capability expired. Step up again to continue.",
      badgeState: "expired",
    });
  },
}));
