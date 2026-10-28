// Remakes img/sky.jpg, the night behind everything: a charcoal gradient, soft cloud and a little film grain.
// It used to be drawn live, which was slow on phones, so it is drawn once here instead.
// Run from the project folder:  node tools/make-sky.cjs   (needs Playwright)
const { chromium } = require("playwright");

const W = 300, H = 650, SCALE = 3;
const defs = `<defs>
    <filter id="cloud" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="5" seed="4"/>
      <feColorMatrix values="0 0 0 0 .40  0 0 0 0 .44  0 0 0 0 .52  1.9 0 0 0 -0.92"/><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="cloud2" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.009 0.014" numOctaves="4" seed="21"/>
      <feColorMatrix values="0 0 0 0 .62  0 0 0 0 .52  0 0 0 0 .44  1.6 0 0 0 -0.9"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .7 -.3"/></filter>
    <radialGradient id="fade" cx="50%" cy="44%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="neb"><rect width="300" height="650" fill="url(#fade)"/></mask>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#24262b"/><stop offset=".55" stop-color="#141518"/><stop offset="1" stop-color="#08090a"/></radialGradient>
    <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>
    <filter id="wide" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="16"/></filter></defs>`;
const night = `<rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g mask="url(#neb)"><rect width="${W}" height="${H}" filter="url(#cloud)" opacity=".75"/><rect width="${W}" height="${H}" filter="url(#cloud2)" opacity=".22"/></g>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".07"/>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W * SCALE, height: H * SCALE } });
  await page.setContent(`<body style="margin:0"><svg width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">${defs}${night}</svg></body>`);
  await page.screenshot({ path: "img/sky.jpg", type: "jpeg", quality: 82 });
  await browser.close();
})();
