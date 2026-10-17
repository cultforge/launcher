import { useEffect, useRef, useState } from "react";
import { Copy, Check, Share2, Link2, Globe } from "lucide-react";
import { copyText } from "../lib/copyText";
import {
  buildCultforgeDeepLink,
  buildCultforgeWebLink,
  type CultforgeDeepLink,
} from "../lib/deepLinks";
import { cn } from "../lib/cn";

type CopyButtonProps = {
  text: string;
  label?: string;
  successMessage?: string;
  className?: string;
  iconOnly?: boolean;
  title?: string;
};

/** Shared copy control — use anywhere an id, path, or link should be copyable. */
export function CopyButton({
  text,
  label = "Copy",
  successMessage = "Copied!",
  className,
  iconOnly = false,
  title,
}: CopyButtonProps) {
  const [done, setDone] = useState(false);

  const onClick = async () => {
    const ok = await copyText(text, successMessage);
    if (!ok) return;
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      title={title ?? label}
      aria-label={title ?? label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-text-muted hover:text-text-primary hover:bg-white/6 cursor-pointer transition-colors",
        iconOnly && "px-2",
        className,
      )}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {iconOnly ? null : <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

type ShareDeepLinkButtonProps = {
  link: CultforgeDeepLink;
  label?: string;
  successMessage?: string;
  className?: string;
  iconOnly?: boolean;
  title?: string;
  /** Optional invite code → weblink uses invite.cultforge.com/{code}. */
  inviteCode?: string | null;
};

/**
 * Share menu: Deeplink (cultforge://) and Weblink (guilds/invite https).
 * Keeps the old export name so call sites stay stable.
 */
export function ShareDeepLinkButton({
  link,
  label = "Share",
  className,
  iconOnly = false,
  title,
  inviteCode,
}: ShareDeepLinkButtonProps) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<"deep" | "web" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const webFromInvite =
    inviteCode && inviteCode.trim()
      ? `https://invite.cultforge.com/${encodeURIComponent(inviteCode.trim())}`
      : null;
  const webHref = webFromInvite || buildCultforgeWebLink(link);
  const deepHref = buildCultforgeDeepLink(link);

  const copyKind = async (kind: "deep" | "web") => {
    const href = kind === "deep" ? deepHref : webHref;
    if (!href) return;
    const ok = await copyText(
      href,
      kind === "deep" ? "Deep link copied" : "Web link copied",
    );
    if (!ok) return;
    setDone(kind);
    setOpen(false);
    window.setTimeout(() => setDone(null), 1600);
  };

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title ?? "Share link"}
        aria-label={title ?? "Share link"}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-text-muted hover:text-text-primary hover:bg-white/6 cursor-pointer transition-colors",
          iconOnly && "px-2",
          className,
        )}
      >
        {done ? <Check size={12} /> : <Share2 size={12} />}
        {iconOnly ? null : (
          <span>{done ? "Copied" : label}</span>
        )}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[11.5rem] rounded-xl border border-white/12 bg-bg-elevated shadow-xl p-1 flex flex-col gap-0.5">
          <button
            type="button"
            disabled={!deepHref}
            onClick={() => void copyKind("deep")}
            className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/6 cursor-pointer disabled:opacity-40"
          >
            <Link2 size={14} className="mt-0.5 text-primary-base shrink-0" />
            <span>
              <span className="block text-[11px] font-semibold text-text-primary">
                Deeplink
              </span>
              <span className="block text-[9px] text-text-muted mt-0.5">
                Opens in CultForge
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={!webHref}
            onClick={() => void copyKind("web")}
            className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/6 cursor-pointer disabled:opacity-40"
          >
            <Globe size={14} className="mt-0.5 text-primary-base shrink-0" />
            <span>
              <span className="block text-[11px] font-semibold text-text-primary">
                Weblink
              </span>
              <span className="block text-[9px] text-text-muted mt-0.5">
                {webFromInvite
                  ? "invite.cultforge.com"
                  : webHref?.includes("api.cultforge.com")
                    ? "api.cultforge.com"
                    : "guilds.cultforge.com"}
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
