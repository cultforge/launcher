import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  fetchAchievementsCatalog,
  fetchProfileCard,
  fetchTitlesCatalog,
  setMyActiveTitle,
  setMyFeaturedAchievements,
  type CatalogItem,
  type ProfileCard,
} from "../../lib/profileCardApi";
import { ShareDeepLinkButton } from "../CopyButton";
import { cn } from "../../lib/cn";

type Props = {
  userId: string;
  isSelf?: boolean;
  className?: string;
};

export function ProfileIdentityCard({ userId, isSelf, className }: Props) {
  const [card, setCard] = useState<ProfileCard | null>(null);
  const [titles, setTitles] = useState<CatalogItem[]>([]);
  const [achievements, setAchievements] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pickedFeatured, setPickedFeatured] = useState<string[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await fetchProfileCard(userId);
      setCard(next);
      setPickedFeatured(next.featuredAchievementIds.slice(0, 5));
    } catch (err) {
      setCard(null);
      if (isSelf) {
        toast.message("Profile card unavailable", {
          description:
            err instanceof Error ? err.message : "Could not load card",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [userId]);

  useEffect(() => {
    if (!isSelf) return;
    void Promise.all([
      fetchTitlesCatalog().catch(() => [] as CatalogItem[]),
      fetchAchievementsCatalog().catch(() => [] as CatalogItem[]),
    ]).then(([t, a]) => {
      setTitles(t);
      setAchievements(a);
    });
  }, [isSelf]);

  const labelFor = (id: string, catalog: CatalogItem[]) =>
    catalog.find((c) => c.id === id)?.label ?? id;

  const unlockedTitleIds = useMemo(
    () => new Set(card?.titleIds ?? []),
    [card],
  );
  const unlockedAchievementIds = useMemo(
    () => new Set((card?.achievements ?? []).map((a) => a.id)),
    [card],
  );

  const onSetTitle = async (titleId: string) => {
    if (!isSelf || busy) return;
    setBusy(true);
    try {
      const next = await setMyActiveTitle(titleId);
      setCard(next);
      toast.success("Active title updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set title");
    } finally {
      setBusy(false);
    }
  };

  const toggleFeatured = (id: string) => {
    setPickedFeatured((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const onSaveFeatured = async () => {
    if (!isSelf || busy) return;
    if (pickedFeatured.length < 3) {
      toast.message("Pick at least 3 featured achievements");
      return;
    }
    setBusy(true);
    try {
      const next = await setMyFeaturedAchievements(pickedFeatured);
      setCard(next);
      setPickedFeatured(next.featuredAchievementIds);
      toast.success("Featured achievements saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save featured",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "cf-panel rounded-xl p-4 text-[12px] text-text-muted",
          className,
        )}
      >
        Loading identity card…
      </div>
    );
  }

  if (!card) {
    return (
      <div
        className={cn(
          "cf-panel rounded-xl p-4 text-[12px] text-text-muted",
          className,
        )}
      >
        No competitive identity card yet.
      </div>
    );
  }

  const cats = Object.entries(card.categories).filter(([, v]) => v > 0);

  return (
    <div className={cn("cf-panel rounded-xl p-4 flex flex-col gap-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-bold text-text-primary">
            Identity card
          </h3>
          <p className="mt-0.5 text-[10px] text-text-muted">
            SCORE → TIER → RANK · ACHIEVEMENTS → TITLES → FEATURED
          </p>
        </div>
        <ShareDeepLinkButton
          link={{
            kind: "profile",
            userId: card.username || userId,
          }}
          label="Share profile"
          title="Share profile"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">
            Score
          </div>
          <div className="mt-1 text-[18px] font-bold tabular-nums text-text-primary">
            {Math.round(card.score)}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">
            Tier
          </div>
          <div className="mt-1 text-[18px] font-bold text-primary-base">
            {card.tier}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/20 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-text-muted">
            Rank
          </div>
          <div className="mt-1 text-[18px] font-bold tabular-nums text-text-primary">
            {card.rank != null ? `#${card.rank}` : "—"}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Active title
        </div>
        <p className="mt-1 text-[13px] font-semibold text-text-primary">
          {card.activeTitle
            ? labelFor(card.activeTitle, titles)
            : "None"}
        </p>
        {isSelf && card.titleIds.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {card.titleIds.map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy || !unlockedTitleIds.has(id)}
                onClick={() => void onSetTitle(id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[10px] cursor-pointer disabled:opacity-40",
                  card.activeTitle === id
                    ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                    : "border-white/10 text-text-muted hover:text-text-primary",
                )}
              >
                {labelFor(id, titles)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Featured achievements
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(isSelf ? card.achievements.map((a) => a.id) : card.featuredAchievementIds).map(
            (id) => {
              const active = pickedFeatured.includes(id);
              const unlocked = unlockedAchievementIds.has(id) || !isSelf;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!isSelf || busy || !unlocked}
                  onClick={() => isSelf && toggleFeatured(id)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] cursor-pointer disabled:opacity-40",
                    active
                      ? "border-primary-base/40 bg-primary-base/12 text-primary-base"
                      : "border-white/10 text-text-muted",
                  )}
                >
                  {labelFor(id, achievements)}
                </button>
              );
            },
          )}
        </div>
        {isSelf ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSaveFeatured()}
            className="mt-2 cf-btn-primary rounded-lg px-3 py-1.5 text-[10px] font-semibold cursor-pointer disabled:opacity-40"
          >
            Save featured (3–5)
          </button>
        ) : null}
      </div>

      {cats.length > 0 ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Categories
          </div>
          <div className="grid grid-cols-2 gap-1">
            {cats.slice(0, 8).map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-2 text-[10px] border-b border-white/5 py-1"
              >
                <span className="text-text-muted capitalize">{k}</span>
                <span className="tabular-nums text-text-secondary">
                  {Math.round(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
