import { useState } from "react";
import { cn } from "../../../lib/cn";
import { CopyButton } from "../../CopyButton";

type OpsJsonBlockProps = {
  value: unknown;
  title?: string;
  className?: string;
  defaultOpen?: boolean;
};

/** Platform-admin “Show JSON” disclosure for raw server payloads. */
export function OpsJsonBlock({
  value,
  title = "Server JSON",
  className,
  defaultOpen = false,
}: OpsJsonBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const text =
    value == null
      ? "null"
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);

  return (
    <div className={cn("rounded-lg border border-white/10 bg-black/30", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] font-semibold text-text-secondary hover:text-text-primary cursor-pointer"
        >
          {open ? "Hide JSON" : "Show JSON"}
          <span className="ml-2 text-text-disabled font-normal">{title}</span>
        </button>
        {open ? (
          <CopyButton text={text} label="Copy" successMessage="JSON copied" />
        ) : null}
      </div>
      {open ? (
        <pre className="max-h-72 overflow-auto scroll-hidden p-3 text-[10px] font-mono text-text-muted whitespace-pre-wrap break-all">
          {text}
        </pre>
      ) : null}
    </div>
  );
}
