import fs from 'node:fs';
import path from 'node:path';
import type { SiteRules } from './matcher';

/** One entry in sites.json. */
export interface SiteEntry extends SiteRules {
  name: string;
  home: string;
  icon: string;
}

export interface SitesFile {
  fallbackBrowser: string;
  bundleIdPrefix: string;
  sites: SiteEntry[];
}

/** What a built app reads from Resources/site.json. */
export interface SiteConfig extends SiteRules {
  name: string;
  home: string;
  bundleId: string;
  fallbackBrowser: string;
}

export function readSitesFile(file: string): SitesFile {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as SitesFile;
}

export function siteConfigs(file: SitesFile): SiteConfig[] {
  return file.sites.map((s) => ({
    id: s.id,
    name: s.name,
    home: s.home,
    match: s.match,
    allow: s.allow,
    bundleId: `${file.bundleIdPrefix}.${s.id}`,
    fallbackBrowser: file.fallbackBrowser,
  }));
}

export interface ResolveOptions {
  /** `process.resourcesPath`; a packaged app has `site.json` here. */
  resourcesPath: string;
  /** `WEBAPPS_SITE`, used when running unpackaged. */
  siteId: string | undefined;
  /** Path to sites.json for the unpackaged case. */
  sitesFile: string;
}

export function resolveSiteConfig(opts: ResolveOptions): SiteConfig {
  const embedded = path.join(opts.resourcesPath, 'site.json');
  if (fs.existsSync(embedded)) {
    return JSON.parse(fs.readFileSync(embedded, 'utf8')) as SiteConfig;
  }
  if (!opts.siteId) {
    throw new Error('No embedded site.json and WEBAPPS_SITE is not set');
  }
  const config = siteConfigs(readSitesFile(opts.sitesFile)).find((c) => c.id === opts.siteId);
  if (!config) throw new Error(`unknown site "${opts.siteId}" in ${opts.sitesFile}`);
  return config;
}
