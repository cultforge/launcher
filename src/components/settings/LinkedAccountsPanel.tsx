import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  linkOAuthProvider,
  listOAuthProviders,
  openOAuthUrl,
  unlinkOAuthProvider,
  type LinkedOAuthProvider,
  type OAuthProvider,
} from "../../lib/client";
import { cn } from "../../lib/cn";

const LINKABLE: { id: OAuthProvider; label: string }[] = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
  { id: "discord", label: "Discord" },
  { id: "microsoft", label: "Microsoft" },
];

function labelFor(provider: string): string {
  const known = LINKABLE.find((p) => p.id === provider);
  if (known) return known.label;
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function LinkedAccountsPanel() {
  const [providers, setProviders] = useState<LinkedOAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listOAuthProviders();
      setProviders(list);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not load linked accounts",
      );
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const linkedIds = new Set(
    providers.filter((p) => p.linked).map((p) => p.provider.toLowerCase()),
  );

  const onLink = async (provider: OAuthProvider) => {
    setBusy(provider);
    try {
      const url = await linkOAuthProvider(provider);
      await openOAuthUrl(url);
      toast.message("Continue in your browser", {
        description: `Link ${labelFor(provider)}, then return here.`,
      });
      window.setTimeout(() => {
        void refresh();
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start link");
    } finally {
      setBusy(null);
    }
  };

  const onUnlink = async (provider: string) => {
    const confirmed = window.confirm(
      `Unlink ${labelFor(provider)} from this CultForge account?`,
    );
    if (!confirmed) return;
    setBusy(provider);
    try {
      await unlinkOAuthProvider(provider);
      toast.success(`${labelFor(provider)} unlinked`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unlink");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-3">
      <div>
        <div className="text-[13px] text-text-primary font-medium">
          Linked accounts
        </div>
        <p className="text-[10px] text-text-muted mt-0.5">
          Connect GitHub and other providers to this CultForge account for
          sign-in.
        </p>
      </div>

      {loading ? (
        <p className="text-[11px] text-text-muted px-0.5">Loading…</p>
      ) : (
        <div className="flex flex-col divide-y divide-white/6">
          {LINKABLE.map((item) => {
            const row = providers.find(
              (p) => p.provider.toLowerCase() === item.id,
            );
            const linked = linkedIds.has(item.id);
            const detail =
              row?.username ||
              row?.email ||
              (linked ? "Connected" : "Not linked");
            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-text-primary font-medium">
                    {item.label}
                  </div>
                  <div
                    className={cn(
                      "text-[10px] mt-0.5 truncate",
                      linked ? "text-text-secondary" : "text-text-disabled",
                    )}
                  >
                    {detail}
                  </div>
                </div>
                {linked ? (
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void onUnlink(item.id)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-white/12 text-text-secondary hover:text-white cursor-pointer disabled:opacity-50"
                  >
                    Unlink
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void onLink(item.id)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-semibold border border-primary-base/35 text-primary-base hover:bg-primary-base/10 cursor-pointer disabled:opacity-50"
                  >
                    {busy === item.id ? "Opening…" : "Link"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        className="self-start text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
}
