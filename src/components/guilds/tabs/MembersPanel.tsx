import { useMemo, useState } from "react";
import { Chip } from "@heroui/react";
import {
  type GuildRole,
  type MemberStatus,
} from "../../../data/guilds";
import { useGuildStore } from "../../../stores/guilds";
import { cn } from "../../../lib/cn";
import { friendByName } from "../../../data/friends";
import { useProfileRouteStore } from "../../../stores/profileRoute";
import { useAppStore } from "../../../userstore";
import {
  canManageMember,
  membershipForUser,
} from "../../../lib/guildPermissions";
import { useGuildModalsStore } from "../../../stores/guildModals";

const ROLES: Array<GuildRole | "All"> = ["All", "Leader", "Officer", "Member"];

function statusDot(status: MemberStatus) {
  if (status === "online") return "bg-primary-base";
  if (status === "idle") return "bg-state-warning";
  return "bg-text-disabled";
}

export function MembersPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const members = useGuildStore((s) => s.members);
  const userId = useAppStore((s) => s.currentUser?.id ?? "");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<GuildRole | "All">("All");
  const openProfile = useProfileRouteStore((s) => s.openFriend);
  const openModal = useGuildModalsStore((s) => s.open);
  const actor = membershipForUser(members, guildId, userId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (m.guildId !== guildId) return false;
      if (role !== "All" && m.role !== role) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [guildId, members, search, role]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-lg text-[12px] bg-black/30 border border-white/10 text-text-primary placeholder:text-text-disabled outline-none focus:border-primary-base/40"
        />
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-semibold rounded-lg border cursor-pointer",
                role === r
                  ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                  : "border-white/8 text-text-muted hover:text-text-primary",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="cf-panel rounded-xl p-1.5 flex flex-col gap-0.5">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-text-muted">
            No members match
          </div>
        ) : (
          filtered.map((m) => {
            const profile = friendByName(m.name);
            return (
            <div
              key={m.id}
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-bg-elevated"
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  statusDot(m.status),
                )}
              />
              {profile ? (
                <button
                  type="button"
                  onClick={() => openProfile(profile.id)}
                  className="flex-1 truncate text-left text-[13px] font-medium text-text-primary hover:text-primary-base cursor-pointer"
                >
                  {m.name}
                </button>
              ) : (
                <span className="flex-1 truncate text-[13px] font-medium text-text-primary">
                  {m.name}
                </span>
              )}
              <Chip size="sm" variant="soft" color="default">
                <Chip.Label className="text-[9px]">{m.role}</Chip.Label>
              </Chip>
              <span className="text-[11px] text-text-muted tabular-nums w-14 text-right">
                {m.contribution.toLocaleString()}
              </span>
              {canManageMember(actor, m) && (
                <button
                  type="button"
                  onClick={() => openModal("member", m.id)}
                  className="rounded-md border border-border-subtle px-2 py-1 text-[8px] font-semibold text-text-muted hover:text-text-primary cursor-pointer"
                >
                  Manage
                </button>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
