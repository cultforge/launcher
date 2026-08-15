import { useEffect, useState } from "react";
import { resolveGuildMediaDisplayUrl } from "../lib/guildMedia";
import { cn } from "../lib/cn";

export function CoverImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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

  if (!resolved || failed) return null;

  return (
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("w-full object-cover", className)}
    />
  );
}
