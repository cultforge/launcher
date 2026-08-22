import { Chip } from "@heroui/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "../../../ico";
import { AppIcons } from "../../../icons";
import { ThemeManager } from "../../../settings/ThemeManager";
import { LinkedAccountsPanel } from "../../../settings/LinkedAccountsPanel";
import { E2eIdentityPanel } from "../../../settings/E2eIdentityPanel";
import { AssistantApiPanel } from "../../../settings/AssistantApiPanel";
import { useLobbyMusicStore } from "../../../../stores/lobbyMusic";
import { useSettingsStore } from "../../../../stores/settings";
import {
  useSettingsUiStore,
  type SettingsCategory,
} from "../../../../stores/settingsUi";
import { cn } from "../../../../lib/cn";
import { useAppStore } from "../../../../userstore";
import {
  JAVA_LTS_MAJORS,
  ensureJava,
  listJavaRuntimes,
  parseJavaMajor,
  type JavaRuntimeInfo,
} from "../../../../lib/javaRuntime";
import { CfSelect } from "../../../ui/CfSelect";
import { LicensesPanel } from "../../../settings/LicensesPanel";
import type { GuildUiPreferences } from "../../../../lib/guildUi";

const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: typeof AppIcons.Settings;
}[] = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Themes and custom palettes",
    icon: AppIcons.Images,
  },
  {
    id: "general",
    label: "General",
    description: "Appearance and launcher behavior",
    icon: AppIcons.Settings,
  },
  {
    id: "audio",
    label: "Audio",
    description: "Lobby music and volume",
    icon: AppIcons.Activity,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Updates and friend activity",
    icon: AppIcons.Notifications,
  },
  {
    id: "paths",
    label: "Paths & Java",
    description: "Downloads and runtime defaults",
    icon: AppIcons.FolderOpen,
  },
  {
    id: "licenses",
    label: "Licenses",
    description: "EULA, terms, and open-source notices",
    icon: AppIcons.FolderOpen,
  },
];

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left px-3 py-3 rounded-xl hover:bg-white/2.5 cursor-pointer"
    >
      <div className="min-w-0">
        <div className="text-[13px] text-text-primary font-medium">{label}</div>
        {description && (
          <div className="text-[10px] text-text-muted mt-0.5">{description}</div>
        )}
      </div>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors shrink-0",
          checked
            ? "bg-primary-base/30 border-primary-base/50"
            : "bg-white/6 border-white/12",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
            checked ? "left-4.5 bg-primary-base" : "left-0.5 bg-text-muted",
          )}
        />
      </span>
    </button>
  );
}

function JavaRuntimePanel({
  javaDefault,
  onJavaDefaultChange,
}: {
  javaDefault: string;
  onJavaDefaultChange: (value: string) => void;
}) {
  const [runtimes, setRuntimes] = useState<JavaRuntimeInfo[]>([]);
  const [installing, setInstalling] = useState(false);
  const major = parseJavaMajor(javaDefault) ?? 21;

  const refresh = () => {
    void listJavaRuntimes()
      .then(setRuntimes)
      .catch(() => setRuntimes([]));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <FieldLabel>Default Java</FieldLabel>
            <p className="text-[10px] text-text-disabled mt-1">
              Used when a build has no runtime override. CultForge downloads
              Temurin if this major is missing.
            </p>
          </div>
          <CfSelect
            value={String(major)}
            onChange={onJavaDefaultChange}
            className="shrink-0 w-28"
            options={JAVA_LTS_MAJORS.map((value) => ({
              value,
              label: `Java ${value}`,
            }))}
            aria-label="Default Java major"
          />
        </div>
        <button
          type="button"
          disabled={installing}
          onClick={() => {
            setInstalling(true);
            void ensureJava(String(major), true)
              .then((runtime) => {
                toast.success(`Java ${runtime.major ?? major} ready`, {
                  description: runtime.version || runtime.path,
                });
                refresh();
              })
              .catch((err) => {
                toast.error("Could not install Java", {
                  description:
                    err instanceof Error ? err.message : String(err),
                });
              })
              .finally(() => setInstalling(false));
          }}
          className="w-fit px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer disabled:opacity-50"
        >
          {installing ? `Installing Java ${major}…` : `Install Java ${major}`}
        </button>
      </div>
      {runtimes.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <FieldLabel>Detected runtimes</FieldLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {runtimes.map((runtime) => (
              <li
                key={runtime.path}
                className="text-[10px] text-text-secondary"
              >
                <span className="text-text-primary">
                  Java {runtime.major ?? "?"}
                </span>
                <span className="text-text-muted">
                  {" "}
                  · {runtime.managed ? "CultForge" : "System"}
                  {runtime.version ? ` · ${runtime.version}` : ""}
                </span>
                <div className="font-mono text-[9px] text-text-disabled break-all">
                  {runtime.path}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
      {children}
    </label>
  );
}

function GuildUiPreferencesPanel({
  value,
  onChange,
}: {
  value: GuildUiPreferences;
  onChange: (patch: Partial<GuildUiPreferences>) => void;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-1 divide-y divide-white/6">
      <div className="pb-3">
        <FieldLabel>Guild pages</FieldLabel>
        <p className="mt-1 text-[10px] text-text-disabled leading-relaxed">
          Adjust card density and optional tabs. Navigation stays the same.
        </p>
      </div>
      <ToggleRow
        label="Compact guild cards"
        description="Tighter padding on guild overview panels"
        checked={value.compactCards}
        onChange={(compactCards) => onChange({ compactCards })}
      />
      <ToggleRow
        label="Show Rankings tab"
        description="XP leaderboard tab in the guild hub"
        checked={value.showRankingsTab}
        onChange={(showRankingsTab) => onChange({ showRankingsTab })}
      />
      <ToggleRow
        label="Show Discord tab"
        description="Discord widget tab in the guild hub"
        checked={value.showDiscordTab}
        onChange={(showDiscordTab) => onChange({ showDiscordTab })}
      />
    </div>
  );
}

function PanelHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="pb-4 border-b border-white/[0.07]">
      <h3 className="font-sora text-[15px] font-bold text-text-primary">
        {title}
      </h3>
      <p className="text-[11px] text-text-muted mt-1">{description}</p>
    </div>
  );
}

function SignOutRow() {
  const signOut = useAppStore((s) => s.signOut);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const name = useAppStore((s) => s.currentUser?.name);
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    const confirmed = window.confirm(
      "Permanently deactivate your CultForge account? This cannot be undone from the launcher.",
    );
    if (!confirmed) return;
    const confirmAgain = window.confirm(
      "Type confirm: delete this account and sign out on all devices?",
    );
    if (!confirmAgain) return;
    setBusy(true);
    try {
      await deleteAccount();
      toast.message("Account deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] text-text-primary font-medium">Account</div>
          <p className="text-[10px] text-text-muted mt-0.5">
            Signed in as {name ?? "player"}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="px-3 py-2 rounded-lg text-[11px] font-semibold border border-white/12 text-text-secondary hover:text-white hover:border-white/25 cursor-pointer disabled:opacity-50"
          onClick={() => {
            void signOut().then(() => toast.message("Signed out"));
          }}
        >
          Sign out
        </button>
      </div>
      <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
        <div>
          <div className="text-[12px] text-state-error font-medium">
            Delete account
          </div>
          <p className="text-[10px] text-text-muted mt-0.5">
            Deactivate your CultForge account on the server.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className="px-3 py-2 rounded-lg text-[11px] font-semibold border border-state-error/40 text-state-error hover:bg-state-error/10 cursor-pointer disabled:opacity-50"
          onClick={() => {
            void onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const draft = useSettingsStore((s) => s.draft);
  const settings = useSettingsStore((s) => s.settings);
  const setDraft = useSettingsStore((s) => s.setDraft);
  const save = useSettingsStore((s) => s.save);
  const reset = useSettingsStore((s) => s.reset);
  const category = useSettingsUiStore((s) => s.category);
  const setCategory = useSettingsUiStore((s) => s.setCategory);
  const volume = useLobbyMusicStore((s) => s.volume);
  const setVolume = useLobbyMusicStore((s) => s.setVolume);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="h-full overflow-y-auto scroll-hidden p-4 pb-24 flex flex-col gap-3">
      <header className="cf-panel rounded-xl px-4 py-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-sora text-[18px] font-bold text-text-primary">
            Settings
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            Launcher preferences — instance settings remain under Builds.
          </p>
        </div>
        {dirty && (
          <span className="text-[10px] text-primary-base shrink-0">
            Unsaved changes
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3 items-start">
        <nav className="cf-panel rounded-xl p-1.5 flex md:flex-col gap-1 overflow-x-auto scroll-hidden">
          {CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={cn(
                  "min-w-42.5 md:min-w-0 w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left border cursor-pointer transition-colors",
                  active
                    ? "bg-primary-base/10 border-primary-base/25"
                    : "border-transparent hover:bg-white/3",
                )}
              >
                <span
                  className={cn(
                    "h-8 w-8 rounded-lg border flex items-center justify-center shrink-0",
                    active
                      ? "border-primary-base/30 bg-primary-base/10 text-primary-base"
                      : "border-white/8 text-text-muted",
                  )}
                >
                  <Icon icon={item.icon} size={14} />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[12px] font-semibold",
                      active ? "text-primary-base" : "text-text-primary",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-[9px] text-text-disabled truncate mt-0.5">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <section
          id={`settings-${category}`}
          className="cf-panel rounded-xl p-4 min-h-90 flex flex-col gap-4"
        >
          {category === "appearance" && (
            <>
              <ThemeManager />
              <GuildUiPreferencesPanel
                value={settings.guildUiPreferences}
                onChange={(patch) =>
                  setDraft({
                    guildUiPreferences: {
                      ...settings.guildUiPreferences,
                      ...patch,
                    },
                  })
                }
              />
            </>
          )}

          {category === "general" && (
            <>
              <PanelHeader
                title="General"
                description="Control how CultForge looks and behaves."
              />
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 flex items-center justify-between gap-4">
                <div>
                  <FieldLabel>Appearance</FieldLabel>
                  <p className="text-[12px] text-text-secondary mt-1">
                    Deep-black OLED theme with emerald accents.
                  </p>
                </div>
                <Chip size="sm" variant="soft" color="default">
                  <Chip.Label>OLED locked</Chip.Label>
                </Chip>
              </div>
              <div className="divide-y divide-white/6">
                <ToggleRow
                  label="Reduce motion"
                  description="Use quieter transitions throughout the launcher"
                  checked={draft.reduceMotion}
                  onChange={(v) => setDraft({ reduceMotion: v })}
                />
                <ToggleRow
                  label="Minimize to tray on game launch"
                  description="Hide CultForge to the system tray and idle (low CPU/GPU) while Minecraft runs"
                  checked={draft.closeOnLaunch}
                  onChange={(v) => setDraft({ closeOnLaunch: v })}
                />
              </div>
              <LinkedAccountsPanel />
              <AssistantApiPanel />
              <E2eIdentityPanel />
              <SignOutRow />
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Personal Discord source</FieldLabel>
                <p className="text-[10px] text-text-disabled">
                  Guild ID, widget iframe URL, or widget.json API URL. Saved with
                  launcher settings on this device (Account → Discord).
                </p>
                <input
                  type="text"
                  value={draft.personalDiscordSource}
                  onChange={(e) =>
                    setDraft({ personalDiscordSource: e.target.value })
                  }
                  placeholder="613938057346093056 or https://discord.com/widget?id=..."
                  className="w-full min-w-0 px-3 py-2.5 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
                />
              </div>
            </>
          )}

          {category === "audio" && (
            <>
              <PanelHeader
                title="Audio"
                description="Manage the lobby soundtrack and default volume."
              />
              <ToggleRow
                label="Lobby music on launch"
                description="Play Already Dreaming ~1–2s before the loading screen ends"
                checked={draft.lobbyMusicOnLaunch}
                onChange={(v) => setDraft({ lobbyMusicOnLaunch: v })}
              />
              <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <FieldLabel>Lobby volume</FieldLabel>
                  <span className="text-[12px] text-primary-base tabular-nums">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-primary-base cursor-pointer"
                />
              </div>
            </>
          )}

          {category === "notifications" && (
            <>
              <PanelHeader
                title="Notifications"
                description="Choose which launcher events can interrupt you."
              />
              <div className="divide-y divide-white/6">
                <ToggleRow
                  label="Update alerts"
                  description="Build, mod, and launcher update notifications"
                  checked={draft.notifyUpdates}
                  onChange={(v) => setDraft({ notifyUpdates: v })}
                />
                <ToggleRow
                  label="Friend activity"
                  description="Invites, messages, and friends coming online"
                  checked={draft.notifyFriends}
                  onChange={(v) => setDraft({ notifyFriends: v })}
                />
              </div>
            </>
          )}

          {category === "paths" && (
            <>
              <PanelHeader
                title="Paths & Java"
                description="Global storage and runtime defaults."
              />
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Downloads folder</FieldLabel>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.downloadsPath}
                    onChange={(e) => setDraft({ downloadsPath: e.target.value })}
                    className="flex-1 min-w-0 px-3 py-2.5 rounded-lg text-[12px] font-mono bg-black/30 border border-white/10 text-text-primary outline-none focus:border-primary-base/40"
                  />
                  <button
                    type="button"
                    className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    Browse
                  </button>
                </div>
              </div>
              <JavaRuntimePanel
                javaDefault={draft.javaDefault}
                onJavaDefaultChange={(value) =>
                  setDraft({ javaDefault: value })
                }
              />
              <button
                type="button"
                className="w-fit px-3 py-2 text-[11px] font-semibold rounded-lg border border-white/10 text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Open logs folder
              </button>
            </>
          )}

          {category === "licenses" && <LicensesPanel />}
        </section>
      </div>

      {category !== "appearance" && category !== "licenses" && (
        <div className="cf-panel sticky bottom-2 flex items-center justify-end gap-2 rounded-xl px-3 py-2.5">
          <span className="mr-auto text-[10px] text-text-muted">
            {dirty
              ? "Unsaved changes"
              : "Settings saved on this device"}
          </span>
          <button
            type="button"
            onClick={reset}
            className="cursor-pointer rounded-lg border border-white/10 px-3.5 py-2 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="cf-btn-primary cursor-pointer rounded-lg px-4 py-2 text-[12px] disabled:cursor-default disabled:opacity-40"
          >
            Save changes
          </button>
        </div>
      )}
    </div>
  );
}
