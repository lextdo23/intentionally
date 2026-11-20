// The glass pill (social stage 1, step 1; alex 2026-11-20, CLAUDE.md "Social"). One floating, subtle smoky glass
// pill at the bottom: Today · Friends · You, beside the screen's main action (End your day, and the like). Tapping a
// tab glides the highlight across and slides that screen in. Daydeck always opens on Today. The pill hides during
// check-ins, cards, sheets and Settings.
//
// While the friends side is being built it shows in test mode only (main.js decides). Friends is a calm "coming
// soon" until step 2; You holds your picture, name and Settings.
import { h, reduceMotion } from "./util.js";
import { log } from "./tester.js";
import * as account from "./account.js";
import { openSettings } from "./settings.js";

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
  screens.friends = h("section", { id: "friends", class: "tab-screen", "aria-label": "Friends" });
  screens.you = h("section", { id: "you", class: "tab-screen", "aria-label": "You" });
  document.body.append(screens.friends, screens.you);
  mark();
}
export function stop() {
  if (!nav) return;
  [nav, screens.friends, screens.you].forEach((e) => e && e.remove());
  nav = null; screens = {}; tab = "today";
  document.body.classList.remove("has-pill"); delete document.body.dataset.tab;
}

// The screen's main action sits in the pill (main.js hands over its "End your day" button and the like).
// Until "Share a moment" arrives (step 3), the action shows on Today only: no orange on the social screens.
let act = null;
export function setAction(btn) {
  if (!slot) return;
  act = btn || null;
  showAct();
}
function showAct() {
  const b = tab === "today" ? act : null;
  slot.replaceChildren(...(b ? [b] : []));
  nav.classList.toggle("no-act", !b);
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

// ---------------- Friends: coming soon (step 2 builds it) ----------------
function drawFriends() {
  const faces = h("div.friends-faces", { "aria-hidden": "true" }, ["frog", "smile", "cat"].map((id) => account.littleOne(id, 64)));
  screens.friends.replaceChildren(
    h("div.tab-head", null, h("h1.big-title", { tabindex: "-1" }, "Friends")),
    h("div.tab-empty", null, faces,
      h("h2", null, "Days are better shared"),
      h("p", null, "Soon you'll be able to add a few friends, see how their days go, and cheer each other on."),
      h("p.tab-note", null, "Coming soon. Only friends will ever see what you choose to share.")));
}

// ---------------- You: your picture, name and Settings ----------------
function drawYou() {
  const u = account.user();
  const gear = h("button.round", { type: "button", "aria-label": "Settings", onclick: () => openSettings(() => { drawYou(); mark(); }) },
    svg(22, [["circle", { cx: "12", cy: "12", r: "3" }], ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" }]], { "stroke-width": "1.8" }));
  const pic = h("button.you-pic", { type: "button", "aria-label": "Change your picture", onclick: () => account.choosePicture(() => { drawYou(); mark(); }) }, account.picture(88));
  const who = u
    ? h("div.you-who", null, h("span.you-name", null, u.username), h("span.you-handle", null, "@" + u.username))
    : h("div.you-who", null, h("span.you-name", null, "You"), h("button.btn-text", { type: "button", onclick: () => account.openSignup(() => { drawYou(); mark(); }, { from: "settings" }) }, "Make an account"));
  screens.you.replaceChildren(
    h("div.tab-head", null, h("h1.big-title", { tabindex: "-1" }, "You"), gear),
    h("div.you-top", null, pic, who),
    h("div.tab-empty.small", null,
      h("h2", null, "What you've shared"),
      h("p", null, "Moments you share with friends will show here, once friends arrive.")));
}
