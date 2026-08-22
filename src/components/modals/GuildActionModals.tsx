import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  EventType,
  GuildEvent,
  GuildNewsItem,
  GuildServer,
  LeaderboardRow,
  RankingMetric,
} from "../../data/guilds";
import { useGuildModalsStore } from "../../stores/guildModals";
import {
  useGuildStore,
  type GuildActionResult,
} from "../../stores/guilds";
import { cn } from "../../lib/cn";
import { GuildModalShell } from "../guilds/GuildModalShell";
import {
  guildDangerBtnClass,
  guildFieldClass,
  guildHintClass,
  guildLabelClass,
  guildPrimaryBtnClass,
  guildSectionClass,
  guildTextareaClass,
} from "../guilds/guildFormStyles";
import { useAppStore } from "../../userstore";
import {
  capabilitiesForRole,
  membershipForUser,
} from "../../lib/guildPermissions";
import {
  combineLocalDateTime,
  toLocalDateValue,
  toLocalTimeValue,
} from "../../lib/datetimeFields";
import { GuildBuildEditorScreen } from "../guilds/manage/GuildBuildEditorScreen";
import {
  BuildImageField,
  emptyBuildImageDraft,
  type BuildImageDraft,
} from "../guilds/manage/BuildImageField";
import { CfSelect } from "../ui/CfSelect";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

const fieldClass = guildFieldClass;
const labelClass = guildLabelClass;

export function GuildActionModals() {
  const modal = useGuildModalsStore((state) => state.modal);
  const targetId = useGuildModalsStore((state) => state.targetId);
  const close = useGuildModalsStore((state) => state.close);
  const guildId = useGuildStore((state) => state.activeGuildId);
  const userId = useAppStore((state) => state.currentUser?.id ?? "");
  const members = useGuildStore((state) => state.members);
  const events = useGuildStore((state) => state.events);
  const news = useGuildStore((state) => state.news);
  const servers = useGuildStore((state) => state.servers);
  const rankings = useGuildStore((state) => state.rankings);
  const buildReleases = useGuildStore((state) => state.buildReleases);
  const rankingMetric = useGuildStore((state) => state.rankingMetric);
  const inviteMember = useGuildStore((state) => state.inviteMember);
  const setMemberRole = useGuildStore((state) => state.setMemberRole);
  const removeMember = useGuildStore((state) => state.removeMember);
  const saveEvent = useGuildStore((state) => state.saveEvent);
  const cancelEvent = useGuildStore((state) => state.cancelEvent);
  const saveNews = useGuildStore((state) => state.saveNews);
  const deleteNews = useGuildStore((state) => state.deleteNews);
  const saveServer = useGuildStore((state) => state.saveServer);
  const deleteServer = useGuildStore((state) => state.deleteServer);
  const saveRankingRow = useGuildStore((state) => state.saveRankingRow);
  const deleteRankingRow = useGuildStore((state) => state.deleteRankingRow);
  const leaveGuild = useGuildStore((state) => state.leaveGuild);
  const transferLeadership = useGuildStore(
    (state) => state.transferLeadership,
  );
  const targetMember = members.find((member) => member.id === targetId);
  const targetEvent = events.find((event) => event.id === targetId);
  const targetNews = news.find((item) => item.id === targetId);
  const targetServer = servers.find((server) => server.id === targetId);
  const targetBuild = buildReleases.find((release) => release.id === targetId);
  const targetRanking = rankings.find(
    (row) =>
      row.guildId === guildId &&
      row.metric === rankingMetric &&
      row.name === targetId,
  );
  const guildMembers = members.filter((member) => member.guildId === guildId);
  const capabilities = capabilitiesForRole(
    membershipForUser(members, guildId, userId)?.role,
  );

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventType, setEventType] = useState<EventType>("social");
  const [customType, setCustomType] = useState("");
  const [startDate, setStartDate] = useState(toLocalDateValue());
  const [startTime, setStartTime] = useState(toLocalTimeValue());
  const [endDate, setEndDate] = useState(
    toLocalDateValue(new Date(Date.now() + 2 * 60 * 60_000).toISOString()),
  );
  const [endTime, setEndTime] = useState(
    toLocalTimeValue(new Date(Date.now() + 2 * 60 * 60_000).toISOString()),
  );
  const [pinned, setPinned] = useState(false);
  const [tagline, setTagline] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [linksDraft, setLinksDraft] = useState("");
  const [location, setLocation] = useState("");
  const [bodyFormat, setBodyFormat] = useState<"plain" | "markdown">(
    "markdown",
  );
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [successorId, setSuccessorId] = useState("");
  const [address, setAddress] = useState("");
  const [region, setRegion] = useState("NA");
  const [status, setStatus] = useState<GuildServer["status"]>("online");
  const [tags, setTags] = useState("");
  const [requiredBuildId, setRequiredBuildId] = useState("");
  const [requiredBuildVersion, setRequiredBuildVersion] = useState("");
  const [serverIcon, setServerIcon] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [serverCover, setServerCover] = useState<BuildImageDraft>(() =>
    emptyBuildImageDraft(),
  );
  const [score, setScore] = useState("");
  const [rank, setRank] = useState("1");
  const [metric, setMetric] = useState<RankingMetric>("xp");
  const [originalRankingName, setOriginalRankingName] = useState("");
  const minecraft = "1.20.1";

  useEffect(() => {
    setName(
      targetServer?.name ??
        targetRanking?.name ??
        targetBuild?.name ??
        "",
    );
    setTitle(targetEvent?.title ?? targetNews?.title ?? "");
    setBody(targetNews?.body ?? targetEvent?.body ?? "");
    setTagline(targetNews?.tagline ?? targetEvent?.tagline ?? "");
    setCoverUrl(targetNews?.coverUrl ?? targetEvent?.coverUrl ?? "");
    setLinksDraft(
      (targetNews?.links ?? targetEvent?.links ?? [])
        .map((link) => `${link.label}|${link.href}`)
        .join("\n"),
    );
    setLocation(targetEvent?.location ?? "");
    setBodyFormat(
      targetNews?.bodyFormat ?? targetEvent?.bodyFormat ?? "markdown",
    );
    setEventType(targetEvent?.type ?? "social");
    setCustomType(targetEvent?.customType ?? "");
    setStartDate(toLocalDateValue(targetEvent?.startsAt));
    setStartTime(toLocalTimeValue(targetEvent?.startsAt));
    setEndDate(
      toLocalDateValue(
        targetEvent?.endsAt ??
          new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      ),
    );
    setEndTime(
      toLocalTimeValue(
        targetEvent?.endsAt ??
          new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      ),
    );
    setPinned(Boolean(targetNews?.pinned));
    setConfirmed(false);
    setSaving(false);
    setSuccessorId("");
    setAddress(targetServer?.address ?? "");
    setRegion(targetServer?.region ?? "NA");
    setStatus(targetServer?.status ?? "online");
    setTags(targetServer?.tags.join(", ") ?? "");
    setRequiredBuildId(targetServer?.requiredBuildId ?? "");
    setRequiredBuildVersion(targetServer?.requiredBuildVersion ?? "");
    setServerIcon(
      emptyBuildImageDraft(
        targetServer?.iconUrl && isHttpUrl(targetServer.iconUrl)
          ? targetServer.iconUrl
          : "",
      ),
    );
    setServerCover(
      emptyBuildImageDraft(
        (targetServer?.coverUrl && isHttpUrl(targetServer.coverUrl)
          ? targetServer.coverUrl
          : null) ||
          (targetServer?.thumbnail && isHttpUrl(targetServer.thumbnail)
            ? targetServer.thumbnail
            : "") ||
          "",
      ),
    );
    setScore(targetRanking?.score ?? "");
    setRank(String(targetRanking?.rank ?? 1));
    setMetric(targetRanking?.metric ?? rankingMetric);
    setOriginalRankingName(targetRanking?.name ?? "");
  }, [
    modal,
    targetId,
    targetEvent,
    targetNews,
    targetServer,
    targetRanking,
    targetBuild,
    rankingMetric,
    guildId,
    servers,
  ]);

  const heading = useMemo(() => {
    if (modal === "invite") return "Invite player";
    if (modal === "member") return `Manage ${targetMember?.name ?? "member"}`;
    if (modal === "event") return targetEvent ? "Edit event" : "Create event";
    if (modal === "announcement")
      return targetNews ? "Edit announcement" : "Post announcement";
    if (modal === "server") return targetServer ? "Edit server" : "Add server";
    if (modal === "ranking")
      return targetRanking ? "Edit ranking row" : "Add ranking row";
    if (modal === "build")
      return targetBuild ? "Edit build release" : "Add build release";
    if (modal === "leave") return "Leave Guild";
    if (modal === "transfer") return "Transfer leadership";
    return "Guild management";
  }, [
    modal,
    targetEvent,
    targetMember,
    targetNews,
    targetServer,
    targetRanking,
    targetBuild,
  ]);

  const subtitle = useMemo(() => {
    if (modal === "invite")
      return "Create a link on invite.cultforge.com — optional username for a curated invite.";
    if (modal === "member")
      return "Update roles or remove someone from the guild roster.";
    if (modal === "event")
      return "Plan something for your crew. Markdown and cultforge:// links are supported.";
    if (modal === "announcement")
      return "Post news to the guild board for everyone to see.";
    if (modal === "server")
      return "Add a world your guild can play on together.";
    if (modal === "ranking")
      return "Track who is leading on the trophy wall.";
    if (modal === "leave")
      return "You will lose access to this guild's chat, builds, and events.";
    if (modal === "transfer")
      return "Hand leadership to another member before you step back.";
    return undefined;
  }, [modal]);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    setInviteUrl(null);
    setInviteBusy(false);
  }, [modal]);

  const finish = async (
    result:
      | GuildActionResult
      | Promise<GuildActionResult>
      | (GuildActionResult & { inviteUrl?: string })
      | Promise<GuildActionResult & { inviteUrl?: string }>,
  ) => {
    const resolved = await Promise.resolve(result);
    if (resolved.ok) {
      toast.success(resolved.message);
      if ("inviteUrl" in resolved && resolved.inviteUrl) {
        setInviteUrl(resolved.inviteUrl);
        return;
      }
      close();
    } else {
      toast.error(resolved.message);
    }
  };

  const parseLinksDraft = () =>
    linksDraft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, ...rest] = line.split("|");
        const href = rest.join("|").trim();
        return { label: (label || "").trim(), href };
      })
      .filter((link) => link.label && link.href);

  return (
    <>
      <GuildBuildEditorScreen
        open={modal === "build"}
        title={heading}
        guildId={guildId}
        targetBuild={targetBuild}
        onClose={close}
        onFinish={finish}
      />

      <GuildModalShell
        open={modal !== null && modal !== "build"}
        title={heading}
        subtitle={subtitle}
        onClose={close}
        confirmClose
        confirmCloseMessage="Close this dialog? Unsaved edits will be lost."
        size={modal === "event" || modal === "announcement" || modal === "server" ? "wide" : "default"}
      >
      <div className="flex flex-col gap-4">
        {modal === "invite" && (
          <>
            <p className="text-[11px] text-text-muted">
              Creates a real invite on{" "}
              <span className="text-text-secondary">invite.cultforge.com</span>.
              Leave blank for a public link, or enter an exact CultForge
              username / user id for a curated invite.
            </p>
            <label className="text-[9px] uppercase tracking-wider text-text-muted">
              CultForge username or user id (optional)
            </label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              placeholder="GliTCH or cf_…"
            />
            {inviteUrl ? (
              <div className="rounded-lg border border-primary-base/25 bg-primary-base/8 px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-wider text-text-muted">
                  Invite link
                </div>
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block break-all text-[12px] text-primary-base"
                >
                  {inviteUrl}
                </a>
                <button
                  type="button"
                  className="mt-2 text-[10px] font-semibold text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteUrl);
                    toast.success("Invite link copied");
                  }}
                >
                  Copy link
                </button>
              </div>
            ) : null}
            <button
              type="button"
              disabled={inviteBusy}
              onClick={() => {
                setInviteBusy(true);
                void inviteMember(guildId, name)
                  .then(finish)
                  .finally(() => setInviteBusy(false));
              }}
              className={guildPrimaryBtnClass}
            >
              {inviteBusy ? "Creating…" : "Create invite"}
            </button>
          </>
        )}

        {modal === "member" && targetMember && (
          <>
            <p className="text-[11px] text-text-muted">
              Role changes persist on CultForge. Removal uses the live kick
              endpoint when available.
            </p>
            <div className="rounded-xl border border-border-subtle bg-black/15 p-3">
              <div className="text-[12px] font-semibold text-text-primary">
                {targetMember.name}
              </div>
              <div className="mt-1 text-[9px] text-text-muted">
                Current role: {targetMember.role}
              </div>
            </div>
            {capabilities.changeRoles && (
              <div className="flex gap-2">
                {(["Officer", "Member"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSaving(true);
                      void finish(
                        setMemberRole(guildId, targetMember.id, role),
                      ).finally(() => setSaving(false));
                    }}
                    className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-[10px] text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-50"
                  >
                    Set {role}
                  </button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-[9px] text-text-muted">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm removal from the roster
            </label>
            <button
              type="button"
              disabled={!confirmed || saving}
              onClick={() => {
                setSaving(true);
                void finish(removeMember(guildId, targetMember.id)).finally(
                  () => setSaving(false),
                );
              }}
              className={guildDangerBtnClass}
            >
              {saving ? "Removing…" : "Remove member"}
            </button>
          </>
        )}

        {modal === "event" && (
          <>
            <p className="text-[11px] text-text-muted">
              Saved to CultForge. Markdown + cultforge:// deep links supported.
            </p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
              placeholder="Event title"
            />
            <input
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              className={fieldClass}
              placeholder="Tagline (optional)"
            />
            <div className="grid grid-cols-2 gap-2">
              <CfSelect
                value={eventType}
                onChange={(value) => setEventType(value as EventType)}
                options={[
                  { value: "raid", label: "Raid" },
                  { value: "contest", label: "Contest" },
                  { value: "drive", label: "Resource drive" },
                  { value: "social", label: "Social" },
                  { value: "custom", label: "Custom" },
                ]}
                aria-label="Event type"
              />
              <CfSelect
                value={bodyFormat}
                onChange={(value) =>
                  setBodyFormat(value as "plain" | "markdown")
                }
                options={[
                  { value: "markdown", label: "Markdown" },
                  { value: "plain", label: "Plain" },
                ]}
                aria-label="Body format"
              />
            </div>
            {eventType === "custom" && (
              <input
                value={customType}
                onChange={(event) => setCustomType(event.target.value)}
                className={fieldClass}
                placeholder="Custom type label"
              />
            )}
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={fieldClass}
              placeholder="Location (optional)"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={`${guildTextareaClass} min-h-28`}
              placeholder="Description (markdown OK)"
            />
            <input
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              className={fieldClass}
              placeholder="Cover image URL (optional)"
            />
            <textarea
              value={linksDraft}
              onChange={(event) => setLinksDraft(event.target.value)}
              className={`${guildTextareaClass} min-h-16`}
              placeholder="Links — one per line: Label|href"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Starts</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className={fieldClass}
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Ends</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    className={fieldClass}
                  />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!title.trim()) {
                  toast.error("Add an event title.");
                  return;
                }
                if (eventType === "custom" && !customType.trim()) {
                  toast.error("Enter a custom event type.");
                  return;
                }
                const startsIso = combineLocalDateTime(startDate, startTime);
                const endsIso = combineLocalDateTime(endDate, endTime);
                if (!startsIso || !endsIso) {
                  toast.error("Complete the event schedule.");
                  return;
                }
                if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
                  toast.error("End time must be after the start.");
                  return;
                }
                const item: GuildEvent = {
                  id: targetEvent?.id ?? `event-${Date.now()}`,
                  guildId,
                  title: title.trim(),
                  tagline: tagline.trim() || null,
                  body: body.trim() || null,
                  bodyFormat,
                  location: location.trim() || null,
                  coverUrl: coverUrl.trim() || null,
                  links: parseLinksDraft(),
                  type: eventType,
                  customType:
                    eventType === "custom" ? customType.trim() : undefined,
                  startsAt: startsIso,
                  endsAt: endsIso,
                  isPublished: true,
                };
                setSaving(true);
                void finish(saveEvent(item)).finally(() => setSaving(false));
              }}
              className={guildPrimaryBtnClass}
            >
              {saving ? "Saving…" : "Save event"}
            </button>
            {targetEvent && (
              <>
                <label className="flex items-center gap-2 text-[10px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirm event cancellation
                </label>
                <button
                  type="button"
                  disabled={!confirmed || saving}
                  onClick={() => {
                    setSaving(true);
                    void finish(cancelEvent(guildId, targetEvent.id)).finally(
                      () => setSaving(false),
                    );
                  }}
                  className={cn(guildDangerBtnClass, "disabled:opacity-35")}
                >
                  Cancel event
                </button>
              </>
            )}
          </>
        )}

        {modal === "announcement" && (
          <>
            <p className="text-[11px] text-text-muted">
              Saved to CultForge. Markdown + cultforge:// deep links supported.
            </p>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass}
              placeholder="Announcement title"
            />
            <input
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              className={fieldClass}
              placeholder="Tagline (optional)"
            />
            <CfSelect
              value={bodyFormat}
              onChange={(value) =>
                setBodyFormat(value as "plain" | "markdown")
              }
              options={[
                { value: "markdown", label: "Markdown" },
                { value: "plain", label: "Plain" },
              ]}
              aria-label="Body format"
            />
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={`${guildTextareaClass} min-h-32`}
              placeholder="Write the announcement… (markdown OK)"
            />
            <input
              value={coverUrl}
              onChange={(event) => setCoverUrl(event.target.value)}
              className={fieldClass}
              placeholder="Cover image URL (optional)"
            />
            <textarea
              value={linksDraft}
              onChange={(event) => setLinksDraft(event.target.value)}
              className={`${guildTextareaClass} min-h-16`}
              placeholder="Links — one per line: Label|href"
            />
            <label className="flex items-center gap-2 text-[10px] text-text-muted">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(event) => setPinned(event.target.checked)}
              />
              Pin this announcement (local only)
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!title.trim() || !body.trim()) {
                  toast.error("Add a title and message.");
                  return;
                }
                const item: GuildNewsItem = {
                  id: targetNews?.id ?? `news-${Date.now()}`,
                  guildId,
                  title: title.trim(),
                  tagline: tagline.trim() || null,
                  body: body.trim(),
                  bodyFormat,
                  coverUrl: coverUrl.trim() || null,
                  links: parseLinksDraft(),
                  when: "Just now",
                  pinned,
                  isPublished: true,
                };
                setSaving(true);
                void finish(saveNews(item)).finally(() => setSaving(false));
              }}
              className={guildPrimaryBtnClass}
            >
              {saving ? "Saving…" : "Save announcement"}
            </button>
            {targetNews && (
              <>
                <label className="flex items-center gap-2 text-[9px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirm announcement deletion
                </label>
                <button
                  type="button"
                  disabled={!confirmed || saving}
                  onClick={() => {
                    setSaving(true);
                    void finish(deleteNews(guildId, targetNews.id)).finally(
                      () => setSaving(false),
                    );
                  }}
                  className={guildDangerBtnClass}
                >
                  Delete announcement
                </button>
              </>
            )}
          </>
        )}

        {modal === "server" && (
          <>
            <p className="text-[11px] text-text-muted">
              Saved to CultForge. Address, required build, and status persist.
            </p>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              placeholder="Server name"
            />
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={fieldClass}
              placeholder="play.example.com"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className={fieldClass}
                placeholder="Region"
              />
              <CfSelect
                value={status}
                onChange={(value) =>
                  setStatus(value as GuildServer["status"])
                }
                options={[
                  { value: "online", label: "Online" },
                  { value: "maintenance", label: "Maintenance" },
                  { value: "offline", label: "Offline" },
                ]}
                aria-label="Server status"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CfSelect
                value={requiredBuildId}
                onChange={(id) => {
                  setRequiredBuildId(id);
                  const release = buildReleases.find((b) => b.id === id);
                  if (release) setRequiredBuildVersion(release.version);
                }}
                options={[
                  { value: "", label: "Required build (catalog)…" },
                  ...buildReleases
                    .filter((b) => b.guildId === guildId)
                    .map((b) => ({
                      value: b.id,
                      label: `${b.name} · v${b.version}`,
                    })),
                ]}
                aria-label="Required build"
              />
              <input
                value={requiredBuildVersion}
                onChange={(event) =>
                  setRequiredBuildVersion(event.target.value)
                }
                className={fieldClass}
                placeholder="Required version"
              />
            </div>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className={fieldClass}
              placeholder="Tags (comma separated)"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BuildImageField
                kind="icon"
                label="Server icon"
                value={serverIcon}
                onChange={setServerIcon}
                existingHint={targetServer?.iconUrl ?? null}
                stagedHint="File staged — uploads when you save the server."
              />
              <BuildImageField
                kind="cover"
                label="Cover image"
                value={serverCover}
                onChange={setServerCover}
                existingHint={targetServer?.coverUrl ?? targetServer?.thumbnail ?? null}
                stagedHint="File staged — uploads when you save the server."
              />
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!name.trim() || !address.trim()) {
                  toast.error("Enter a server name and address.");
                  return;
                }
                const iconUrlOut = serverIcon.upload
                  ? null
                  : serverIcon.url.trim() || targetServer?.iconUrl || null;
                const coverUrlOut = serverCover.upload
                  ? null
                  : serverCover.url.trim() ||
                    targetServer?.coverUrl ||
                    (targetServer?.thumbnail?.startsWith("http")
                      ? targetServer.thumbnail
                      : null) ||
                    null;
                const item: GuildServer = {
                  id: targetServer?.id ?? `srv-${Date.now()}`,
                  guildId,
                  name: name.trim(),
                  address: address.trim(),
                  playersOnline: targetServer?.playersOnline ?? 0,
                  playersMax: targetServer?.playersMax ?? 100,
                  pingMs: targetServer?.pingMs ?? 40,
                  version: targetServer?.version ?? (minecraft || "1.20.1"),
                  region: region.trim() || "NA",
                  description: targetServer?.description ?? "",
                  thumbnail:
                    serverCover.preview ||
                    coverUrlOut ||
                    serverIcon.preview ||
                    iconUrlOut ||
                    targetServer?.thumbnail ||
                    "",
                  iconUrl: iconUrlOut,
                  coverUrl: coverUrlOut,
                  tags: tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                  loader: targetServer?.loader ?? "Forge",
                  status,
                  requiredBuildId: requiredBuildId.trim(),
                  requiredBuildVersion: requiredBuildVersion.trim(),
                };
                setSaving(true);
                void finish(
                  saveServer(item, {
                    iconUpload: serverIcon.upload,
                    coverUpload: serverCover.upload,
                  }),
                ).finally(() => setSaving(false));
              }}
              className={guildPrimaryBtnClass}
            >
              {saving ? "Saving…" : "Save server"}
            </button>
            {targetServer && (
              <>
                <label className="flex items-center gap-2 text-[9px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirm server deletion
                </label>
                <button
                  type="button"
                  disabled={!confirmed || saving}
                  onClick={() => {
                    setSaving(true);
                    void finish(
                      deleteServer(guildId, targetServer.id),
                    ).finally(() => setSaving(false));
                  }}
                  className={guildDangerBtnClass}
                >
                  {saving ? "Deleting…" : "Delete server"}
                </button>
              </>
            )}
          </>
        )}

        {modal === "ranking" && (
          <>
            <CfSelect
              value={metric}
              onChange={(value) => setMetric(value as RankingMetric)}
              options={[
                { value: "xp", label: "XP" },
                { value: "kills", label: "Kills" },
                { value: "playtime", label: "Playtime" },
              ]}
              disabled={Boolean(targetRanking)}
              aria-label="Ranking metric"
            />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              placeholder="Player name"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={score}
                onChange={(event) => setScore(event.target.value)}
                className={fieldClass}
                placeholder="Score"
              />
              <input
                type="number"
                min={1}
                value={rank}
                onChange={(event) => setRank(event.target.value)}
                className={fieldClass}
                placeholder="Rank"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!name.trim() || !score.trim()) {
                  toast.error("Enter a player name and score.");
                  return;
                }
                const parsedRank = Number(rank);
                const item: LeaderboardRow = {
                  guildId,
                  metric,
                  name: name.trim(),
                  score: score.trim(),
                  rank: Number.isFinite(parsedRank) && parsedRank > 0
                    ? Math.floor(parsedRank)
                    : 1,
                };
                if (
                  originalRankingName &&
                  originalRankingName !== item.name
                ) {
                  const removed = deleteRankingRow(
                    guildId,
                    metric,
                    originalRankingName,
                  );
                  if (!removed.ok) {
                    finish(removed);
                    return;
                  }
                }
                finish(saveRankingRow(item));
              }}
              className={guildPrimaryBtnClass}
            >
              Save ranking
            </button>
            {targetRanking && (
              <>
                <label className="flex items-center gap-2 text-[9px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  Confirm ranking row deletion
                </label>
                <button
                  type="button"
                  disabled={!confirmed}
                  onClick={() =>
                    finish(
                      deleteRankingRow(
                        guildId,
                        targetRanking.metric,
                        targetRanking.name,
                      ),
                    )
                  }
                  className={guildDangerBtnClass}
                >
                  Delete ranking row
                </button>
              </>
            )}
          </>
        )}

        {modal === "leave" && (
          <>
            <p className="text-[11px] text-text-secondary">
              Leaders must transfer leadership before they can leave.
            </p>
            <label className="flex items-center gap-2 text-[9px] text-text-muted">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm leaving this guild
            </label>
            <button
              type="button"
              disabled={!confirmed}
              onClick={() => finish(leaveGuild(guildId))}
              className={guildDangerBtnClass}
            >
              Leave Guild
            </button>
          </>
        )}

        {modal === "transfer" && (
          <>
            <CfSelect
              value={successorId}
              onChange={setSuccessorId}
              placeholder="Choose successor"
              options={[
                { value: "", label: "Choose successor" },
                ...guildMembers
                  .filter((member) => member.userId !== userId)
                  .map((member) => ({
                    value: member.id,
                    label: `${member.name} · ${member.role}`,
                  })),
              ]}
              aria-label="Successor"
            />
            <label className="flex items-center gap-2 text-[9px] text-text-muted">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              Confirm leadership transfer and my demotion to Officer
            </label>
            <button
              type="button"
              disabled={!confirmed || !successorId}
              onClick={() =>
                finish(transferLeadership(guildId, successorId))
              }
              className={cn(guildPrimaryBtnClass, "disabled:opacity-35")}
            >
              Transfer leadership
            </button>
          </>
        )}
      </div>
    </GuildModalShell>
    </>
  );
}
