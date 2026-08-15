import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { TextShimmer } from "./magic/text-shimmer";
import { ThemeLogo } from "./ThemeLogo";
import {
  STARTUP_LABELS,
  type StartupPhase,
} from "../types/startup";

function Splash({
  phase,
  elapsedMs,
}: {
  phase: StartupPhase;
  elapsedMs: number;
}) {
  const logoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!logoRef.current || !textRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const logoAnim = animate(logoRef.current, {
      translateY: [-10, 10],
      scale: [0.97, 1.04],
      opacity: [0.82, 1],
      alternate: true,
      loop: true,
      ease: "inOutSine",
      duration: 1500,
    });

    const textAnim = animate(textRef.current, {
      opacity: [0.25, 1],
      alternate: true,
      loop: true,
      ease: "inOutSine",
      duration: 1000,
    });

    return () => {
      logoAnim.pause();
      textAnim.pause();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-bg-app gap-8">
      <div ref={logoRef}>
        <ThemeLogo variant="abstract" className="w-52 h-44" />
      </div>
      <p
        ref={textRef}
        className="font-sora tracking-[0.35em] text-sm uppercase font-semibold"
      >
        <TextShimmer className="text-lg tracking-[0.35em]">Loading</TextShimmer>
      </p>

      <div
        className="absolute right-7 bottom-7 flex items-center gap-3"
        role="status"
        aria-live="polite"
        aria-label={STARTUP_LABELS[phase]}
      >
        <div className="relative h-8 w-8 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full border border-border-strong" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-base animate-spin motion-reduce:animate-none" />
          <span className="absolute inset-2.75 rounded-full bg-primary-base/70" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[10px] uppercase tracking-[0.16em] text-text-primary font-semibold">
            {STARTUP_LABELS[phase]}
          </span>
          <span className="text-[9px] text-text-disabled mt-0.5 min-h-3">
            {phase === "offline"
              ? "Local services unavailable"
              : elapsedMs >= 5000
                ? "Still working — this can take a moment"
                : "CultForge launcher"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default Splash;
