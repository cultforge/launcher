import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { Icon } from "../ico";

export type CfContextMenuItem = {
  id: string;
  label: string;
  icon?: unknown;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type CfContextMenuSeparator = { type: "separator" };

export type CfContextMenuEntry = CfContextMenuItem | CfContextMenuSeparator;

type Pos = { top: number; left: number };

function isSeparator(entry: CfContextMenuEntry): entry is CfContextMenuSeparator {
  return "type" in entry && entry.type === "separator";
}

export function CfContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  ariaLabel = "Context menu",
}: {
  open: boolean;
  x: number;
  y: number;
  items: CfContextMenuEntry[];
  onClose: () => void;
  ariaLabel?: string;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos>({ top: y, left: x });

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) {
      setPos({ top: y, left: x });
      return;
    }
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(x, window.innerWidth - rect.width - pad);
    const top = Math.min(y, window.innerHeight - rect.height - pad);
    setPos({ top: Math.max(pad, top), left: Math.max(pad, left) });
  }, [open, x, y, items]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className="cf-context-menu fixed z-400 w-48 flex flex-col py-1 text-[13px] text-text-muted rounded-xl border border-border-subtle bg-bg-elevated shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((entry, i) => {
        if (isSeparator(entry)) {
          return (
            <div
              key={`sep-${i}`}
              className="cf-context-menu-sep h-px bg-border-subtle my-1"
              role="separator"
            />
          );
        }
        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              if (entry.disabled) return;
              entry.onSelect();
              onClose();
            }}
            className={cn(
              "cf-context-menu-item flex items-center gap-3 px-4 py-2 w-full text-left cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              entry.danger
                ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
                : "hover:bg-white/5 hover:text-text-primary",
            )}
          >
            {entry.icon ? (
              <Icon icon={entry.icon} size={15} className="shrink-0 opacity-90" />
            ) : null}
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function useContextMenuState() {
  const [state, setState] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });
  const openAt = (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
    e.preventDefault();
    setState({ open: true, x: e.clientX, y: e.clientY });
  };
  const close = () => setState((s) => ({ ...s, open: false }));
  return { ...state, openAt, close };
}

export function ContextMenuTrigger({
  children,
  className,
  items,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  items: CfContextMenuEntry[];
  disabled?: boolean;
}) {
  const menu = useContextMenuState();
  return (
    <>
      <div
        className={className}
        onContextMenu={disabled ? undefined : menu.openAt}
      >
        {children}
      </div>
      <CfContextMenu
        open={menu.open}
        x={menu.x}
        y={menu.y}
        items={items}
        onClose={menu.close}
      />
    </>
  );
}
