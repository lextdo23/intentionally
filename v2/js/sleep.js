// Going to sleep (alex 2026-11-16): an optional bedtime button with sleep sounds.
// Tapping it notes the bedtime. Next morning the sleep arc starts from that time, and the wake side starts at
// the time the app is opened. The first time, it asks once which sound (if any) you'd like, with a sample of
// each; after that one tap goes straight to the night screen with your usual sound playing.
// Sounds are long (10-minute) files played on a loop, the kind of player iPhone keeps going on a locked screen.
// A web app can't loop with no gap or change the volume itself; the long files keep any loop gap rare.
import { h, clock12, dayKey } from "./util.js";
import { now } from "./clock.js";
import * as store from "./store.js";
import { log } from "./tester.js";
import { begin, close, show, step, where, spacer } from "./checkin.js";
import { roundBtn } from "./ui.js";

export const GROUPS = [
  ["Block out noise", "Covers sounds that wake you", [["brown", "Brown noise"], ["pink", "Pink noise"], ["white", "White noise"], ["fan", "Fan"]]],
  ["Quiet a busy mind", "Nature sounds help you settle", [["gentle-rain", "Gentle rain"], ["window-rain", "Rain on a window"], ["storm", "Rainstorm"], ["river", "River"], ["waves", "Ocean waves"], ["wind", "Wind"]]],
  ["Something soft", "Gentle, music-like", [["pad", "Soft pad"], ["hum", "Soft hum"]]],
];
const NAME = Object.fromEntries(GROUPS.flatMap((g) => g[2]));
export const LENGTHS = [[15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [0, "All night"]];
const lenWord = (m) => (LENGTHS.find((l) => l[0] === m) || LENGTHS[2])[1];
const minsOf = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };

// Settings live in store.sleep: the usual sound (null = no sound), how long it plays, whether we've asked,
// and tonight's note (when the button was tapped).
export function prefs() {
  const s = store.get();
  s.sleep = Object.assign({ sound: null, len: 60, asked: false, note: null }, s.sleep);
  return s.sleep;
}

// Tonight's bedtime, if the button was tapped and the morning hasn't used it yet (within the last 16 hours).
export function lastNote() {
  const n = prefs().note;
  return n && !n.used && now() - n.at < 16 * 3600e3 && now() >= n.at ? n : null;
}
// Sleep noted on the current day (before 4am counts as the evening before), for the home line.
export const notedTonight = () => { const n = lastNote(); return n && dayKey(n.at) === dayKey() ? n : null; };
export const markUsed = () => { const p = prefs(); if (p.note) { p.note.used = true; store.save(); } };

// ---------- the player ----------
const audio = typeof Audio !== "undefined" ? new Audio() : null;
if (audio) { audio.loop = true; audio.preload = "none"; }
let playing = null, endAt = 0, stopT = 0, onStop = null;
function play(id) {
  if (!audio) return;
  if (playing !== id) { audio.src = `sounds/${id}.mp3`; playing = id; }
  audio.play().catch(() => { playing = null; onStop && onStop(); });
  if ("mediaSession" in navigator) try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: NAME[id], artist: "Daydeck" });
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("play", () => play(playing));
  } catch { /* older phones */ }
}
function pause() { if (audio) audio.pause(); }
function stop() { pause(); playing = null; clearTimeout(stopT); endAt = 0; }
// The timer: stop after the chosen length. Checked on a timer and on the player's own ticks, because a locked
// phone can hold back timers while the sound keeps going.
function timer(len) {
  clearTimeout(stopT); endAt = len ? now() + len * 60e3 : 0;
  if (endAt) stopT = setTimeout(() => { pause(); onStop && onStop(); }, len * 60e3);
}
if (audio) audio.addEventListener("timeupdate", () => { if (endAt && now() >= endAt && !audio.paused) { pause(); onStop && onStop(); } });

// ---------- screens ----------
const MOON = (c = "#1d1e22", s = 18) => h("svg", { width: s, height: s, viewBox: "0 0 24 24", "aria-hidden": "true" }, h("path", { d: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", fill: c }));
export const moonIcon = MOON;
const ICON = {
  sound: () => h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" })),
  timer: () => h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "aria-hidden": "true" }, h("circle", { cx: "12", cy: "13", r: "8" }), h("path", { d: "M12 9v4l2.5 2M9 2h6" })),
  pause: () => h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" }, h("rect", { x: "6", y: "5", width: "4", height: "14", rx: "1" }), h("rect", { x: "14", y: "5", width: "4", height: "14", rx: "1" })),
  play: () => h("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" }, h("path", { d: "M7 5l12 7-12 7z" })),
};
const check = () => h("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.4", "stroke-linecap": "round", "aria-hidden": "true" }, h("path", { d: "M5 12.5l4.5 4.5L19 7.5" }));
const bars = () => h("span.snd-bars", { "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"));

export function goToSleep(onDone) {
  const p = prefs();
  p.note = { at: now() }; store.save();
  log("sleep_button");
  begin(onDone);
  if (!p.asked) askStep(); else nightStep(true);
}

// Changed your mind within a minute: the bedtime isn't kept.
function leave() {
  stop();
  const p = prefs();
  if (p.note && !p.note.used && now() - p.note.at < 60e3) { p.note = null; log("sleep_cancel"); }
  store.save();
  close(true);
}

// First night only: hear a sample of each, then choose.
function askStep() {
  let pick = null;
  const start = h("button.btn-main", { "aria-disabled": "true", onclick: () => {
    if (!pick) return;
    const p = prefs(); p.sound = pick; p.asked = true; store.save(); log("sleep_sound", pick); nightStep(false);
  } }, MOON(), h("span", null, "Pick a sound to hear it"));
  const rows = [];
  const list = h("div.col", { style: { gap: "16px" } }, GROUPS.map(([g, why, items]) => h("div.col", { style: { gap: "6px" } },
    h("div.snd-head", null, h("b", null, g), h("span", null, why)),
    h("div.snd-list", null, items.map(([id, name]) => {
      const row = h("button.snd-row", { type: "button", "aria-pressed": "false", onclick: () => {
        if (pick === id && audio && !audio.paused) { pause(); pick = null; } else { pick = id; play(id); }
        rows.forEach((r) => { const on = r.dataset.id === pick; r.setAttribute("aria-pressed", String(on)); r.querySelector(".snd-state").replaceChildren(...(on ? [bars(), "Playing a sample"] : [])); });
        start.setAttribute("aria-disabled", pick ? "false" : "true");
        start.lastChild.textContent = pick ? `Start ${NAME[pick].toLowerCase()}` : "Pick a sound to hear it";
      } }, h("span", null, name), h("span.snd-state"));
      row.dataset.id = id; rows.push(row); return row;
    })))));
  const none = h("button.btn-quiet", { onclick: () => { const p = prefs(); p.sound = null; p.asked = true; store.save(); log("sleep_sound", "none"); stop(); nightStep(false); } }, "No thanks, just goodnight");
  show(step(
    [roundBtn("close", "Not now", leave), where("Going to sleep"), spacer()],
    [h("h1.q.rise", { style: { fontSize: "22px" } }, "Want a sound to fall asleep to?"), h("div.rise", null, list)],
    [start, none]));
  current().classList.add("night");
}
const current = () => document.querySelector("#flow .step:last-child");

// The night screen: your sound, and three matching round buttons (sound, pause, timer) with small menus.
function nightStep(fresh) {
  const p = prefs();
  const name = h("span.night-name"), line = h("span.night-line"), ctl = h("div.night-ctl");
  const wrap = h("div.night-mid", null, MOON("rgba(217,214,238,.5)", 40), name, line);
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  const btn = (icon, label, onclick, on) => h("button.night-btn", { type: "button", "aria-label": label, "aria-expanded": on == null ? null : String(!!on), onclick }, h("span.night-ico", null, icon), h("span.night-lab", null, label));
  const draw = () => {
    const sound = p.sound, isOn = audio && !audio.paused && playing === sound;
    name.textContent = sound ? NAME[sound] : "Goodnight.";
    const n = p.note;
    line.textContent = !sound ? (n ? `Tomorrow starts from ${clock12(Math.round(minsOf(n.at) / 5) * 5 % 1440)}.` : "Sleep well.")
      : !isOn ? "Paused" : endAt ? `Stops at ${clock12(Math.round(minsOf(endAt) / 5) * 5 % 1440)}` : "Plays all night";
    ctl.replaceChildren(
      btn(ICON.sound(), sound ? "Sound" : "Add a sound", openSounds, !!menu),
      ...(sound ? [btn(isOn ? ICON.pause() : ICON.play(), isOn ? "Pause" : "Play", () => { if (isOn) { pause(); log("sleep_pause"); } else { play(sound); timer(p.len); } draw(); }),
        btn(ICON.timer(), lenWord(p.len), openTimer, !!menu)] : []));
  };
  // The menu pops up right above the button that opened it, like Apple's small menus.
  const pop = (label, items, side, keepOpen, from) => {
    closeMenu();
    const catcher = h("div.pop-catch", { onclick: closeMenu });
    const box = h("div.pop", { role: "menu", "aria-label": label, style: side }, h("div.pop-title", null, label), ...items(() => { if (!keepOpen) closeMenu(); }));
    menu = h("div", null, catcher, box);
    const el = current(); el.append(menu);
    const b = from && from.closest(".night-btn");
    if (b) box.style.bottom = `${Math.round(el.getBoundingClientRect().bottom - b.getBoundingClientRect().top + 8)}px`;
  };
  function openSounds(e) {
    pop("Sound", (done) => {
      const rows = [];
      const mk = (id, name) => { const r = h("button.pop-row", { role: "menuitemradio", "aria-checked": String(p.sound === id), onclick: () => {
        p.sound = id; store.save(); log("sleep_sound", id || "none");
        if (id) { play(id); timer(p.len); } else stop();
        rows.forEach((x) => { const on = x.dataset.id === String(id); x.setAttribute("aria-checked", String(on)); x.querySelector(".pop-tick").replaceChildren(...(on ? [check()] : [])); });
        draw(); done();
      } }, h("span", null, name), h("span.pop-tick", null, p.sound === id ? check() : null)); r.dataset.id = String(id); rows.push(r); return r; };
      return [mk(null, "No sound"), ...GROUPS.flatMap(([g, , items]) => [h("div.pop-group", null, g), ...items.map(([id, name]) => mk(id, name))])];
    }, { left: "16px" }, true, e && e.target); // stays open so you can try a few; tap anywhere else to close
  }
  function openTimer(e) {
    pop("Play for", (done) => LENGTHS.map(([m, word]) => h("button.pop-row", { role: "menuitemradio", "aria-checked": String(p.len === m), onclick: () => {
      p.len = m; store.save(); log("sleep_len", m); if (audio && !audio.paused) timer(m); draw(); done();
    } }, h("span", null, word), h("span.pop-tick", null, p.len === m ? check() : null))), { right: "16px" }, false, e && e.target);
  }
  onStop = () => draw();
  if (audio) { audio.onplay = draw; audio.onpause = draw; }
  if (p.sound && (fresh || playing !== p.sound || audio.paused)) play(p.sound);
  if (p.sound) timer(p.len);
  draw();
  const foot = h("p.night-foot", null, p.sound ? "You can lock your phone. It keeps playing." : "");
  show(step([roundBtn("close", "Stop and close", leave), spacer(), spacer()], [h("div.rise", null, wrap)], [ctl, foot]));
  const el = current(); el.classList.add("night");
  if (!p.sound) { setTimeout(() => el.classList.add("dark"), 4000); el.addEventListener("click", () => el.classList.remove("dark")); } // silent: fades to black after a few seconds
  // Opening the app in the morning with the night screen still up: go home so the morning can start.
  const wake = () => { if (document.visibilityState === "visible" && el.isConnected && (!audio || audio.paused) && p.note && now() - p.note.at > 3 * 3600e3) { document.removeEventListener("visibilitychange", wake); stop(); close(true); } };
  document.addEventListener("visibilitychange", wake);
}
