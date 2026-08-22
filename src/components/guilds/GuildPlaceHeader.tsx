import { Icon } from "../ico";
import { AppIcons } from "../icons";
import { GUILD_HUB_TAB_LABELS, type GuildHubTab } from "../../data/guilds";
import { useGuildStore } from "../../stores/guilds";
import { destinationForTab } from "../../lib/guildDestinations";

export function GuildPlaceHeader({ hubTab }: { hubTab: GuildHubTab }) {
  const setHubTab = useGuildStore((s) => s.setHubTab);
  const destination = destinationForTab(hubTab);
  const title = destination?.title ?? GUILD_HUB_TAB_LABELS[hubTab];
  const description = destination?.description;

  return (
    <header className="guild-place-header shrink-0">
      <button
        type="button"
        onClick={() => setHubTab("Overview")}
        className="guild-place-back cursor-pointer"
      >
        <Icon icon={AppIcons.ChevronLeft} size={14} />
        Guild home
      </button>
      <div className="mt-3 min-w-0">
        <h2 className="font-sora text-[20px] font-bold text-text-primary">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[13px] text-text-muted">{description}</p>
        ) : null}
      </div>
    </header>
  );
}
