// The first time the app opens: the sky is born. Darkness, then a small sun (you), one slow breath, then what you want
// to look after becomes planets, your first thought becomes a star, and the clouds drift in until it's your home sky.
// Words fade between steps while the sky stays. You go on by tapping the sun, as with the look back. Nothing is saved
// until the end, so closing the app part way simply starts again next time.
import * as store from "./store.js";
import { now } from "./clock.js";
import { renderSky, startSpin, fitTags, layout, sparkle, placeStar, esc, POINTS, skyPoint } from "./sky.js";
import { guessKind, KIND_LABEL } from "./thoughts.js";
import { heaviness } from "./helps.js";
import { TINTS, SUGGESTED, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

// Each step: how big the sun has grown (it keeps growing gently) and how far the clouds have come in.
const STEPS = [
  { id: "dark", sun: 0, clouds: 0 },
  { id: "hello", sun: .4, clouds: 0 },
  { id: "you", sun: .6, clouds: .08 },
  { id: "pick", sun: .8, clouds: .2 },
  { id: "thought", sun: 1, clouds: .4 },
  { id: "name", sun: 1, clouds: .6 },
  { id: "day", sun: 1, clouds: .8 },
  { id: "care", sun: 1, clouds: 1 },
];
const DAYS = [["Sunday", "S"], ["Monday", "M"], ["Tuesday", "T"], ["Wednesday", "W"], ["Thursday", "T"], ["Friday", "F"], ["Saturday", "S"]];
const EXAMPLES = ["I'm behind on everything", "I want to call Mum this week", "Glad I went outside today", "What if I'm not good enough"];
const A_KIND = { kind: "a kind thought", worry: "a worry", want: "a want" };
const star = (kind) => `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let root = null, ui = null, go = null, hooks = {};
let step = 0, shown = -1, picked = [], thought = null, flying = false, name = "", day = 0, ownOpen = false, draft = "", ex = 0;
let timers = [], moving = 0, drawn = "", lastAt = {};

// Called on every render while set-up isn't done. It only builds the screen once, so saving elsewhere never restarts it.
export function show(app, h) {
  hooks = h;
  if (root && app.contains(root)) return;
  const s = store.get();
  // Someone who picked planets on the old set-up keeps them and carries on from their name.
  picked = s.pillars.map((p) => p.name);
  step = picked.length ? STEPS.findIndex((x) => x.id === "name") : 0;
  thought = null; flying = false; name = s.name; day = s.lookDay ?? 0; ownOpen = false; draft = ""; shown = -1; drawn = ""; lastAt = {};
  app.innerHTML = `<section class="born" aria-label="Welcome">
    <div class="sky-wrap"><div class="b-clouds"></div><div class="b-sky"></div></div>
    <div class="b-ui"></div>
    <button type="button" class="b-go" aria-label="Go on"></button></section>`;
  root = app.querySelector(".born"); ui = root.querySelector(".b-ui"); go = root.querySelector(".b-go");
  go.addEventListener("click", (e) => { e.stopPropagation(); if (ready()) next(step + 1); });
  // During the first breath, a tap anywhere moves on.
  root.addEventListener("click", () => { if (STEPS[step].id === "hello") next(step + 1); });
  addEventListener("resize", placeGo);
  render();
  drawSky();
}

const ready = () => !!ui.querySelector("[data-ready]");
const skyKey = () => picked.join() + "|" + (thought ? thought.kind + thought.text : "");
const pid = (n) => "w" + n.toLowerCase().replace(/[^a-z0-9]/g, "");

// The real sky. Planets that moved slide over from where they were; a new one grows in, and once it has settled
// its name fades in letter by letter to form its ring. The clouds are their own layer, so this never resets them.
function drawSky({ born = null, arriving = null, from = null } = {}) {
  const pillars = picked.map((n, i) => ({ id: pid(n), name: n, tint: TINTS[i], focus: false }));
  const at = layout(pillars), changed = skyKey().split("|")[0] !== drawn.split("|")[0];
  const sky = root.querySelector(".b-sky");
  sky.innerHTML = renderSky({ pillars, thoughts: thought ? [thought] : [], arriving, from, labels: store.get().test.labels !== false });
  fitTags(sky);
  for (const p of pillars) {
    const g = sky.querySelector(`[data-orbit="${p.id}"]`);
    if (p.id === born) g.classList.add("b-new");
    else if (lastAt[p.id] && !still()) {
      g.style.transition = "none";
      g.style.translate = `${lastAt[p.id].x - at[p.id].x}px ${lastAt[p.id].y - at[p.id].y}px`;
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = ""; g.style.translate = "0px 0px"; }));
    }
  }
  lastAt = at; drawn = skyKey();
  startSpin(sky);
  if (changed && !still()) {
    const rings = sky.querySelectorAll(".rings");
    rings.forEach((r) => r.classList.add("b-wait"));
    const k = pillars.findIndex((p) => p.id === born), per = k < 0 ? 1 : pillars[k].name.replace(/ /g, "").length + 1;
    const letters = k < 0 ? [] : [...sky.querySelectorAll(`.ring[data-k="${k}"]`)].flatMap((g) => [...g.children].map((el, i) => [el.firstElementChild, i % per]));
    letters.forEach(([el]) => { el.style.opacity = 0; });
    setTimeout(() => {
      rings.forEach((r) => r.classList.remove("b-wait"));
      letters.forEach(([el, i]) => { el.style.transition = `opacity .6s ease ${i * 90}ms`; el.style.opacity = 1; });
    }, 1300);
  }
  sky.querySelectorAll("[data-planet]").forEach((h) => h.addEventListener("click", () => {
    if (STEPS[step].id !== "pick") return;
    const p = pillars.find((x) => x.id === h.dataset.planet);
    picked = picked.filter((n) => n !== p.name);
    render(); drawSky();
  }));
  placeGo();
}

// The tap target sits over the sun, wherever the sun lands on this screen.
function placeGo() {
  const p = skyPoint("sun");
  if (p && go) { go.style.left = `${p.x}px`; go.style.top = `${p.y}px`; root.style.setProperty("--sy", `${p.y}px`); }
  const low = skyPoint("below");
  if (low && root) root.style.setProperty("--below", `${low.y}px`);
}

const hint = () => `<p class="b-hint" data-ready>Tap the light when you’re ready.</p>`;

function screen(id) {
  switch (id) {
    case "dark": return "";
    case "hello": return `<div class="b-say b-top"><h2>Hi.</h2><p class="b-breath">Breathe in with the light…</p></div>`;
    case "you": return `<div class="b-say b-under"><h2>This light is you.</h2><p>What matters to you will gather around it.</p></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "pick": {
      const n = picked.length, left = SUGGESTED.filter((w) => !picked.includes(w));
      const sub = n === 0 ? "Pick three to five." : n < MIN_PILLARS ? `${MIN_PILLARS - n} more, at least.` : n < MAX_PILLARS ? "You can add more, or carry on." : "That’s five. The sky is full.";
      return `<div class="b-say b-top b-high"><h2>What do you want to look after?</h2><p>${sub}</p>${n ? `<p class="b-note">Tap a planet to take it back.</p>` : ""}</div>
        <div class="b-say b-low b-below">
          ${n < MAX_PILLARS ? `<div class="b-words">${left.map((w) => `<button type="button" data-pick="${esc(w)}">${esc(w)}</button>`).join("")}</div>
          ${ownOpen ? `<form class="b-own" data-own><input id="b-own" maxlength="${MAX_NAME}" placeholder="Your own" autocomplete="off" aria-label="Your own"><button type="submit" class="b-quiet">Add</button></form>`
                    : `<button type="button" class="b-quiet" data-ownopen>Something else</button>`}` : ""}
          ${n >= MIN_PILLARS ? hint() : ""}
        </div>`;
    }
    case "thought": {
      if (thought && !flying) {
        // A thought that sounds heavy gets no question about its kind: one calm line, and someone to talk to.
        if (thought.heavy) return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>Thank you for writing that down.</h2>
          <p>If it feels heavy right now, someone’s there to talk to, any time.</p></div>
          <div class="b-say b-low"><button type="button" class="b-quiet" data-support>Talk to someone</button>${hint()}</div>`;
        return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>That feels like ${A_KIND[thought.kind]}.</h2><p>Each kind has its own shape and colour. Is that right?</p></div>
          <div class="b-say b-low"><div class="b-kinds" role="group" aria-label="What kind of thought">${["kind", "worry", "want"].map((k) =>
            `<button type="button" class="k-${k}" data-kind="${k}" aria-pressed="${thought.kind === k}">${star(k)}${KIND_LABEL[k]}</button>`).join("")}</div>
          <p class="b-note">Tap another to change it.</p>${hint()}</div>`;
      }
      const k = draft.trim() ? guessKind(draft) : null;
      return `<form class="b-card" data-catch><label for="b-t">What’s on your mind right now?</label>
        <div class="b-row"><textarea id="b-t" rows="2" maxlength="120" placeholder="${esc(EXAMPLES[ex % EXAMPLES.length])}">${esc(draft)}</textarea>
        <button type="submit" class="b-send" aria-label="Add to the sky" ${draft.trim() ? "" : "disabled"}><i>${star("kind")}</i></button></div>
        <p class="b-guess">${k ? `${star(k)} ${KIND_LABEL[k]}` : ""}</p></form>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-none>Nothing right now</button></div>`;
    }
    case "name": return `<div class="b-say b-top"><h2>What should your sky call you?</h2><p>Only this phone will know.</p>
      <input class="b-name" id="b-name" maxlength="24" autocomplete="given-name" placeholder="Tap to write your name" value="${esc(name)}" aria-label="Your name"></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "day": return `<div class="b-say b-top"><h2>Once a week, ten quiet minutes to look back.</h2><p>Which day suits you?</p></div>
      <div class="b-say b-low"><div class="b-days" role="radiogroup" aria-label="Look back day">${DAYS.map(([d, l], i) =>
        `<button type="button" role="radio" aria-label="${d}" aria-checked="${i === day}" data-day="${i}">${l}</button>`).join("")}</div>
        <p class="b-note">${DAYS[day][0]}s. You can change it any time.</p>${hint()}</div>`;
    case "care": return `<div class="b-say b-top"><h2>One last thing.</h2><p>This isn’t therapy. If things ever feel heavy, someone’s there to talk to, any time. You’ll always find them in Record.</p></div>
      <div class="b-say b-low">${hint()}</div>`;
  }
}

function render() {
  timers.forEach(clearTimeout); timers = [];
  const s = STEPS[step];
  root.dataset.step = s.id;
  root.style.setProperty("--sun", s.sun);
  root.style.setProperty("--clouds", s.clouds);
  root.classList.toggle("b-breathing", s.id === "hello" && !still());
  ui.classList.toggle("b-enter", shown !== step); shown = step;
  ui.innerHTML = screen(s.id);
  go.classList.toggle("ready", ready());
  wire(s.id);
}

// Moving on: the words fade out, then the next ones fade in. The sky stays, and keeps changing slowly underneath.
function next(to) {
  if (to >= STEPS.length) return finish();
  if (to === step) return;
  timers.forEach(clearTimeout); timers = [];
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  clearTimeout(moving);
  moving = setTimeout(() => {
    step = to;
    ui.classList.remove("b-leaving");
    render();
    if (skyKey() !== drawn) drawSky();
  }, still() ? 0 : 700);
}

function wire(id) {
  if (id === "dark") timers.push(setTimeout(() => next(1), still() ? 300 : 1800));
  if (id === "hello") {
    // The words follow the breath: in for about four seconds, out for about five. Two breaths, then on.
    const p = ui.querySelector(".b-breath"), say = (t) => { p.classList.add("b-swap"); timers.push(setTimeout(() => { p.textContent = t; p.classList.remove("b-swap"); }, 500)); };
    [[4000, "…and out as it settles."], [9000, "Again. Breathe in…"], [13000, "…and out."], [18000, null]].forEach(([ms, t]) =>
      timers.push(setTimeout(() => t ? say(t) : next(step + 1), ms)));
  }
  ui.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => add(b.dataset.pick)));
  ui.querySelector("[data-ownopen]")?.addEventListener("click", () => { ownOpen = true; render(); ui.querySelector("#b-own")?.focus(); });
  ui.querySelector("[data-own]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ui.querySelector("#b-own").value.trim().slice(0, MAX_NAME);
    if (!v || picked.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    ownOpen = false; add(v);
  });
  const ta = ui.querySelector("#b-t");
  if (ta) {
    // Example thoughts drift through the empty space, one every few seconds.
    const drift = () => { if (!ta.value) { ex++; ta.placeholder = EXAMPLES[ex % EXAMPLES.length]; } timers.push(setTimeout(drift, 3200)); };
    timers.push(setTimeout(drift, 3200));
    ta.addEventListener("input", () => {
      draft = ta.value;
      const k = draft.trim() ? guessKind(draft) : null;
      ui.querySelector(".b-guess").innerHTML = k ? `${star(k)} ${KIND_LABEL[k]}` : "";
      ui.querySelector(".b-send").disabled = !draft.trim();
    });
    ui.querySelector("[data-catch]").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      ta.blur();
      const svg = root.querySelector("svg.sky"), b = ui.querySelector(".b-send").getBoundingClientRect();
      const p = new DOMPoint(b.left + b.width / 2, b.top + b.height / 2).matrixTransform(svg.getScreenCTM().inverse());
      const heavy = heaviness(text);
      thought = { id: store.uid(), text, kind: guessKind(text), pillarId: null, status: "active", count: 1, seen: [now()], ...placeStar([]), createdAt: now(), helped: [], ...(heavy && { heavy }) };
      draft = ""; flying = true;
      ui.classList.add("b-leaving");
      drawSky({ arriving: still() ? null : thought.id, from: { x: p.x, y: p.y } });
      timers.push(setTimeout(() => { flying = false; ui.classList.remove("b-leaving"); shown = -1; render(); }, still() ? 0 : 2600));
    });
  }
  ui.querySelector("[data-none]")?.addEventListener("click", () => { thought = null; draft = ""; next(step + 1); });
  ui.querySelector("[data-support]")?.addEventListener("click", () => hooks.support?.());
  ui.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { thought.kind = b.dataset.kind; render(); drawSky(); }));
  const nm = ui.querySelector("#b-name");
  nm?.addEventListener("input", () => { name = nm.value.trim(); });
  nm?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nm.blur(); } });
  ui.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = +b.dataset.day; render(); }));
}

function add(n) {
  if (picked.length >= MAX_PILLARS || picked.includes(n)) return;
  picked.push(n);
  render(); drawSky({ born: pid(n) });
}

// Everything is kept in one go, then the home sky takes over: the greeting and the dock fade in.
function finish() {
  timers.forEach(clearTimeout); clearTimeout(moving);
  removeEventListener("resize", placeGo);
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  setTimeout(() => {
    root = null;
    hooks.done?.();
    store.update((s) => {
      const old = new Map(s.pillars.map((p) => [p.name, p]));
      s.pillars = picked.map((n, i) => old.get(n) ?? { id: store.uid(), name: n, tint: TINTS[i], focus: false });
      if (thought) s.thoughts.push(thought);
      s.name = name.slice(0, 24); s.lookDay = day; s.setup = true;
    });
  }, still() ? 0 : 700);
}
