/** Preferred fixed resolutions for CultForge image uploads. */

export const IMAGE_RES = {
  icon: { width: 512, height: 512, label: "512×512" },
  cover: { width: 1920, height: 1080, label: "1920×1080 (16:9)" },
  banner: { width: 1920, height: 480, label: "1920×480 (4:1)" },
} as const;

export type ImageResKind = keyof typeof IMAGE_RES;

export type ImageDimensionCheck = {
  width: number;
  height: number;
  ok: boolean;
  message: string | null;
};

export function loadImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image dimensions"));
    img.src = src;
  });
}

export function checkFixedResolution(
  kind: ImageResKind,
  width: number,
  height: number,
): ImageDimensionCheck {
  const target = IMAGE_RES[kind];
  const ok = width === target.width && height === target.height;
  return {
    width,
    height,
    ok,
    message: ok
      ? null
      : `Expected ${target.label}, got ${width}×${height}. Resize or enable Ignore resolution.`,
  };
}
