import { Icon } from "../../ico";
import { AppIcons } from "../../icons";
import { useGuildStore } from "../../../stores/guilds";
import { manageSectionMeta } from "../../../lib/manageSections";
import type { ManageSectionId } from "../../../stores/guilds";

export function ManagePlaceHeader({ section }: { section: ManageSectionId }) {
  const setSection = useGuildStore((s) => s.setManageSection);
  const meta = manageSectionMeta(section);

  if (!meta) return null;

  return (
    <header className="guild-manage-section-header">
      <button
        type="button"
        onClick={() => setSection("overview")}
        className="guild-place-back cursor-pointer"
      >
        <Icon icon={AppIcons.ChevronLeft} size={14} />
        All settings
      </button>
      <div className="mt-4 min-w-0">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-base/12 text-primary-base">
            <Icon icon={AppIcons[meta.icon]} size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-sora text-[22px] font-bold text-text-primary">
              {meta.title}
            </h2>
            <p className="mt-0.5 text-[13px] text-text-muted">
              {meta.description}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
