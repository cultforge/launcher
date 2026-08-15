import { LOGO_ASSETS, type LogoVariant } from "../data/branding";
import { cn } from "../lib/cn";
import { useThemeStore } from "../stores/theme";

type ThemeLogoProps = {
  variant?: LogoVariant;
  className?: string;
  label?: string;
  glow?: boolean;
};

export function ThemeLogo({
  variant: requestedVariant,
  className,
  label = "CultForge",
  glow = true,
}: ThemeLogoProps) {
  const logoMode = useThemeStore((s) => s.logoMode);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const logoAssignments = useThemeStore((s) => s.logoAssignments);
  const variant =
    requestedVariant ??
    (logoMode === "auto"
      ? (logoAssignments[activeThemeId] ?? "disc")
      : logoMode);
  const asset = LOGO_ASSETS[variant];
  // Disc and Abstract contain raster artwork inside SVG wrappers. Their dark
  // pixels are opaque, so alpha masking flattens the image into a solid blob.
  // Thin is path-based and intentionally uses its path alpha instead.
  const maskMode = variant === "thin" ? "alpha" : "luminance";
  const supportsMask =
    typeof CSS !== "undefined" &&
    (CSS.supports("mask-image", `url(\"${asset}\")`) ||
      CSS.supports("-webkit-mask-image", `url(\"${asset}\")`)) &&
    (maskMode === "alpha" || CSS.supports("mask-mode", "luminance"));

  if (!supportsMask) {
    return (
      <img
        src={asset}
        alt={label}
        className={cn("object-contain", glow && "animate-breathe", className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-block shrink-0",
        glow && "drop-shadow-[0_0_12px_var(--color-primary-base)]",
        className,
      )}
      style={{
        background:
          "linear-gradient(135deg, var(--color-primary-soft), var(--color-primary-base) 58%, var(--color-accent-alpha))",
        maskImage: `url("${asset}")`,
        WebkitMaskImage: `url("${asset}")`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskMode,
      }}
    />
  );
}
