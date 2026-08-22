import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { FullScreenShell } from "../modals/FullScreenShell";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "default" | "wide";
  confirmClose?: boolean | (() => boolean);
  confirmCloseMessage?: string;
};

export function GuildModalShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "default",
  confirmClose = true,
  confirmCloseMessage = "Discard unsaved changes and close?",
}: Props) {
  return (
    <FullScreenShell
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={footer}
      confirmClose={confirmClose}
      confirmCloseMessage={confirmCloseMessage}
      bodyScroll
    >
      <div
        className={cn(
          "guild-modal-form flex flex-col gap-5",
          size === "wide" ? "max-w-3xl" : "max-w-xl",
        )}
      >
        {children}
      </div>
    </FullScreenShell>
  );
}
