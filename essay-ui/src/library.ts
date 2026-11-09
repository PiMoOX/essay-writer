// Local library of saved essays, persisted in localStorage.
// The "essay-settings" key is never touched here; library records store only
// display information (provider label + model name), never the API key.

export type Essay = {
  id: string;
  topic: string;
  /** ISO timestamp of the first save. */
  createdAt: string;
  /** ISO timestamp of the most recent save. */
  updatedAt: string;
  draft: string;
  review: string;
  /** Saved revisions; versions[0] is the first revised essay. Empty while the essay is incomplete. */
  versions: string[];
  /** Index within `versions` of the version currently shown; absent defaults to the latest. */
  index?: number;
  /** Display label of the provider, never the API key or settings object. */
  provider: string;
  model: string;
};

/** Result of a write to the library; failures are surfaced to the UI. */
export type SaveResult = { ok: true } | { ok: false; error: string };

const KEY = "essay-library";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Best-effort validation so a corrupted entry never breaks the whole list. */
function normalize(raw: unknown): Essay | null {
  if (!isRecord(raw)) return null;
  const e = raw as Partial<Essay>;
  if (typeof e.id !== "string" || typeof e.topic !== "string") return null;
  const versions: string[] = Array.isArray(e.versions)
    ? e.versions.filter((v) => typeof v === "string")
    : [];
  const last = Math.max(versions.length - 1, 0);
  return {
    id: e.id,
    topic: e.topic,
    createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
    updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
    draft: typeof e.draft === "string" ? e.draft : "",
    review: typeof e.review === "string" ? e.review : "",
    versions,
    index:
      typeof e.index === "number" && Number.isInteger(e.index)
        ? Math.max(0, Math.min(e.index, last))
        : last,
    provider: typeof e.provider === "string" ? e.provider : "",
    model: typeof e.model === "string" ? e.model : "",
  };
}

/** All saved essays, newest first. Never throws. */
export function loadLibrary(): Essay[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((e): e is Essay => e !== null)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch {
    return [];
  }
}

/** A single essay by id, or null if missing or the store is unreadable. */
export function getEssay(id: string): Essay | null {
  try {
    return loadLibrary().find((e) => e.id === id) ?? null;
  } catch {
    return null;
  }
}

/** Create or update an essay by id. Failures (e.g. quota exceeded) are reported, never thrown. */
export function saveEssay(essay: Essay): SaveResult {
  try {
    const all = loadLibrary();
    const without = all.filter((e) => e.id !== essay.id);
    localStorage.setItem(KEY, JSON.stringify([...without, essay]));
    return { ok: true };
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      error: quota
        ? "Library save failed: browser storage is full (quota exceeded). Delete old essays to make room."
        : "Library save failed: the essay could not be written to local storage.",
    };
  }
}

/** Remove an essay. Returns false only if the store could not be updated. */
export function deleteEssay(id: string): boolean {
  try {
    const all = loadLibrary();
    const next = all.filter((e) => e.id !== id);
    if (next.length === all.length) return true; // not there already
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
