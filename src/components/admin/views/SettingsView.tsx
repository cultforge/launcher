import { OpsButton, OpsPageHeader, OpsStatusPill } from "../ui/ops";
import { OpsJsonBlock } from "../ui/OpsJsonBlock";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { AdminClient } from "../../../lib/adminClient";
import { useEffect, useState } from "react";
import { formatRelativeTime } from "../../../lib/adminFormatters";
import { CopyButton } from "../../CopyButton";

function asRec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** Session / whoami — under Developer collapsed nav as Settings. */
export function SettingsView() {
  const badgeState = useAdminSessionStore((s) => s.badgeState);
  const handle = useAdminSessionStore((s) => s.handle);
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const capabilityExpiresAt = useAdminSessionStore((s) => s.capabilityExpiresAt);
  const sessionFreshEnough = useAdminSessionStore(
    (s) => s.stepUpHints?.sessionFreshEnough ?? null,
  );
  const refreshWhoami = useAdminSessionStore((s) => s.refreshWhoami);
  const loadCatalog = useAdminSessionStore((s) => s.loadCatalog);
  const catalogCount = useAdminSessionStore((s) => s.catalog?.length ?? 0);

  const [whoami, setWhoami] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { whoami: w } = await AdminClient.whoami();
        setWhoami(asRec(w) ?? (w as unknown as Record<string, unknown>));
      } catch {
        setWhoami(null);
      }
    })();
  }, []);

  const badge =
    badgeState === "active"
      ? { state: "ok" as const, label: "Step-up active" }
      : badgeState === "relogin"
        ? { state: "err" as const, label: "Re-login required" }
        : badgeState === "expired"
          ? { state: "warn" as const, label: "Step-up expired" }
          : { state: "warn" as const, label: "Needs step-up" };

  const roles = Array.isArray(whoami?.roles)
    ? whoami.roles.map(String)
    : [];
  const userId = String(whoami?.user_id ?? whoami?.id ?? "");
  const display =
    String(whoami?.handle ?? whoami?.username ?? handle ?? "Staff") || "Staff";

  const expiresLabel =
    capabilityActive && capabilityExpiresAt
      ? formatRelativeTime(new Date(capabilityExpiresAt).toISOString()) ||
        new Date(capabilityExpiresAt).toLocaleString()
      : "Not elevated";

  return (
    <div>
      <OpsPageHeader
        title="Session"
        subtitle="Your staff identity and elevated capability for destructive actions."
        actions={
          <div className="flex gap-2">
            <OpsButton onClick={() => void refreshWhoami()}>
              Refresh session
            </OpsButton>
            <OpsButton onClick={() => void loadCatalog()}>
              Refresh catalog
            </OpsButton>
          </div>
        }
      />
      <div className="grid gap-3 max-w-2xl sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-text-disabled">
            Signed in as
          </div>
          <div className="font-sora text-[16px] font-bold text-text-primary">
            {display}
          </div>
          {userId ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-text-muted">
                {userId}
              </span>
              <CopyButton text={userId} iconOnly title="Copy user id" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1 pt-1">
            {roles.length ? (
              roles.map((role) => (
                <span
                  key={role}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-text-secondary"
                >
                  {role}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-text-muted">
                {whoami?.admin ? "Platform admin" : "Staff"}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-text-disabled">
              Capability
            </span>
            <OpsStatusPill state={badge.state} label={badge.label} />
          </div>
          <div className="text-[12px] text-text-secondary">
            Expires:{" "}
            <span className="text-text-primary">{expiresLabel}</span>
          </div>
          <div className="text-[12px] text-text-secondary">
            Session freshness:{" "}
            <span className="text-text-primary">
              {sessionFreshEnough == null
                ? "Unknown"
                : sessionFreshEnough
                  ? "Fresh enough for step-up"
                  : "Too old — sign in again"}
            </span>
          </div>
          <div className="text-[12px] text-text-secondary">
            Discovery catalog:{" "}
            <span className="text-text-primary">{catalogCount} routes</span>
          </div>
        </div>
      </div>
      <div className="mt-4 max-w-2xl">
        <OpsJsonBlock
          value={
            whoami
              ? {
                  admin: whoami.admin,
                  handle: whoami.handle ?? whoami.username,
                  user_id: whoami.user_id ?? whoami.id,
                  roles: whoami.roles,
                }
              : null
          }
          title="whoami (no tokens)"
        />
      </div>
    </div>
  );
}
