import { create } from "zustand";
import type { FriendProfile } from "./data/friends";
import { clearPlayerProfileCache } from "./data/friends";
import {
  classifyOAuthOutcome,
  hasRealProfileIdentity,
  isProfileSuccess,
  mapApiProfileToCurrentUser,
  profileEnvelopeKeys,
  randomAccountPassword,
} from "./lib/authProfile";
import {
  applySessionToken,
  authFailureMessage,
  createAccount,
  deleteAccount as clientDeleteAccount,
  extractSessionToken,
  fetchMyProfile,
  fetchSessionStatus,
  isHardAuthError,
  isUnauthorizedError,
  logout as clientLogout,
  openOAuthUrl,
  startOAuth,
  type OAuthProvider,
} from "./lib/client";
import { getPreference, setPreference } from "./lib/persistentStore";
import { logger } from "./lib/logger";
import { useFriendsRosterStore } from "./stores/friendsRoster";
import { usePresenceStore } from "./stores/presence";
import { useGuildStore } from "./stores/guilds";
import { useNotificationsStore } from "./stores/notifications";
import { useAdminSessionStore } from "./stores/adminSession";
import { toast } from "sonner";

function hydrateGuildsAfterAuth() {
  void useGuildStore
    .getState()
    .hydrateMyGuilds()
    .catch((err) => {
      logger.warn(
        `Guild hydrate failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  void useNotificationsStore.getState().refresh();
  void useAdminSessionStore.getState().refreshWhoami();
}

export type CurrentUser = FriendProfile & {
  avatarUrl: string;
  email: string;
};

export type AuthStatus =
  | "unknown"
  | "anonymous"
  | "authenticating"
  | "needs_profile"
  | "authenticated";

/** live = verified against remote; cached = offline / degraded shell. */
export type AuthSource = "none" | "live" | "cached";

export type OAuthCallbackPayload = {
  status: boolean;
  message?: string;
  token?: string;
  token_kind?: string;
  avatar_url?: string;
  email?: string;
  name?: string;
  username?: string;
  handle_name?: string;
  handle?: string;
  user_id?: string;
  provider?: string;
};

const SESSION_KEY = "auth.session";

/** Prevent WS + poll from double-finishing OAuth. */
let oauthCallbackInFlight: Promise<void> | null = null;
/** Bumps on login/logout so stale hydrate 401s cannot wipe a fresh session. */
let authEpoch = 0;
let cachedAuthToastShown = false;

type PersistedSession = {
  active: boolean;
  user: CurrentUser | null;
};

interface AppState {
  currentUser: CurrentUser | null;
  authStatus: AuthStatus;
  authSource: AuthSource;
  authError: string | null;
  pendingOAuth: OAuthCallbackPayload | null;
  /** UI marker only — real JWT lives in sidecar keyring. */
  sessionToken: string | null;
  news: { title: string; date: string }[];
  storeItems: { id: number; name: string; price: number }[];
  clientReady: boolean;
  setUserData: (name: string) => void;
  setOnline: (online: boolean) => void;
  setNews: (news: { title: string; date: string }[]) => void;
  setStoreItems: (items: { id: number; name: string; price: number }[]) => void;
  setClientReady: (ready: boolean) => void;
  hydrateSession: () => Promise<void>;
  beginOAuth: (provider: OAuthProvider) => Promise<void>;
  applyOAuthCallback: (payload: OAuthCallbackPayload) => Promise<void>;
  completeProfile: (input: {
    username: string;
    handle?: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  handleSessionExpired: (
    message?: string,
    epoch?: number,
    opts?: { quiet?: boolean },
  ) => Promise<void>;
  cancelAuth: () => void;
  setCurrentUserFromProfile: (
    api: unknown,
    fallback?: Partial<{ name: string; email: string; avatarUrl: string }>,
  ) => void;
  rememberSessionToken: (token: string | null) => Promise<void>;
}

/** Clear friends roster + presence when the session ends. */
function clearFriendsState() {
  useFriendsRosterStore.getState().clear();
  usePresenceStore.getState().clear();
}

/** Persist non-secret user cache only — JWT stays in OS keyring via sidecar. */
async function persistSession(user: CurrentUser | null) {
  const payload: PersistedSession = {
    active: Boolean(user),
    user,
  };
  await setPreference(SESSION_KEY, payload);
}

async function readCachedSession(): Promise<PersistedSession | null> {
  const cached = await getPreference<PersistedSession>(SESSION_KEY);
  if (!cached || typeof cached !== "object") return null;
  return cached;
}

function cachedUserValid(user: CurrentUser | null | undefined): user is CurrentUser {
  return Boolean(user && hasRealProfileIdentity(user));
}

/** Map SDK 401/403 into clearer auth copy for create-account. */
function normalizeCreateAccountError(error: unknown): string {
  if (isUnauthorizedError(error)) {
    const mapped = authFailureMessage(error);
    if (mapped.toLowerCase().includes("device not authorised")) {
      return "Device not authorised. Sign in again to finish creating your account.";
    }
    return "Session expired. Sign in again to finish creating your account.";
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  authStatus: "unknown",
  authSource: "none",
  authError: null,
  pendingOAuth: null,
  sessionToken: null,
  news: [],
  storeItems: [],
  clientReady: false,
  setUserData: (name) =>
    set((state) =>
      state.currentUser
        ? { currentUser: { ...state.currentUser, name } }
        : state,
    ),
  setOnline: (online) =>
    set((state) =>
      state.currentUser
        ? {
            currentUser: {
              ...state.currentUser,
              status: online ? "online" : "offline",
              lastSeen: online ? "Online now" : "Recently",
            },
          }
        : state,
    ),
  setNews: (news) => set({ news }),
  setStoreItems: (storeItems) => set({ storeItems }),
  setClientReady: (clientReady) => {
    set({ clientReady });
    if (clientReady && get().authStatus === "authenticated") {
      void useFriendsRosterStore.getState().refresh();
      hydrateGuildsAfterAuth();
    }
  },

  rememberSessionToken: async (token) => {
    // Real JWT is applied to the sidecar (keyring). UI only keeps a marker.
    set({ sessionToken: token ? "sidecar" : null });
    await persistSession(get().currentUser);
    if (token && token.includes(".") && get().clientReady) {
      try {
        await applySessionToken(token);
      } catch (e) {
        logger.warn(
          `Could not push session to sidecar: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  },

  setCurrentUserFromProfile: (api, fallback) => {
    const user = mapApiProfileToCurrentUser(api, fallback);
    if (!hasRealProfileIdentity(user)) {
      logger.warn(
        `Refusing to persist blank profile identity (keys=${profileEnvelopeKeys(api)})`,
      );
      return;
    }
    cachedAuthToastShown = false;
    set({
      currentUser: user,
      authStatus: "authenticated",
      authSource: "live",
      authError: null,
      pendingOAuth: null,
      sessionToken: get().sessionToken ?? "sidecar",
    });
    void persistSession(user);
    if (get().clientReady) {
      void useFriendsRosterStore.getState().refresh();
      hydrateGuildsAfterAuth();
    }
  },

  hydrateSession: async () => {
    const epoch = authEpoch;
    set({ authStatus: "authenticating", authError: null });

    const enterCachedAuth = async (
      user: CurrentUser,
      reason: string,
      sessionMarker: "sidecar" | "cached",
    ) => {
      if (epoch !== authEpoch) return;
      const offlineUser: CurrentUser = {
        ...user,
        status: "offline",
        lastSeen: "Cached",
        activity: "Offline",
      };
      set({
        currentUser: offlineUser,
        authStatus: "authenticated",
        authSource: "cached",
        authError: null,
        pendingOAuth: null,
        sessionToken: sessionMarker,
      });
      void useFriendsRosterStore.getState().loadCached();
      logger.warn(reason);
      if (!cachedAuthToastShown) {
        cachedAuthToastShown = true;
        toast.message("Offline — using cached profile", {
          description: reason,
        });
      }
    };

    try {
      if (!get().clientReady) {
        const cached = await readCachedSession();
        if (cached?.active && cachedUserValid(cached.user)) {
          await enterCachedAuth(
            cached.user,
            "Local client unreachable. Continuing with your last saved profile.",
            "cached",
          );
          return;
        }
        if (epoch !== authEpoch) return;
        set({
          currentUser: null,
          authStatus: "anonymous",
          authSource: "none",
          sessionToken: null,
        });
        return;
      }

      let hasSession = false;
      try {
        const status = await fetchSessionStatus();
        hasSession = Boolean(status.has_session);
      } catch {
        // Sidecar up but session check failed — try cache without clearing keyring.
        const cached = await readCachedSession();
        if (cached?.active && cachedUserValid(cached.user)) {
          await enterCachedAuth(
            cached.user,
            "Could not verify session with the local client. Using cached profile.",
            "cached",
          );
          return;
        }
        if (epoch !== authEpoch) return;
        set({
          currentUser: null,
          authStatus: "anonymous",
          authSource: "none",
          sessionToken: null,
        });
        return;
      }

      if (epoch !== authEpoch) return;

      if (!hasSession) {
        await persistSession(null);
        clearFriendsState();
        set({
          currentUser: null,
          authStatus: "anonymous",
          authSource: "none",
          pendingOAuth: null,
          sessionToken: null,
          authError: null,
        });
        return;
      }

      set({ sessionToken: "sidecar" });

      try {
        const profile = await fetchMyProfile();
        if (epoch !== authEpoch) return;
        logger.debug(
          `hydrate get_my_profile keys=[${profileEnvelopeKeys(profile)}]`,
        );
        if (isProfileSuccess(profile)) {
          get().setCurrentUserFromProfile(profile);
          if (get().authStatus === "authenticated") {
            return;
          }
        }
        // Soft: profile payload incomplete while remote responded — try cache.
        const cached = await readCachedSession();
        if (cached?.active && cachedUserValid(cached.user)) {
          await enterCachedAuth(
            cached.user,
            "Could not refresh profile from CultForge. Using cached profile.",
            "sidecar",
          );
          return;
        }
        logger.warn(
          `hydrate: profile missing username/handle (keys=[${profileEnvelopeKeys(profile)}])`,
        );
        // Keep keyring; do not logout on soft incomplete profile.
        set({
          currentUser: null,
          authStatus: "anonymous",
          authSource: "none",
          sessionToken: "sidecar",
          authError:
            "Could not load your profile. Sign in again when CultForge is reachable.",
        });
        return;
      } catch (e) {
        if (epoch !== authEpoch) return;
        if (isHardAuthError(e)) {
          // Boot / stale keyring vs local API — clear quietly so Login does not
          // flash "Session expired" for a second. Mid-session live auth still warns.
          const wasLive =
            get().authStatus === "authenticated" &&
            get().authSource === "live";
          await get().handleSessionExpired(authFailureMessage(e), epoch, {
            quiet: !wasLive,
          });
          return;
        }
        logger.debug(
          `Session profile check failed (soft): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        const cached = await readCachedSession();
        if (cached?.active && cachedUserValid(cached.user)) {
          await enterCachedAuth(
            cached.user,
            "CultForge APIs are offline. Using your cached profile.",
            "sidecar",
          );
          return;
        }
        // Soft fail with no cache: stay anonymous but keep keyring.
        set({
          currentUser: null,
          authStatus: "anonymous",
          authSource: "none",
          sessionToken: "sidecar",
          authError:
            "CultForge is offline and no cached profile is available.",
        });
      }
    } catch (e) {
      if (epoch !== authEpoch) return;
      logger.warn(
        `hydrateSession failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      const cached = await readCachedSession();
      if (cached?.active && cachedUserValid(cached.user)) {
        await enterCachedAuth(
          cached.user,
          "Session restore failed. Using cached profile.",
          "cached",
        );
        return;
      }
      set({
        currentUser: null,
        authStatus: "anonymous",
        authSource: "none",
        sessionToken: null,
      });
    }
  },

  beginOAuth: async (provider) => {
    if (!get().clientReady) {
      const message =
        "Local client is offline. OAuth requires the CultForge client.";
      set({ authError: message });
      throw new Error(message);
    }
    authEpoch += 1;
    set({ authStatus: "authenticating", authError: null });
    try {
      const url = await startOAuth(provider);
      await openOAuthUrl(url);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not start OAuth sign-in.";
      set({ authStatus: "anonymous", authError: message });
      throw e;
    }
  },

  applyOAuthCallback: async (payload) => {
    if (oauthCallbackInFlight) {
      await oauthCallbackInFlight;
      return;
    }

    oauthCallbackInFlight = (async () => {
      if (!payload.status) {
        set({
          authStatus: "anonymous",
          authError: payload.message || "OAuth sign-in failed.",
          pendingOAuth: null,
        });
        return;
      }

      // Idempotent if WS + poll both fire after a completed login.
      const existingUser = get().currentUser;
      if (
        get().authStatus === "authenticated" &&
        existingUser &&
        hasRealProfileIdentity(existingUser)
      ) {
        return;
      }

      const outcome = classifyOAuthOutcome({
        token_kind: payload.token_kind,
        message: payload.message,
      });

      set({
        authStatus: "authenticating",
        authError: null,
        pendingOAuth: payload,
      });
      // Invalidate in-flight hydrate so a stale 401 cannot clear this login.
      authEpoch += 1;

      // Sidecar already applied the JWT in-process. Prefer not trusting WS tokens.
      if (payload.token && payload.token_kind === "session") {
        await get().rememberSessionToken(payload.token);
      } else if (payload.token_kind === "session" || outcome === "login") {
        set({ sessionToken: "sidecar" });
      }

      const fallback = {
        name: payload.username || payload.name,
        email: payload.email,
        avatarUrl: payload.avatar_url,
      };

      const tryLoadProfile = async (attempt: number): Promise<boolean> => {
        try {
          const profile = await fetchMyProfile();
          logger.debug(
            `oauth profile attempt=${attempt} keys=[${profileEnvelopeKeys(profile)}]`,
          );
          if (isProfileSuccess(profile)) {
            if (!get().sessionToken) {
              set({ sessionToken: "sidecar" });
            }
            get().setCurrentUserFromProfile(profile, fallback);
            return get().authStatus === "authenticated";
          }
        } catch (e) {
          // Never wipe a brand-new OAuth session because /profile/me 401'd —
          // common with local API fingerprint/DB lag. Fall through to soft paths.
          logger.warn(
            `Profile fetch after OAuth failed (attempt ${attempt}): ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
        return false;
      };

      // Existing-user login → /v1/profile/me is source of truth.
      if (outcome === "login") {
        if (await tryLoadProfile(1)) {
          if (get().authStatus === "authenticated") {
            logger.success("Signed in");
          }
          return;
        }
        // One retry before temporary OAuth identity.
        await new Promise((r) => window.setTimeout(r, 400));
        if (await tryLoadProfile(2)) {
          if (get().authStatus === "authenticated") {
            logger.success("Signed in");
          }
          return;
        }

        // Temporary OAuth fallback only when callback provided a real name.
        const oauthName = (
          payload.username ||
          payload.name ||
          ""
        ).trim();
        if (oauthName) {
          const handle = (payload.handle_name || payload.handle || "")
            .trim()
            .replace(/^@/, "");
          const user = mapApiProfileToCurrentUser(
            {
              id: payload.user_id || (payload.email ? `email:${payload.email}` : undefined),
              username: oauthName,
              handle_name: handle || undefined,
              email: payload.email,
              avatar_url: payload.avatar_url,
            },
            fallback,
          );
          if (hasRealProfileIdentity(user)) {
            if (!get().sessionToken) {
              set({ sessionToken: "sidecar" });
            }
            set({
              currentUser: user,
              authStatus: "authenticated",
              authSource: "live",
              authError: null,
              pendingOAuth: null,
            });
            await persistSession(user);
            logger.success("Signed in (OAuth identity; profile pending)");
            return;
          }
        }

        set({
          authStatus: "anonymous",
          authError:
            "Signed in remotely but could not load your CultForge profile. Try again.",
          pendingOAuth: null,
        });
        return;
      }

      // New-user registration only.
      if (outcome === "register") {
        set({
          authStatus: "needs_profile",
          pendingOAuth: payload,
          authError: null,
        });
        return;
      }

      // Unknown: try profile; only then offer registration.
      if (await tryLoadProfile(1)) {
        if (get().authStatus === "authenticated") {
          logger.success("Signed in");
        }
        return;
      }

      set({
        authStatus: "needs_profile",
        pendingOAuth: payload,
        authError: null,
      });
    })();

    try {
      await oauthCallbackInFlight;
    } finally {
      oauthCallbackInFlight = null;
    }
  },

  completeProfile: async ({ username, handle }) => {
    const pending = get().pendingOAuth;
    const trimmed = username.trim();
    if (!trimmed) {
      throw new Error("Username is required.");
    }
    set({ authStatus: "authenticating", authError: null });
    try {
      const email =
        pending?.email || `${trimmed.toLowerCase()}@users.cultforge.local`;
      const avatar_url = pending?.avatar_url || "";
      const handle_name = (handle?.trim() || trimmed).replace(/^@/, "");
      const created = await createAccount({
        username: trimmed,
        password: randomAccountPassword(),
        email,
        handle_name,
        avatar_url,
      });
      const session = extractSessionToken(created);
      if (session) {
        await get().rememberSessionToken(session);
      }
      const profile = await fetchMyProfile();
      if (isProfileSuccess(profile)) {
        get().setCurrentUserFromProfile(profile, {
          name: trimmed,
          email,
          avatarUrl: avatar_url,
        });
      }
      if (get().authStatus !== "authenticated") {
        const user = mapApiProfileToCurrentUser(
          {
            id: `user:${trimmed.toLowerCase()}`,
            username: trimmed,
            email,
            avatar_url,
            handle_name: handle_name,
          },
          { name: trimmed, email, avatarUrl: avatar_url },
        );
        if (!hasRealProfileIdentity(user)) {
          throw new Error("Account created but profile identity is incomplete.");
        }
        set({
          currentUser: user,
          authStatus: "authenticated",
          authSource: "live",
          authError: null,
          pendingOAuth: null,
        });
        await persistSession(user);
      }
      logger.success("Account forged");
    } catch (e) {
      const message = normalizeCreateAccountError(e);
      set({ authStatus: "needs_profile", authError: message });
      throw new Error(message);
    }
  },

  handleSessionExpired: async (message, epoch, opts) => {
    if (typeof epoch === "number" && epoch !== authEpoch) {
      logger.debug("Ignoring stale session-expired from older hydrate");
      return;
    }
    authEpoch += 1;
    const quiet = Boolean(opts?.quiet);
    const msg = message || "Sign in again to continue.";
    try {
      if (get().clientReady) {
        await clientLogout();
      }
    } catch {
      // Token may already be invalid remotely.
    }
    cachedAuthToastShown = false;
    clearPlayerProfileCache();
    clearFriendsState();
    useGuildStore.getState().clearRemoteGuildState();
    useAdminSessionStore.getState().clearAdminSession();
    await persistSession(null);
    set({
      currentUser: null,
      authStatus: "anonymous",
      authSource: "none",
      // Quiet boot cleanup must not paint "Session expired" on the login screen.
      authError: quiet ? null : msg,
      pendingOAuth: null,
      sessionToken: null,
    });
    if (quiet) {
      logger.debug(`Quiet session clear: ${msg}`);
    } else {
      logger.warn(msg);
    }
  },

  signOut: async () => {
    authEpoch += 1;
    try {
      if (get().clientReady) {
        await clientLogout();
      }
    } catch (e) {
      logger.warn(
        `Logout request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    cachedAuthToastShown = false;
    clearPlayerProfileCache();
    clearFriendsState();
    useGuildStore.getState().clearRemoteGuildState();
    useAdminSessionStore.getState().clearAdminSession();
    await persistSession(null);
    set({
      currentUser: null,
      authStatus: "anonymous",
      authSource: "none",
      authError: null,
      pendingOAuth: null,
      sessionToken: null,
    });
  },

  deleteAccount: async () => {
    if (!get().clientReady) {
      throw new Error("Local client is offline.");
    }
    set({ authError: null });
    try {
      await clientDeleteAccount({ confirm: true, delete_owned_guilds: false });
    } catch (e) {
      if (isUnauthorizedError(e)) {
        const msg = authFailureMessage(e);
        await get().handleSessionExpired(msg);
        throw new Error(msg);
      }
      throw e instanceof Error ? e : new Error("Could not delete account.");
    }
    cachedAuthToastShown = false;
    clearPlayerProfileCache();
    clearFriendsState();
    await persistSession(null);
    set({
      currentUser: null,
      authStatus: "anonymous",
      authSource: "none",
      authError: null,
      pendingOAuth: null,
      sessionToken: null,
    });
    logger.success("Account deleted");
  },

  cancelAuth: () => {
    const status = get().authStatus;
    if (status === "authenticating" || status === "needs_profile") {
      set({
        authStatus: "anonymous",
        authSource: "none",
        authError: null,
        pendingOAuth: null,
      });
    }
  },
}));

export function currentUserId(): string {
  return useAppStore.getState().currentUser?.id ?? "";
}

export function currentUserName(): string {
  return useAppStore.getState().currentUser?.name ?? "";
}
