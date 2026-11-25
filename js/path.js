// Your levels (alex 2026-11-18, picked "a path" because it's the easiest to read): one line down the page, lit up
// to where you are. The next things are named; after that it says "Something new". Opens from the level row on home.
import { h, reduceMotion } from "./util.js";
import { roundBtn } from "./ui.js";
import * as levels from "./levels.js";
import { log } from "./tester.js";

const SHOW_AHEAD = 2;   // name the next two things, then "Something new"
const ALWAYS = "Always open: Going to sleep, What's been on your mind?, rest days, your pillars and Talk to someone.";

let page = null, onClosedL = null;
export function openLevels(closed) {
  if (page) return;
  onClosedL = closed; log("levels_open", levels.level().level);
  page = h("div", { id: "levels", role: "dialog", "aria-modal": "true", "aria-label": "Your levels" });
  page.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLevels(); });
  page.append(h("div.lp-scroll", null, body()));
  document.body.append(page);
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("in-levels"); page.querySelector(".round")?.focus({ preventScroll: true }); }));
  edgeSwipe(page);
}
function closeLevels() {
  if (!page) return;
  const p = page; page = null;
  document.body.classList.remove("in-levels");
  setTimeout(() => p.remove(), reduceMotion() ? 160 : 420);
  onClosedL && onClosedL();
}
function edgeSwipe(el) {
  let x0 = null, dx = 0;
  el.addEventListener("pointerdown", (e) => { if (e.clientX < 28 && e.pointerType !== "mouse") { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; } });
  el.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, e.clientX - x0); el.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (x0 == null) return; x0 = null; el.style.transition = ""; el.style.transform = ""; if (dx > innerWidth * 0.33) closeLevels(); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}

// The steps: level 1 (the basics), every level that opens something, then the next "Something new" levels.
export function steps(now = levels.level().level) {
  const list = [{ level: 1, ...levels.BASICS }].concat(levels.UNLOCKS.map((u) => ({ level: u.level, name: u.name, line: u.line })));
  // Past and current steps, then up to SHOW_AHEAD named ones still to come, then one "Something new".
  const ahead = list.filter((s) => s.level > now).slice(0, SHOW_AHEAD);
  const out = list.filter((s) => s.level <= now).concat(ahead).map((s) => ({ ...s, state: s.level < now ? "lit" : s.level === now ? "here" : "soon" }));
  out.push({ level: Math.max(out[out.length - 1].level, now) + 1, name: "Something new", state: "hide" });
  return out;
}

function body() {
  const L = levels.level();
  const lv = L.level, list = steps(lv);
  // Past the map, the person's own level sits on the path too, so "You're here" is always on it.
  const here = list.some((s) => s.state === "here");
  if (!here) {
    const i = list.findIndex((s) => s.level > lv);
    list.splice(i < 0 ? list.length : i, 0, { level: lv, name: "A box every level", state: "here" });
  }
  const bar = h("div.lp-bar", null, h("i", { style: { width: `${Math.round(L.frac * 1000) / 10}%` } }));
  return h("div.lp-page", null,
    h("div.page-head", null, roundBtn("back", "Back to today", closeLevels)),
    h("div.lp-head", null,
      h("h1.big-title", null, "Your levels"),
      h("div.lp-line", { role: "img", "aria-label": `Level ${lv}` }, h("span.lp-num", null, `Level ${lv}`), bar),
      h("p.lp-sub", null, "Every level brings a box.")),
    h("ol.lp-path", null, list.map((s) => h(`li.lp-step.${s.state}`, null,
      h("span.lp-rail", { "aria-hidden": "true" }, h("span.lp-dot")),
      h("span.lp-text", null,
        h("span.lp-n", null, s.state === "here" ? `Level ${s.level} · You're here` : `Level ${s.level}`),
        h("span.lp-t", null, s.name),
        s.line && s.state !== "soon" && s.state !== "hide" ? h("span.lp-d", null, s.line) : null)))),
    h("p.lp-foot", null, ALWAYS));
}

// ---------- Not open yet (alex 2026-11-25, "Daydeck · Greyed-out unlocks" canvas) ----------
// Things a level opens are shown from day one in their real spot (Friends in the pill, Cards in the corner), as an
// empty dashed ring, so home never rearranges when they open. Tapping one shows a small bubble beside it: what it is,
// the level, and what gets you there (never a countdown or points to go). It fades by itself; a tap anywhere closes it.
const RING = (d) => h("svg", { class: "ny-ring", width: d, height: d, viewBox: `0 0 ${d} ${d}`, "aria-hidden": "true" },
  h("circle", { cx: d / 2, cy: d / 2, r: d / 2 - 1.25, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-dasharray": "6 4.5", "stroke-linecap": "round" }));
export const ring = RING;
export function notYetLabel(id) {
  const u = levels.UNLOCKS.find((x) => x.id === id);
  return u ? `${u.name}, opens at level ${u.level}` : "";
}
let nyLayer = null, nyT = 0;
export function notYet(el, id) {
  const u = levels.UNLOCKS.find((x) => x.id === id);
  if (!u || !el) return;
  closeNotYet(true);
  log("locked_tap", id);
  const r = el.getBoundingClientRect(), below = r.top + r.height / 2 < innerHeight / 2;
  const W = 236, edge = 20, left = Math.max(edge, Math.min(innerWidth - edge - W, r.left + r.width / 2 - 70));
  const more = h("button.ny-more", { type: "button", onclick: (e) => { e.stopPropagation(); closeNotYet(); openLevels(() => {}); } }, "See your levels ›");
  const box = h(`div.ny-box.${below ? "below" : "above"}`, { role: "status" },
    h("b", null, `${u.name} opens at level ${u.level}.`), " Start and end your days to get there.", more);
  box.style.left = `${left}px`;
  box.style.setProperty("--ax", `${Math.round(r.left + r.width / 2 - left - 7)}px`);
  if (below) box.style.top = `${r.bottom + 12}px`; else box.style.bottom = `${innerHeight - r.top + 12}px`;
  nyLayer = h("div.ny-layer", { onclick: () => closeNotYet() }, box);
  document.body.append(nyLayer);
  requestAnimationFrame(() => nyLayer && nyLayer.classList.add("on"));
  nyT = setTimeout(() => closeNotYet(), 3500);
}
export function closeNotYet(now) {
  clearTimeout(nyT);
  if (!nyLayer) return;
  const l = nyLayer; nyLayer = null;
  if (now || reduceMotion()) return l.remove();
  l.classList.remove("on"); setTimeout(() => l.remove(), 220);
}
