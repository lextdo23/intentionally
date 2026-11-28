// The morning notification's words (showMorning in sw.js, alex 2026-11-28): friends first, then a finding, then plain
// words; never the card, never "Good morning"; quiet if a friend notification came in the last 90 minutes.
// Runs sw.js in a pretend service worker. No browser needed.
const fs = require("fs"), path = require("path"), vm = require("vm");
const { checker } = require("./helpers.cjs");

function worker() {
  const store = {}, shown = [], handlers = {};
  const cache = (name) => ({
    match: async (k) => (store[name + "/" + k] != null ? { json: async () => JSON.parse(store[name + "/" + k]), text: async () => store[name + "/" + k] } : undefined),
    put: async (k, r) => { store[name + "/" + k] = await r.text(); }, delete: async (k) => delete store[name + "/" + k],
  });
  class Response { constructor(b) { this.b = b; } async text() { return this.b; } async json() { return JSON.parse(this.b); } }
  const self = { addEventListener: (n, f) => (handlers[n] = f), registration: { showNotification: async (title, o) => shown.push({ title, ...o }) }, clients: { matchAll: async () => [] }, navigator: {} };
  const ctx = { self, caches: { open: async (n) => cache(n), keys: async () => [] }, Response, Date, Math, JSON, String, Number, URL, Infinity, location: { origin: "x" }, fetch: async () => ({}) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), ctx);
  const put = (k, v) => (store["nudge-plan/" + k] = JSON.stringify(v));
  const ping = async () => { let p; handlers.push({ data: null, waitUntil: (x) => (p = x) }); await p; return shown[shown.length - 1]; };
  return { put, ping, shown, store };
}

(async () => {
  const { check, done } = checker();
  const RealDate = Date, at = new RealDate(2026, 10, 28, 7, 40).getTime();
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } };

  let w = worker(), n = await w.ping();
  check(n && n.tag === "daydeck-am" && !/good morning|card/i.test(n.title + n.body), "no data: plain words, no greeting and no card (" + (n && n.title) + ")");

  w = worker(); w.put("morning", { k: "x", t: at, id: "sleep", title: "Your best days came after a certain amount of sleep", body: "From your last 20 nights." });
  n = await w.ping();
  check(n && n.title.startsWith("Your best days") && n.data.line === "finding", "a finding when there's one for this morning");

  w = worker(); w.put("morning", { t: at, title: "A finding", body: "x" }); w.put("social", { t: at - 3 * 36e5, title: "Mia replied to your comment", body: "Sam shared a moment" });
  n = await w.ping();
  check(n && n.title === "Mia replied to your comment" && n.data.line === "social", "friends' news beats the finding");

  w = worker(); w.put("social", { t: at - 30 * 60e3, title: "Sam shared a moment", body: "" });
  const before = w.shown.length; await w.ping();
  check(w.shown.length === before, "a friend notification in the last 90 minutes: stays quiet, no second buzz");

  w = worker(); w.put("social", { t: at - 20 * 36e5, title: "Old news", body: "" });
  n = await w.ping();
  check(n && n.title !== "Old news", "friend news older than 16 hours is left out");
  check(JSON.parse(w.store["nudge-log/log"]).some((e) => e[1] === "line"), "which words were used is noted for tester mode");
  done();
})();
