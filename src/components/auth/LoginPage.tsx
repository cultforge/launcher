import { useEffect, useState, type FormEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Boxes,
  Layers,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppIcons } from "../icons";
import { Icon } from "../ico";
import { ThemeLogo } from "../ThemeLogo";
import { APP_VERSION } from "../../manifest";
import { useAppStore } from "../../userstore";
import type { OAuthProvider } from "../../lib/client";
import { fetchOAuthPending, health } from "../../lib/client";
import {
  requestPasswordForgot,
  requestPasswordReset,
} from "../../lib/passwordRecoveryApi";
import { cn } from "../../lib/cn";

const appWindow = getCurrentWindow();

const FEATURES = [
  {
    icon: Boxes,
    title: "Manage Multiple Builds",
    detail: "Forge, Fabric, Quilt and more.",
  },
  {
    icon: Users,
    title: "Powerful Guilds",
    detail: "Build, raid, and rise together.",
  },
  {
    icon: Layers,
    title: "Mods & Packs",
    detail: "Discover, install, and customize.",
  },
  {
    icon: Lock,
    title: "Secure & Private",
    detail: "Your data. Your world.",
  },
] as const;

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3l-.8.6-2.5 1.9C4.9 20 8.2 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4z"
      />
      <path
        fill="#4A90E2"
        d="M3.3 7.2C2.5 8.7 2 10.3 2 12s.5 3.3 1.3 4.8l3.3-2.5C6.2 13.5 6 12.8 6 12s.2-1.5.6-2.3L3.3 7.2z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.7 14.7 2 12 2 8.2 2 4.9 4 3.3 7.2l3.3 2.5C7 7.7 9.2 5.8 12 5.8z"
      />
    </svg>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .26.18.58.69.48A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  );
}

function WindowChrome() {
  return (
    <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-end h-12 px-4">
      <div data-tauri-drag-region className="absolute inset-0" />
      <div className="relative z-10 flex items-center gap-2.5 text-white/55">
        <button
          type="button"
          title="Minimize"
          aria-label="Minimize window"
          className="cursor-pointer hover:text-white p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          onClick={() => void appWindow.minimize()}
        >
          <Icon icon={AppIcons.Minimize} size={13} />
        </button>
        <button
          type="button"
          title="Maximize"
          aria-label="Maximize window"
          className="cursor-pointer hover:text-white p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          onClick={() => void appWindow.toggleMaximize()}
        >
          <Icon icon={AppIcons.Maximize} size={13} />
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close window"
          className="cursor-pointer hover:text-state-error p-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          onClick={() => void appWindow.close()}
        >
          <Icon icon={AppIcons.Close} size={15} />
        </button>
      </div>
    </div>
  );
}

function CompleteProfileCard() {
  const completeProfile = useAppStore((s) => s.completeProfile);
  const cancelAuth = useAppStore((s) => s.cancelAuth);
  const authStatus = useAppStore((s) => s.authStatus);
  const authError = useAppStore((s) => s.authError);
  const pending = useAppStore((s) => s.pendingOAuth);
  const [username, setUsername] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await completeProfile({ username, handle });
      toast.success("Welcome to CultForge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || authStatus === "authenticating";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[420px] rounded-2xl border border-primary-base/35 bg-[#12151a]/78 backdrop-blur-xl shadow-[0_0_0_1px_rgba(30,227,150,0.08),0_24px_80px_rgba(0,0,0,0.55)] px-8 py-9"
    >
      <p className="text-[11px] tracking-[0.18em] uppercase text-primary-base font-semibold mb-2">
        Almost there
      </p>
      <h1 className="text-[28px] font-bold text-white leading-tight mb-2">
        Choose a username
      </h1>
      <p className="text-sm text-white/55 mb-7">
        Pick how you appear across CultForge. Your {pending?.email ? "OAuth" : ""}{" "}
        account is already linked.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-white/45">
            Username
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_-]+"
            placeholder="ForgeMaster"
            disabled={disabled}
            className="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary-base/55 focus:ring-1 focus:ring-primary-base/30"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-white/45">
            Handle <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            maxLength={32}
            placeholder="@handle"
            disabled={disabled}
            className="h-11 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary-base/55 focus:ring-1 focus:ring-primary-base/30"
          />
        </label>

        {authError ? (
          <p className="text-sm text-state-error" role="alert">
            {authError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={disabled || username.trim().length < 3}
          className="mt-2 h-12 rounded-lg bg-linear-to-r from-[#0f9f6e] to-[#1ee396] text-sm font-bold tracking-[0.14em] uppercase text-bg-app disabled:opacity-50 cursor-pointer hover:brightness-110 transition"
        >
          {disabled ? "Creating…" : "Continue"}
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => cancelAuth()}
          className="text-center text-sm text-white/45 hover:text-white cursor-pointer disabled:opacity-50"
        >
          Start over
        </button>
      </form>
    </motion.div>
  );
}

function LoginCard() {
  const beginOAuth = useAppStore((s) => s.beginOAuth);
  const applyOAuthCallback = useAppStore((s) => s.applyOAuthCallback);
  const authStatus = useAppStore((s) => s.authStatus);
  const authError = useAppStore((s) => s.authError);
  const clientReady = useAppStore((s) => s.clientReady);
  const [busyProvider, setBusyProvider] = useState<OAuthProvider | null>(null);
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"oauth" | "forgot" | "reset">("oauth");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!clientReady) {
      setRemoteOk(false);
      return;
    }
    void health()
      .then((h) => {
        if (!cancelled) setRemoteOk(h.remote);
      })
      .catch(() => {
        if (!cancelled) setRemoteOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientReady]);

  // Poll sidecar while waiting for browser OAuth (covers missed WS events).
  useEffect(() => {
    if (authStatus !== "authenticating" || !clientReady) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const pending = await fetchOAuthPending(controller.signal);
          if (!pending.ready || !pending.oauth) return;
          await applyOAuthCallback(pending.oauth);
        } catch {
          // ignore poll errors while waiting
        }
      })();
    }, 1500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [authStatus, clientReady, applyOAuthCallback]);

  const start = async (provider: OAuthProvider) => {
    if (!clientReady || remoteOk === false) {
      toast.error("Remote APIs offline", {
        description: "Sign-in needs CultForge remote services.",
      });
      return;
    }
    setBusyProvider(provider);
    try {
      await beginOAuth(provider);
      toast.message("Continue in your browser", {
        description: "Finish signing in, then return to the launcher.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OAuth failed");
    } finally {
      setBusyProvider(null);
    }
  };

  const disabled =
    busyProvider !== null ||
    recoveryBusy ||
    authStatus === "authenticating" ||
    !clientReady ||
    remoteOk === false;

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    setRecoveryBusy(true);
    try {
      const message = await requestPasswordForgot(email);
      toast.success("Check your email", { description: message });
      setMode("reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start reset");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const onReset = async (e: FormEvent) => {
    e.preventDefault();
    setRecoveryBusy(true);
    try {
      const message = await requestPasswordReset({ token, password });
      toast.success("Password updated", { description: message });
      setMode("oauth");
      setToken("");
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setRecoveryBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-[420px] rounded-2xl border border-primary-base/35 bg-[#12151a]/78 backdrop-blur-xl shadow-[0_0_0_1px_rgba(30,227,150,0.08),0_24px_80px_rgba(0,0,0,0.55)] px-8 py-9"
    >
      <p className="text-[11px] tracking-[0.18em] uppercase text-primary-base font-semibold mb-2">
        Welcome back
      </p>
      <h1 className="text-[28px] font-bold text-white leading-tight mb-2">
        {mode === "oauth"
          ? "Login to CultForge"
          : mode === "forgot"
            ? "Forgot password"
            : "Reset password"}
      </h1>
      <p className="text-sm text-white/55 mb-8">
        {mode === "oauth"
          ? "Continue with Google or GitHub, or recover a password account."
          : mode === "forgot"
            ? "We’ll email a reset token if that address is registered."
            : "Paste the token from your email and choose a new password."}
      </p>

      {mode === "oauth" ? (
        <>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => void start("google")}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/12 bg-white/[0.04] text-sm font-semibold text-white transition hover:bg-white/[0.08] hover:border-white/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <GoogleMark className="h-5 w-5" />
              {busyProvider === "google"
                ? "Opening Google…"
                : "Continue with Google"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void start("github")}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/12 bg-white/[0.04] text-sm font-semibold text-white transition hover:bg-white/[0.08] hover:border-white/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <GitHubMark className="h-5 w-5" />
              {busyProvider === "github"
                ? "Opening GitHub…"
                : "Continue with GitHub"}
            </button>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("forgot")}
            className="mt-5 w-full text-center text-sm text-white/45 hover:text-white cursor-pointer disabled:opacity-50"
          >
            Forgot password?
          </button>
        </>
      ) : mode === "forgot" ? (
        <form onSubmit={(e) => void onForgot(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              Email
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-lg border border-white/12 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-base/40"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="submit"
            disabled={disabled}
            className="cf-btn-primary h-11 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {recoveryBusy ? "Sending…" : "Send reset email"}
          </button>
          <button
            type="button"
            onClick={() => setMode("oauth")}
            className="text-sm text-white/45 hover:text-white cursor-pointer"
          >
            Back to sign-in
          </button>
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="text-sm text-primary-base hover:underline cursor-pointer"
          >
            I already have a token
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void onReset(e)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              Reset token
            </span>
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="h-11 rounded-lg border border-white/12 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-base/40 font-mono"
              placeholder="Paste token"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              New password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-lg border border-white/12 bg-black/30 px-3 text-sm text-white outline-none focus:border-primary-base/40"
              placeholder="At least 8 characters"
            />
          </label>
          <button
            type="submit"
            disabled={disabled}
            className="cf-btn-primary h-11 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {recoveryBusy ? "Updating…" : "Update password"}
          </button>
          <button
            type="button"
            onClick={() => setMode("oauth")}
            className="text-sm text-white/45 hover:text-white cursor-pointer"
          >
            Back to sign-in
          </button>
        </form>
      )}

      {authStatus === "authenticating" ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          <p className="text-center text-sm text-primary-base/90">
            Waiting for browser sign-in…
          </p>
          <button
            type="button"
            className="text-xs text-white/45 hover:text-white cursor-pointer"
            onClick={() => useAppStore.getState().cancelAuth()}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {authError && authStatus !== "authenticating" ? (
        <p className="mt-4 text-sm text-state-error text-center" role="alert">
          {authError}
        </p>
      ) : null}

      {!clientReady || remoteOk === false ? (
        <p className="mt-4 text-sm text-amber-200/80 text-center">
          {!clientReady
            ? "Local client offline — sign-in unavailable."
            : "Remote CultForge APIs are offline."}
        </p>
      ) : null}

      {mode === "oauth" ? (
        <p className="mt-8 text-center text-sm text-white/50">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            disabled={disabled}
            onClick={() => void start("google")}
            className="text-primary-base font-semibold hover:underline cursor-pointer disabled:opacity-50"
          >
            Create one →
          </button>
        </p>
      ) : null}
    </motion.div>
  );
}

export function LoginPage() {
  const authStatus = useAppStore((s) => s.authStatus);

  return (
    <div className="relative flex h-full w-full overflow-hidden text-white">
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url("/art/login-bg.png")' }}
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(105deg,rgba(4,8,10,0.88)_0%,rgba(4,8,10,0.72)_42%,rgba(4,8,10,0.55)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,transparent_0%,rgba(0,0,0,0.45)_70%)]"
      />

      <WindowChrome />

      <div className="relative z-10 flex flex-1 min-h-0">
        <motion.aside
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="hidden md:flex w-[min(42%,480px)] flex-col justify-between px-10 pb-8 pt-16"
        >
          <div>
            <div className="flex items-center gap-3 mb-10">
              <ThemeLogo className="h-11 w-11" glow label="" />
              <div className="leading-tight">
                <div className="text-xl font-bold tracking-[0.12em]">CULTFORGE</div>
                <div className="text-[11px] tracking-[0.22em] text-white/55 uppercase">
                  Forge your world
                </div>
              </div>
            </div>

            <ul className="flex flex-col gap-5 max-w-sm">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="flex gap-3.5 items-start">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-base/35 bg-primary-base/10 text-primary-base">
                    <feature.icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {feature.title}
                    </div>
                    <div className="text-sm text-white/50">{feature.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-base/25 bg-black/35 px-3 py-1.5 text-[11px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-base shadow-[0_0_8px_var(--color-primary-base)]" />
              <ShieldCheck className="h-3.5 w-3.5 text-primary-base" />
              Secure connection: encrypted
            </div>
            <p className="text-[11px] text-white/35">CultForge {APP_VERSION}</p>
          </div>
        </motion.aside>

        <div className="flex flex-1 items-center justify-center px-6 py-16">
          {authStatus === "needs_profile" ? (
            <CompleteProfileCard />
          ) : (
            <LoginCard />
          )}
        </div>
      </div>
    </div>
  );
}
