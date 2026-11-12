import { SCALE_STEPS, SCHEMA_VERSION, type Project } from '@/types';

/** LocalStorage adapter (WS-001/003/004). Every read and write is guarded; nothing here throws. */

const KEY = 'palette-ai:project:v1';
const BACKUP_KEY = 'palette-ai:corrupt-backup';

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; project: Project }
  | { status: 'corrupt'; reason: string }
  | { status: 'unavailable' };

function looksLikeProject(data: any): data is Project {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.id !== 'string' || typeof data.name !== 'string') return false;
  if (data.schemaVersion !== SCHEMA_VERSION) return false;
  if (!Array.isArray(data.palettes) || !Array.isArray(data.colourFamilies)) return false;
  for (const family of data.colourFamilies) {
    if (typeof family?.familyName !== 'string' || !family.base?.oklch) return false;
    for (const step of SCALE_STEPS) {
      const shade = family.shades?.[step];
      if (!shade || !/^#[0-9A-F]{6}$/.test(shade.hex) || typeof shade.oklch?.l !== 'number') return false;
    }
  }
  for (const palette of data.palettes) {
    if (!Array.isArray(palette?.colours) || !palette.anchor) return false;
    if (palette.colours.some((c: any) => !/^#[0-9A-F]{6}$/.test(c?.hex) || typeof c?.role !== 'string')) return false;
  }
  return true;
}

export function loadProject(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { status: 'unavailable' };
  }
  if (!raw) return { status: 'empty' };
  try {
    const data = JSON.parse(raw);
    if (looksLikeProject(data)) {
      return { status: 'ok', project: { ...data, tokens: data.tokens ?? [], themes: data.themes ?? [] } };
    }
    throw new Error('Saved data did not match the expected project shape.');
  } catch (e) {
    // Keep the unreadable data so nothing is silently lost, then start clean.
    try {
      localStorage.setItem(BACKUP_KEY, raw);
    } catch {
      /* ignore */
    }
    return { status: 'corrupt', reason: (e as Error).message };
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

export function saveProject(project: Project): SaveResult {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return { ok: true };
  } catch (e) {
    const name = (e as DOMException)?.name ?? '';
    return { ok: false, reason: /quota/i.test(name) ? 'quota' : 'unavailable' };
  }
}

export function clearProject() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
