import { encodeSpec, type AppSpec } from '../compiler/spec';

/** Maps built in this browser, newest first, so the studio can reopen them. Per viewer only. */
export interface RecentMap {
  title: string;
  token: string;
  at: string;
  place: string;
}

const KEY = 'interchange.recent';

export function loadRecent(): RecentMap[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberMap(spec: AppSpec): void {
  try {
    const token = encodeSpec(spec);
    const list = loadRecent().filter((r) => r.title !== spec.title || r.place !== spec.aoi.name);
    list.unshift({ title: spec.title, token, at: new Date().toISOString().slice(0, 10), place: spec.aoi.name });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* storage blocked: nothing to remember */
  }
}

export function forgetMaps(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
