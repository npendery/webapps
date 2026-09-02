// TEMPORARY: proves open-url delivery to a packaged app. Replaced by the full shell in Task 8.
import { app, BaseWindow, WebContentsView } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { resolveSiteConfig } from '../shared/site';

const site = resolveSiteConfig({
  resourcesPath: process.resourcesPath,
  siteId: process.env.WEBAPPS_SITE,
  sitesFile: path.join(app.getAppPath(), 'sites.json'),
});
app.setName(site.name);
app.setPath('userData', path.join(app.getPath('appData'), site.name));
const log = (line: string) =>
  fs.appendFileSync(path.join(app.getPath('userData'), 'open-url.log'), `${new Date().toISOString()} ${line}\n`);

let view: WebContentsView | null = null;
app.on('open-url', (event, url) => {
  event.preventDefault();
  log(`open-url ${url}`);
  void view?.webContents.loadURL(url);
});

void app.whenReady().then(() => {
  const win = new BaseWindow({ width: 1200, height: 800, title: site.name });
  view = new WebContentsView();
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 1200, height: 800 });
  void view.webContents.loadURL(site.home);
  log('ready');
});
