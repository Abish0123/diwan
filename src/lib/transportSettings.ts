import { smartDb } from "./localDb";

const SETTINGS_ID = "global";

interface TransportConfig {
  schoolLat?: string;
  schoolLng?: string;
  schoolName?: string;
  schoolAddress?: string;
  [key: string]: unknown;
}

// getSchoolLat/Lng/Name/Address below are called synchronously from ~16
// call sites (PDF generators, map screens) that can't await a network
// round-trip mid-render. MySQL is still the only durable store — this is an
// in-memory read cache populated from it, not localStorage.
let cache: TransportConfig = {};
let loadPromise: Promise<void> | null = null;

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = smartDb.getOne("TransportSettings", SETTINGS_ID)
      .then((row) => { if (row) cache = row as TransportConfig; })
      .catch(() => { /* keep defaults */ });
  }
  return loadPromise;
}
ensureLoaded();

/** Called by the Transport Settings page after a successful save so every
 * open tab's cache reflects the new values without a full reload. */
export function setTransportSettingsCache(data: TransportConfig) {
  cache = { ...cache, ...data };
}

export async function saveTransportSettings(data: TransportConfig): Promise<void> {
  cache = { ...cache, ...data };
  await smartDb.create("TransportSettings", cache, SETTINGS_ID);
}

export async function loadTransportSettings(): Promise<TransportConfig> {
  loadPromise = null; // force a fresh fetch, bypassing the module-load cache
  await ensureLoaded();
  return cache;
}

export function getSchoolLat(): number {
  const v = parseFloat(cache.schoolLat ?? "");
  if (isFinite(v)) return v;
  return Number(import.meta.env.VITE_SCHOOL_LAT) || 8.1839;
}

export function getSchoolLng(): number {
  const v = parseFloat(cache.schoolLng ?? "");
  if (isFinite(v)) return v;
  return Number(import.meta.env.VITE_SCHOOL_LNG) || 77.4315;
}

export function getSchoolName(): string {
  return cache.schoolName || (import.meta.env.VITE_SCHOOL_NAME as string) || "Bluewood School";
}

export function getSchoolAddress(): string {
  return cache.schoolAddress || (import.meta.env.VITE_SCHOOL_ADDRESS as string) || "";
}
