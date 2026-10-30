// Remakes the app icons in icons/: the app's warm, lit sun glowing in a deep blue night.
// Run from the project folder:  node tools/make-icons.cjs   (needs Playwright)
const { chromium } = require("playwright");

// The app's sun in a deep blue night. The sun is the brightest thing on the icon, which matters: the newest iOS lifts
// the brightest part of a web app icon as raised glass and sinks the rest, so a bright shape on a dark tile stays crisp.
// Drawn on a 100 x 100 tile. The sun stays inside the middle 80%, so phones that crop icons to a circle keep all of it.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27325a"/><stop offset="1" stop-color="#0e1226"/></linearGradient>
    <radialGradient id="dusk" cx="85%" cy="10%" r="70%"><stop offset="0" stop-color="#3b2f5c" stop-opacity=".8"/><stop offset="1" stop-color="#3b2f5c" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#f6c48c" stop-opacity=".55"/><stop offset=".45" stop-color="#f2c08f" stop-opacity=".165"/><stop offset="1" stop-color="#f2c08f" stop-opacity="0"/></radialGradient>
    <linearGradient id="disc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf2"/><stop offset="1" stop-color="#f2b27a"/></linearGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".35"/></filter>
  </defs>
  <rect width="100" height="100" fill="url(#night)"/>
  <rect width="100" height="100" fill="url(#dusk)"/>
  <circle cx="50" cy="50" r="48.4" fill="url(#glow)"/>
  <circle cx="50" cy="50" r="22" fill="url(#disc)" filter="url(#shadow)"/>
</svg>`;

const OUT = [["icons/apple-touch-icon.png", 180], ["icons/icon-192.png", 192], ["icons/icon-512.png", 512], ["icons/icon-maskable-512.png", 512]];

(async () => {
  const browser = await chromium.launch();
  for (const [file, size] of OUT) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg(size)}</body>`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
  }
  await browser.close();
})();
