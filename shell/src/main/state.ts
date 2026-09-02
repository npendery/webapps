import fs from 'node:fs';
import path from 'node:path';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PersistedState {
  bounds: WindowBounds | null;
  tabs: string[];
  activeIndex: number;
}

export const EMPTY_STATE: PersistedState = { bounds: null, tabs: [], activeIndex: 0 };

export interface StateStore {
  load(): PersistedState;
  /** Debounced; the last state passed wins. */
  save(state: PersistedState): void;
  /** Write any pending state now (used on window close). */
  flush(): void;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeBounds(value: unknown): WindowBounds | null {
  if (typeof value !== 'object' || value === null) return null;
  const b = value as Record<string, unknown>;
  const nums = [b.x, b.y, b.width, b.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  return { x: b.x as number, y: b.y as number, width: b.width as number, height: b.height as number };
}

export function readState(file: string): PersistedState {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ...EMPTY_STATE };
  }
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_STATE };
  const r = raw as Record<string, unknown>;
  const tabs = Array.isArray(r.tabs) ? r.tabs.filter(isHttpUrl) : [];
  const idx = typeof r.activeIndex === 'number' ? r.activeIndex : 0;
  const activeIndex = idx >= 0 && idx < tabs.length ? idx : 0;
  return { bounds: sanitizeBounds(r.bounds), tabs, activeIndex };
}

export function writeState(file: string, state: PersistedState): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

export function createStateStore(file: string, delayMs = 500): StateStore {
  let pending: PersistedState | null = null;
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending) {
      try {
        writeState(file, pending);
      } catch (err) {
        console.error('state write failed', err);
      }
      pending = null;
    }
  };
  return {
    load: () => readState(file),
    save: (state) => {
      pending = state;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
