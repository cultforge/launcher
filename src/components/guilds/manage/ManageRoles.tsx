import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  assignGuildRole,
  createGuildRole,
  fetchGuildPermissionCatalog,
  fetchGuildRoles,
  revokeGuildRole,
  updateGuildRole,
  type GuildPermissionCatalogEntry,
  type GuildRoleRecord,
} from "../../../lib/guildApi";
import { useGuildStore } from "../../../stores/guilds";
import { cn } from "../../../lib/cn";

export function ManageRoles() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const members = useGuildStore((s) => s.members).filter(
    (m) => m.guildId === guildId,
  );

  const [roles, setRoles] = useState<GuildRoleRecord[]>([]);
  const [catalog, setCatalog] = useState<GuildPermissionCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPerms, setDraftPerms] = useState<string[]>([]);
  const [draftRank, setDraftRank] = useState(50);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRoleId, setAssignRoleId] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        fetchGuildRoles(guildId),
        fetchGuildPermissionCatalog().catch(() => [] as GuildPermissionCatalogEntry[]),
      ]);
      setRoles(r);
      setCatalog(c);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [guildId]);

  const groups = useMemo(() => {
    const map = new Map<string, GuildPermissionCatalogEntry[]>();
    for (const entry of catalog) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const knownIds = useMemo(
    () => new Set(catalog.map((c) => c.id)),
    [catalog],
  );

  const startCreate = () => {
    setEditingId("new");
    setDraftName("");
    setDraftPerms([]);
    setDraftRank(50);
  };

  const startEdit = (role: GuildRoleRecord) => {
    setEditingId(role.id);
    setDraftName(role.name);
    setDraftPerms(role.permissions.filter((p) => knownIds.has(p) || !catalog.length));
    setDraftRank(role.rank);
  };

  const togglePerm = (id: string) => {
    if (catalog.length && !knownIds.has(id)) return;
    setDraftPerms((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const saveRole = async () => {
    if (!draftName.trim()) {
      toast.message("Role name required");
      return;
    }
    const perms = catalog.length
      ? draftPerms.filter((p) => knownIds.has(p))
      : draftPerms;
    setBusy(true);
    try {
      if (editingId === "new") {
        await createGuildRole(guildId, {
          name: draftName.trim(),
          permissions: perms,
          rank: draftRank,
        });
        toast.success("Role created");
      } else if (editingId) {
        await updateGuildRole(guildId, editingId, {
          name: draftName.trim(),
          permissions: perms,
          rank: draftRank,
        });
        toast.success("Role updated");
      }
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onAssign = async () => {
    if (!assignUserId || !assignRoleId) return;
    setBusy(true);
    try {
      await assignGuildRole(guildId, assignUserId, assignRoleId);
      toast.success("Role assigned");
      setAssignUserId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (userId: string, roleId: string) => {
    setBusy(true);
    try {
      await revokeGuildRole(guildId, userId, roleId);
      toast.success("Role revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p className="text-[12px] text-text-muted px-1 py-4">Loading roles…</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Roles & permissions
          </h3>
          <p className="text-[10px] text-text-muted">
            Pick permissions from the CultForge catalog only — unknown ids are
            rejected by the API.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
        >
          New role
        </button>
      </div>

      <section className="cf-panel rounded-xl overflow-hidden">
        <div className="border-b border-border-subtle px-3 py-2 text-[9px] uppercase tracking-wider text-text-muted">
          Roles · {roles.length}
        </div>
        <ul className="divide-y divide-border-subtle/50">
          {roles.map((role) => (
            <li
              key={role.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-text-primary truncate">
                  {role.name}
                </div>
                <div className="text-[9px] text-text-muted truncate">
                  rank {role.rank} · {role.permissions.length} perms
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(role)}
                className="text-[10px] text-primary-base cursor-pointer"
              >
                Edit
              </button>
            </li>
          ))}
          {roles.length === 0 ? (
            <li className="px-3 py-4 text-[11px] text-text-muted">
              No custom roles yet.
            </li>
          ) : null}
        </ul>
      </section>

      {editingId ? (
        <section className="cf-panel rounded-xl p-3 flex flex-col gap-3">
          <h4 className="text-[11px] font-semibold text-text-primary">
            {editingId === "new" ? "Create role" : "Edit role"}
          </h4>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              Name
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[12px] text-text-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-text-muted">
              Rank
              <input
                type="number"
                value={draftRank}
                onChange={(e) => setDraftRank(Number(e.target.value) || 0)}
                className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[12px] text-text-primary"
              />
            </label>
          </div>
          {catalog.length === 0 ? (
            <p className="text-[11px] text-text-muted">
              Permission catalog unavailable — save name/rank only, or retry
              later.
            </p>
          ) : (
            <div className="flex flex-col gap-3 max-h-64 overflow-auto">
              {groups.map(([group, entries]) => (
                <div key={group}>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted mb-1">
                    {group}
                  </div>
                  <div className="flex flex-col gap-1">
                    {entries.map((entry) => {
                      const on = draftPerms.includes(entry.id);
                      return (
                        <label
                          key={entry.id}
                          className={cn(
                            "flex items-start gap-2 rounded-lg border px-2 py-1.5 cursor-pointer",
                            on
                              ? "border-primary-base/35 bg-primary-base/8"
                              : "border-white/8",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePerm(entry.id)}
                            className="mt-0.5 accent-primary-base"
                          />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-medium text-text-primary">
                              {entry.id}
                            </span>
                            {entry.description ? (
                              <span className="block text-[9px] text-text-muted">
                                {entry.description}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveRole()}
              className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="cf-panel rounded-xl p-3 flex flex-col gap-2">
        <h4 className="text-[11px] font-semibold text-text-primary">
          Assign / revoke
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={assignUserId}
            onChange={(e) => setAssignUserId(e.target.value)}
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
          >
            <option value="">Member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={assignRoleId}
            onChange={(e) => setAssignRoleId(e.target.value)}
            className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5 text-[11px] text-text-primary"
          >
            <option value="">Role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !assignUserId || !assignRoleId}
            onClick={() => void onAssign()}
            className="cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
          >
            Assign
          </button>
          <button
            type="button"
            disabled={busy || !assignUserId || !assignRoleId}
            onClick={() => void onRevoke(assignUserId, assignRoleId)}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-[10px] text-text-secondary cursor-pointer disabled:opacity-40"
          >
            Revoke
          </button>
        </div>
      </section>
    </div>
  );
}
