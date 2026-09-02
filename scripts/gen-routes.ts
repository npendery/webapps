import fs from 'node:fs';
import path from 'node:path';
import { readSitesFile, siteConfigs } from '../shell/src/shared/site';

const root = path.resolve(__dirname, '..');
const sitesFile = readSitesFile(path.join(root, 'sites.json'));
const routes = {
  fallback: sitesFile.fallbackBrowser,
  routes: siteConfigs(sitesFile).map((s) => ({ bundleId: s.bundleId, match: s.match })),
};
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'routes.json');
fs.writeFileSync(out, JSON.stringify(routes, null, 2) + '\n');
console.log(out);
