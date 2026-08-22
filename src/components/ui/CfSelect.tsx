import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

export type CfSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type MenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  flip: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: CfSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Show a filter field when there are many options (default: auto at 10+). */
  searchable?: boolean;
  /** Cap the open list height (CSS length). */
  maxMenuHeight?: string;
  "aria-label"?: string;
};

function parseCssLength(length: string, fallback = 224): number {
  const trimmed = length.trim();
  if (trimmed.endsWith("rem")) {
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? n * 16 : fallback;
  }
  if (trimmed.endsWith("px")) {
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function CfSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className,
  searchable,
  maxMenuHeight = "14rem",
  "aria-label": ariaLabel,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;
  const enableSearch = searchable ?? options.length >= 10;
  const preferredMenuHeight = parseCssLength(maxMenuHeight);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const updateMenuPos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const gap = 4;
    const searchHeight = enableSearch ? 44 : 0;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const flip = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = (flip ? spaceAbove : spaceBelow) - gap;
    const maxHeight = Math.min(
      preferredMenuHeight,
      Math.max(96, available - searchHeight),
    );

    setMenuPos({
      top: flip ? rect.top - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
      flip,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
  }, [open, enableSearch, preferredMenuHeight]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => updateMenuPos();

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, enableSearch, preferredMenuHeight]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMenuPos(null);
      return;
    }
    const idx = Math.max(
      0,
      filtered.findIndex((o) => o.value === value),
    );
    setHighlight(idx === -1 ? 0 : idx);
    if (enableSearch) {
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, enableSearch, filtered, value]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = filtered[highlight];
      if (row && !row.disabled) pick(row.value);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-border-subtle bg-black/25 px-3 text-left text-[12px] text-text-primary outline-none transition-colors",
          "hover:border-white/18 focus-visible:border-primary-base/50",
          open && "border-primary-base/45",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !selected && "text-text-disabled",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 16 16"
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M4.47 6.22a.75.75 0 0 1 1.06 0L8 8.69l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z"
          />
        </svg>
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            className="fixed z-[450] overflow-hidden rounded-lg border border-border-subtle bg-bg-card shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxWidth: "calc(100vw - 24px)",
              transform: menuPos.flip ? "translateY(-100%)" : undefined,
            }}
          >
            {enableSearch && (
              <div className="border-b border-border-subtle p-1.5">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  placeholder="Filter…"
                  className="h-8 w-full rounded-md border border-border-subtle bg-black/30 px-2.5 text-[11px] text-text-primary outline-none placeholder:text-text-disabled focus:border-primary-base/40"
                />
              </div>
            )}
            <div
              className="scrollbar-cultforge overflow-y-auto overscroll-contain py-1"
              style={{ maxHeight: menuPos.maxHeight }}
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-[11px] text-text-muted">
                  No matches
                </p>
              ) : (
                filtered.map((option, index) => {
                  const active = option.value === value;
                  const focused = index === highlight;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      disabled={option.disabled}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => !option.disabled && pick(option.value)}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-40",
                        focused && "bg-white/6",
                        active && "bg-primary-base/12",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[12px]",
                            active
                              ? "font-medium text-primary-base"
                              : "text-text-primary",
                          )}
                        >
                          {option.label}
                        </span>
                        {option.description ? (
                          <span className="block truncate text-[10px] text-text-muted">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      {active ? (
                        <svg
                          viewBox="0 0 16 16"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-base"
                          aria-hidden
                        >
                          <path
                            fill="currentColor"
                            d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 1 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0Z"
                          />
                        </svg>
                      ) : (
                        <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
