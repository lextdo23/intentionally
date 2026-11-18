// Showing a new thing once, where it lives (alex 2026-11-18, picked "A. A tip that points at it").
// When a level opens something, home dims, the thing stays lit, and a short tip sits beside it with "Got it".
// Tapping the lit thing opens it straight away. Each tip shows once, never on day one, and never for people who
// already had everything open. Inside a screen, a small gold "New" tag sits on the new thing until it's first used.
import { h } from "./util.js";
import * as store from "./store.js";
import * as levels from "./levels.js";
import { log } from "./tester.js";

// Where each new thing lives on home (the card library is the round Cards button at the top).
const TARGET = { days: "button.peek", own: ".btn-main", library: 'button[aria-label="Cards"]', months: "button.peek" };
const TIP = {
  days: ["Your days", "See how your days have felt, and what seems to help. It's always here at the top."],
  own: ["Make your own card", "Tonight, when you end your day, you can add something else you did as a card of your own."],
  library: ["Card library", "Every card in Daydeck, to look through and add to your deck."],
  months: ["Month and Year", "Open Your days to look back over a whole month or year."],
};

// Some tips wait for the right moment: making your own card is pointed out only while the day is still open.
// ("Change today" and "Going to sleep" mean the day is ended; the tip waits for tomorrow.)
const READY = { own: () => !document.querySelector(".btn-main.soft, .btn-main.with-ico") };
const mem = () => { const m = (store.get().levels = store.get().levels || {}); m.tips = m.tips || {}; return m; };
// Things opened by a level that haven't had their tip yet, lowest level first.
function waiting() {
  const m = mem();
  if (m.keepAll) return [];
  return levels.UNLOCKS.filter((u) => levels.isOpen(u.id) && !m.tips[u.id] && TIP[u.id]);
}

// "New" tag on something inside a screen, until it's first used. newTag("own") / used("own").
export function isNew(id) { const m = mem(); return !m.keepAll && levels.isOpen(id) && !(m.used || {})[id]; }
export function used(id) { const m = mem(); m.used = m.used || {}; if (!m.used[id]) { m.used[id] = 1; store.save(); } }
export const newTag = () => h("span.new-tag", null, "New");

let layer = null;
// Show the next waiting tip if home is quiet and its thing is on screen. Returns true if one showed.
export function next() {
  if (layer || document.querySelector(".sheet-host, .cam, .ph-viewer")) return false;
  if (["in-ask", "in-flow", "in-wrap", "in-photos", "in-settings", "in-levels", "in-days", "in-cards"].some((x) => document.body.classList.contains(x))) return false;
  const u = waiting().find((x) => document.querySelector(TARGET[x.id]) && (!READY[x.id] || READY[x.id]()));
  if (!u) return false;
  const el = document.querySelector(TARGET[u.id]), r = el.getBoundingClientRect();
  if (!r.width) return false;
  const m = mem(); m.tips[u.id] = 1; store.save(); log("unlock_tip", u.id);
  const [title, text] = TIP[u.id];
  const pad = 4, rad = Math.min(26, (r.height + pad * 2) / 2);
  const hole = h("button.tip-hole", { "aria-label": `Open ${title}`, style: { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: `${rad}px` } });
  const ok = h("button.tip-ok", null, "Got it");
  const below = r.top + r.height / 2 < innerHeight / 2;
  const box = h(`div.tip-box.${below ? "below" : "above"}`, { role: "dialog", "aria-label": `New: ${title}` },
    h("span.tip-k", null, "New"), h("span.tip-t", null, title), h("span.tip-d", null, text), ok);
  box.style.setProperty("--ax", `${Math.max(28, Math.min(innerWidth - 28, r.left + r.width / 2)) - 20}px`);
  if (below) box.style.top = `${r.bottom + pad + 16}px`; else box.style.bottom = `${innerHeight - r.top + pad + 16}px`;
  layer = h("div.tip-layer", null, hole, box);
  const close = (go) => {
    if (!layer) return;
    const l = layer; layer = null; l.classList.add("out"); setTimeout(() => l.remove(), 300);
    if (go) el.click(); else setTimeout(() => next(), 600);   // another waiting tip (rare: two levels at once)
  };
  layer.addEventListener("click", (e) => { if (e.target === layer) close(false); });
  hole.addEventListener("click", () => close(true));
  ok.addEventListener("click", () => close(false));
  document.body.append(layer);
  requestAnimationFrame(() => { layer && layer.classList.add("on"); });
  return true;
}

// After a level-up the "Level 4." moment plays first (about 3.6s), then the tip, once home is quiet.
let t = 0;
export function soon(delay = 4200) {
  clearTimeout(t);
  if (!waiting().length) return;
  let tries = 0;
  const go = () => { if (!next() && waiting().length && ++tries < 20) t = setTimeout(go, 1500); };
  t = setTimeout(go, delay);
}
