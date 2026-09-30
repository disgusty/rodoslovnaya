// Renders build/icon.svg to build/icon.png (512×512) with Electron's Chromium.
// Run: electron scripts/make-icon.cjs   (electron-builder converts the PNG to .ico)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(path.join(dir, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG());
  console.log('build/icon.png written');
  app.quit();
});
