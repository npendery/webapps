// Write dist/routes.json for LinkRouter from sites.json.
// Usage: tsx scripts/gen-routes.ts [--fallback <bundleId>]
// --fallback overrides sites.json's fallbackBrowser; install.sh passes the
// browser that was the default before LinkRouter took over.
import fs from 'node:fs';
import path from 'node:path';
import { readSitesFile, siteConfigs } from '../shell/src/shared/site';

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fallbackIndex = args.indexOf('--fallback');
const fallbackOverride = fallbackIndex === -1 ? undefined : args[fallbackIndex + 1];
if (fallbackIndex !== -1 && !fallbackOverride) {
  console.error('usage: gen-routes [--fallback <bundleId>]');
  process.exit(2);
}

const sitesFile = readSitesFile(path.join(root, 'sites.json'));
const routes = {
  fallback: fallbackOverride ?? sitesFile.fallbackBrowser,
  routes: siteConfigs(sitesFile).map((s) => ({ bundleId: s.bundleId, match: s.match })),
};
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'routes.json');
fs.writeFileSync(out, JSON.stringify(routes, null, 2) + '\n');
console.log(out);
