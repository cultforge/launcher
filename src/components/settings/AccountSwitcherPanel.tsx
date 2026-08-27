import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  activateLocalAccount,
  forgetLocalAccount,
  listLocalAccounts,
  stashLocalAccount,
  type LocalAccountRow,
} from "../../lib/client";
import { useAppStore } from "../../userstore";
import { useSettingsStore } from "../../stores/settings";
import { cn } from "../../lib/cn";

export function AccountSwitcherPanel() {
  const enabled = useSettingsStore((s) => s.settings.experimentalAccountSwitch);
  const user = useAppStore((s) => s.currentUser);
  const hydrateSession = useAppStore((s) => s.hydrateSession);
  const beginOAuth = useAppStore((s) => s.beginOAuth);
  const [rows, setRows] = useState<LocalAccountRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setRows(await listLocalAccounts());
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, user?.id]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    void stashLocalAccount({
      userId: user.id,
      name: user.name || user.handle || user.id,
      avatarUrl: user.avatarUrl,
    })
      .then(setRows)
      .catch(() => undefined);
  }, [enabled, user?.id, user?.name, user?.handle, user?.avatarUrl]);

  if (!enabled) return null;

  const onSwitch = async (id: string) => {
    if (!id || id === user?.id || busy) return;
    if (user?.id) {
      try {
        await stashLocalAccount({
          userId: user.id,
          name: user.name || user.handle || user.id,
          avatarUrl: user.avatarUrl,
        });
      } catch {
        /* continue */
      }
    }
    setBusy(id);
    try {
      await activateLocalAccount(id);
      await hydrateSession();
      toast.success("Switched account");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch");
    } finally {
      setBusy(null);
    }
  };

  const onForget = async (id: string) => {
    if (!window.confirm("Remove this saved account from this device?")) return;
    setBusy(id);
    try {
      setRows(await forgetLocalAccount(id));
      toast.message("Account removed from this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  };

  const onAdd = async () => {
    if (user?.id) {
      try {
        await stashLocalAccount({
          userId: user.id,
          name: user.name || user.handle || user.id,
          avatarUrl: user.avatarUrl,
        });
      } catch {
        /* continue */
      }
    }
    try {
      await beginOAuth("discord");
      toast.message("Continue in your browser to add another account");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start sign-in");
    }
  };

  return (
    <section className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-2">
      <div>
        <h3 className="text-[13px] font-semibold text-text-primary">
          Switch accounts
        </h3>
        <p className="text-[10px] text-text-muted mt-0.5">
          Experimental — stash sessions on this PC and switch without reinstalling.
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const active = row.id === user?.id;
          return (
            <li
              key={row.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-2",
                active ? "bg-primary-base/12" : "hover:bg-white/4",
              )}
            >
              {row.avatar_url ? (
                <img
                  src={row.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <span className="h-7 w-7 rounded-full bg-white/10 grid place-items-center text-[10px]">
                  {(row.name || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-text-primary truncate">
                  {row.name || row.id}
                </p>
                {active ? (
                  <p className="text-[10px] text-primary-base">Active</p>
                ) : null}
              </div>
              {!active ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void onSwitch(row.id)}
                  className="rounded-md border border-white/12 px-2 py-1 text-[10px] cursor-pointer disabled:opacity-40"
                >
                  {busy === row.id ? "…" : "Switch"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy !== null || active}
                onClick={() => void onForget(row.id)}
                className="rounded-md px-2 py-1 text-[10px] text-text-muted hover:text-state-error cursor-pointer disabled:opacity-30"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => void onAdd()}
        className="self-start rounded-lg border border-primary-base/30 px-3 py-1.5 text-[11px] font-semibold text-primary-base cursor-pointer"
      >
        Add account
      </button>
    </section>
  );
}
