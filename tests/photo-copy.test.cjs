// "Save a copy" carries the photos, and "Restore from a file" puts them back (alex 2026-11-20), so moving to a new
// phone or address keeps them. Made-up data and a made-up picture only.
const { chromium } = require("playwright");
const fs = require("fs");
const { serve, checker } = require("./helpers.cjs");

const day = (n) => { const d = new Date(Date.now() - n * 864e5 - 4 * 3600e3); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ acceptDownloads: true }), p = await ctx.newPage();
  // Accounts are on for everyone (alex 2026-11-20): this test is about something else, so it acts as someone who chose
  // "Use without an account".
  await ctx.addInitScript(() => { if (!localStorage.getItem("daydeck-account")) localStorage.setItem("daydeck-account", '{"skip":1}'); });
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}', headers: { "access-control-allow-origin": "*" } }));
  const days = { [day(1)]: { mood: 3, feel: ["calm"] }, [day(0)]: { mood: 2 } };
  await p.goto(server.url);
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" } })), days);
  await p.reload(); await p.waitForTimeout(1200);

  // A made-up photo on yesterday: a plain orange square.
  await p.evaluate(async (k) => {
    const ph = await import("./js/photos.js");
    const c = document.createElement("canvas"); c.width = ph.W; c.height = ph.H; const g = c.getContext("2d"); g.fillStyle = "#e08a3c"; g.fillRect(0, 0, c.width, c.height);
    await ph.save(k, c, { src: "lib" });
  }, day(1));
  const openSettings = async () => { if (await p.$("#settings")) return; await p.click('#pill [data-tab="you"]'); await p.waitForTimeout(400); await p.click('#you button[aria-label="Settings"]'); await p.waitForTimeout(700); };
  const tapRow = async (text) => p.evaluate((t) => [...document.querySelectorAll("#settings button")].find((x) => x.textContent.trim().startsWith(t))?.click(), text);

  await openSettings();
  const [dl] = await Promise.all([p.waitForEvent("download"), tapRow("Save a copy")]);
  const file = await dl.path(), copy = JSON.parse(fs.readFileSync(file, "utf8"));
  check(copy.photos && Object.keys(copy.photos).length === 1 && copy.photos[day(1)], "the copy holds the photo");
  check(copy.photos[day(1)].full.startsWith("data:image/jpeg;base64,") && copy.photos[day(1)].thumb.startsWith("data:image/jpeg;base64,"), "the photo is saved as a picture, full size and small");
  check(!copy.data.tester, "tester details stay out of the copy");

  // A new phone: nothing on it.
  await p.evaluate(async () => { localStorage.clear(); await (await import("./js/photos.js")).wipe(); });
  await p.evaluate((days) => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: Object.keys(days).sort()[0], days, seen: { note: "sleep" } })), { [day(0)]: {} });
  await p.reload(); await p.waitForTimeout(1200);
  check(await p.evaluate(async () => (await import("./js/photos.js")).keys().length) === 0, "the new phone starts with no photos");

  await openSettings();
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), tapRow("Restore from a file")]);
  await chooser.setFiles(file); await p.waitForTimeout(600);
  const said = await p.evaluate(() => document.querySelector(".sheet, [role=dialog]:last-of-type")?.textContent || document.body.textContent);
  check(/2 days and 1 photo/.test(said), "the restore sheet says it holds 2 days and 1 photo");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Restore")?.click());
  await p.waitForTimeout(1200);
  const back = await p.evaluate(async (k) => {
    const ph = await import("./js/photos.js"), u = await ph.url(k, "full");
    if (!u) return null;
    const img = new Image(); img.src = u; await img.decode();
    const c = document.createElement("canvas"); c.width = 4; c.height = 4; c.getContext("2d").drawImage(img, 0, 0, 4, 4);
    return { n: ph.keys().length, px: [...c.getContext("2d").getImageData(1, 1, 1, 1).data].slice(0, 3), w: img.naturalWidth };
  }, day(1));
  check(back && back.n === 1, "after restoring, the photo is back on its day");
  check(back && back.w === 1080 && Math.abs(back.px[0] - 0xe0) < 12 && Math.abs(back.px[1] - 0x8a) < 12, "it's the same picture, at full size");
  check(await p.evaluate((k) => JSON.parse(localStorage.getItem("daydeck")).days[k].mood === 3, day(1)), "the days come back too");

  // An older copy without photos still restores.
  const old = file + ".old.json"; fs.writeFileSync(old, JSON.stringify({ app: "daydeck", saved: day(0), data: copy.data }));
  await openSettings();
  const [ch2] = await Promise.all([p.waitForEvent("filechooser"), tapRow("Restore from a file")]);
  await ch2.setFiles(old); await p.waitForTimeout(600);
  check(await p.evaluate(() => /holds 2 days\. It replaces/.test(document.body.textContent)), "a copy saved before this change still restores (days only)");
  check(errors.length === 0, "no page errors" + (errors.length ? `: ${errors.join("; ")}` : ""));
  await b.close(); server.close(); done();
})();
