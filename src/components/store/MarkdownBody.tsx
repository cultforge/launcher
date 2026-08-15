import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "../../lib/cn";

/** Allow Modrinth HTML (embeds, figures) while keeping XSS surface small. */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "iframe",
    "video",
    "source",
    "figure",
    "figcaption",
    "details",
    "summary",
  ],
  attributes: {
    ...defaultSchema.attributes,
    iframe: [
      "src",
      "width",
      "height",
      "allow",
      "allowfullscreen",
      "frameborder",
      "title",
      "loading",
      "referrerpolicy",
    ],
    video: ["src", "controls", "width", "height", "poster"],
    source: ["src", "type"],
    img: [...(defaultSchema.attributes?.img ?? []), "loading"],
    a: [...(defaultSchema.attributes?.a ?? []), "target", "rel"],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "class"],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), "https", "http"],
  },
};

const BODY_CLASS = cn(
  "text-[12px] text-text-secondary leading-relaxed break-words",
  "[&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2",
  "[&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5",
  "[&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1",
  "[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4",
  "[&_li]:mb-0.5 [&_a]:text-primary-base [&_a]:underline-offset-2 hover:[&_a]:underline",
  "[&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11px] [&_code]:font-mono",
  "[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/35 [&_pre]:p-3 [&_pre]:text-[11px]",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-text-muted",
  "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:h-auto",
  "[&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg [&_iframe]:border-0",
  "[&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1",
  "[&_hr]:my-4 [&_hr]:border-white/10",
);

export function MarkdownBody({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const trimmed = source.trim();
  if (!trimmed) return null;

  return (
    <div className={cn(BODY_CLASS, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
        ]}
        components={{
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              {...rest}
            >
              {children}
            </a>
          ),
          iframe: ({ src, title, ...rest }) => {
            if (!src || !isAllowedEmbed(src)) return null;
            return (
              <iframe
                src={src}
                title={title || "Embedded media"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                {...rest}
              />
            );
          },
          img: ({ src, alt, ...rest }) => {
            if (!src) return null;
            return (
              <img src={src} alt={alt ?? ""} loading="lazy" {...rest} />
            );
          },
        }}
      >
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}

function isAllowedEmbed(src: string): boolean {
  try {
    const u = new URL(src);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "youtu.be" ||
      host.endsWith(".youtube.com") ||
      host === "player.vimeo.com"
    );
  } catch {
    return false;
  }
}
