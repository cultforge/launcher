import { useGuildModalsStore } from "../../../stores/guildModals";
import { useGuildStore } from "../../../stores/guilds";
import { capabilitiesForRole, membershipForUser } from "../../../lib/guildPermissions";
import { useAppStore } from "../../../userstore";

export function ManageRoster() {
  const guildId = useGuildStore((state) => state.activeGuildId);
  const members = useGuildStore((state) => state.members);
  const invitations = useGuildStore((state) => state.invitations);
  const audit = useGuildStore((state) => state.audit);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const open = useGuildModalsStore((state) => state.open);
  const capabilities = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  );
  const roster = members
    .filter((member) => member.guildId === guildId)
    .sort((a, b) => b.contribution - a.contribution);
  const invites = invitations.filter((item) => item.guildId === guildId);
  const feed = audit.filter((entry) => entry.guildId === guildId).slice(0, 12);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-sora text-[14px] font-bold text-text-primary">
            Roster & audit
          </h3>
          <p className="text-[10px] text-text-muted">
            Invite players, change roles on CultForge, and review recent
            management actions.
          </p>
        </div>
        <div className="flex gap-2">
          {capabilities.inviteMembers && (
            <button
              type="button"
              onClick={() => open("invite")}
              className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer"
            >
              Invite
            </button>
          )}
          {capabilities.transferLeadership && (
            <button
              type="button"
              onClick={() => open("transfer")}
              className="rounded-lg border border-border-subtle px-3 py-2 text-[10px] text-text-secondary cursor-pointer"
            >
              Transfer
            </button>
          )}
        </div>
      </div>

      <section className="cf-panel overflow-hidden rounded-xl">
        <div className="border-b border-border-subtle px-3 py-2 text-[9px] uppercase tracking-wider text-text-muted">
          Members · {roster.length}
        </div>
        <div className="max-h-56 overflow-auto">
          {roster.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-2 border-b border-border-subtle/50 px-3 py-2 last:border-0"
            >
              <div>
                <div className="text-[11px] text-text-primary">{member.name}</div>
                <div className="text-[9px] text-text-muted">
                  {member.role} · {member.status}
                </div>
              </div>
              {capabilities.manageMembers && member.userId !== userId && (
                <button
                  type="button"
                  onClick={() => open("member", member.id)}
                  className="text-[9px] text-primary-base cursor-pointer"
                >
                  Manage
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {invites.length > 0 && (
        <section className="cf-panel rounded-xl p-3">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">
            Pending invites
          </div>
          <ul className="mt-2 space-y-1">
            {invites.map((invite) => (
              <li key={invite.id} className="text-[10px] text-text-secondary">
                {invite.playerName}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cf-panel rounded-xl p-3">
        <div className="text-[9px] uppercase tracking-wider text-text-muted">
          Audit feed
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {feed.length === 0 ? (
            <p className="text-[10px] text-text-muted">No actions logged.</p>
          ) : (
            feed.map((entry) => (
              <div
                key={entry.id}
                className="flex justify-between gap-2 text-[10px]"
              >
                <span className="text-text-secondary">
                  {entry.action}
                  <span className="text-text-muted"> · {entry.target}</span>
                </span>
                <span className="shrink-0 text-text-muted">
                  {new Date(entry.occurredAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
