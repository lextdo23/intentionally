// The glass pill (social stage 1, step 1; alex 2026-11-20, CLAUDE.md "Social"). One floating, subtle smoky glass
// pill at the bottom: Today · Friends · You, beside the screen's main action (End your day, and the like). Tapping a
// tab glides the highlight across and slides that screen in. Daydeck always opens on Today. The pill hides during
// check-ins, cards, sheets and Settings.
//
// It shows once Friends opens at level 4 (js/levels.js), or in test mode (main.js decides). Until then Daydeck looks
// as it always has. Friends and your profile on You live in js/friends.js; You also holds Settings.
import { h, reduceMotion } from "./util.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import { openSettings } from "./settings.js";
import * as friends from "./friends.js";

const TABS = ["today", "friends", "you"];
let nav = null, bubble = null, slot = null, tab = "today", screens = {}, onToday = null;

const svg = (w, paths, extra = {}) => h("svg", { width: w, height: w, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", ...extra }, paths.map(([t, a]) => h(t, a)));
const ICON = {
  today: () => svg(24, [["circle", { cx: "12", cy: "12", r: "4.5" }], ["path", { d: "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" }]]),
  friends: () => svg(24, [["circle", { cx: "9", cy: "8.5", r: "3.3" }], ["circle", { cx: "17", cy: "9.5", r: "2.6" }], ["path", { d: "M3 19.5c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" }], ["path", { d: "M15.5 14.6c2.6 0 4.6 1.6 5.5 4.4" }]]),
  you: () => h("span.pill-you", null, account.picture(26)),
};
const LABEL = { today: "Today", friends: "Friends", you: "You" };

export const on = () => !!nav;
export const current = () => tab;

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
  screens.friends = h("section", { id: "friends", class: "tab-screen", "aria-label": "Friends" });
  screens.you = h("section", { id: "you", class: "tab-screen", "aria-label": "You" });
  document.body.append(screens.friends, screens.you);
  friends.connect({ dot: (on) => nav && nav.querySelector('[data-tab="friends"]').classList.toggle("dot", !!on), you: () => { if (!nav) return; if (tab === "you") drawYou(); mark(); } });
  friends.load();   // quietly, so the small dot shows if a request is waiting
  mark();
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
  friends.closeAll();
  [nav, screens.friends, screens.you].forEach((e) => e && e.remove());
  nav = null; screens = {}; tab = "today";
  document.body.classList.remove("has-pill"); delete document.body.dataset.tab;
}

// The screen's main action sits in the pill (main.js hands over its "End your day" button and the like).
// The action stays in the pill on every tab, so the pill never changes shape (alex 2026-11-20: switching felt
// jumpy). On Friends and You it turns off-white (no orange on the social screens) until "Share a moment" (step 3).
export function setAction(btn) {
  if (!slot) return;
  slot.replaceChildren(...(btn ? [btn] : []));
  nav.classList.toggle("no-act", !btn);
}

export function go(t, quiet) {
  if (!nav || !TABS.includes(t)) return;
  const was = tab; tab = t;
  if (t === "friends") drawFriends();
  if (t === "you") drawYou();
  mark();
  if (t === "today" && was !== "today" && onToday) onToday();
  if (!quiet && was !== t) log("tab", t);
  const s = screens[t];
  if (s) setTimeout(() => s.querySelector("h1")?.focus({ preventScroll: true }), reduceMotion() ? 0 : 300);
}
function mark() {
  const i = TABS.indexOf(tab);
  document.body.dataset.tab = tab;
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
function drawFriends() { friends.drawFriends(screens.friends); }

// ---------------- You: your picture, name and Settings ----------------
function drawYou() {
  const u = account.user();
  const gear = h("button.round", { type: "button", "aria-label": "Settings", onclick: () => openSettings(() => { drawYou(); mark(); }) },
    svg(22, [["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" }]], { "stroke-width": "1.8" }));
  const top = u ? friends.youTop(true) : h("div.you-top", null,
    h("button.you-pic", { type: "button", "aria-label": "Change your picture", onclick: () => account.choosePicture(() => { drawYou(); mark(); }) }, account.picture(88)),
    h("div.you-who", null, h("span.you-name", null, "You"), h("button.btn-text", { type: "button", onclick: () => account.openSignup(() => { drawYou(); mark(); }, { from: "settings" }) }, "Make an account")));
  screens.you.replaceChildren(h("div.tab-head", null, h("h1.big-title", { tabindex: "-1" }, "You"), gear), top);
}
