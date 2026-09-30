// Generates Android launcher icons (legacy, round, adaptive foreground) and splash images
// from the app's icon artwork. Run: electron scripts/make-android-assets.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const SPLASH_BG = '#F7F2FA';

// the family glyph from build/icon.svg (drawn in a 512 box, centered at 256)
const GLYPH = `
  <g fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.92">
    <path d="M196 150 H316"/><path d="M256 150 V236"/><path d="M150 236 H362"/>
    <path d="M150 236 V300"/><path d="M362 236 V300"/><path d="M256 236 V300"/>
  </g>
  <g fill="#FFFFFF">
    <circle cx="170" cy="150" r="46"/><circle cx="342" cy="150" r="46"/>
    <circle cx="150" cy="346" r="42"/><circle cx="256" cy="346" r="42"/>
  </g>
  <circle cx="362" cy="346" r="42" fill="#F2B8B5"/>
  <circle cx="170" cy="150" r="20" fill="#4A3589" opacity="0.25"/>
  <circle cx="342" cy="150" r="20" fill="#4A3589" opacity="0.25"/>`;
const GRADIENT = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7E67C1"/><stop offset="1" stop-color="#4A3589"/></linearGradient></defs>`;

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${GRADIENT}${body}</svg>`;
// glyph scaled to `size` px and centered at (cx, cy)
const glyphAt = (cx, cy, size) => `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 512})">${GLYPH}</g>`;

const art = {
  // legacy square icon: rounded tile, full artwork
  legacy: (s) => svg(s, s, `<rect x="${s * 0.04}" y="${s * 0.04}" width="${s * 0.92}" height="${s * 0.92}" rx="${s * 0.22}" fill="url(#bg)"/>${glyphAt(s / 2, s / 2 + s * 0.02, s * 0.78)}`),
  round: (s) => svg(s, s, `<circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.46}" fill="url(#bg)"/>${glyphAt(s / 2, s / 2 + s * 0.02, s * 0.72)}`),
  // adaptive foreground: 108dp canvas, content inside the 66dp safe zone
  foreground: (s) => svg(s, s, glyphAt(s / 2, s / 2 + s * 0.015, s * 0.62)),
  splash: (w, h) => {
    const icon = Math.min(w, h) * 0.34;
    const x = (w - icon) / 2, y = (h - icon) / 2;
    return svg(w, h, `<rect width="${w}" height="${h}" fill="${SPLASH_BG}"/><rect x="${x}" y="${y}" width="${icon}" height="${icon}" rx="${icon * 0.24}" fill="url(#bg)"/>${glyphAt(w / 2, h / 2 + icon * 0.02, icon * 0.85)}`);
  },
};

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// SVG → <img> → canvas inside a hidden page; independent of window size and screen
async function render(win, markup, w, h, file) {
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = ${w}; c.height = ${h};
      c.getContext('2d').drawImage(img, 0, 0, ${w}, ${h});
      res(c.toDataURL('image/png'));
    };
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(markup)});
  })`);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

app.disableHardwareAcceleration();
app.whenReady().then(() => main().catch((e) => {
  console.error(e);
  app.exit(1);
}));

async function main() {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html></html>');
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${d}`);
    await render(win, art.legacy(48 * k), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'));
    await render(win, art.round(48 * k), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'));
    await render(win, art.foreground(108 * k), 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'));
  }
  // splash images: keep the size of every image the template ships
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const file = path.join(RES, dir, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const { nativeImage } = require('electron');
    const { width, height } = nativeImage.createFromPath(file).getSize();
    await render(win, art.splash(width, height), width, height, file);
  }
  console.log('android icons and splash written');
  app.quit();
}
