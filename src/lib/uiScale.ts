function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * True viewport width in CSS px, measured with our zoom temporarily reset.
 * Without this, style.zoom feeds back into innerWidth and the scale gets
 * pinned to a clamp bound (e.g. shrinking the window never lowers the scale).
 */
function measureViewportWidth(): number {
  const root = document.documentElement;
  const prev = root.style.zoom;
  if (prev && prev !== "1") root.style.zoom = "1";
  const width = window.innerWidth;
  if (prev && prev !== "1") root.style.zoom = prev;
  return width;
}

/** Compute DPI/viewport-aware UI scale (clamped ~0.95–1.25). */
export function computeUiScale(
  width = measureViewportWidth(),
  dpr = window.devicePixelRatio || 1,
): number {
  const widthFactor = clamp(width / 1440, 0.95, 1.18);
  let dprFactor = 1;
  if (dpr >= 2) dprFactor = 1.1;
  else if (dpr >= 1.5) dprFactor = 1.05;
  return clamp(widthFactor * dprFactor, 0.95, 1.25);
}

export function applyUiScale() {
  const scale = computeUiScale();
  const root = document.documentElement;
  root.style.zoom = String(scale);
  // Consumed by CSS (#origin) to size the app root as 100dvh|dvw / scale,
  // so the zoomed content renders exactly to the window without overflow.
  root.style.setProperty("--ui-scale", String(scale));
  return scale;
}

let started = false;
let debounceTimer: number | null = null;
let dprMedia: MediaQueryList | null = null;

function onDprChange() {
  scheduleApply();
}

function scheduleApply() {
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    applyUiScale();
    bindDprWatcher();
  }, 100);
}

function bindDprWatcher() {
  const next = window.matchMedia(
    `(resolution: ${window.devicePixelRatio}dppx)`,
  );
  if (dprMedia) {
    if (typeof dprMedia.removeEventListener === "function") {
      dprMedia.removeEventListener("change", onDprChange);
    } else {
      dprMedia.removeListener(onDprChange);
    }
  }
  dprMedia = next;
  if (typeof dprMedia.addEventListener === "function") {
    dprMedia.addEventListener("change", onDprChange);
  } else {
    dprMedia.addListener(onDprChange);
  }
}

/** Apply scale immediately and keep it in sync with resize / DPR changes. */
export function startUiScale() {
  if (started) return;
  started = true;
  applyUiScale();
  window.addEventListener("resize", scheduleApply);
  bindDprWatcher();
}
