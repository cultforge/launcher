import { cn } from "../../lib/cn";

export const guildFieldClass =
  "h-10 w-full rounded-xl border border-border-subtle bg-black/25 px-3.5 text-[13px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45 [color-scheme:dark]";

export const guildTextareaClass =
  "w-full rounded-xl border border-border-subtle bg-black/25 px-3.5 py-2.5 text-[13px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/45 min-h-28 resize-y [color-scheme:dark]";

export const guildLabelClass = "text-[12px] font-medium text-text-secondary";

export const guildHintClass = "text-[11px] leading-relaxed text-text-muted";

export const guildSectionClass =
  "rounded-xl border border-border-subtle bg-black/15 p-4";

export const guildPrimaryBtnClass =
  "cf-btn-primary cursor-pointer rounded-xl px-6 py-2.5 text-[13px] font-semibold disabled:opacity-50";

export const guildSecondaryBtnClass =
  "cursor-pointer rounded-xl border border-white/12 px-4 py-2.5 text-[13px] text-text-secondary hover:bg-white/4 disabled:opacity-50";

export const guildDangerBtnClass =
  "cursor-pointer rounded-xl border border-state-error/30 px-4 py-2 text-[12px] text-state-error hover:bg-state-error/10 disabled:opacity-35";

export function guildFormField(
  className?: string,
  multiline?: boolean,
): string {
  return cn(multiline ? guildTextareaClass : guildFieldClass, className);
}
