// Settings: a full page that slides in from the right (like the iPhone's own Settings), opened by the round
// gear on home. Grouped rows: Nudges, Your data, Support, About, then Delete everything at the bottom.
import { h, dayKey, reduceMotion } from "./util.js";
import * as store from "./store.js";
import * as notify from "./notify.js";
import * as tester from "./tester.js";
import { openSheet, roundBtn } from "./ui.js";
import { openTester, testerRow } from "./tester-sheet.js";

let onClosed = null, el = null;

export function openSettings(closed) {
  onClosed = closed; tester.log("settings_open");
  el = h("div", { id: "settings", role: "dialog", "aria-modal": "true", "aria-label": "Settings" });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSettings(); });
  document.body.append(el);
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add("in-settings"); el.querySelector(".round")?.focus({ preventScroll: true }); }));
  edgeSwipe();
}

function closeSettings() {
  if (!el) return;
  const page = el; el = null;
  document.body.classList.remove("in-settings");
  setTimeout(() => page.remove(), reduceMotion() ? 160 : 420);
  onClosed && onClosed();
}

// Like iPhone apps: drag from the left edge to go back. The page follows your finger.
function edgeSwipe() {
  const page = el;
  let x0 = null, dx = 0;
  page.addEventListener("pointerdown", (e) => { if (e.clientX < 28 && e.pointerType !== "mouse") { x0 = e.clientX; dx = 0; page.setPointerCapture(e.pointerId); page.style.transition = "none"; } });
  page.addEventListener("pointermove", (e) => { if (x0 == null) return; dx = Math.max(0, e.clientX - x0); page.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (x0 == null) return; x0 = null; page.style.transition = ""; page.style.transform = ""; if (dx > innerWidth * 0.33) closeSettings(); };
  page.addEventListener("pointerup", up); page.addEventListener("pointercancel", up);
}

const group = (title, rows, foot) => h("section.set-group", null,
  title ? h("h2.set-head", null, title) : null,
  h("div.set-card", null, rows.flatMap((r, i) => (i ? [h("div.set-line", { "aria-hidden": "true" }), r] : [r]))),
  foot ? (typeof foot === "string" ? h("p.set-foot", null, foot) : foot) : null);
const linkRow = (label, value, attrs) => h(attrs.href ? "a.set-row" : "button.set-row", attrs,
  h("span.set-label", null, label), value ? h("span.set-value", null, value) : null, h("span.set-chev", { "aria-hidden": "true" }, "›"));

function render() {
  if (!el) return;
  const top = el.querySelector(".set-scroll")?.scrollTop || 0;
  el.replaceChildren(h("div.set-scroll", null, h("div.set-page", null,
    h("div.col", { style: { gap: "8px" } }, roundBtn("back", "Back to home", closeSettings), h("h1.big-title", null, "Settings")),
    nudges(),
    group("Your data", [
      linkRow("Save a copy", null, { onclick: saveCopy }),
      linkRow("Restore from a file", null, { onclick: restore }),
    ], "Everything stays on this phone. A copy is a file you keep wherever you like."),
    h("div.set-card", null, testerRow(() => openTester(render))),
    group("Support", [
      linkRow("Talk to someone", "Lifeline 13 11 14", { href: "tel:131114" }),
      linkRow("Money worries", "Debt Helpline", { href: "tel:1800007007" }),
    ], "Daydeck is here to help you look after yourself. It isn't therapy."),
    group("About", [linkRow("How Daydeck works", null, { onclick: howItWorks })]),
    deleteAll())));
  el.querySelector(".set-scroll").scrollTop = top;
}

// Nudges: one for the start of your day, one for the end. Each can be on or off, at a time you choose.
function nudges() {
  const n = notify.prefs();
  const msg = h("p.set-foot");
  const say = () => {
    msg.textContent = notify.needsInstall() ? "On iPhone, add Daydeck to your Home Screen first (Share, then Add to Home Screen), then turn these on there."
      : !notify.supported() ? "This browser can't show notifications."
      : notify.blocked() ? "Notifications are switched off for Daydeck in your phone's Settings app." : "One gentle nudge each, skipped if you've already checked in. It never shows anything you wrote.";
  };
  const row = (key, label) => {
    const sw = h("button.switch", { role: "switch", "aria-checked": String(n[key].on), "aria-label": label });
    const time = h("input.time-pill", { type: "time", step: "300", value: n[key].t, "aria-label": `${label} time` });
    time.disabled = !n[key].on;
    sw.addEventListener("click", async () => {
      const on = !n[key].on;
      if (on && (!notify.supported() || Notification.permission !== "granted")) { const ok = await notify.enable(); say(); if (!ok) return; }
      n[key].on = on; sw.setAttribute("aria-checked", String(on)); time.disabled = !on; store.save(); notify.sync(); tester.log("nudge_" + key, on ? n[key].t : "off");
    });
    time.addEventListener("change", () => { if (time.value) { n[key].t = time.value; store.save(); notify.sync(); tester.log("nudge_" + key, time.value); } });
    return h("div.set-row.set-toggle", null, h("span.set-label", null, label), time, sw);
  };
  say();
  return group("Nudges", [row("am", "Start of your day"), row("pm", "End your day")], msg);
}

// A copy of everything, as a file the person keeps. Tester details stay out of it.
function saveCopy() {
  const data = Object.assign({}, store.get()); delete data.tester;
  const blob = new Blob([JSON.stringify({ app: "daydeck", saved: dayKey(), data }, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `Daydeck copy ${dayKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  tester.log("save_copy");
}

function restore() {
  const pick = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
  pick.addEventListener("change", async () => {
    const f = pick.files[0]; pick.remove(); if (!f) return;
    let copy = null;
    try { const j = JSON.parse(await f.text()); if (j && j.app === "daydeck" && j.data && typeof j.data.days === "object") copy = j; } catch { /* not a copy */ }
    openSheet((panel, close) => {
      if (!copy) {
        panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "That file isn't a Daydeck copy"),
          h("p.sub", null, "Pick a file made with Save a copy. Nothing on this phone has changed.")),
          h("button.btn-main", { onclick: () => close("done") }, "Okay"));
        return;
      }
      const n = Object.keys(copy.data.days).length;
      panel.append(h("div.col", { style: { gap: "4px" } }, h("h2", null, "Restore this copy?"),
        h("p.sub", null, `It was saved on ${copy.saved} and holds ${n} ${n === 1 ? "day" : "days"}. It replaces what's on this phone now.`)),
        h("div.col", { style: { gap: "4px" } },
          h("button.btn-main", { onclick: () => {
            const keep = store.get().tester;
            Object.assign(store.reset(), copy.data, { tester: keep }); store.save(); notify.sync(); tester.log("restore");
            close("done"); render();
          } }, "Restore"),
          h("button.btn-quiet", { onclick: () => close("no") }, "Not now")));
    }, { label: "Restore from a file" });
  });
  document.body.append(pick); pick.click();
}

function howItWorks() {
  openSheet((panel, close) => {
    panel.append(h("h2", null, "How Daydeck works"),
      h("div.col", { style: { gap: "8px" } },
        h("p", null, "Start your day by noting how you slept. End it by noting how the day felt."),
        h("p", null, "Your days shows how your days have gone, and what seems to go with the good ones."),
        h("p", null, "There's more to come, a little at a time. Everything stays on this phone.")),
      h("button.btn-main", { onclick: () => close("done") }, "Done"));
  }, { label: "How Daydeck works" });
}

// Two taps, so it can't happen by accident. Testers' shared data is deleted too.
function deleteAll() {
  let armed = false;
  const b = h("button.set-row.set-danger", { onclick: async () => {
    if (!armed) { armed = true; b.textContent = "Tap again to delete everything"; return; }
    b.disabled = true; b.textContent = "Deleting…";
    if (tester.on()) await tester.leave();
    store.reset(); notify.sync(); closeSettings();
  } }, "Delete everything");
  return h("div.col", { style: { gap: "8px" } }, h("div.set-card", null, b),
    h("p.set-foot", null, "Removes everything Daydeck has kept on this phone. This can't be undone."));
}
