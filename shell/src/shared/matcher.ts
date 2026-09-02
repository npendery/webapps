export interface SiteRules {
  id: string;
  match: string[];
  allow: string[];
}

export interface HostPattern {
  host: string;
  wildcard: boolean;
  pathPrefix: string | null;
}

const REDIRECTOR_HOST = 'www.google.com';
const REDIRECTOR_PATH = '/url';

/**
 * Pattern grammar: `host[/path-prefix]`. A leading `*.` matches any subdomain
 * of `host` but not `host` itself. Host comparison is case-insensitive.
 */
export function parsePattern(raw: string): HostPattern {
  const trimmed = raw.trim().toLowerCase();
  const slash = trimmed.indexOf('/');
  const hostPart = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const pathPrefix = slash === -1 ? null : trimmed.slice(slash);
  if (hostPart.startsWith('*.')) {
    return { host: hostPart.slice(2), wildcard: true, pathPrefix };
  }
  return { host: hostPart, wildcard: false, pathPrefix };
}

export function matchesPattern(url: URL, pattern: HostPattern): boolean {
  const host = url.hostname.toLowerCase();
  const hostOk = pattern.wildcard ? host.endsWith(`.${pattern.host}`) : host === pattern.host;
  if (!hostOk) return false;
  return pattern.pathPrefix === null || url.pathname.startsWith(pattern.pathPrefix);
}

export function matchesAnyPattern(url: URL, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(url, parsePattern(p)));
}

/** Parse `input` as a URL, accepting only http and https. */
export function parseHttpUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url;
}

/** Gmail wraps outbound links in `https://www.google.com/url?q=<target>`; return the target. */
export function unwrapRedirect(url: URL): URL {
  if (url.hostname.toLowerCase() !== REDIRECTOR_HOST || url.pathname !== REDIRECTOR_PATH) return url;
  const target = url.searchParams.get('q') ?? url.searchParams.get('url');
  if (!target) return url;
  return parseHttpUrl(target) ?? url;
}

export function normalizeUrl(input: string): URL | null {
  const url = parseHttpUrl(input);
  return url ? unwrapRedirect(url) : null;
}

/** True when the URL is one the router sends to this site. */
export function isMatch(site: SiteRules, input: string): boolean {
  const url = normalizeUrl(input);
  return url !== null && matchesAnyPattern(url, site.match);
}

/** True when the URL stays in-app but is not routed here (login and account pages). */
export function isAllowed(site: SiteRules, input: string): boolean {
  const url = normalizeUrl(input);
  return url !== null && matchesAnyPattern(url, site.allow);
}

export function isInScope(site: SiteRules, input: string): boolean {
  return isMatch(site, input) || isAllowed(site, input);
}

/** The id of the site whose `match` patterns claim this URL, or null. */
export function routeTarget(sites: SiteRules[], input: string): string | null {
  const url = normalizeUrl(input);
  if (!url) return null;
  const site = sites.find((s) => matchesAnyPattern(url, s.match));
  return site?.id ?? null;
}

/** Every `match` pattern must belong to exactly one site. */
export function validateSites(sites: SiteRules[]): string[] {
  const errors: string[] = [];
  const owners = new Map<string, string>();
  for (const site of sites) {
    for (const raw of site.match) {
      const key = raw.trim().toLowerCase();
      const owner = owners.get(key);
      if (owner !== undefined && owner !== site.id) {
        errors.push(`pattern "${key}" claimed by both ${owner} and ${site.id}`);
      }
      owners.set(key, site.id);
    }
  }
  return errors;
}
