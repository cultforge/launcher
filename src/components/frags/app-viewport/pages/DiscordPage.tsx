import { DiscordWidgetPanel } from "../../../discord/DiscordWidgetPanel";
import { useSettingsStore } from "../../../../stores/settings";
import { useNavigationStore } from "../../../../typlibs";

export default function DiscordPage() {
  const source = useSettingsStore((s) => s.settings.personalDiscordSource);
  const setSideItem = useNavigationStore((s) => s.setSideItem);

  return (
    <div className="flex h-full flex-col gap-3 p-4 pb-24">
      <div>
        <h1 className="font-sora text-[20px] font-bold text-text-primary">
          Discord
        </h1>
        <p className="mt-1 text-[12px] text-text-muted">
          Your personal community lounge, powered by Discord&apos;s widget API.
        </p>
      </div>
      <DiscordWidgetPanel
        title="Personal Discord"
        source={source}
        emptyMessage="Add a guild ID or Discord widget URL in Settings → General to load your community server here."
        emptyAction={{
          label: "Open Settings",
          onClick: () => setSideItem("Settings"),
        }}
      />
    </div>
  );
}
