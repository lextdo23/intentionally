// The glass pill (social stage 1, step 1; alex 2026-11-20, CLAUDE.md "Social"). One floating, subtle smoky glass
// pill at the bottom: Today · Friends · You, beside the screen's main action (End your day, and the like). Tapping a
// tab glides the highlight across and slides that screen in. Daydeck always opens on Today. The pill hides during
// check-ins, cards, sheets and Settings.
//
// Moving between tabs (alex 2026-11-23, "like other apps"): tapping a tab shows that screen straight away, with no
// slide. Swiping sideways on a screen moves whole screens with your finger, side by side with a thin dark line
// between them; let go past halfway (or flick) to move on, otherwise it springs back.
//
// It shows from day one (alex 2026-11-25), so home never rearranges when Friends opens at level 4 (js/levels.js).
// Until then Friends sits in the pill as an empty dashed ring: tapping it says when it opens (path.js notYet), and
// swiping never lands on it. Friends and your profile on You live in js/friends.js; You also holds Settings.
import { h, reduceMotion } from "./util.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import { openSettings } from "./settings.js";
import * as friends from "./friends.js";
import * as moments from "./moments.js";
import { ring, notYet, notYetLabel, closeNotYet } from "./path.js";

const TABS = ["today", "friends", "you"];
let nav = null, bubble = null, slot = null, tab = "today", screens = {}, onToday = null, todayAct = null, shareAct = null;
let friendsOpen = true, loaded = false;

const svg = (w, paths, extra = {}) => h("svg", { width: w, height: w, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", ...extra }, paths.map(([t, a]) => h(t, a)));
const ICON = {
  today: () => svg(24, [["circle", { cx: "12", cy: "12", r: "4.5" }], ["path", { d: "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" }]]),
  friends: () => svg(24, [["circle", { cx: "9", cy: "8.5", r: "3.3" }], ["circle", { cx: "17", cy: "9.5", r: "2.6" }], ["path", { d: "M3 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" }], ["path", { d: "M15.5 14.6c2.6 0 4.6 1.6 5.5 4.4" }]]),
  you: () => h("span.pill-you", null, account.picture(26)),
};
const LABEL = { today: "Today", friends: "Friends", you: "You" };

export const on = () => !!nav;
export const current = () => tab;
export const friendsOn = () => !!nav && friendsOpen;

// Build the pill once. today: called when Today is shown again (main.js redraws home).
export function start(today) {
  if (nav) return;
  onToday = today;
  bubble = h("span.pill-bubble", { "aria-hidden": "true" });
  slot = h("div.pill-act");
  nav = h("nav", { id: "pill", "aria-label": "Main" }, bubble,
    TABS.map((t) => h("button.pill-tab", { type: "button", "data-tab": t, "aria-label": LABEL[t], onclick: () => go(t) }, ICON[t]())),
    slot);
  document.body.append(nav);
  document.body.classList.add("has-pill");
  follow();
  swipe();
  screens.friends = h("section", { id: "friends", class: "tab-screen", "aria-label": "Friends" });
  screens.you = h("section", { id: "you", class: "tab-screen", "aria-label": "You" });
  document.body.append(screens.friends, screens.you);
  friends.connect({ go: (t) => go(t), dot: (n) => { if (!nav) return; const b = nav.querySelector('[data-tab="friends"]'); n = friendsOpen ? +n || 0 : 0; b.classList.toggle("dot", n > 0); if (n) b.dataset.count = n > 9 ? "9+" : String(n); else delete b.dataset.count; b.setAttribute("aria-label", friendsOpen ? (n ? `${LABEL.friends}, ${n} new` : LABEL.friends) : notYetLabel("friends")); }, you: () => { if (!nav) return; if (tab === "you") drawYou(); mark(); } });
  mark();
}

// Friends open or not yet (main.js says, every time home draws). Not yet: the dashed ring, and the bubble on a tap.
export function setFriends(open) {
  if (!nav) return;
  friendsOpen = !!open;
  document.body.classList.toggle("friends-open", friendsOpen);
  const b = nav.querySelector('[data-tab="friends"]');
  b.classList.toggle("not-yet", !friendsOpen);
  b.setAttribute("aria-label", friendsOpen ? LABEL.friends : notYetLabel("friends"));
  const r = b.querySelector(".ny-ring");
  if (!friendsOpen && !r) b.append(ring(48)); else if (friendsOpen && r) r.remove();
  if (!friendsOpen && tab === "friends") go("today", true);
  // Quietly, once Friends is open, so the small dot shows if a request is waiting, and Today can offer "Share with friends".
  if (friendsOpen && !loaded) { loaded = true; friends.load().then((x) => { if (x && nav && tab === "today" && onToday && friends.canShare()) onToday(); }); }
  if (tab === "you") drawYou();
  showAct();
}
// Press and slide along the tabs: the highlight follows your finger, and letting go opens the nearest tab
// (alex 2026-11-20). A plain tap still works as before.
function follow() {
  let down = null;
  const tabsBox = () => { const t = nav.querySelectorAll(".pill-tab"); const a = t[0].getBoundingClientRect(), z = t[t.length - 1].getBoundingClientRect(); return { left: a.left, right: z.right, w: a.width }; };
  nav.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".pill-tab")) return;
    down = { x: e.clientX, moved: false, box: tabsBox(), id: e.pointerId };
  });
  nav.addEventListener("pointermove", (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && Math.abs(e.clientX - down.x) < 6) return;
    if (!down.moved) { down.moved = true; try { nav.setPointerCapture(e.pointerId); } catch { /* fine */ } nav.classList.add("dragging"); }
    const navLeft = nav.getBoundingClientRect().left, b = down.box;
    const x = Math.max(b.left, Math.min(b.right - b.w, e.clientX - b.w / 2));
    bubble.style.left = (x - navLeft) + "px";
  });
  const end = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    nav.classList.remove("dragging"); bubble.style.left = "";
    if (!d.moved) return;
    const b = d.box, i = Math.max(0, Math.min(TABS.length - 1, Math.round((e.clientX - b.left - b.w / 2) / ((b.right - b.left - b.w) / (TABS.length - 1)))));
    go(TABS[i]);
    nav.dataset.dragged = "1"; setTimeout(() => delete nav.dataset.dragged, 0);   // the click that follows a drag is ignored
  };
  nav.addEventListener("pointerup", end); nav.addEventListener("pointercancel", end);
  nav.addEventListener("click", (e) => { if (nav.dataset.dragged && e.target.closest(".pill-tab")) { e.stopPropagation(); e.preventDefault(); } }, true);
}

export function stop() {
  if (!nav) return;
  friends.closeAll(); closeNotYet(true);
  [nav, screens.friends, screens.you].forEach((e) => e && e.remove());
  nav = null; screens = {}; tab = "today"; shareAct = null; todayAct = null; friendsOpen = true; loaded = false;
  document.body.classList.remove("has-pill", "friends-open"); delete document.body.dataset.tab;
}

// The screen's main action sits in the pill: Today's (main.js hands over "End your day" and the like), and
// "Share a moment" on Friends and You (alex 2026-11-21: it stays "Share a moment"). Both fill the same space, so the
// pill never changes shape when switching (alex 2026-11-20). Off-white on the social screens, never orange.
export function setAction(btn) {
  if (!slot) return;
  todayAct = btn || null;
  showAct();
}
function share() {
  if (!moments.openShare({ from: "pill" })) go("friends");   // not ready to share yet (no account, or the 18+ tick): Friends explains
}
function showAct() {
  if (!shareAct) shareAct = h("button.btn-main.pill-share", { type: "button", onclick: share },
    svg(18, [["path", { d: "M12 5v14M5 12h14" }]], { "stroke-width": "2.2" }), h("span", null, "Share a moment"));
  // Before Friends opens there's nothing to share yet, so You keeps Today's action (off-white, like the social screens),
  // and the pill never changes shape.
  const b = tab === "today" || !friendsOpen ? todayAct : shareAct;
  if (slot.firstChild !== b) slot.replaceChildren(...(b ? [b] : []));
  nav.classList.toggle("no-act", !b);
}

export function go(t, quiet) {
  if (!nav || !TABS.includes(t)) return;
  if (t === "friends" && !friendsOpen) { if (!quiet) notYet(nav.querySelector('[data-tab="friends"]'), "friends"); return; }
  closeNotYet();
  const was = tab; tab = t;
  if (t === "friends") drawFriends();
  if (t === "you") drawYou();
  // Straight away, no slide: switch the screens with their movement turned off for a moment.
  document.body.classList.add("tab-now");
  mark();
  void document.body.offsetWidth;
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("tab-now")));
  if (t === "today" && was !== "today" && onToday) onToday();
  if (!quiet && was !== t) log("tab", t);
  const s = screens[t];
  if (s) s.querySelector("h1")?.focus({ preventScroll: true });
}

// ---------------- Swiping between tabs ----------------
// Screens sit side by side (Today · Friends · You) like separate phone screens: rounded corners on black, GAP apart
// (alex 2026-11-23, from Instagram's swipe). The pill stays put on top. Only starts on a screen
// that's showing on its own (no check-in, card, sheet or page over it), and never on something that already moves
// sideways itself (the day card, sliders, rows that scroll across, text boxes), so those work as before.
const GAP = 12;
const BUSY = ["booting", "in-flow", "in-ask", "ask-open", "in-acct", "in-settings", "in-wrap", "in-photos", "in-cards", "in-levels", "in-fpage", "in-days", "in-sheet"];
const free = () => nav && !BUSY.some((c) => document.body.classList.contains(c)) && !document.querySelector(".sheet-host");
const screenOf = (t) => (t === "today" ? document.getElementById("home") : screens[t]);
function ownsSideways(el, stopAt) {
  for (let e = el; e && e !== stopAt && e !== document.body; e = e.parentElement) {
    if (e.matches("input, textarea, select, [contenteditable], #pill")) return true;
    const cs = getComputedStyle(e), ta = cs.touchAction;
    if (ta === "none" || ta.startsWith("pan-y")) return true;
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && e.scrollWidth > e.clientWidth + 1) return true;
  }
  return false;
}
function swipe() {
  let s = null;   // { x, y, t, i, on, dx, pts, drawn }
  const W = () => innerWidth + GAP;
  const els = () => TABS.map((t) => screenOf(t));
  const sun = () => document.getElementById("sun");
  const place = (pos, anim) => {
    // pos: where we are in screens (0 = Today, 1 = Friends, 2 = You; in between while dragging)
    els().forEach((el, i) => { if (!el) return;
      el.style.transition = anim ? `transform ${anim}ms var(--swipe-ease)` : "none";
      el.style.transform = `translateX(${(i - pos) * W()}px)`; el.style.opacity = "1"; el.style.pointerEvents = "none"; });
    nav.style.setProperty("--i", Math.max(0, Math.min(TABS.length - 1, pos)));
    bubble.style.transition = anim ? `left ${anim}ms var(--swipe-ease)` : "none";
  };
  // Today has no background of its own (the sky and sun sit behind it), so while it moves as a screen it gets the
  // sky with the sun's glow painted in where the sun is now.
  const paintToday = () => {
    const home = screenOf("today"), sn = sun(); if (!home || !sn) return;
    const r = sn.getBoundingClientRect(), hr = home.getBoundingClientRect(), o = Number(getComputedStyle(sn).opacity) || 0;
    const x = r.left + r.width / 2 - hr.left, y = r.top + r.height / 2 - hr.top, g = getComputedStyle(document.documentElement).getPropertyValue("--glow").trim() || "242 192 143";
    const glow = tab === "today" && o > 0 ? `radial-gradient(circle 310px at ${x}px ${y}px, rgb(${g} / ${(.32 * o).toFixed(3)}) 0, rgb(${g} / ${(.11 * o).toFixed(3)}) 150px, rgb(${g} / 0) 310px), ` : "";
    home.style.background = glow + "linear-gradient(180deg, var(--sky1) 0%, var(--sky2) 60%, var(--sky3) 100%)";
  };
  const clear = () => {
    [...els(), bubble].forEach((el) => el && ["transition", "transform", "opacity", "pointerEvents", "background"].forEach((k) => (el.style[k] = "")));
    document.body.classList.remove("tab-drag");
  };
  document.addEventListener("touchstart", (e) => {
    s = null;
    if (e.touches.length !== 1 || !free()) return;
    const here = screenOf(tab);
    if (!here || !here.contains(e.target) || ownsSideways(e.target, here)) return;
    const p = e.touches[0];
    s = { x: p.clientX, y: p.clientY, i: TABS.indexOf(tab), on: false, dx: 0, pts: [[performance.now(), p.clientX]], drawn: {} };
  }, { passive: true, capture: true });
  document.addEventListener("touchmove", (e) => {
    if (!s) return;
    if (e.touches.length !== 1) { if (s.on) end(); s = null; return; }
    const p = e.touches[0], dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2 || !e.cancelable) { s = null; return; }   // up and down: let it scroll
      s.on = true; paintToday(); document.body.classList.add("tab-drag");
    }
    e.preventDefault();
    const t = performance.now(); s.pts.push([t, p.clientX]); s.pts = s.pts.filter((q) => t - q[0] < 100);
    // Past the first or last screen it only gives a little, then springs back.
    // Friends not open yet: no screen to swipe to, so it gives a little and springs back, like the last screen.
    const lo = friendsOpen ? 0 : s.i, hi = friendsOpen ? TABS.length - 1 : s.i;
    const n = s.i - dx / W(), edge = n < lo || n > hi;
    s.dx = edge ? dx / 3 : dx;
    const next = TABS[s.i + (dx < 0 ? 1 : -1)];
    if (next && next !== "today" && !edge && !s.drawn[next]) { s.drawn[next] = 1; next === "friends" ? drawFriends() : drawYou(); }
    place(s.i - s.dx / W());
  }, { passive: false, capture: true });
  const end = () => {
    if (!s || !s.on) { s = null; return; }
    const d = s; s = null;
    const now = performance.now(), pts = d.pts.filter((q) => now - q[0] < 100);   // a finger that stopped before letting go isn't a flick
    const a = pts[0], b = pts[pts.length - 1], v = pts.length > 1 ? (b[1] - a[1]) / Math.max(1, b[0] - a[0]) : 0;   // px per ms
    let to = d.i;
    if ((d.dx < -innerWidth / 2 || v < -0.4) && d.dx < 0) to = d.i + 1;
    if ((d.dx > innerWidth / 2 || v > 0.4) && d.dx > 0) to = d.i - 1;
    to = Math.max(0, Math.min(TABS.length - 1, to));
    if (!friendsOpen) to = d.i;
        // Settling takes about half a second (alex 2026-11-23: 0.16 to 0.32s felt too quick); a little quicker after a
    // hard flick so it never feels like it's dragging behind the finger.
    const left = Math.abs((to - (d.i - d.dx / W())) * W()) / W();   // how much of a screen is left to travel
    const ms = reduceMotion() ? 0 : Math.round((Math.abs(v) > 1.2 ? 380 : 480) * (0.6 + 0.4 * left));
    place(to, ms);
    setTimeout(() => { if (TABS[to] !== tab) go(TABS[to]); else document.body.classList.add("tab-now"); clear();
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("tab-now"))); }, ms);
  };
  document.addEventListener("touchend", end, { capture: true });
  document.addEventListener("touchcancel", end, { capture: true });
}
function mark() {
  const i = TABS.indexOf(tab);
  document.body.dataset.tab = tab;
  showAct();
  nav.style.setProperty("--i", i);
  nav.querySelectorAll(".pill-tab").forEach((b) => {
    const here = b.dataset.tab === tab;
    b.classList.toggle("here", here);
    if (here) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  // Your picture changes in Settings or sign-up: keep the You icon fresh.
  const you = nav.querySelector('[data-tab="you"]');
  if (you) you.replaceChildren(ICON.you());
}

// ---------------- Friends (js/friends.js) ----------------
function drawFriends() { friends.drawFriends(screens.friends, true); }

// ---------------- You: your picture, name and Settings ----------------
function drawYou() {
  const u = account.user();
  const gear = h("button.round", { type: "button", "aria-label": "Settings", onclick: () => openSettings(() => { drawYou(); mark(); }) },
    svg(22, [["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" }]], { "stroke-width": "1.8" }));
  const top = u ? friends.youTop(friendsOpen) : h("div.you-top", null,
    h("button.you-pic", { type: "button", "aria-label": "Change your picture", onclick: () => account.choosePicture(() => { drawYou(); mark(); }) }, account.picture(88)),
    h("div.you-who", null, h("span.you-name", null, "You"), h("button.btn-text", { type: "button", onclick: () => account.openSignup(() => { drawYou(); mark(); }, { from: "settings" }) }, "Make an account")));
  screens.you.replaceChildren(h("div.tab-head", null, h("h1.big-title", { tabindex: "-1" }, "You"), gear), top);
}
