// The first time the app opens. Its job: by the end, someone knows how the app works, why it works, and wants to use it.
// The shape is "show it, do it, feel it":
//   Show it: what the app is for in one line, then a journey out across the night to a sky a few weeks in. It shows the
//            four things you do here, each with its reason, and ends on the payoff: what helped.
//   Do it:   back home, the same four things, in the same order, with your own life: what you look after becomes planets,
//            a thought becomes a star and gets a home, and you try a timer (practice only).
//   Feel it: your thought lands as one small star in a big sky, and the look-back day tells you it'll be waiting there.
// You go on by tapping the sun, the same tap that shows your week on the home sky. Nothing is saved until the end,
// so closing part way simply starts again next time.
import * as store from "./store.js";
import { now, formatRunning } from "./clock.js";
import { renderSky, startSpin, fitTags, layout, sparkle, placeStar, esc, POINTS, skyPoint, markTarget, zoomTo } from "./sky.js";
import { guessKind, KIND_LABEL } from "./thoughts.js";
import { heaviness, guessHome } from "./helps.js";
import { TINTS, SUGGESTED, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

// Each step: how big your sun is (it grows a little as your sky fills) and how far your clouds have come in.
const STEPS = [
  { id: "dark", sun: 0, clouds: 0 },
  { id: "promise", sun: .35, clouds: 0 },
  { id: "example", sun: .35, clouds: 0 },
  { id: "you", sun: .6, clouds: .1 },
  { id: "pick", sun: .8, clouds: .2 },
  { id: "thought", sun: .9, clouds: .3 },
  { id: "place", sun: 1, clouds: .4 },
  { id: "give", sun: 1, clouds: .5 },
  { id: "day", sun: 1, clouds: .7 },
  { id: "name", sun: 1, clouds: .85 },
  { id: "care", sun: 1, clouds: 1 },
];
const at = (id) => STEPS.findIndex((x) => x.id === id);
const DAYS = [["Sunday", "S"], ["Monday", "M"], ["Tuesday", "T"], ["Wednesday", "W"], ["Thursday", "T"], ["Friday", "F"], ["Saturday", "S"]];
const EXAMPLES = ["I'm behind on everything", "I want to call Mum this week", "Glad I went outside today", "What if I'm not good enough"];
// The four things you do here, each with its reason. The example shows them in this order, and setup does them in it too.
const LINES = [
  ["Notice what’s on your mind", "Written down, a thought gets smaller."],
  ["Give each thought a home", "You see which part of life it’s about."],
  ["Give time to what matters", "So worries aren’t all there is."],
  ["Look back each week", "You find out what actually helps you."],
];
// The example sky: someone a few weeks in. Never saved. Work gathers a small crowd once the stars find their homes.
const EX_PILLARS = ["Friends", "Health", "Work", "Rest"].map((name, i) => ({ id: "ex" + i, name, tint: TINTS[i], focus: false }));
const EX_STARS = [
  ["Behind at work", "worry", .74, .27, "ex2"], ["Did I upset Jo?", "worry", .2, .3, "ex0"], ["Lovely walk", "kind", .55, .23, "ex1"],
  ["Too many emails", "worry", .82, .63, "ex2"], ["Learn to cook", "want", .16, .64, "ex1"], ["Slept well", "kind", .5, .7, "ex3"],
  ["Ask for Friday off", "want", .3, .2, "ex2"],
];
const star = (kind) => `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let root = null, ui = null, go = null, hooks = {};
let step = 0, shown = -1, picked = [], thought = null, phase = "", name = "", day = 0, ownOpen = false, draft = "", ex = 0;
let example = null, practice = null;
let timers = [], moving = 0, lastAt = {}, drawnPlanets = "", travelling = 0;

// Called on every render while set-up isn't done. It only builds the screen once, so saving elsewhere never restarts it.
export function show(app, h) {
  hooks = h;
  if (root && app.contains(root)) return;
  const s = store.get();
  // Someone who picked planets on an older set-up keeps them and carries on from the look-back day.
  picked = s.pillars.map((p) => p.name);
  step = picked.length ? at("day") : 0;
  thought = null; phase = ""; name = s.name; day = s.lookDay ?? 0; ownOpen = false; draft = ""; shown = -1; lastAt = {}; drawnPlanets = "";
  example = null; practice = null;
  app.innerHTML = `<section class="born" aria-label="Welcome">
    <div class="sky-wrap"><div class="b-clouds"></div><canvas class="b-far" aria-hidden="true"></canvas><div class="b-sky"></div><div class="b-ex"></div></div>
    <div class="b-ui"></div>
    <button type="button" class="b-go" aria-label="Go on"></button></section>`;
  root = app.querySelector(".born"); ui = root.querySelector(".b-ui"); go = root.querySelector(".b-go");
  go.addEventListener("click", (e) => { e.stopPropagation(); if (ready()) onSun(); });
  addEventListener("resize", placeGo);
  render();
  drawSky();
}

const ready = () => !!ui.querySelector("[data-ready]");
const pid = (n) => "w" + n.toLowerCase().replace(/[^a-z0-9]/g, "");
const myPillars = () => picked.map((n, i) => ({ id: pid(n), name: n, tint: TINTS[i], focus: false }));
const id = () => STEPS[step].id;

// Tapping the sun: usually "go on". At the end of the example it means "take me home".
function onSun() {
  if (id() === "example") return travel(-1, () => next(at("you")));
  next(step + 1);
}

/* ---------- Your sky ---------- */

// Planets that moved slide over from where they were; a new one grows in, then its name fades in letter by letter.
function drawSky({ born = null, arriving = null, from = null, words = true } = {}) {
  const pillars = myPillars();
  const where = layout(pillars), key = pillars.map((p) => p.id).join(), changed = key !== drawnPlanets;
  const sky = root.querySelector(".b-sky");
  const shownThoughts = thought ? [thought] : [];
  sky.innerHTML = renderSky({ pillars, thoughts: shownThoughts, arriving, from, runningId: practice?.id, runLen: practice ? 25 : 0,
    labels: words && store.get().test.labels !== false });
  fitTags(sky);
  for (const p of pillars) {
    const g = sky.querySelector(`[data-orbit="${p.id}"]`);
    if (p.id === born) g.classList.add("b-new");
    else if (lastAt[p.id] && !still()) {
      g.style.transition = "none";
      g.style.translate = `${lastAt[p.id].x - where[p.id].x}px ${lastAt[p.id].y - where[p.id].y}px`;
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.transition = ""; g.style.translate = "0px 0px"; }));
    }
  }
  lastAt = where; drawnPlanets = key;
  if (!example) startSpin(sky);
  if (changed && born && !still()) {
    const rings = sky.querySelectorAll(".rings");
    rings.forEach((r) => r.classList.add("b-wait"));
    const k = pillars.findIndex((p) => p.id === born), per = pillars[k].name.replace(/ /g, "").length + 1;
    const letters = [...sky.querySelectorAll(`.ring[data-k="${k}"]`)].flatMap((g) => [...g.children].map((el, i) => [el.firstElementChild, i % per]));
    letters.forEach(([el]) => { el.style.opacity = 0; });
    setTimeout(() => {
      rings.forEach((r) => r.classList.remove("b-wait"));
      letters.forEach(([el, i]) => { el.style.transition = `opacity .6s ease ${i * 90}ms`; el.style.opacity = 1; });
    }, 1300);
  }
  sky.querySelectorAll("[data-planet]").forEach((h) => h.addEventListener("click", () => tapPlanet(h.dataset.planet)));
  sky.querySelector("[data-sun]")?.addEventListener("click", (e) => { if (id() === "place" && phase === "ask") { e.stopPropagation(); home("me"); } });
  if (id() === "place" && phase === "ask") markTarget(thought?.guess ?? null);
  placeGo();
}

function tapPlanet(p) {
  if (id() === "pick") {
    picked = picked.filter((n) => pid(n) !== p);
    render(); drawSky();
  } else if (id() === "place" && phase === "ask") home(p);
  else if (id() === "give" && !practice) startPractice(p);
}

// The tap target sits over the sun, wherever the sun lands on this screen.
function placeGo() {
  const p = skyPoint("sun");
  if (p && go) { go.style.left = `${p.x}px`; go.style.top = `${p.y}px`; root.style.setProperty("--sy", `${p.y}px`); }
  const low = skyPoint("below");
  if (low && root) root.style.setProperty("--below", `${low.y}px`);
}

/* ---------- The example sky, and the journey there and back ---------- */

// The example sky, a few weeks in: planets, its own clouds, and stars that already show their words.
function drawExample() {
  const t0 = now() - 3 * 86400000;
  const thoughts = EX_STARS.map(([text, kind, x, y, home], i) => ({ id: "exs" + i, text, kind, status: "active", count: i === 0 ? 3 : 1, x, y, createdAt: t0 - i * 3600000,
    pillarId: example.homes ? home : null, sortedAt: example.homes ?? 0 }));
  const box = root.querySelector(".b-ex");
  box.innerHTML = renderSky({ pillars: EX_PILLARS, thoughts, runningId: example.glow, labels: true });
  fitTags(box);
  startSpin(box);
}

// The journey: out from your sun until it's one warm light among many, across the night, and into the example sky.
// dir 1 goes out, -1 comes home. The far suns sit at three depths, so near ones slide past faster; faint wisps drift
// across in front; the view banks gently; the destination sharpens and brightens as it nears; your own sun stays a faint
// warm point you can find from far away. With reduced motion, the skies simply swap.
const FAR = Array.from({ length: 170 }, (_, i) => ({ x: rnd(i) * 4400 - 1500, y: rnd(i + 500) * 3600 - 1800, b: .3 + rnd(i + 900) * .7, d: [.35, .65, 1][i % 3], tw: rnd(i + 77) * 6.28, warm: rnd(i + 31) > .3 }))
  .filter((f) => Math.hypot(f.x, f.y) > 200 && Math.hypot(f.x - 1300, f.y + 260) > 220);
const WISPS = Array.from({ length: 9 }, (_, i) => ({ x: rnd(i + 40) * 2600 - 600, y: rnd(i + 60) * 1600 - 800, r: 80 + rnd(i + 80) * 120 }));
function rnd(i) { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
const DEST = { x: 1300, y: -260 }, MINS = .1, TRAVEL = 3200;
const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (t) => Math.max(0, Math.min(1, t));
function camera(p) {
  const e = ease(p);
  return { x: e * DEST.x, y: Math.sin(e * Math.PI) * -120 + e * DEST.y, s: 1 - (1 - MINS) * Math.pow(Math.sin(Math.PI * clamp(p)), .6), tilt: Math.sin(Math.PI * clamp(p)) * -.07 };
}
let sprite = null;
function glowSprite() {
  if (sprite) return sprite;
  sprite = document.createElement("canvas"); sprite.width = sprite.height = 64;
  const c = sprite.getContext("2d"), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,240,220,1)"); g.addColorStop(.25, "rgba(242,192,143,.4)"); g.addColorStop(1, "rgba(242,192,143,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return sprite;
}
function travel(dir, then) {
  const mine = root.querySelector(".b-sky"), box = root.querySelector(".b-ex"), cv = root.querySelector(".b-far");
  timers.forEach(clearTimeout); timers = [];
  ui.classList.add("b-leaving"); go.classList.remove("ready");
  if (dir > 0) { example = { glow: null, homes: null }; drawExample(); }
  const done = () => {
    cancelAnimationFrame(travelling); travelling = 0;
    cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
    mine.style.transform = box.style.transform = box.style.maskImage = box.style.webkitMaskImage = "";
    mine.style.opacity = dir > 0 ? "0" : ""; box.style.opacity = dir > 0 ? "" : "0";
    if (dir < 0) { box.innerHTML = ""; example = null; }
    then();
  };
  if (still()) return done();
  const dpr = Math.min(2, devicePixelRatio || 1), Wd = innerWidth, Hd = innerHeight;
  cv.width = Wd * dpr; cv.height = Hd * dpr;
  const c = cv.getContext("2d"), spr = glowSprite();
  const S = skyPoint("sun") ?? { x: Wd / 2, y: Hd / 2 }, k = Math.max(Wd / 300, Hd / 650);
  mine.style.opacity = box.style.opacity = "";
  const t0 = performance.now();
  const frame = (ms) => {
    const f = clamp((ms - t0) / TRAVEL), p = dir > 0 ? f : 1 - f, { x, y, s, tilt } = camera(p), far = clamp((1 - s) / .5);
    const ox = x * k, oy = y * k;
    const layer = (dx, dy) => `translate(${S.x}px,${S.y}px) rotate(${tilt}rad) scale(${s}) translate(${dx - ox}px,${dy - oy}px) translate(${-S.x}px,${-S.y}px)`;
    mine.style.transform = layer(0, 0);
    box.style.transform = layer(DEST.x * k, DEST.y * k);
    // Seen from afar, the example sky is a soft round glow of its own, not a rectangle.
    const m = Math.round(.5 * Wd + Math.pow(clamp((s - .82) / .18), 2) * 2.4 * Hd);
    box.style.maskImage = box.style.webkitMaskImage = s > .98 ? "" : `radial-gradient(circle ${m}px at ${S.x}px ${S.y}px, #000 20%, transparent 100%)`;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, Wd, Hd);
    c.save(); c.translate(S.x, S.y); c.rotate(tilt);
    const T = ms / 1000;
    for (const st of FAR) {
      const m = .6 + .4 * st.d, sx = (st.x - x * st.d) * s * m * k, sy = (st.y - y * st.d) * s * m * k;
      if (Math.abs(sx) > Wd || Math.abs(sy) > Hd) continue;
      const near = clamp(Math.hypot(sx, sy) / (300 * k) * .5 + .5), r = (1.3 + (2.6 - 1.3) * near) * (.6 + .6 * st.d) * k * 2.2;
      c.globalAlpha = far * st.b * (.75 + .25 * Math.sin(T * 1.6 + st.tw)) * (1 - near * .35);
      c.drawImage(spr, sx - r, sy - r, r * 2, r * 2);
    }
    // Your sun as a faint point to find your way home by, and the destination brightening as it nears.
    const home = { x: -ox * s, y: -oy * s }, dest = { x: (DEST.x * k - ox) * s, y: (DEST.y * k - oy) * s };
    const hr = 9 * k; c.globalAlpha = clamp((.5 - s) * 3); c.drawImage(spr, home.x - hr, home.y - hr, hr * 2, hr * 2);
    const dr = (8 + 6 * p) * k; c.globalAlpha = far * .9; c.drawImage(spr, dest.x - dr, dest.y - dr, dr * 2, dr * 2);
    // Wisps in front, moving faster than everything behind them.
    for (const w of WISPS) {
      const wx = (w.x - x * 1.8) * s * 1.4 * k, wy = (w.y - y * 1.8) * s * 1.4 * k, r = w.r * Math.max(s * 1.4, .5) * k;
      if (Math.abs(wx) > Wd + r * 2 || Math.abs(wy) > Hd + r) continue;
      const a = clamp(far * 1.6) * .13;
      c.save(); c.translate(wx, wy); c.rotate(.4); c.scale(1.8, .6);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(150,155,170,${a})`); g.addColorStop(.6, `rgba(150,155,170,${a * .4})`); g.addColorStop(1, "rgba(150,155,170,0)");
      c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.restore();
    }
    c.restore();
    if (f < 1) travelling = requestAnimationFrame(frame); else done();
  };
  travelling = requestAnimationFrame(frame);
}

// The example plays itself: each line with its reason; the stars drift to their planets; a planet glows as time is
// given to it; then the payoff: what this person's look back found. Then it waits for a tap on the light.
function playExample() {
  const q = still() ? .4 : 1;
  const say = (i) => {
    const el = ui.querySelector(".b-ex-line");
    if (!el) return;
    el.classList.add("b-swap");
    timers.push(setTimeout(() => { el.innerHTML = `<p class="b-ex-k">${LINES[i][0]}</p><p>${LINES[i][1]}</p>`; el.classList.remove("b-swap"); }, still() ? 0 : 500));
  };
  const plan = [
    [400, () => say(0)],
    [5000, () => { say(1); example.homes = now(); drawExample(); }],
    [10000, () => { say(2); example.glow = "ex1"; drawExample(); }],
    [15000, () => { say(3); example.glow = null; drawExample(); ui.querySelector(".b-payoff")?.classList.add("on"); }],
    [19500, () => { ui.querySelector(".b-low").innerHTML = hint("Now yours. Tap the light."); go.classList.add("ready"); }],
  ];
  for (const [ms, fn] of plan) timers.push(setTimeout(fn, ms * q));
}

/* ---------- Trying a timer: practice only ---------- */

function startPractice(p) {
  practice = { id: p, start: Date.now() };
  drawSky();
  // The same look as a real timer: everything but the planet and the sun steps away.
  root.classList.add("zoomed", "timing");
  zoomTo(p);
  render();
  const tick = () => {
    if (!practice) return;
    const el = ui.querySelector("[data-run]"), done = Math.min(1, (Date.now() - practice.start) / (25 * 60000));
    if (el) el.textContent = formatRunning(Date.now() - practice.start);
    root.querySelector(".tring [data-fill]")?.setAttribute("stroke-dasharray", `${Math.max(1.5, done * 100).toFixed(2)} 100`);
    timers.push(setTimeout(tick, 1000));
  };
  tick();
}
function stopPractice() {
  zoomTo(null);
  root.classList.remove("zoomed", "timing");
  ui.classList.add("b-leaving");
  timers.push(setTimeout(() => { practice = null; drawSky(); next(step + 1); }, still() ? 0 : 1400));
}

/* ---------- Screens ---------- */

const hint = (words = "Tap the light when you’re ready.") => `<p class="b-hint" data-ready>${words}</p>`;
const myName = (p) => p === "me" ? "you" : myPillars().find((x) => x.id === p)?.name ?? "";

function screen(s) {
  switch (s) {
    case "dark": return "";
    case "promise": return `<div class="b-say b-top b-mid"><h2>A calm place to notice what’s on your mind, and make time for what matters.</h2></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "example": return `<div class="b-say b-top b-high"><p class="b-note">A sky a few weeks in</p><div class="b-ex-line" aria-live="polite"></div></div>
      <div class="b-payoff" aria-live="polite"><p>“Behind at work” came up 3 times</p><p class="b-gold">What helped: a walk at lunch</p></div>
      <div class="b-say b-low"></div>`;
    case "you": return `<div class="b-say b-under"><h2>This light is you.</h2><p>Let’s make your sky.</p></div>
      <div class="b-say b-low">${hint()}</div>`;
    case "pick": {
      const n = picked.length, left = SUGGESTED.filter((w) => !picked.includes(w));
      const sub = n === 0 ? "Pick three to five." : n < MIN_PILLARS ? `${MIN_PILLARS - n} more, at least.` : n < MAX_PILLARS ? "You can add more, or carry on." : "That’s five. The sky is full.";
      return `<div class="b-say b-top b-high"><h2>What do you want to look after?</h2><p>These become your planets. Your thoughts and your time will gather around them.</p><p class="b-note">${sub}${n ? " Tap a planet to take it back." : ""}</p></div>
        <div class="b-say b-low b-below">
          ${n < MAX_PILLARS ? `<div class="b-words">${left.map((w) => `<button type="button" data-pick="${esc(w)}">${esc(w)}</button>`).join("")}</div>
          ${ownOpen ? `<form class="b-own" data-own><input id="b-own" maxlength="${MAX_NAME}" placeholder="Your own" autocomplete="off" aria-label="Your own"><button type="submit" class="b-quiet">Add</button></form>`
                    : `<button type="button" class="b-quiet" data-ownopen>Something else</button>`}` : ""}
          ${n >= MIN_PILLARS ? hint() : ""}
        </div>`;
    }
    case "thought": {
      if (phase === "flying") return "";
      // A thought that sounds heavy lands quietly: one calm line, and someone to talk to. It isn't asked anything.
      if (phase === "landed" && thought.heavy) return `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>Thank you for writing that down.</h2>
          <p>If it feels heavy right now, someone’s there to talk to, any time.</p></div>
          <div class="b-say b-low"><button type="button" class="b-quiet" data-support>Talk to someone</button>${hint()}</div>`;
      if (phase === "landed") return `<div class="b-say b-top"><h2>There it is.</h2><p>One small star in a big sky.</p></div>`;
      const k = draft.trim() ? guessKind(draft) : null;
      return `<form class="b-card" data-catch><label for="b-t">What’s on your mind right now?</label>
        <div class="b-row"><textarea id="b-t" rows="2" maxlength="120" placeholder="${esc(EXAMPLES[ex % EXAMPLES.length])}">${esc(draft)}</textarea>
        <button type="submit" class="b-send" aria-label="Add to the sky" ${draft.trim() ? "" : "disabled"}><i>${star("kind")}</i></button></div>
        <p class="b-guess">${k ? `${star(k)} ${KIND_LABEL[k]}` : ""}</p></form>
        <p class="b-why">${LINES[0][1]}</p>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-none>Nothing right now</button></div>`;
    }
    case "place": return phase === "placed"
      ? `<div class="b-say b-top"><h2>${thought.pillarId === "me" ? "It’s just about you. It circles the sun." : "It has a place now."}</h2><p>Over a week, you’ll see which parts of life are on your mind most. You can always skip this.</p></div>`
      : `<div class="b-say b-top"><p class="b-quote">“${esc(thought.text)}”</p><h2>Where does it belong?</h2><p>Tap its planet, or the sun if it’s just about you.</p></div>
        <div class="b-say b-low"><div class="b-kinds b-small" role="group" aria-label="What kind of thought">${["kind", "worry", "want"].map((k) =>
          `<button type="button" class="k-${k}" data-kind="${k}" aria-pressed="${thought.kind === k}">${star(k)}${KIND_LABEL[k]}</button>`).join("")}</div>
        <button type="button" class="b-quiet" data-skip>Not now</button></div>`;
    case "give": return practice
      ? `<div class="b-say b-top"><p>Now give time to something you care about.</p></div>
        <div class="b-say b-run"><p class="b-note">${esc(myName(practice.id))} · practice</p><p class="b-big" data-run>0:00</p>
          <p>Tap a planet when you start something. It keeps time, so worries aren’t all there is.</p>
          <button type="button" class="b-stop" data-stop aria-label="Stop the practice timer"><i></i></button></div>`
      : `<div class="b-say b-top"><h2>Now give time to something you care about.</h2><p>Tap one you gave time to today.</p><p class="b-note">Just practice. Nothing is saved.</p></div>
        <div class="b-say b-low"><button type="button" class="b-quiet" data-skip>Nothing today</button></div>`;
    case "day": return `<div class="b-say b-top"><h2>Once a week, a quiet look back.</h2><p>What helped? What didn’t? What keeps coming up? Then pick one small thing for the week ahead.</p>
        ${thought && !thought.heavy ? `<p class="b-gold">“${esc(thought.text)}” will be there.</p>` : ""}</div>
      <div class="b-say b-low"><p class="b-note">Which day suits you?</p><div class="b-days" role="radiogroup" aria-label="Look back day">${DAYS.map(([d, l], i) =>
        `<button type="button" role="radio" aria-label="${d}" aria-checked="${i === day}" data-day="${i}">${l}</button>`).join("")}</div>
        <p class="b-note">${DAYS[day][0]}s. You can change it any time.</p>${hint()}</div>`;
    case "name": return `<div class="b-say b-top"><h2>What should your sky call you?</h2>
      <input class="b-name" id="b-name" maxlength="24" autocomplete="given-name" placeholder="Tap to write your name" value="${esc(name)}" aria-label="Your name"></div>
      <div class="b-say b-low">${hint()}</div>`;
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
  ui.classList.toggle("b-enter", shown !== step); shown = step;
  ui.innerHTML = screen(s.id);
  go.classList.toggle("ready", ready());
  wire(s.id);
}

// Moving on: the words fade out, then the next ones fade in. The sky stays, and keeps changing slowly underneath.
function next(to) {
  if (to >= STEPS.length) return finish();
  timers.forEach(clearTimeout); timers = [];
  ui.classList.add("b-leaving");
  go.classList.remove("ready");
  markTarget(null);
  clearTimeout(moving);
  // Leaving for the example: the journey out, then the example plays.
  if (STEPS[to].id === "example") return travel(1, () => { step = to; ui.classList.remove("b-leaving"); render(); });
  moving = setTimeout(() => {
    step = to; phase = "";
    if (STEPS[to].id === "place" && (!thought || thought.heavy)) return next(to + 1);
    if (STEPS[to].id === "place") phase = "ask";
    ui.classList.remove("b-leaving");
    render();
    drawSky();
  }, still() ? 0 : 700);
}

function wire(s) {
  if (s === "dark") timers.push(setTimeout(() => next(1), still() ? 300 : 1600));
  if (s === "example") playExample();
  if (s === "thought" && phase === "landed" && !thought.heavy) timers.push(setTimeout(() => next(step + 1), still() ? 1500 : 2800));
  if (s === "place" && phase === "placed") timers.push(setTimeout(() => next(step + 1), still() ? 2000 : 4200));
  ui.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => add(b.dataset.pick)));
  ui.querySelector("[data-ownopen]")?.addEventListener("click", () => { ownOpen = true; render(); ui.querySelector("#b-own")?.focus(); });
  ui.querySelector("[data-own]")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = ui.querySelector("#b-own").value.trim().slice(0, MAX_NAME);
    if (!v || picked.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    ownOpen = false; add(v);
  });
  ui.querySelector("[data-skip]")?.addEventListener("click", () => next(step + 1));
  ui.querySelector("[data-stop]")?.addEventListener("click", stopPractice);
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
      thought.guess = heavy ? null : guessHome(text, myPillars());
      draft = ""; phase = "flying";
      ui.classList.add("b-leaving");
      // The star lands first; its words fade in once it has.
      drawSky({ arriving: still() ? null : thought.id, from: { x: p.x, y: p.y }, words: false });
      timers.push(setTimeout(() => { phase = "landed"; ui.classList.remove("b-leaving"); shown = -1; render(); drawSky(); }, still() ? 0 : 2600));
    });
  }
  ui.querySelector("[data-none]")?.addEventListener("click", () => { thought = null; draft = ""; next(at("give")); });
  ui.querySelector("[data-support]")?.addEventListener("click", () => hooks.support?.());
  ui.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { thought.kind = b.dataset.kind; render(); drawSky(); }));
  const nm = ui.querySelector("#b-name");
  nm?.addEventListener("input", () => { name = nm.value.trim(); });
  nm?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nm.blur(); } });
  ui.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { day = +b.dataset.day; render(); }));
}

// Your first thought finds its home: it leaves its lap and drifts over to circle that planet (or the sun).
function home(p) {
  thought.pillarId = p; thought.sortedAt = now();
  phase = "placed";
  markTarget(null);
  render(); drawSky();
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
      if (thought) {
        const { guess, ...t } = thought;
        // The planet ids used during set-up become the real ones.
        if (t.pillarId && t.pillarId !== "me") t.pillarId = s.pillars.find((p) => pid(p.name) === t.pillarId)?.id ?? null;
        s.thoughts.push(t);
      }
      s.name = name.slice(0, 24); s.lookDay = day; s.setup = true; s.setupAt = now(); s.hints = thought ? { thought: now() } : {};
    });
  }, still() ? 0 : 700);
}
