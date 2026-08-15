import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { resolveGuildMediaDisplayUrl } from "../lib/guildMedia";

type GuildIconProps = {
  src?: string | null;
  name?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
};

/**
 * Guild logo with sidecar proxy for guilds.cultforge.com URLs and
 * initials fallback when the image is missing or fails to load.
 */
export function GuildIcon({
  src,
  name = "?",
  className,
  imgClassName,
  fallbackClassName,
}: GuildIconProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const initials = (name.trim().replace(/[^a-zA-Z0-9]/g, "") || "?").slice(0, 2).toUpperCase();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setResolved(null);
    void resolveGuildMediaDisplayUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const showImg = Boolean(resolved) && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden bg-white/10 text-white font-bold shrink-0",
        className,
      )}
    >
      {showImg ? (
        <img
          src={resolved!}
          alt=""
          className={cn("h-full w-full object-cover", imgClassName)}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className={cn("text-[10px] leading-none", fallbackClassName)}>
          {initials}
        </span>
      )}
    </span>
  );
}
