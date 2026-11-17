// The old app (root) shares browser storage with Daydeck (/v2/). When the old app updates, it must clear only its
// own old saved copies, never Daydeck's saved files, card reminder text or nudge counts. Made-up data only.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), p = await b.newPage();
  await p.goto(server.url + "v2/"); await p.waitForTimeout(500);
  // Plant Daydeck's caches and an out-of-date old-app copy, as they'd be on a real phone.
  await p.evaluate(async () => {
    for (const name of ["daydeck-d30", "nudge-plan", "nudge-log", "notify", "v1"]) await (await caches.open(name)).put("made-up", new Response("{}"));
  });
  // Open the old app and switch on its offline helper, as an update would (the app itself only does this on https).
  await p.goto(server.url);
  await p.evaluate(() => Promise.race([new Promise((r) => setTimeout(r, 15000)), navigator.serviceWorker.register("sw.js").then((reg) => new Promise((done) => {
    const w = reg.installing || reg.waiting || reg.active; if (w.state === "activated") return done();
    w.addEventListener("statechange", () => w.state === "activated" && done());
  }))]));
  await p.waitForTimeout(500);
  const keys = await p.evaluate(() => caches.keys());
  const version = (require("fs").readFileSync(require("path").join(__dirname, "..", "sw.js"), "utf8").match(/VERSION = "([^"]+)"/) || [])[1];
  check(keys.includes(version), `the old app saved its own copy (${version})`);
  check(!keys.includes("v1"), "the old app cleared its own out-of-date copy");
  for (const name of ["daydeck-d30", "nudge-plan", "nudge-log", "notify"]) check(keys.includes(name), `${name} is left alone`);
  await b.close(); server.close(); done();
})();
