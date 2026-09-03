import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where install.sh writes LinkRouter's config. */
export const ROUTES_CONFIG_PATH = path.join(os.homedir(), '.config', 'webapps', 'routes.json');

/**
 * The fallback browser recorded at install time (the browser that was the
 * default before LinkRouter took over), or null when unavailable.
 */
export function readInstalledFallback(file: string = ROUTES_CONFIG_PATH): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { fallback?: unknown };
    return typeof parsed.fallback === 'string' && parsed.fallback.length > 0 ? parsed.fallback : null;
  } catch {
    return null;
  }
}
