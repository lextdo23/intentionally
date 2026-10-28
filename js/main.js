import * as store from "./store.js";
import { now, weekStart, greeting, formatTotal, formatRunning, setOffsetDays, DAY } from "./clock.js";
import { renderSky, fitTags, startSpin, planet, sparkle, placeStar, esc } from "./sky.js";
import { TINTS, SUGGESTED, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
let testMode = params.has("test");
setOffsetDays(store.get().test.offsetDays);

const ICON = {
  sort: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="12" cy="19" r="2"/><path d="M6.3 7.6 10.8 17.2M17.7 7.6 13.2 17.2"/></svg>`,
  record: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11.5A2.5 2.5 0 0 1 19 6.5V20H7.5A2.5 2.5 0 0 1 5 17.5z"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19"/><path d="M9.5 8.5h5"/></svg>`,
  star: `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(4, 8)}"/></svg>`,
};

function render() {
  const s = store.get();
  if (!s.pillars.length) renderWelcome();
  else renderHome(s);
  if (testMode) renderTestPanel();
}

/* ---------- First day: say it will open up slowly, then pick pillars ---------- */

let picked = [];
function renderWelcome() {
  const all = [...new Set([...SUGGESTED, ...picked])];
  const ok = picked.length >= MIN_PILLARS;
  app.innerHTML = `<section class="welcome">
    <div class="sky-wrap">${renderSky({ pillars: [], thoughts: [] })}</div>
    <div class="welcome-body">
      <h1>Welcome</h1>
      <p class="intro">We'll keep this simple. Today you'll just pick what matters to you and catch your first thought. The rest will open up gently over the next few weeks, when you're ready for it.</p>
      <h2>What do you want to look after?</h2>
      <p class="hint">Pick ${MIN_PILLARS} to ${MAX_PILLARS}. You can change them later.</p>
      <div class="chips" role="group" aria-label="Parts of life">
        ${all.map((n) => `<button type="button" class="chip" aria-pressed="${picked.includes(n)}" data-pick="${esc(n)}">${esc(n)}</button>`).join("")}
      </div>
      <form class="own" id="own">
        <label for="own-name" class="sr">Add your own</label>
        <input id="own-name" maxlength="${MAX_NAME}" placeholder="Add your own" autocomplete="off">
        <button type="submit" class="ghost">Add</button>
      </form>
      <button type="button" class="primary" id="begin" ${ok ? "" : "disabled"}>${ok ? "Begin" : `Pick ${MIN_PILLARS - picked.length} more`}</button>
    </div></section>`;
  app.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => {
    const n = b.dataset.pick;
    if (picked.includes(n)) picked = picked.filter((x) => x !== n);
    else if (picked.length < MAX_PILLARS) picked.push(n);
    else return toast(`You can pick up to ${MAX_PILLARS}.`);
    renderWelcome();
  }));
  app.querySelector("#own").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = app.querySelector("#own-name").value.trim().slice(0, MAX_NAME);
    if (!v) return;
    if (picked.length >= MAX_PILLARS) return toast(`You can pick up to ${MAX_PILLARS}.`);
    if (!picked.some((x) => x.toLowerCase() === v.toLowerCase())) picked.push(v);
    renderWelcome();
  });
  app.querySelector("#begin").addEventListener("click", () => {
    store.update((s) => { s.pillars = picked.map((name, i) => ({ id: store.uid(), name, tint: TINTS[i], focus: false })); });
    picked = [];
  });
}

/* ---------- Home: the sky, and the dock with timers and actions ---------- */

function renderHome(s) {
  const active = s.thoughts.filter((t) => t.status === "active").length;
  const sub = active ? `${active} star${active === 1 ? "" : "s"} in your sky` : "Your sky is clear";
  app.innerHTML = `<section class="home">
    <div class="sky-wrap">${renderSky({ pillars: s.pillars, thoughts: s.thoughts, runningId: s.running?.pillarId })}</div>
    <header class="greet"><h1 id="greet">${greeting()}${s.name ? `, <span>${esc(s.name)}</span>` : ""}</h1><p>${sub}</p></header>
    <nav class="dock" aria-label="Your pillars and actions">
      <div class="pillars">${s.pillars.map((p, i) => `
        <button type="button" class="pl ${s.running?.pillarId === p.id ? "run" : ""}" data-timer="${p.id}" style="--c:${p.tint}"
          aria-label="${esc(p.name)}: ${s.running?.pillarId === p.id ? "timer running, tap to stop" : "tap to start a timer"}">
          <svg viewBox="-15 -15 30 30" aria-hidden="true">${planet("dock", i, 8, p.tint)}</svg>
          <b>${esc(p.name)}</b><small data-time="${p.id}"></small></button>`).join("")}
      </div>
      <div class="actions">
        <button type="button" class="round" data-soon="Sort" aria-label="Sort">${ICON.sort}</button>
        <button type="button" class="catch" data-soon="New thought" aria-label="New thought"><span class="dot">${ICON.star}</span><span class="lab">New thought</span></button>
        <button type="button" class="round" data-soon="Record" aria-label="Record">${ICON.record}</button>
      </div>
    </nav></section>`;
  fitTags(app);
  startSpin(app);
  tick();
  app.querySelectorAll("[data-timer]").forEach((b) => b.addEventListener("click", () => {
    const p = store.get().pillars.find((x) => x.id === b.dataset.timer);
    const starting = store.get().running?.pillarId !== p.id;
    store.toggleTimer(p.id);
    toast(starting ? `Timing ${p.name}. Tap again to stop.` : `${p.name} timer stopped.`);
  }));
  app.querySelectorAll("[data-soon]").forEach((b) => b.addEventListener("click", () => toast(`${b.dataset.soon} arrives in an upcoming step.`)));
  let taps = 0;
  app.querySelector("#greet").addEventListener("click", () => { if (++taps >= 5) { taps = 0; testMode = true; renderTestPanel(); } });
}

// Only the time labels change every second; the sky is left alone so its motion stays smooth.
function tick() {
  const s = store.get(), from = weekStart();
  app.querySelectorAll("[data-time]").forEach((el) => {
    const id = el.dataset.time, run = s.running?.pillarId === id;
    el.textContent = run ? formatRunning(now() - s.running.start) : formatTotal(store.timeSince(id, from));
  });
}
setInterval(tick, 1000);

/* ---------- Test mode: example data and time travel, for checking weeks and seasons quickly ---------- */

function renderTestPanel() {
  document.querySelector(".testpanel")?.remove();
  const s = store.get(), d = new Date(now());
  const panel = document.createElement("aside");
  panel.className = "testpanel";
  panel.setAttribute("aria-label", "Test mode");
  panel.innerHTML = `<b>Test mode</b><span>Pretend date: ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${s.test.offsetDays ? ` (+${s.test.offsetDays} days)` : ""}</span>
    <div><button data-t="example">Example sky</button><button data-t="day">+1 day</button><button data-t="week">+1 week</button>
    <button data-t="today">Today</button><button data-t="reset">Reset all</button><button data-t="close">Close</button></div>`;
  document.body.append(panel);
  panel.addEventListener("click", (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    if (t === "close") { testMode = false; return panel.remove(); }
    if (t === "reset") { store.reset(); setOffsetDays(0); return; }
    if (t === "example") return loadExample();
    const days = t === "today" ? 0 : s.test.offsetDays + (t === "day" ? 1 : 7);
    setOffsetDays(days);
    store.update((x) => { x.test.offsetDays = days; });
  });
}

function loadExample() {
  const t0 = now();
  store.update((s) => {
    if (!s.pillars.length) s.pillars = ["Friends", "Health", "Career", "Creativity"].map((name, i) => ({ id: store.uid(), name, tint: TINTS[i], focus: false }));
    const [a, b, c, d] = s.pillars;
    s.sessions.push(
      { pillarId: a.id, start: t0 - 2 * DAY, end: t0 - 2 * DAY + 70 * 60000 },
      { pillarId: b.id, start: t0 - DAY, end: t0 - DAY + 25 * 60000 },
      { pillarId: c.id, start: t0 - 3 * 3600000, end: t0 - 3 * 3600000 + 40 * 60000 },
    );
    if (d) s.sessions.push({ pillarId: d.id, start: t0 - 5 * 3600000, end: t0 - 5 * 3600000 + 15 * 60000 });
    const ex = [["I'm not good enough at work", "worry", 4], ["Call Nan this weekend", "want", 1], ["I handled today well", "kind", 1],
      ["I never reply fast enough", "worry", 2], ["Start running again", "want", 1], ["Jess made me laugh", "kind", 1], ["What if I can't keep this up", "worry", 1]];
    for (const [text, kind, count] of ex) s.thoughts.push({ id: store.uid(), text, kind, pillarId: null, status: "active", count, ...placeStar(s.thoughts), createdAt: t0, helped: [] });
  });
  toast("Example sky loaded.");
}

/* ---------- Small shared bits ---------- */

let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

store.onChange(render);
render();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
