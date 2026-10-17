import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";
import { handleContentHref, isCultforgeDeepLink } from "../lib/deepLinks";
import { resolveGuildMediaDisplayUrl } from "../lib/guildMedia";

function ProxiedImg({ src, alt }: { src?: string; alt?: string }) {
  const [resolved, setResolved] = useState<string | null>(src ?? null);
  useEffect(() => {
    let cancelled = false;
    void resolveGuildMediaDisplayUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (!resolved) return null;
  return (
    <img
      src={resolved}
      alt={alt ?? ""}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="my-2 max-w-full rounded-lg"
    />
  );
}

function ContentAnchor({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    if (isCultforgeDeepLink(href)) {
      e.preventDefault();
      handleContentHref(href);
    }
  };
  const internal = isCultforgeDeepLink(href);
  return (
    <a
      href={href}
      onClick={onClick}
      target={internal ? undefined : "_blank"}
      rel={internal ? undefined : "noreferrer"}
      className="text-primary-base underline-offset-2 hover:underline cursor-pointer"
    >
      {children}
    </a>
  );
}

export function RichMarkdown({
  source,
  format = "markdown",
  className,
}: {
  source: string;
  format?: "plain" | "markdown";
  className?: string;
}) {
  if (!source.trim()) return null;

  if (format === "plain") {
    return (
      <p
        className={cn(
          "text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap",
          className,
        )}
      >
        {source}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "cf-markdown text-[13px] text-text-secondary leading-relaxed",
        "[&_h1]:text-[18px] [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5",
        "[&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1",
        "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4",
        "[&_li]:mb-0.5",
        "[&_hr]:my-4 [&_hr]:border-white/10",
        "[&_strong]:text-text-primary [&_strong]:font-semibold",
        "[&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono",
        "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/35 [&_pre]:p-3 [&_pre]:text-[11px]",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-text-muted",
        "[&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]",
        "[&_th]:border [&_th]:border-white/12 [&_th]:bg-black/25 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-text-primary",
        "[&_td]:border [&_td]:border-white/10 [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top",
        "[&_tr:nth-child(even)_td]:bg-white/[0.02]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <ContentAnchor href={href}>{children}</ContentAnchor>
          ),
          img: ({ src, alt }) => <ProxiedImg src={src} alt={alt} />,
          table: ({ children }) => (
            <div className="cf-markdown-table my-3 w-full overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export function ContentLinks({
  links,
}: {
  links?: { label: string; href: string }[] | null;
}) {
  if (!links?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={`${link.label}:${link.href}`}
          href={link.href}
          onClick={(e) => {
            if (handleContentHref(link.href)) e.preventDefault();
          }}
          target={isCultforgeDeepLink(link.href) ? undefined : "_blank"}
          rel={isCultforgeDeepLink(link.href) ? undefined : "noreferrer"}
          className="rounded-lg border border-primary-base/30 bg-primary-base/8 px-2.5 py-1.5 text-[11px] font-semibold text-primary-base hover:bg-primary-base/15 cursor-pointer"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
