import { useEffect, useRef } from "react";
import Reveal from "reveal.js";
import "reveal.js/reveal.css";

type Props = {
  open: boolean;
  title: string;
  slides: string[];
  onClose: () => void;
};

export function RevealStory({ open, title, slides, onClose }: Props) {
  const deckRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<InstanceType<typeof Reveal> | null>(null);

  useEffect(() => {
    if (!open || !deckRef.current) return;

    let cancelled = false;
    const deck = new Reveal(deckRef.current, {
      embedded: true,
      hash: false,
      controls: true,
      progress: true,
      center: true,
      transition: "fade",
      width: "100%",
      height: "100%",
    });

    deck.initialize().then(() => {
      if (cancelled) {
        deck.destroy();
        return;
      }
      revealRef.current = deck;
    });

    return () => {
      cancelled = true;
      revealRef.current?.destroy();
      revealRef.current = null;
    };
  }, [open, slides]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl h-[min(70vh,520px)] cf-panel rounded-2xl overflow-hidden border border-white/10">
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/8">
          <h2 className="font-sora text-[13px] font-semibold text-text-primary truncate pr-4">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] uppercase tracking-wide text-text-muted hover:text-white cursor-pointer"
          >
            Close
          </button>
        </div>
        <div className="reveal h-full pt-12" ref={deckRef}>
          <div className="slides">
            {slides.map((s) => (
              <section key={s}>
                <h3 className="font-sora text-2xl md:text-3xl font-bold text-text-primary px-8 leading-snug">
                  {s}
                </h3>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
