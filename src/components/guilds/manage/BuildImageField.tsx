import { useRef, useState } from "react";
import { toast } from "sonner";
import { toRawAvatarBase64 } from "../../UserAvatar";
import { cn } from "../../../lib/cn";
import {
  GUILD_BUILD_COVER_MAX_BYTES,
  GUILD_BUILD_ICON_MAX_BYTES,
  GUILD_BUILD_IMAGE_MIME,
  GUILD_BUILD_IMAGE_URL_MAX,
  type GuildBuildImageUpload,
} from "../../../lib/guildBuildApi";

const fieldClass =
  "h-9 w-full rounded-lg border border-border-subtle bg-black/25 px-3 text-[12px] text-text-primary outline-none focus:border-primary-base/45";

export type BuildImageDraft = {
  /** External http(s) URL — mutually exclusive with pending upload. */
  url: string;
  /** Local file staged for POST …/icon|cover as image_base64. */
  upload: GuildBuildImageUpload | null;
  /** data: URL or http URL for preview. */
  preview: string;
};

type Kind = "icon" | "cover";

type Props = {
  kind: Kind;
  label: string;
  value: BuildImageDraft;
  onChange: (next: BuildImageDraft) => void;
  existingHint?: string | null;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function inferMime(file: File): string {
  const typed = (file.type || "").toLowerCase();
  if (GUILD_BUILD_IMAGE_MIME.has(typed)) return typed;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return typed;
}

export function emptyBuildImageDraft(existingUrl?: string | null): BuildImageDraft {
  const url =
    typeof existingUrl === "string" && /^https?:\/\//i.test(existingUrl)
      ? existingUrl
      : "";
  return { url, upload: null, preview: url };
}

export function buildImageIsReady(
  draft: BuildImageDraft,
  hasExisting: boolean,
): boolean {
  if (draft.upload?.image_base64) return true;
  const url = draft.url.trim();
  if (url && /^https?:\/\//i.test(url) && url.length <= GUILD_BUILD_IMAGE_URL_MAX) {
    return true;
  }
  return hasExisting && !draft.url && !draft.upload;
}

export function BuildImageField({
  kind,
  label,
  value,
  onChange,
  existingHint,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const maxBytes =
    kind === "icon" ? GUILD_BUILD_ICON_MAX_BYTES : GUILD_BUILD_COVER_MAX_BYTES;
  const maxLabel = kind === "icon" ? "1 MiB" : "4 MiB";

  const pickFile = async (file: File) => {
    const mime = inferMime(file);
    if (!GUILD_BUILD_IMAGE_MIME.has(mime)) {
      toast.error("Use a PNG, JPEG, or WebP image (SVG not allowed).");
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`${label} must be at most ${maxLabel}`);
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const { base64, contentType } = toRawAvatarBase64(dataUrl);
      onChange({
        url: "",
        preview: dataUrl,
        upload: {
          image_base64: base64,
          content_type: contentType || mime,
        },
      });
    } catch {
      toast.error("Could not read that image file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-black/15 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span className="text-[9px] text-text-disabled">
          Link or upload · PNG/JPEG/WebP · max {maxLabel}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        {kind === "cover" ? (
          <div
            className="h-14 w-24 shrink-0 rounded-md bg-cover bg-center bg-bg-elevated border border-border-subtle"
            style={
              value.preview
                ? { backgroundImage: `url(${value.preview})` }
                : undefined
            }
          />
        ) : value.preview ? (
          <img
            src={value.preview}
            alt=""
            className="h-12 w-12 shrink-0 rounded-md object-cover border border-border-subtle"
          />
        ) : (
          <span className="h-12 w-12 shrink-0 rounded-md bg-bg-elevated border border-border-subtle" />
        )}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <input
            value={value.url}
            onChange={(e) => {
              const url = e.target.value;
              onChange({
                url,
                upload: null,
                preview: /^https?:\/\//i.test(url.trim()) ? url.trim() : "",
              });
            }}
            className={fieldClass}
            placeholder="https://… image URL"
            maxLength={GUILD_BUILD_IMAGE_URL_MAX}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-1.5">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void pickFile(file);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "rounded-md border border-primary-base/35 bg-primary-base/10 px-2.5 py-1.5 text-[10px] font-semibold text-primary-base cursor-pointer disabled:opacity-50",
              )}
            >
              {busy ? "Reading…" : value.upload ? "Replace file" : "Upload file"}
            </button>
            {(value.url || value.upload || value.preview) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onChange({ url: "", upload: null, preview: "" })}
                className="rounded-md border border-border-subtle px-2.5 py-1.5 text-[10px] text-text-muted cursor-pointer disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
          {value.upload ? (
            <p className="text-[9px] text-primary-base">
              File staged — uploads after the build is saved (base64 JSON).
            </p>
          ) : existingHint && !value.url ? (
            <p className="text-[9px] text-text-disabled truncate">
              Current: {existingHint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
