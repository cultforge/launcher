import { OpsButton, OpsPageHeader, OpsStatusPill } from "../ui/ops";
import { useAdminSessionStore } from "../../../stores/adminSession";
import { AdminClient } from "../../../lib/adminClient";
import { useEffect, useState } from "react";

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
      ? { state: "ok" as const, label: "active" }
      : badgeState === "relogin"
        ? { state: "err" as const, label: "re-login" }
        : badgeState === "expired"
          ? { state: "warn" as const, label: "expired" }
          : { state: "warn" as const, label: "needs step-up" };

  return (
    <div>
      <OpsPageHeader
        title="Session"
        subtitle="Whoami and capability state. Catalog is discovery fallback only — not primary IA."
        actions={
          <div className="flex gap-2">
            <OpsButton onClick={() => void refreshWhoami()}>Refresh whoami</OpsButton>
            <OpsButton onClick={() => void loadCatalog()}>Refresh catalog</OpsButton>
          </div>
        }
      />
      <div className="space-y-3 max-w-xl text-[12px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-muted">Capability</span>
          <OpsStatusPill state={badge.state} label={badge.label} />
          <span className="font-mono text-[10px] text-text-disabled">
            {capabilityActive && capabilityExpiresAt
              ? `expires ${new Date(capabilityExpiresAt).toISOString()}`
              : "—"}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Handle </span>
          <span className="font-mono text-text-primary">{handle || "—"}</span>
        </div>
        <div>
          <span className="text-text-muted">Session fresh </span>
          <span className="font-mono">
            {sessionFreshEnough == null ? "—" : String(sessionFreshEnough)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Catalog entries </span>
          <span className="font-mono">{catalogCount}</span>
        </div>
        {whoami ? (
          <pre className="overflow-auto rounded-md border border-white/10 bg-black/40 p-3 text-[10px] font-mono text-text-secondary max-h-80">
            {JSON.stringify(
              {
                admin: whoami.admin,
                handle: whoami.handle ?? whoami.username,
                user_id: whoami.user_id ?? whoami.id,
                roles: whoami.roles,
                // never dump tokens
              },
              null,
              2,
            )}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
