import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ico";
import { AppIcons } from "./icons";
import { EntityImage } from "./EntityImage";
import { useBuildStore } from "../stores/build";
import { useBuildModalsStore } from "../stores/buildModals";
import { cn } from "../lib/cn";

type MenuPos = { top: number; left: number; width: number };

export function BuildSwitcher({
  className,
  showLabel = false,
  titleClassName,
}: {
  className?: string;
  showLabel?: boolean;
  titleClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const builds = useBuildStore((s) => s.builds);
  const activeId = useBuildStore((s) => s.activeId);
  const setActive = useBuildStore((s) => s.setActive);
  const openModal = useBuildModalsStore((s) => s.openModal);
  const active = useBuildStore((s) => s.active());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      top: r.bottom + 8,
      left: r.left,
      width: Math.max(280, r.width),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    const onReposition = () => updatePos();

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
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      {showLabel && (
        <span className="text-[9px] uppercase tracking-[0.14em] text-text-disabled font-semibold block mb-0.5">
          Active Build
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 text-left cursor-pointer group max-w-full"
        title="Switch build"
      >
        <span
          className={cn(
            "font-sora text-[15px] font-bold text-text-primary truncate group-hover:text-white",
            titleClassName,
          )}
        >
          {active.name}
        </span>
        <Icon
          icon={AppIcons.ChevronDown}
          size={14}
          className={`text-text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Switch build"
            className="fixed z-200 cf-panel rounded-xl p-1.5 border border-white/12 bg-bg-elevated"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxWidth: "min(320px, calc(100vw - 24px))",
            }}
          >
            <div className="px-2.5 py-1.5 text-[9px] uppercase tracking-[0.16em] text-text-disabled font-semibold">
              Switch build
            </div>
            <div className="max-h-[min(60vh,320px)] overflow-y-auto scrollbar-cultforge">
              {builds.map((b) => {
                const selected = b.id === activeId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setActive(b.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer transition-colors",
                      selected
                        ? "bg-white/[0.07] border border-white/12"
                        : "border border-transparent hover:bg-white/5",
                    )}
                  >
                    <div
                      className={`h-9 w-9 rounded-md bg-linear-to-br ${b.accent} shrink-0 overflow-hidden border border-white/10`}
                    >
                      {b.image ? (
                        <EntityImage
                          kind="build"
                          entityId={b.id}
                          source={b.image}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium text-text-primary truncate">
                        {b.name}
                      </div>
                      <div className="text-[10px] text-text-muted truncate">
                        MC {b.mc} · {b.loader}
                      </div>
                    </div>
                    {selected && (
                      <span className="text-[9px] uppercase tracking-wide text-primary-base font-semibold">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openModal("add");
              }}
              className="mt-1 w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-[11px] font-semibold text-primary-base hover:bg-white/5 cursor-pointer"
            >
              <Icon icon={AppIcons.Plus} size={14} />
              Add Minecraft version
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
