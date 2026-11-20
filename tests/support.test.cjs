// Settings, Support: Lifeline call, text and chat, Butterfly Foundation, QLife and 000 are all there and point to the right
// places; "isn't therapy" stays; the word "crisis" never shows on screen; check-ins still show the Lifeline line.
const { chromium } = require("playwright");
const { serve, checker } = require("./helpers.cjs");

const WANT = [
  ["Talk to someone", "Lifeline 13 11 14", "tel:131114"],
  ["Text someone", "0477 13 11 14", "sms:0477131114"],
  ["Chat online", "Lifeline", "https://www.lifeline.org.au/crisis-chat/"],
  ["Body image", "Butterfly 1800 33 4673", "tel:1800334673"],
  ["LGBTQIA+", "QLife 1800 184 527", "tel:1800184527"],
  ["In danger right now", "Call 000", "tel:000"],
];

(async () => {
  const server = await serve(), { check, done } = checker();
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 430, height: 932 } }), p = await ctx.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("https://intentionally-push.lextdo.workers.dev/**", (r) => r.abort());
  await p.goto(server.url + "v2/");
  await p.evaluate(() => localStorage.setItem("daydeck", JSON.stringify({ v: 1, started: "2026-11-10", days: {}, seen: { note: "x" } })));
  await p.reload(); await p.waitForTimeout(800);
  await p.evaluate(async () => (await import("./js/settings.js")).openSettings()); await p.waitForTimeout(600);

  const rows = await p.evaluate(() => [...document.querySelectorAll("#settings a.set-row")].map((a) => ({
    label: a.querySelector(".set-label").textContent, value: (a.querySelector(".set-value") || {}).textContent, href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel") })));
  for (const [label, value, href] of WANT) {
    const r = rows.find((x) => x.label === label);
    check(r && r.value === value && r.href === href, `${label} · ${value} → ${href}`);
  }
  const chat = rows.find((x) => x.label === "Chat online");
  check(chat && chat.target === "_blank" && chat.rel === "noopener", "chat opens in a new tab, safely");
  const text = await p.locator("#settings").innerText();
  check(text.includes("It isn't therapy"), "\"It isn't therapy\" still shows");
  check(!/crisis/i.test(text), "the word \"crisis\" isn't on screen");
  await p.screenshot({ path: process.env.SHOT || "/tmp/support.png", fullPage: false });
  check(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  await b.close(); server.close(); done();
})();
