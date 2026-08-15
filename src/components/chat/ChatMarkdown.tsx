import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "../../lib/cn";

const schema = {
  ...defaultSchema,
  tagNames: [
    "p",
    "strong",
    "em",
    "del",
    "a",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "blockquote",
    "br",
  ],
};

const BODY = cn(
  "text-[13px] leading-relaxed break-words [overflow-wrap:anywhere]",
  "[&_p]:mb-1 [&_p:last-child]:mb-0",
  "[&_ul]:mb-1 [&_ul]:list-disc [&_ul]:pl-4",
  "[&_ol]:mb-1 [&_ol]:list-decimal [&_ol]:pl-4",
  "[&_code]:rounded [&_code]:bg-black/25 [&_code]:px-1 [&_code]:text-[11px] [&_code]:font-mono [&_code]:break-all",
  "[&_pre]:mb-1 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/30 [&_pre]:p-2 [&_pre]:text-[11px]",
  "[&_a]:underline [&_a]:underline-offset-2",
);

function textFromChildren(children: ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) return children.map(textFromChildren).join("");
  if (typeof children === "object" && "props" in children) {
    return textFromChildren(
      (children as { props?: { children?: ReactNode } }).props?.children,
    );
  }
  return "";
}

/** duckduckgo.com → duckduckgo, en.wikipedia.org → wikipedia, bbc.co.uk → bbc */
function sourceLinkLabel(href: string): string {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
    const parts = host.split(".").filter(Boolean);
    if (parts.length >= 3 && parts[parts.length - 2].length <= 3) {
      return parts[parts.length - 3];
    }
    if (parts.length >= 2) return parts[parts.length - 2];
    return host || "link";
  } catch {
    return "link";
  }
}

function isBareUrlLabel(text: string, href?: string): boolean {
  const t = text.trim();
  if (!href) return !t;
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  const stripped = href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (t === href || t === stripped || t === href.replace(/\/$/, "")) return true;
  if (t.length > 40 && (t.includes("?") || /%[0-9A-Fa-f]{2}/.test(t))) {
    return true;
  }
  return false;
}

export function ChatMarkdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const trimmed = source.trim();
  if (!trimmed) return null;
  return (
    <div className={cn(BODY, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children, ...rest }) => {
            const labelText = textFromChildren(children);
            const label =
              href && isBareUrlLabel(labelText, href)
                ? sourceLinkLabel(href)
                : children;
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="whitespace-nowrap"
                title={typeof href === "string" ? href : undefined}
                {...rest}
              >
                {label}
              </a>
            );
          },
        }}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
