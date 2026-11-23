// Remakes the app icons in icons/: the Daydeck eclipse, a flat black disc with the marigold sun (alex 2026-11-23, new look).
// Run from the project folder:  node tools/make-icons.cjs   (needs Playwright)
const { chromium } = require("playwright");

// Drawn on a 100 x 100 white tile, the same eclipse as the splash. It stays inside the middle 80%, so phones that crop
// icons to a circle keep all of it. No glow or gradient (alex 2026-11-23).
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><clipPath id="in"><circle cx="50" cy="50" r="27"/></clipPath></defs>
  <rect width="100" height="100" fill="#ffffff"/>
  <circle cx="50" cy="50" r="27" fill="#0a0a0b"/>
  <circle cx="61.2" cy="50" r="23.1" fill="#ffa51f" clip-path="url(#in)"/>
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
