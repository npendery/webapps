import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readSitesFile, siteConfigs } from '../shell/src/shared/site';

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const only = process.argv.slice(2);
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

fs.mkdirSync(dist, { recursive: true });
const sitesFile = readSitesFile(path.join(root, 'sites.json'));

for (const site of siteConfigs(sitesFile)) {
  if (only.length > 0 && !only.includes(site.id)) continue;
  console.log(`\n=== building ${site.name} (${site.bundleId})`);

  const siteJson = path.join(dist, `site-${site.id}.json`);
  fs.writeFileSync(siteJson, JSON.stringify(site, null, 2));

  const icon = path.join(root, 'icons', `${site.id}.icns`);
  if (!fs.existsSync(icon)) throw new Error(`missing ${icon}; run scripts/fetch-icons.sh`);

  const config = {
    appId: site.bundleId,
    productName: site.name,
    extraMetadata: { name: site.id, productName: site.name },
    directories: { output: path.join(dist, 'build', site.id) },
    files: ['shell/out/**/*', 'shell/ui/**/*', '!**/*.map'],
    extraResources: [{ from: siteJson, to: 'site.json' }],
    mac: {
      target: [{ target: 'dir', arch: [arch] }],
      icon,
      identity: null,
      category: 'public.app-category.productivity',
    },
    protocols: [{ name: 'Web URL', schemes: ['http', 'https'], role: 'Viewer' }],
    npmRebuild: false,
  };
  const configPath = path.join(dist, `builder-${site.id}.json`);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  execFileSync('pnpm', ['exec', 'electron-builder', '--mac', '--config', configPath], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  });

  const outDir = path.join(dist, 'build', site.id);
  const macDir = fs.readdirSync(outDir).find((d) => d.startsWith('mac'));
  if (!macDir) throw new Error(`no mac output under ${outDir}`);
  const built = path.join(outDir, macDir, `${site.name}.app`);
  const target = path.join(dist, `${site.name}.app`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(built, target);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', target], { stdio: 'inherit' });
  console.log(`=== ${target}`);
}
