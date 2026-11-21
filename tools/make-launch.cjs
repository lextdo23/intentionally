// Remakes the launch pictures in icons/launch-*.png: what an iPhone shows the instant Daydeck is opened from the
// home screen, before the page has loaded. They're drawn from the splash in index.html itself, so the hand-over from
// the phone's picture to the page can't be seen (alex 2026-11-21: "shows the logo on a blank screen, then loads").
// Run from the project folder:  node tools/make-launch.cjs   (needs Playwright)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

// iPhone screen sizes in points, and how many pixels per point. index.html links each picture to its size.
const SIZES = [[440, 956, 3], [430, 932, 3], [428, 926, 3], [402, 874, 3], [393, 852, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2], [375, 667, 2]];

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const splash = html.match(/<div id="splash"[\s\S]*?<\/div>/)[0];

(async () => {
  const browser = await chromium.launch();
  for (const [w, hgt, k] of SIZES) {
    const page = await browser.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: k });
    await page.setContent(`<!doctype html><html><head><style>${style} body { margin: 0; }</style></head><body>${splash}</body></html>`);
    const file = `icons/launch-${w * k}x${hgt * k}.png`;
    await page.screenshot({ path: path.join(__dirname, "..", file) });
    console.log("made", file);
    await page.close();
  }
  await browser.close();
  // Down to 256 colours, which this picture needs no more than (about 900 KB to about 200 KB each). Needs Python's Pillow.
  require("child_process").execFileSync("python3", ["-c", `
import glob
from PIL import Image
for f in glob.glob("icons/launch-*.png"):
    Image.open(f).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)
`], { cwd: path.join(__dirname, ".."), stdio: "inherit" });
})();
