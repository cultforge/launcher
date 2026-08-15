import { LazyStore } from "@tauri-apps/plugin-store";

const nativeStore = new LazyStore("cultforge-preferences.json", {
  autoSave: true,
  defaults: {},
});

const fallbackKey = "cultforge-preferences";

function readFallback(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(fallbackKey) ?? "{}") as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

function writeFallback(values: Record<string, unknown>) {
  try {
    localStorage.setItem(fallbackKey, JSON.stringify(values));
  } catch {
    // Native persistence remains the primary storage path.
  }
}

export async function getPreference<T>(key: string): Promise<T | undefined> {
  try {
    return await nativeStore.get<T>(key);
  } catch {
    return readFallback()[key] as T | undefined;
  }
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  try {
    await nativeStore.set(key, value);
    await nativeStore.save();
  } catch {
    const values = readFallback();
    values[key] = value;
    writeFallback(values);
  }
}
