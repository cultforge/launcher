import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AdminClient,
  extractAdminRows,
  isAdminCapabilityError,
} from "../../../lib/adminClient";
import { useAdminSessionStore } from "../../../stores/adminSession";
import {
  OpsButton,
  OpsConfirmDialog,
  OpsError,
  OpsInput,
  OpsPageHeader,
  OpsTable,
  OpsToolbar,
  type OpsColumn,
} from "../ui/ops";
import { formatRelativeTime } from "../../../lib/adminFormatters";

type InviteRow = Record<string, unknown> & { id: string; code: string };

export function InvitesView() {
  const capabilityActive = useAdminSessionStore((s) => s.capabilityActive);
  const handleUnauthorized = useAdminSessionStore(
    (s) => s.handleCapabilityUnauthorized,
  );
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revokeCode, setRevokeCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await AdminClient.listInvites({ q, limit: 100 });
      setRows(
        extractAdminRows(raw).map((r) => {
          const code = String(r.code ?? r.invite_code ?? r.id ?? "");
          return { ...r, id: code, code } as InviteRow;
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invites");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: OpsColumn<InviteRow>[] = [
    {
      key: "code",
      header: "Code",
      render: (r) => (
        <span className="font-mono text-[11px] text-text-primary">{r.code}</span>
      ),
    },
    {
      key: "guild",
      header: "Guild",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.guild_id ?? r.guild ?? "—")}
        </span>
      ),
    },
    {
      key: "uses",
      header: "Uses",
      render: (r) => {
        const used = Number(r.uses ?? r.use_count ?? r.used ?? 0);
        const max = r.max_uses ?? r.maxUses;
        const rem = r.remaining;
        if (max != null && max !== "") return `${used} / ${max}`;
        if (rem != null && rem !== "") return `${used} used · ${rem} left`;
        return String(used || "—");
      },
    },
    {
      key: "expires",
      header: "Expires",
      render: (r) => (
        <span className="text-[11px] text-text-muted">
          {formatRelativeTime(r.expires_at ?? r.expires) || "—"}
        </span>
      ),
    },
    {
      key: "by",
      header: "Created by",
      render: (r) => (
        <span className="font-mono text-[10px]">
          {String(r.created_by ?? r.creator_id ?? r.owner_id ?? "—")}
        </span>
      ),
    },
    {
      key: "act",
      header: "",
      className: "w-24 text-right",
      render: (r) => (
        <OpsButton
          variant="danger"
          disabled={!capabilityActive}
          onClick={(e) => {
            e.stopPropagation();
            setRevokeCode(r.code);
          }}
        >
          Revoke
        </OpsButton>
      ),
    },
  ];

  return (
    <div>
      <OpsPageHeader
        title="Invites"
        subtitle="List invite codes and revoke by code. Destructive actions need step-up."
      />
      <OpsToolbar>
        <OpsInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search invites"
          className="w-52"
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <OpsButton variant="primary" onClick={() => void load()}>
          Search
        </OpsButton>
      </OpsToolbar>
      {error ? <OpsError message={error} onRetry={() => void load()} /> : null}
      <OpsTable columns={columns} rows={rows.filter((r) => r.code)} empty="No invites" />
      <OpsConfirmDialog
        open={Boolean(revokeCode)}
        title="Revoke invite"
        body={`Revoke invite code ${revokeCode ?? ""}. This cannot be undone.`}
        confirmText="revoke"
        danger
        busy={busy}
        onCancel={() => setRevokeCode(null)}
        onConfirm={async () => {
          if (!revokeCode || !capabilityActive) return;
          setBusy(true);
          try {
            await AdminClient.revokeInvite(revokeCode);
            toast.success("Invite revoked");
            setRevokeCode(null);
            await load();
          } catch (err) {
            if (isAdminCapabilityError(err)) handleUnauthorized();
            toast.error(err instanceof Error ? err.message : "Failed");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
