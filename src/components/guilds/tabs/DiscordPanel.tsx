import { DiscordWidgetPanel } from "../../discord/DiscordWidgetPanel";
import { discordSourceForGuild } from "../../../data/guilds";
import { useGuildStore } from "../../../stores/guilds";

export function DiscordPanel() {
  const guildId = useGuildStore((s) => s.activeGuildId);
  const discordOverrides = useGuildStore((s) => s.discordOverrides);
  const source = discordSourceForGuild(guildId, discordOverrides);

  return (
    <DiscordWidgetPanel
      title="Guild Discord"
      source={source}
      emptyMessage="This guild has not configured a Discord widget source yet."
    />
  );
}
