import type { GuildBuildRelease } from "../../../types/buildManifest";
import type { GuildActionResult } from "../../../stores/guilds";
import { FullScreenShell } from "../../modals/FullScreenShell";
import { GuildBuildEditor } from "./GuildBuildEditor";

type Props = {
  open: boolean;
  title: string;
  guildId: string;
  targetBuild?: GuildBuildRelease;
  onClose: () => void;
  onFinish: (
    result: GuildActionResult | Promise<GuildActionResult>,
  ) => Promise<void>;
};

export function GuildBuildEditorScreen({
  open,
  title,
  guildId,
  targetBuild,
  onClose,
  onFinish,
}: Props) {
  return (
    <FullScreenShell
      open={open}
      title={title}
      subtitle="Create a modpack your guild can install together — search Modrinth, add mods, then publish."
      onClose={onClose}
      confirmClose
      bodyScroll={false}
    >
      <GuildBuildEditor
        guildId={guildId}
        targetBuild={targetBuild}
        onFinish={onFinish}
        layout="full"
      />
    </FullScreenShell>
  );
}
