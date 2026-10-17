import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveLine } from "@nivo/line";
import { toast } from "sonner";
import { friendById, kdRatio, type FriendProfile } from "../../../../data/friends";
import { cn } from "../../../../lib/cn";
import {
  type PlayerProfileTab,
  useProfileRouteStore,
} from "../../../../stores/profileRoute";
import { EntityImage } from "../../../EntityImage";
import { UserAvatar, toRawAvatarBase64 } from "../../../UserAvatar";
import { useAppStore } from "../../../../userstore";
import { useNavigationStore } from "../../../../typlibs";
import { authFailureMessage, fetchMyProfile, isHardAuthError, isUnauthorizedError, updateHandle, updateMyAvatar } from "../../../../lib/client";
import { isProfileSuccess } from "../../../../lib/authProfile";
import { ProfileIdentityCard } from "../../../profile/ProfileIdentityCard";

const PROFILE_TABS: { id: PlayerProfileTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "stats", label: "Stats" },
  { id: "rankings", label: "Rankings" },
  { id: "activity", label: "Activity" },
];

const AVATAR_URL_MAX = 500;
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidHttpsAvatarUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > AVATAR_URL_MAX) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read image file"));
    };
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

function compactNumber(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

function statusColor(status: FriendProfile["status"]) {
  if (status === "online") return "bg-primary-base";
  if (status === "idle") return "bg-state-warning";
  return "bg-text-disabled";
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card/80 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-[20px] font-bold tabular-nums",
          accent ? "text-primary-base" : "text-text-primary",
        )}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-[9px] text-text-disabled">{detail}</div>}
    </div>
  );
}

function levelTier(level: number): {
  name: string;
  card: string;
  value: string;
} {
  if (level >= 60) {
    return {
      name: "Elite",
      card:
        "border-primary-base/55 bg-primary-base/12 shadow-[0_0_18px_rgba(74,222,128,0.22)]",
      value: "text-primary-base animate-pulse drop-shadow-[0_0_8px_rgba(74,222,128,0.55)]",
    };
  }
  if (level >= 40) {
    return {
      name: "Veteran",
      card: "border-primary-base/40 bg-primary-base/8",
      value: "text-primary-base animate-pulse",
    };
  }
  if (level >= 20) {
    return {
      name: "Adept",
      card: "border-primary-base/25 bg-bg-card/80",
      value: "text-primary-base",
    };
  }
  return {
    name: "Novice",
    card: "border-border-subtle bg-bg-card/80",
    value: "text-text-secondary",
  };
}

function LevelStatCard({ level }: { level: number }) {
  const tier = levelTier(level);
  return (
    <div className={cn("rounded-xl border p-3 transition-colors", tier.card)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
          Level
        </div>
        <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-primary-soft/80">
          {tier.name}
        </div>
      </div>
      <div className={cn("mt-1 text-[20px] font-bold tabular-nums", tier.value)}>
        {level}
      </div>
    </div>
  );
}

function OverviewTab({
  player,
  isSelf,
}: {
  player: FriendProfile;
  isSelf?: boolean;
}) {
  const rank = player.rankings[0];
  const percentile = rank
    ? Math.max(1, Math.round(((rank.of - rank.rank + 1) / rank.of) * 100))
    : 0;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <div className="xl:col-span-8 flex flex-col gap-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <LevelStatCard level={player.stats.level} />
          <StatCard label="K/D" value={kdRatio(player.stats)} />
          <StatCard label="Playtime" value={`${player.stats.playtimeHours}h`} />
          <StatCard label="Blocks" value={compactNumber(player.stats.blocksPlaced)} />
        </div>

        <ProfileIdentityCard userId={player.id} isSelf={isSelf} />

        <section className="cf-panel rounded-xl p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-[12px] font-bold text-text-primary">
                Competitive standing
              </h3>
              <p className="mt-1 text-[10px] text-text-muted">
                {rank?.label ?? "Legacy / friend card (display only)"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[20px] font-bold text-primary-base">
                #{rank?.rank ?? "—"}
              </div>
              <div className="text-[8px] text-text-disabled">
                Top {100 - percentile + 1}%
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-overlay">
            <div
              className="h-full rounded-full bg-linear-to-r from-primary-muted to-primary-base"
              style={{ width: `${percentile}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[8px] text-text-disabled">
            <span>{rank?.score ?? "Unranked"} score</span>
            <span>{rank?.of ?? 0} tracked players</span>
          </div>
        </section>

        <section className="cf-panel rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-bold text-text-primary">
              Featured achievements
            </h3>
            <span className="text-[9px] text-text-disabled">
              {player.achievements.length} showcased
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2">
            {player.achievements.map((achievement, index) => (
              <div
                key={achievement.id}
                className="rounded-xl border border-border-subtle bg-black/15 p-3"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-primary-base/25 bg-primary-base/10 text-[13px] font-bold text-primary-base">
                  {index + 1}
                </div>
                <div className="mt-3 text-[11px] font-semibold text-text-primary">
                  {achievement.title}
                </div>
                <p className="mt-1 min-h-8 text-[9px] leading-relaxed text-text-muted">
                  {achievement.description}
                </p>
                <div className="mt-2 text-[8px] text-text-disabled">
                  {achievement.rarity}% of players · {achievement.unlocked}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="xl:col-span-4 flex flex-col gap-3">
        <section className="cf-panel rounded-xl p-4">
          <h3 className="text-[12px] font-bold text-text-primary">Now playing</h3>
          <div className="mt-3 rounded-xl border border-primary-base/20 bg-primary-base/7 p-3">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", statusColor(player.status))} />
              <span className="text-[10px] font-semibold capitalize text-text-primary">
                {player.status}
              </span>
            </div>
            <div className="mt-2 text-[13px] font-bold text-text-primary">
              {player.mainBuild}
            </div>
            <div className="mt-1 text-[10px] text-text-muted">{player.activity}</div>
          </div>
        </section>

        <section className="cf-panel rounded-xl p-4">
          <h3 className="text-[12px] font-bold text-text-primary">
            Recent activity
          </h3>
          <div className="mt-2 flex flex-col">
            {player.recentActivity.slice(0, 4).map((activity) => (
              <div
                key={activity.id}
                className="relative border-l border-border-strong py-2 pl-4"
              >
                <span className="absolute -left-1 top-3 h-2 w-2 rounded-full border border-primary-base bg-bg-app" />
                <div className="text-[10px] font-medium text-text-primary">
                  {activity.title}
                </div>
                <div className="mt-0.5 text-[9px] text-text-muted">
                  {activity.detail}
                </div>
                <div className="mt-1 text-[8px] text-text-disabled">
                  {activity.when}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatsTab({ player }: { player: FriendProfile }) {
  const series = useMemo(
    () => [
      {
        id: "Performance",
        data: player.performance.map((value, index) => ({ x: `W${index + 1}`, y: value })),
      },
    ],
    [player],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard label="Player kills" value={compactNumber(player.stats.kills)} accent />
        <StatCard label="Deaths" value={compactNumber(player.stats.deaths)} />
        <StatCard label="Mobs defeated" value={compactNumber(player.stats.mobsKilled)} />
        <StatCard label="Distance" value={`${player.stats.distanceKm.toFixed(0)} km`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <section className="xl:col-span-8 cf-panel rounded-xl p-4">
          <div>
            <h3 className="text-[12px] font-bold text-text-primary">
              Performance trend
            </h3>
            <p className="mt-1 text-[9px] text-text-muted">
              Session score history
            </p>
          </div>
          <div className="h-62.5 mt-2">
            <ResponsiveLine
              data={series}
              margin={{ top: 18, right: 18, bottom: 34, left: 42 }}
              xScale={{ type: "point" }}
              yScale={{ type: "linear", min: "auto", max: "auto", nice: true }}
              curve="monotoneX"
              colors={["var(--color-primary-base)"]}
              lineWidth={2}
              pointSize={6}
              pointColor="var(--color-bg-app)"
              pointBorderWidth={2}
              pointBorderColor="var(--color-primary-base)"
              enableArea
              areaOpacity={0.1}
              enableGridX={false}
              axisBottom={{ tickSize: 0, tickPadding: 10 }}
              axisLeft={{ tickSize: 0, tickPadding: 8, tickValues: 5 }}
              theme={{
                text: { fill: "var(--color-text-muted)", fontSize: 9 },
                grid: { line: { stroke: "var(--color-border-subtle)" } },
                axis: { domain: { line: { stroke: "var(--color-border-subtle)" } } },
                tooltip: {
                  container: {
                    background: "var(--color-bg-card)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: 8,
                  },
                },
              }}
              useMesh
            />
          </div>
        </section>

        <section className="xl:col-span-4 cf-panel rounded-xl p-4">
          <h3 className="text-[12px] font-bold text-text-primary">
            World contribution
          </h3>
          <div className="mt-4 flex flex-col gap-4">
            {[
              ["Blocks placed", player.stats.blocksPlaced, 250000],
              ["Mobs defeated", player.stats.mobsKilled, 30000],
              ["Distance traveled", player.stats.distanceKm, 350],
            ].map(([label, value, max]) => {
              const numeric = Number(value);
              return (
                <div key={String(label)}>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-text-muted">{label}</span>
                    <span className="text-text-secondary">{compactNumber(numeric)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-bg-overlay">
                    <div
                      className="h-full rounded-full bg-primary-base"
                      style={{ width: `${Math.min(100, (numeric / Number(max)) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function RankingsTab({ player }: { player: FriendProfile }) {
  return (
    <section className="cf-panel rounded-xl p-4">
      <div>
        <h3 className="text-[12px] font-bold text-text-primary">
          Competitive rankings
        </h3>
        <p className="mt-1 text-[9px] text-text-muted">
          Guild and global positions for the current season.
        </p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {player.rankings.map((ranking) => {
          const percentile = Math.round(
            ((ranking.of - ranking.rank + 1) / ranking.of) * 100,
          );
          return (
            <div
              key={ranking.label}
              className="rounded-xl border border-border-subtle bg-black/15 p-3"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-12 text-[18px] font-bold tabular-nums",
                    ranking.rank === 1 ? "text-primary-base" : "text-text-primary",
                  )}
                >
                  #{ranking.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-text-primary">
                    {ranking.label}
                  </div>
                  <div className="mt-0.5 text-[9px] text-text-muted">
                    Ahead of {percentile}% · {ranking.of} players
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-text-secondary">
                  {ranking.score}
                </div>
              </div>
              <div className="mt-2 h-1 rounded-full bg-bg-overlay">
                <div
                  className="h-full rounded-full bg-primary-base/75"
                  style={{ width: `${percentile}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityTab({ player }: { player: FriendProfile }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
      <section className="xl:col-span-7 cf-panel rounded-xl p-4">
        <h3 className="text-[12px] font-bold text-text-primary">Timeline</h3>
        <div className="mt-3 flex flex-col">
          {player.recentActivity.map((activity) => (
            <div
              key={activity.id}
              className="relative border-l border-border-strong pb-5 pl-5"
            >
              <span className="absolute -left-1.5 top-0.5 h-3 w-3 rounded-full border-2 border-bg-app bg-primary-base" />
              <div className="text-[11px] font-semibold text-text-primary">
                {activity.title}
              </div>
              <div className="mt-1 text-[10px] text-text-muted">{activity.detail}</div>
              <div className="mt-1 text-[8px] uppercase tracking-wider text-text-disabled">
                {activity.type} · {activity.when}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="xl:col-span-5 cf-panel rounded-xl p-4">
        <h3 className="text-[12px] font-bold text-text-primary">Played builds</h3>
        <div className="mt-3 flex flex-col gap-2">
          {player.playedBuilds.map((build) => (
            <div
              key={build.id}
              className="rounded-xl border border-border-subtle bg-black/15 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-text-primary">
                    {build.name}
                  </div>
                  <div className="mt-0.5 text-[9px] text-text-muted">
                    Pack {build.version} · {build.playtimeHours}h
                  </div>
                </div>
                <span className="text-[11px] font-bold text-primary-base">
                  {build.completion}%
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-bg-overlay">
                <div
                  className="h-full rounded-full bg-primary-base"
                  style={{ width: `${build.completion}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PlayerProfilePage() {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [savingHandle, setSavingHandle] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const target = useProfileRouteStore((state) => state.target);
  const activeTab = useProfileRouteStore((state) => state.profileTab);
  const setActiveTab = useProfileRouteStore((state) => state.setProfileTab);
  const back = useProfileRouteStore((state) => state.closeProfile);
  const currentUser = useAppStore((state) => state.currentUser);
  const authSource = useAppStore((state) => state.authSource);
  const clientReady = useAppStore((state) => state.clientReady);
  const setCurrentUserFromProfile = useAppStore(
    (state) => state.setCurrentUserFromProfile,
  );
  const handleSessionExpired = useAppStore((state) => state.handleSessionExpired);
  const setPrimaryTab = useNavigationStore((state) => state.setPrimaryTab);
  const setSideItem = useNavigationStore((state) => state.setSideItem);
  const isSelf = target?.kind === "self";
  const remotePaused = authSource === "cached" || !clientReady;
  const player =
    target?.kind === "self"
      ? currentUser
      : target?.kind === "friend"
        ? friendById(target.id)
        : null;
  const avatarSource = isSelf
    ? currentUser?.avatarUrl
    : player?.avatarUrl;

  // Always re-hydrate self profile from /v1/profile/me when opening Account.
  useEffect(() => {
    if (!isSelf || remotePaused) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await fetchMyProfile();
        if (cancelled) return;
        if (isProfileSuccess(profile)) {
          setCurrentUserFromProfile(profile);
        }
      } catch (err) {
        if (cancelled) return;
        if (isHardAuthError(err) || isUnauthorizedError(err)) {
          const msg = authFailureMessage(err);
          await handleSessionExpired(msg);
          toast.message(
            msg.toLowerCase().includes("device not authorised")
              ? "Device not authorised"
              : "Session expired",
            { description: msg },
          );
        }
        // Soft remote failures: keep cached profile; do not logout.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isSelf,
    remotePaused,
    setCurrentUserFromProfile,
    handleSessionExpired,
  ]);

  const openHandleEditor = () => {
    if (remotePaused) {
      toast.message("Remote offline", {
        description: "Edit handle needs CultForge APIs.",
      });
      return;
    }
    const current =
      (currentUser?.title ?? "").replace(/^@/, "") ||
      currentUser?.name ||
      "";
    setHandleDraft(current);
    setEditingHandle(true);
    setEditingAvatar(false);
    setFeedback(null);
  };

  const openAvatarEditor = () => {
    if (remotePaused) {
      toast.message("Remote offline", {
        description: "Change picture needs CultForge APIs.",
      });
      return;
    }
    setAvatarDraft(currentUser?.avatarUrl ?? "");
    setEditingAvatar(true);
    setEditingHandle(false);
    setFeedback(null);
  };

  const saveAvatar = async (nextUrl: string | null) => {
    if (remotePaused) {
      toast.message("Remote offline", {
        description: "Change picture needs CultForge APIs.",
      });
      return;
    }
    if (nextUrl !== null) {
      const trimmed = nextUrl.trim();
      if (!isValidHttpsAvatarUrl(trimmed)) {
        toast.error("Use an http(s) image URL (max 500 characters)");
        return;
      }
      nextUrl = trimmed;
    }
    setSavingAvatar(true);
    try {
      await updateMyAvatar(
        nextUrl === null ? { avatar_url: null } : { avatar_url: nextUrl },
      );
      const profile = await fetchMyProfile();
      if (isProfileSuccess(profile)) {
        setCurrentUserFromProfile(profile);
      } else if (currentUser) {
        useAppStore.setState({
          currentUser: { ...currentUser, avatarUrl: nextUrl ?? "" },
        });
      }
      setEditingAvatar(false);
      toast.success(nextUrl ? "Profile picture updated" : "Profile picture cleared");
    } catch (err) {
      if (isUnauthorizedError(err)) {
        const msg = authFailureMessage(err);
        await useAppStore.getState().handleSessionExpired(msg);
        toast.message(
          msg.toLowerCase().includes("device not authorised")
            ? "Device not authorised"
            : "Session expired",
          { description: msg },
        );
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Could not update profile picture",
      );
    } finally {
      setSavingAvatar(false);
    }
  };

  const uploadAvatarFile = async (file: File) => {
    if (remotePaused) {
      toast.message("Remote offline", {
        description: "Upload picture needs CultForge APIs.",
      });
      return;
    }
    let mime = (file.type || "").toLowerCase();
    if (!AVATAR_MIME.has(mime)) {
      // Some OS pickers omit type — infer from extension.
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".png")) mime = "image/png";
      else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
        mime = "image/jpeg";
      else if (lower.endsWith(".webp")) mime = "image/webp";
    }
    if (!AVATAR_MIME.has(mime)) {
      toast.error("Use a PNG, JPEG, or WebP image");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Image must be at most 512 KiB");
      return;
    }
    setSavingAvatar(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { base64, contentType } = toRawAvatarBase64(dataUrl);
      await updateMyAvatar({
        avatar_base64: base64,
        content_type: contentType || mime,
      });
      // Keep local data-URL preview: remote avatar GET still 404s for slash
      // user_ids until api.cultforge.com deploys {user_id:path}. Sidecar also
      // caches upload bytes at /media/avatar/{user_id}.
      if (currentUser) {
        useAppStore.setState({
          currentUser: { ...currentUser, avatarUrl: dataUrl },
          authSource: "live",
        });
      }
      const profile = await fetchMyProfile();
      if (isProfileSuccess(profile)) {
        setCurrentUserFromProfile(profile);
        const refreshed = useAppStore.getState().currentUser;
        if (refreshed) {
          useAppStore.setState({
            currentUser: { ...refreshed, avatarUrl: dataUrl },
            authSource: "live",
          });
        }
      }
      setEditingAvatar(false);
      toast.success("Profile picture uploaded");
    } catch (err) {
      if (isUnauthorizedError(err)) {
        const msg = authFailureMessage(err);
        await useAppStore.getState().handleSessionExpired(msg);
        toast.message(
          msg.toLowerCase().includes("device not authorised")
            ? "Device not authorised"
            : "Session expired",
          { description: msg },
        );
        return;
      }
      toast.error(
        err instanceof Error ? err.message : "Could not upload profile picture",
      );
    } finally {
      setSavingAvatar(false);
      if (avatarFileRef.current) avatarFileRef.current.value = "";
    }
  };

  const saveHandle = async () => {
    if (remotePaused) {
      toast.message("Remote offline", {
        description: "Edit handle needs CultForge APIs.",
      });
      return;
    }
    const next = handleDraft.trim().replace(/^@/, "");
    if (!next) {
      toast.error("Handle is required");
      return;
    }
    setSavingHandle(true);
    try {
      await updateHandle(next);
      const profile = await fetchMyProfile();
      if (isProfileSuccess(profile)) {
        setCurrentUserFromProfile(profile);
      } else {
        useAppStore.getState().setUserData(currentUser?.name ?? next);
        // Refresh title locally if profile lagging
        const user = useAppStore.getState().currentUser;
        if (user) {
          useAppStore.setState({
            currentUser: { ...user, title: `@${next}` },
          });
        }
      }
      setEditingHandle(false);
      toast.success("Handle updated");
    } catch (err) {
      if (isUnauthorizedError(err)) {
        const msg = authFailureMessage(err);
        await useAppStore.getState().handleSessionExpired(msg);
        toast.message(
          msg.toLowerCase().includes("device not authorised")
            ? "Device not authorised"
            : "Session expired",
          { description: msg },
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not update handle");
    } finally {
      setSavingHandle(false);
    }
  };

  if (!player) {
    return (
      <div className="cf-panel rounded-xl p-8 text-center">
        <h2 className="font-sora text-[18px] font-bold text-text-primary">
          Player not found
        </h2>
        <p className="mt-2 text-[11px] text-text-muted">
          This profile may no longer be available.
        </p>
        <button
          type="button"
          onClick={back}
          className="mt-4 rounded-lg border border-border-strong px-4 py-2 text-[11px] text-text-secondary cursor-pointer"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto scroll-hidden p-4 pb-24">
      <section
        className="relative min-h-52.5 overflow-hidden rounded-2xl border border-border-subtle"
      >
        <EntityImage
          kind="player"
          entityId={player.id}
          source={player.banner}
          alt={`${player.name} profile banner`}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-linear-to-t from-bg-app via-bg-app/55 to-transparent" />
        <div className="relative flex h-full min-h-52.5 flex-col justify-between p-4">
          <button
            type="button"
            onClick={back}
            className="self-start rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-semibold text-text-secondary backdrop-blur cursor-pointer hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70"
          >
            ← Back
          </button>
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative h-20 w-20 shrink-0">
              <UserAvatar
                src={avatarSource}
                name={player.name}
                className="h-full w-full rounded-2xl border border-white/15 bg-black/35 shadow-xl text-[22px]"
              />
              <span
                className={cn(
                  "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-bg-app",
                  statusColor(player.status),
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-sora text-[25px] font-bold text-white">
                  {player.name}
                </h2>
                <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[9px] capitalize text-white/70">
                  {player.status}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/65">
                {player.title} · {player.guild ?? "Independent"}
              </p>
              <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-white/55">
                {player.bio}
              </p>
            </div>
            <div className="flex gap-2">
              {isSelf ? (
                <>
                  <button
                    type="button"
                    onClick={openAvatarEditor}
                    title={
                      remotePaused
                        ? "Remote offline — change picture when CultForge is reachable"
                        : undefined
                    }
                    className={cn(
                      "rounded-lg border border-white/15 bg-black/25 px-3.5 py-2 text-[10px] font-semibold text-white/80 cursor-pointer hover:bg-white/10",
                      remotePaused && "opacity-50",
                    )}
                  >
                    Change picture
                  </button>
                  <button
                    type="button"
                    onClick={openHandleEditor}
                    title={
                      remotePaused
                        ? "Remote offline — edit handle when CultForge is reachable"
                        : undefined
                    }
                    className={cn(
                      "rounded-lg border border-white/15 bg-black/25 px-3.5 py-2 text-[10px] font-semibold text-white/80 cursor-pointer hover:bg-white/10",
                      remotePaused && "opacity-50",
                    )}
                  >
                    Edit handle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      back();
                      setPrimaryTab("Home");
                      setSideItem("Settings");
                    }}
                    className="cf-btn-primary rounded-lg px-4 py-2 text-[10px] font-semibold cursor-pointer"
                  >
                    Account settings
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void import("../../../../stores/dm").then(({ useDmStore }) => {
                        void useDmStore.getState().openPeer(player.id);
                      });
                    }}
                    className="rounded-lg border border-white/15 bg-black/25 px-3.5 py-2 text-[10px] font-semibold text-white/80 cursor-pointer hover:bg-white/10"
                  >
                    Message
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void import("../../../../stores/friendsRoster").then(
                        async ({ useFriendsRosterStore }) => {
                          const roster = useFriendsRosterStore.getState();
                          const isFriend = roster.friends.some(
                            (f) => f.id === player.id,
                          );
                          const result = isFriend
                            ? await roster.remove(player.id)
                            : await roster.request(player.id);
                          setFeedback(result.message);
                        },
                      );
                    }}
                    className="cf-btn-primary rounded-lg px-4 py-2 text-[10px] font-semibold cursor-pointer"
                  >
                    Add / Remove friend
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {editingAvatar && isSelf ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary-base/25 bg-primary-base/7 px-3 py-2">
          <p className="text-[10px] text-text-muted">
            Upload a PNG, JPEG, or WebP (max 512 KiB), or paste an http(s) image URL.
          </p>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={savingAvatar}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAvatarFile(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingAvatar}
              onClick={() => avatarFileRef.current?.click()}
              className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
            >
              {savingAvatar ? "Uploading…" : "Upload image"}
            </button>
            <button
              type="button"
              disabled={savingAvatar}
              onClick={() => void saveAvatar(null)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] text-white/70 cursor-pointer disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={savingAvatar}
              onClick={() => setEditingAvatar(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] text-white/70 cursor-pointer"
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-white/8">
            <input
              value={avatarDraft}
              onChange={(e) => setAvatarDraft(e.target.value)}
              placeholder="Or paste https://… image URL"
              disabled={savingAvatar}
              className="flex-1 h-9 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-primary-base/55"
            />
            <button
              type="button"
              disabled={savingAvatar}
              onClick={() => void saveAvatar(avatarDraft)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/80 cursor-pointer disabled:opacity-50"
            >
              Save URL
            </button>
          </div>
        </div>
      ) : null}

      {editingHandle && isSelf ? (
        <div className="flex flex-col sm:flex-row gap-2 rounded-lg border border-primary-base/25 bg-primary-base/7 px-3 py-2">
          <input
            value={handleDraft}
            onChange={(e) => setHandleDraft(e.target.value)}
            placeholder="@handle"
            disabled={savingHandle}
            className="flex-1 h-9 rounded-lg border border-white/10 bg-black/35 px-3 text-sm text-white outline-none focus:border-primary-base/55"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingHandle}
              onClick={() => void saveHandle()}
              className="cf-btn-primary rounded-lg px-3 py-2 text-[10px] font-semibold cursor-pointer disabled:opacity-50"
            >
              {savingHandle ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={savingHandle}
              onClick={() => setEditingHandle(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] text-white/70 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {feedback && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-primary-base/25 bg-primary-base/7 px-3 py-2 text-[10px] text-primary-base"
        >
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Player profile sections"
        className="flex gap-1 rounded-xl border border-border-subtle bg-bg-card p-1"
      >
        {PROFILE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`profile-tab-${tab.id}`}
            aria-controls={`profile-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const current = PROFILE_TABS.findIndex((item) => item.id === activeTab);
              const direction = event.key === "ArrowRight" ? 1 : -1;
              const next =
                PROFILE_TABS[
                  (current + direction + PROFILE_TABS.length) % PROFILE_TABS.length
                ];
              setActiveTab(next.id);
              window.requestAnimationFrame(() =>
                document.getElementById(`profile-tab-${next.id}`)?.focus(),
              );
            }}
            className={cn(
              "rounded-lg px-4 py-2 text-[10px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-base/70",
              activeTab === tab.id
                ? "bg-primary-base/12 text-primary-base"
                : "text-text-muted hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto hidden items-center px-3 text-[9px] text-text-disabled sm:flex">
          {isSelf ? "Member" : "Friend"} since {player.joined} · {player.lastSeen}
        </div>
      </div>

      <div
        id={`profile-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`profile-tab-${activeTab}`}
        className="pb-4"
      >
        {activeTab === "overview" && (
          <OverviewTab player={player} isSelf={isSelf} />
        )}
        {activeTab === "stats" && <StatsTab player={player} />}
        {activeTab === "rankings" && <RankingsTab player={player} />}
        {activeTab === "activity" && <ActivityTab player={player} />}
      </div>
    </div>
  );
}
