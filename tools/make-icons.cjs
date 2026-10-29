// Remakes the app icons in icons/: a sharp charcoal sparkle on warm paper, with a soft glow of sun behind it.
// Run from the project folder:  node tools/make-icons.cjs   (needs Playwright)
const { chromium } = require("playwright");

// The same sparkle as the thought stars (js/sky.js), with a slimmer waist so the points are sharper.
function sparkle(n, r, inner) {
  const P = (a, rr) => `${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i - Math.PI / 2, b = a + Math.PI / n, c = a + Math.PI * 2 / n;
    d += (i === 0 ? `M${P(a, r)}` : "") + ` Q${P(b, r * inner)} ${P(c, r)}`;
  }
  return d + "Z";
}

// Drawn on a 100 x 100 tile. The star stays inside the middle 80%, so phones that crop icons to a circle keep all of it.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="paper" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#f6efe4"/><stop offset="1" stop-color="#e3d6c3"/></radialGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="#f2c08f" stop-opacity=".45"/><stop offset=".4" stop-color="#f2c08f" stop-opacity=".135"/><stop offset="1" stop-color="#f2c08f" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100" height="100" fill="url(#paper)"/>
  <circle cx="50" cy="50" r="34" fill="url(#glow)"/>
  <path transform="translate(50,50)" d="${sparkle(4, 28, 0.16)}" fill="#24262b"/>
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
