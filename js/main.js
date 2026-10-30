import * as store from "./store.js";
import { now, weekStart, greeting, formatTotal, formatRunning, setOffsetDays, DAY } from "./clock.js";
import { renderSky, fitTags, startSpin, planet, shade, sparkle, placeStar, esc, POINTS, zoomTo, zoomNow, runCamera, skyPoint } from "./sky.js";
import { guessKind, findSimilar, cameUp, KIND_LABEL } from "./thoughts.js";
import * as sort from "./sort.js";
import * as look from "./lookback.js";
import { due, times } from "./week.js";
import { heaviness } from "./helps.js";
import { weekHTML, recordHTML } from "./weekview.js";
import * as notify from "./notify.js";
import { TINTS, ACTIVITIES } from "./pillars.js";
import * as welcome from "./welcome.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
let testMode = params.has("test");
setOffsetDays(store.get().test.offsetDays);

// Text and controls use Apple's own sizes at every screen width, so the app feels like the phone's other apps.
// (Only the sky scales to fill the screen.) `zoom` stays at 1; it is kept so text fields and sheets still read it.
const zoom = 1;
const fit = () => {
  // The whole phone screen's height: on iPhone the app's own area can stop short of the bottom edge,
  // and the sky should still reach it.
  document.documentElement.style.setProperty("--sh", `${screen.height}px`);
};
fit();
addEventListener("resize", fit);

const ICON = {
  sort: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="6" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="12" cy="19" r="2"/><path d="M6.3 7.6 10.8 17.2M17.7 7.6 13.2 17.2"/></svg>`,
  record: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11.5A2.5 2.5 0 0 1 19 6.5V20H7.5A2.5 2.5 0 0 1 5 17.5z"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19"/><path d="M9.5 8.5h5"/></svg>`,
  star: `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="${sparkle(4, 8)}"/></svg>`,
  stop: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2.5"/></svg>`,
};

function render() {
  const s = store.get();
  if (!s.setup) welcome.show(app, { support: openSupport, done: () => { justBorn = true; } });
  else renderHome(s);
  if (testMode) renderTestPanel();
}

/* ---------- First day: the sky is born (js/welcome.js) ---------- */

// Set when set-up has just finished, so the home sky's greeting and dock fade in the first time.
let justBorn = false;

/* ---------- Home: the sky, and the dock with timers and actions ---------- */

// Which timer the screen showed last time, so the running view only animates in when a timer has just started.
let shownRunning = null, firstHome = true;
// A thought caught a moment ago, so its star floats up the next time the sky is drawn.
let arriving = null, arriveFrom = null;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function renderHome(s) {
  const active = s.thoughts.filter((t) => t.status === "active").length;
  const sorting = sort.active() ? sort.view() : null;
  // The look back, when it's ready: the sun calls on the day and the day after, then waits quietly.
  const ready = due(s), calling = ready && ready.days <= 1 && !sorting;
  const sub = sorting && sort.left() ? `${sort.left()} to sort`
    : ready ? (calling ? "Your week is ready. Tap the sun when you are." : "Your week is still here, whenever you’re ready.")
    : justBorn ? "Your sky. It grows with you."
    : active ? `${active} star${active === 1 ? "" : "s"} in your sky` : "Your sky is clear";
  const mine = s.intention && s.pillars.some((p) => p.id === s.intention.pillarId) ? s.intention : null;
  const run = s.running && s.pillars.find((p) => p.id === s.running.pillarId);
  // Opening the app with a timer already running goes straight to the zoomed-in planet.
  const opening = firstHome; firstHome = false;
  const fresh = justBorn; justBorn = false;
  const was = shownRunning, starting = run && was !== run.id && !opening, ending = !run && was;
  shownRunning = run?.id ?? null;
  app.innerHTML = `<section class="home ${fresh ? "fresh" : ""} ${run && !starting || ending ? "timing zoomed" : ""} ${sorting ? `sorting sort-${sorting}` : ""} ${ready && !sorting ? "due" : ""}">
    <div class="sky-wrap">${renderSky({ pillars: s.pillars, thoughts: s.thoughts, runningId: run?.id, runLen: s.running?.minutes, arriving: still() ? null : arriving, from: arriveFrom, labels: s.test.labels !== false,
      gather: ready && !sorting ? ready.since : null, intent: mine?.pillarId })}</div><div class="seam"></div>
    ${calling ? `<div class="suncall" aria-hidden="true"><i></i><i></i></div>` : ""}
    ${mine && !sorting ? `<button type="button" class="intent" id="intent"><span class="k">${dotFor(mine.pillarId)}This week</span><span class="i">${esc(mine.text)}</span>${mine.did.length ? `<span class="n">Done ${times(mine.did.length)}</span>` : ""}</button>` : ""}
    <header class="greet"><h1 id="greet">${greeting()}${s.name ? `, <span>${esc(s.name)}</span>` : ""}</h1><p>${sub}</p></header>
    ${run ? `<div class="running ${starting ? "enter" : ""}" style="--c:${run.tint}">
      <p class="rl"><i aria-hidden="true"></i>${esc(run.name)}${s.running.activity ? ` · ${esc(s.running.activity)}` : ""}</p>
      <p class="big" data-run aria-label="Time so far"></p>
      ${s.running.minutes ? `<p class="of" data-of="${s.running.minutes}"></p>` : ""}
      <button type="button" class="stop" id="stop" aria-label="Stop timer">${ICON.stop}</button></div>` : ""}
    <nav class="dock" aria-label="Actions">
      <div class="actions">
        <button type="button" class="round" id="sort" aria-label="Sort">${ICON.sort}</button>
        <button type="button" class="catch" id="catch" aria-label="New thought"><span class="dot">${ICON.star}</span><span class="lab">New thought</span></button>
        <button type="button" class="round" id="record" aria-label="Record">${ICON.record}</button>
      </div>
    </nav></section>`;
  fitTags(app);
  startSpin(app);
  tick();
  // Starting a timer glides into that planet while the greeting and dock slip away; stopping glides back out.
  if (starting || ending) {
    const home = app.querySelector(".home");
    void home.offsetWidth;
    home.classList.toggle("timing", !!starting);
    home.classList.toggle("zoomed", !!starting);
    zoomTo(starting ? run.id : null);
  } else if (opening) zoomNow(run?.id ?? null);
  else runCamera();
  app.querySelector("#stop")?.addEventListener("click", stop);
  arriving = arriveFrom = null;
  // Planets in the sky open their card (ideas, adding time by hand); stars open the thought they hold.
  const tappable = (sel, key, open) => app.querySelectorAll(sel).forEach((el) => {
    el.addEventListener("click", () => open(el.dataset[key]));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el.dataset[key]); } });
  });
  // While sorting, tapping a planet (or the sun) gives it the thought instead.
  tappable("[data-planet]", "planet", (id) => sort.active() ? sort.choose(id) : openPillar(id));
  tappable("[data-sun]", "sun", (id) => sort.active() ? sort.choose(id) : ready && openLook());
  placeHome();
  app.querySelector("#intent")?.addEventListener("click", openIntention);
  app.querySelector("#record").addEventListener("click", openRecord);
  app.querySelector("#sort").addEventListener("click", () => sort.open(toast));
  sort.afterRender();
  tappable("[data-star]", "star", openStar);
  app.querySelector("#catch").addEventListener("click", openCatch);
  let taps = 0;
  app.querySelector("#greet").addEventListener("click", () => { if (++taps >= 5) { taps = 0; testMode = true; renderTestPanel(); } });
}

function start(pillarId, activity, minutes = 0) {
  const before = store.get().running, n = store.get().notify;
  // The length is remembered first, so starting the timer stays one smooth change on screen.
  if (n.len !== minutes) store.update((s) => { s.notify.len = minutes; });
  const ran = store.startTimer(pillarId, activity, minutes);
  if (before && ran >= 60000) toast(`Logged ${formatTotal(ran)} to ${pillarName(before.pillarId)}.`);
  // The first time a timer is given a length, ask once whether a nudge would help.
  if (minutes && !n.asked && !n.timer && notify.supported() && !notify.blocked()) setTimeout(() => askTimer(minutes), still() ? 0 : 1200);
}

// The running view eases away first, then the timer stops.
function stop() {
  const el = app.querySelector(".running");
  if (el?.classList.contains("leave")) return;
  if (!el || still()) return stopped(store.stopTimer());
  el.classList.add("leave");
  setTimeout(() => stopped(store.stopTimer()), 200);
}

function stopped(ms) {
  const name = pillarName(store.get().sessions.at(-1)?.pillarId);
  toast(ms >= 60000 ? `Logged ${formatTotal(ms)} to ${name}.` : "Stopped. Under a minute, so it wasn't kept.");
}

const pillarName = (id) => store.get().pillars.find((p) => p.id === id)?.name ?? "";

// Only the times change every second; the sky is left alone so its motion stays smooth.
function tick() {
  const s = store.get(), from = weekStart();
  app.querySelectorAll("[data-time]").forEach((el) => {
    const id = el.dataset.time, run = s.running?.pillarId === id;
    el.textContent = run ? formatRunning(now() - s.running.start) : formatTotal(store.timeSince(id, from));
  });
  const big = app.querySelector("[data-run]");
  if (big && s.running) big.textContent = formatRunning(now() - s.running.start);
  // A timer given a length: a gold ring closes round the planet, and once the time is reached one quiet line says so.
  // Nothing stops; the count carries on until it's stopped.
  const len = s.running?.minutes, done = len ? Math.min(1, (now() - s.running.start) / (len * 60000)) : 0;
  app.querySelector(".tring [data-fill]")?.setAttribute("stroke-dasharray", `${(done * 100).toFixed(2)} 100`);
  const of = app.querySelector("[data-of]");
  if (of) {
    const up = done >= 1;
    if (of.dataset.up !== String(up)) {
      of.dataset.up = String(up);
      of.classList.toggle("up", up);
      of.innerHTML = up ? `That’s your ${len === 60 ? "hour" : len % 60 ? `${len} minutes` : `${len / 60} hours`}.<span>Keep going if it feels good.</span>` : `of ${lenLabel(len)}`;
    }
  }
  const sheetTime = document.querySelector("[data-week]");
  if (sheetTime) sheetTime.textContent = formatTotal(store.timeSince(sheetTime.dataset.week, from));
}
setInterval(tick, 1000);

/* ---------- A pillar's card: start a timer, pick an idea, or add time you forgot to track ---------- */

function openPillar(id) {
  const s = store.get(), i = s.pillars.findIndex((p) => p.id === id), p = s.pillars[i];
  if (!p) return;
  const running = s.running?.pillarId === id, ideas = ACTIVITIES[p.name] ?? [];
  const { sheet, close } = openSheet(`
    <header class="sh-head">
      <svg viewBox="-15 -15 30 30" aria-hidden="true">${planet("sheet", i, 11, shade(p))}</svg>
      <div><h2 id="sheet-title">${esc(p.name)}</h2><p>This week <span data-week="${id}"></span></p></div>
      ${CLOSE}
    </header>
    ${running ? "" : `<p class="nl-k" id="nl-k">How long?</p>
    <div class="wheel" role="slider" tabindex="0" aria-labelledby="nl-k" aria-valuemin="0" aria-valuemax="${notify.LENGTHS.length - 1}">
      ${notify.LENGTHS.map((m) => `<div data-len="${m}">${lenLabel(m)}</div>`).join("")}</div>
    <p class="hint">No end is fine too. The timer keeps counting either way.</p>`}
    <button type="button" class="primary" data-go>${running ? "Stop timer" : "Start timer"}</button>
    ${ideas.length ? `<h3>Ideas</h3><p class="hint">Tap one to start a timer for it.</p>
    <div class="chips">${ideas.map((a) => `<button type="button" class="chip" data-idea="${esc(a)}">${esc(a)}</button>`).join("")}</div>` : ""}
    <button type="button" class="link" data-manual aria-expanded="false">Forgot to start a timer? Add time</button>
    <form class="manual" hidden>
      <fieldset><legend>How long?</legend><div class="chips">${[15, 30, 45, 60, 90].map((m, k) => `<button type="button" class="chip" data-min="${m}" aria-pressed="${k === 1}">${formatTotal(m * 60000)}</button>`).join("")}</div></fieldset>
      <fieldset><legend>When?</legend><div class="chips">${["Today", "Yesterday"].map((d, k) => `<button type="button" class="chip" data-ago="${k}" aria-pressed="${k === 0}">${d}</button>`).join("")}</div></fieldset>
      <button type="submit" class="primary">Add time</button>
    </form>`, p.tint);
  startSpin(document.body);
  tick();
  const len = wheel(sheet.querySelector(".wheel"), Math.max(0, notify.LENGTHS.indexOf(s.notify.len)));
  sheet.querySelector("[data-go]").addEventListener("click", () => { const m = len(); close(); running ? stop() : start(id, undefined, m); });
  sheet.querySelectorAll("[data-idea]").forEach((b) => b.addEventListener("click", () => { const m = len(); close(); start(id, b.dataset.idea, m); }));
  const form = sheet.querySelector(".manual"), toggle = sheet.querySelector("[data-manual]");
  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
    toggle.setAttribute("aria-expanded", String(!form.hidden));
    if (!form.hidden) form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  form.querySelectorAll(".chips").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    g.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
  }));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const min = +form.querySelector("[data-min][aria-pressed=true]").dataset.min;
    const ago = +form.querySelector("[data-ago][aria-pressed=true]").dataset.ago;
    store.addTime(id, min, ago);
    close();
    toast(`Added ${formatTotal(min * 60000)} to ${p.name}.`);
  });
}

const lenLabel = (m) => !m ? "No end" : m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} hr ${m % 60}` : `${m / 60} hr`;

// A flick-to-pick wheel of timer lengths, like the iPhone's own timer. Returns a function giving the minutes picked.
// Positions are worked out as a share of the scroll, so the screen zoom can't throw them off.
function wheel(el, start) {
  if (!el) return () => 0;
  const rows = [...el.children], last = rows.length - 1;
  const max = () => el.scrollHeight - el.clientHeight;
  const at = () => Math.max(0, Math.min(last, Math.round(el.scrollTop / (max() || 1) * last)));
  let shown = -1;
  const mark = () => {
    const i = at();
    if (i === shown) return;
    shown = i;
    rows.forEach((r, k) => r.classList.toggle("on", k === i));
    el.setAttribute("aria-valuenow", String(i));
    el.setAttribute("aria-valuetext", rows[i].textContent);
  };
  const go = (i, smooth) => el.scrollTo({ top: max() * Math.max(0, Math.min(last, i)) / last, behavior: smooth && !still() ? "smooth" : "auto" });
  el.addEventListener("scroll", mark, { passive: true });
  el.addEventListener("click", (e) => { const r = e.target.closest("[data-len]"); if (r) go(rows.indexOf(r), true); });
  el.addEventListener("keydown", (e) => {
    const d = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (d) { e.preventDefault(); go(at() + d, true); }
  });
  requestAnimationFrame(() => { go(start); mark(); });
  mark();
  return () => +rows[at()].dataset.len;
}

// iPhone draws the typing cursor in the wrong place inside zoomed boxes, so text fields undo the zoom
// and are sized directly instead: same look, cursor where you type.
function unzoom(el, { font, padY, padX, radius, height }) {
  const z = zoom;
  Object.assign(el.style, {
    zoom: String(1 / z), fontSize: `${font * z}px`, padding: `${padY * z}px ${padX * z}px`, borderRadius: `${radius * z}px`,
    ...(height && { height: `${height * z}px` }),
  });
}

// After the keyboard goes away, iPhone can leave the screen nudged up. Put it back.
addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement?.matches?.("input, textarea")) scrollTo(0, 0); }, 60));

/* ---------- Catching a thought: write it down, and it becomes a star ---------- */

const MAX_THOUGHT = 120;
const starIcon = (kind, size = 16) => `<svg class="kstar k-${kind}" viewBox="-12 -12 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${sparkle(POINTS[kind], 10)}"/></svg>`;

// A small card at the top of the screen, over the dimmed sky, so the keyboard only ever covers empty space.
// Just your words, our guess at the kind (tap to change), and a gold button to add it. Closing keeps the draft.
let draft = "";

function openCatch() {
  closeSheet();
  let kind = "kind", chosen = false;
  const opener = document.activeElement;
  const back = document.createElement("div");
  back.className = "sheet-back light";
  const card = document.createElement("section");
  card.className = "sheet catchcard";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "New thought");
  document.body.append(back, card);
  const close = () => { draft = card.querySelector("textarea")?.value ?? ""; closeSheet(); opener?.focus?.(); };
  back.addEventListener("click", close);
  card.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  requestAnimationFrame(() => { back.classList.add("in"); card.classList.add("in"); });

  const write = () => {
    card.innerHTML = `<form class="cc">
      <label for="thought" class="sr">Your thought</label>
      <textarea id="thought" rows="2" maxlength="${MAX_THOUGHT}" placeholder="What's on your mind?" enterkeyhint="done" autocapitalize="sentences" autocorrect="on" spellcheck="true"></textarea>
      <div class="cc-row">
        <div class="kindpick"></div>
        <button type="submit" class="send" aria-label="Add to my sky" disabled>${ICON.star}</button>
      </div>
      <div class="kfold"><div><div class="klist" role="radiogroup" aria-label="What kind of thought">${["kind", "worry", "want"].map((k) =>
        `<button type="button" class="kopt k-${k}" role="radio" data-kind="${k}" aria-checked="false" tabindex="-1">${starIcon(k, 14)}${KIND_LABEL[k]}</button>`).join("")}</div></div></div></form>`;
    const form = card.querySelector("form"), box = card.querySelector("textarea"), go = card.querySelector(".send"), pick = card.querySelector(".kindpick");
    const fold = card.querySelector(".kfold"), opts = [...card.querySelectorAll(".kopt")];
    unzoom(box, { font: 20, padY: 0, padX: 0, radius: 0 });
    // One quiet line: our guess. Tapped, the three kinds unfold underneath; choosing one folds them away.
    const showGuess = () => {
      pick.innerHTML = box.value.trim() ? `<button type="button" class="guess" aria-expanded="${fold.classList.contains("open")}" aria-label="Kind: ${KIND_LABEL[kind]}. Tap to change.">${starIcon(kind, 13)}${KIND_LABEL[kind]}<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></button>` : "";
      opts.forEach((o) => o.setAttribute("aria-checked", o.dataset.kind === kind));
    };
    const unfold = (open) => {
      fold.classList.toggle("open", open);
      opts.forEach((o) => { o.tabIndex = open ? 0 : -1; });
      pick.querySelector(".guess")?.setAttribute("aria-expanded", open);
    };
    pick.addEventListener("click", (e) => { if (e.target.closest(".guess")) unfold(!fold.classList.contains("open")); });
    fold.addEventListener("click", (e) => {
      const b = e.target.closest(".kopt");
      if (!b) return;
      kind = b.dataset.kind; chosen = true;
      showGuess();
      pick.querySelector(".guess")?.setAttribute("aria-expanded", true);
      // A moment to see the choice land, then fold away and carry on writing.
      setTimeout(() => { unfold(false); box.focus(); }, 220);
    });
    box.value = draft;
    const changed = () => {
      go.disabled = !box.value.trim();
      if (!chosen && box.value.trim()) kind = guessKind(box.value);
      if (!box.value.trim()) unfold(false);
      showGuess();
    };
    changed();
    box.addEventListener("input", changed);
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = box.value.trim().replace(/\s+/g, " ");
      if (!text) return;
      // A heavy thought never joins another star: it lands like any other, quietly.
      const echo = !heaviness(text) && findSimilar(text, store.get().thoughts);
      if (echo) return familiar(echo, text);
      draft = "";
      launch(go, () => catchIt(text, kind, go));
    });
    box.focus();
  };

  // The same thought has come up before: offer to join it to that star instead of adding a new one.
  const familiar = (echo, text) => {
    const settled = echo.status === "settled";
    card.innerHTML = `<div class="cc">
      <p class="cc-eyebrow">This feels familiar</p>
      <blockquote class="cc-quote k-${echo.kind}">${starIcon(echo.kind, 13)}<span>“${esc(echo.text)}”</span></blockquote>
      <p class="cc-soft">${echo.kind === "worry" ? "That's okay. It coming back just means it matters to you." : settled ? "You've settled this one before." : "Thoughts often come back around."}</p>
      <div class="cc-choices"><button type="button" class="ghost" data-diff>It's different</button><button type="button" class="pill-gold" data-same>Same thought</button></div></div>`;
    card.querySelector("[data-same]").focus();
    card.querySelector("[data-same]").addEventListener("click", () => {
      draft = "";
      closeSheet();
      store.thoughtCameBack(echo.id);
      toast(settled ? "It's back in your sky. Look at what helped last time when you're ready." : "Added to that star. It's grown a little.");
    });
    const diff = card.querySelector("[data-diff]");
    diff.addEventListener("click", () => { draft = ""; launch(diff, () => catchIt(text, kind, diff)); });
  };

  write();
}

// The card lifts away while the new star leaves the button that added it.
function launch(button, add) {
  button.classList.add("press");
  document.querySelectorAll(".sheet, .sheet-back").forEach((el) => { el.classList.add("out"); el.unwatch?.(); });
  document.activeElement?.blur?.();
  add();
  setTimeout(closeSheet, 600);
}

// No message: the star finding its place in the sky says it.
function catchIt(text, kind, button) {
  arriving = store.uid();
  arriveFrom = null;
  const svg = document.querySelector("svg.sky"), b = button?.getBoundingClientRect();
  if (svg && b) {
    const p = new DOMPoint(b.left + b.width / 2, b.top + b.height / 2).matrixTransform(svg.getScreenCTM().inverse());
    arriveFrom = { x: p.x, y: p.y };
  }
  const heavy = heaviness(text);
  store.addThought(text, kind, placeStar(store.get().thoughts.filter((x) => x.status === "active")), arriving, heavy);
  if (heavy) setTimeout(() => quietLine(heavy), still() ? 0 : 1800);
  else if (eveningMoment()) setTimeout(offerEvening, still() ? 0 : 2200);
}

// A heavy thought gets one calm line under the sun: no alarm, no colour, and two ways to answer.
function quietLine(heavy) {
  document.querySelector(".hush")?.remove();
  const el = document.createElement("div");
  el.className = "hush";
  el.setAttribute("role", "status");
  el.innerHTML = heavy === "heavy"
    ? `<p class="h">That sounds really heavy.</p><p class="s">You don’t have to carry it on your own.</p>
      <div class="q-row"><button type="button" class="ghost2" data-talk>Talk to someone</button><button type="button" class="q-link" data-ok>I’m okay for now</button></div>`
    : `<p class="h">Sounds like you need a break.</p><p class="s">If it’s more than that, you can talk to someone any time.</p>
      <div class="q-row"><button type="button" class="q-link" data-talk>Talk to someone</button><button type="button" class="q-link" data-ok>Okay</button></div>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const go = () => { el.classList.remove("in"); setTimeout(() => el.remove(), 800); };
  el.querySelector("[data-talk]").addEventListener("click", () => { go(); openSupport(); });
  el.querySelector("[data-ok]").addEventListener("click", go);
}

/* ---------- A star: the thought it holds ---------- */

function openStar(id) {
  const t = store.get().thoughts.find((x) => x.id === id);
  if (!t) return;
  const { sheet, close } = openSheet(`
    <header class="sh-head star-head"><div><p class="eyebrow k-${t.kind}">${starIcon(t.kind, 14)}${KIND_LABEL[t.kind]}</p></div>${CLOSE}</header>
    <blockquote class="big-quote" id="sheet-title">“${esc(t.text)}”</blockquote>
    <p class="meta">${cameUp(t, now())}</p>
    <p class="hint later">${t.pillarId === "me" ? "Sorted. It's about you." : t.pillarId ? `Sorted into ${esc(pillarName(t.pillarId))}.` : "Not sorted yet. Tap Sort in the dock when you're ready."}</p>
    <button type="button" class="link" data-remove>Remove this star</button>`);
  const rm = sheet.querySelector("[data-remove]");
  rm.addEventListener("click", () => {
    if (rm.dataset.sure) { close(); store.removeThought(id); return toast("Removed."); }
    rm.dataset.sure = "1";
    rm.textContent = "Tap again to remove it for good";
  });
}

// A sheet rises from the bottom over a dimmed screen. Tapping outside, the close button or Escape puts it away.
function openSheet(html, tint) {
  closeSheet();
  const opener = document.activeElement;
  const back = document.createElement("div");
  back.className = "sheet-back";
  const sheet = document.createElement("section");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "sheet-title");
  if (tint) sheet.style.setProperty("--c", tint);
  sheet.innerHTML = html;
  document.body.append(back, sheet);
  requestAnimationFrame(() => { back.classList.add("in"); sheet.classList.add("in"); });
  // When the keyboard is up, sit the sheet just above it and let it scroll inside, rather than being pushed off the top.
  const vv = window.visualViewport;
  const above = () => {
    if (!vv) return;
    const covered = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    sheet.style.bottom = `${covered / zoom}px`;
    sheet.style.maxHeight = `${(vv.height - 8) / zoom}px`;
    sheet.classList.toggle("kb", covered > 80);
  };
  above();
  vv?.addEventListener("resize", above);
  vv?.addEventListener("scroll", above);
  sheet.unwatch = () => { vv?.removeEventListener("resize", above); vv?.removeEventListener("scroll", above); };
  const close = () => { closeSheet(); opener?.focus?.(); };
  back.addEventListener("click", close);
  sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
  (sheet.querySelector("[autofocus]") ?? sheet.querySelector("[data-close]"))?.focus();
  return { sheet, close };
}

const CLOSE = `<button type="button" class="x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;

function closeSheet() {
  document.querySelectorAll(".sheet").forEach((el) => el.unwatch?.());
  document.querySelectorAll(".sheet, .sheet-back").forEach((el) => el.remove());
}

/* ---------- The weekly look back, Record, and the week's one small thing ---------- */

const dotFor = (pid) => { const p = store.get().pillars.find((x) => x.id === pid); return p ? `<i style="background:${shade(p)}"></i>` : ""; };

// The sun's call and the intention's words sit over the sky, so they're placed once the sky is on screen.
function placeHome() {
  const sun = skyPoint("sun"), call = app.querySelector(".suncall");
  if (sun && call) Object.assign(call.style, { left: `${sun.x}px`, top: `${sun.y}px` });
  const words = app.querySelector("#intent"), low = skyPoint("below");
  if (words && low) words.style.top = `${low.y}px`;
}
addEventListener("resize", () => app.querySelector(".home") && placeHome());

function openLook() {
  closeSheet();
  if (sort.active()) sort.close();
  look.open({ support: openSupport, weekInFull: (from, to) => openWeek(from, to, store.get().intention), record: openRecord, done: render });
}

function openWeek(from, to, intention, view = "over") {
  const { sheet } = openSheet(weekHTML(store.get(), from, to, intention, view));
  sheet.classList.add("wide");
  // Overview and In depth swap in place; the close button keeps working through the sheet's own listener.
  sheet.addEventListener("click", (e) => {
    const b = e.target.closest(".wv-seg [data-v]");
    if (b) sheet.innerHTML = weekHTML(store.get(), from, to, intention, b.dataset.v);
  });
}

function openRecord() {
  const s = store.get();
  const { sheet, close } = openSheet(recordHTML(s));
  sheet.classList.add("wide");
  sheet.querySelectorAll("[data-week]").forEach((b) => b.addEventListener("click", () => { const w = s.weeks[+b.dataset.week]; close(); openWeek(w.from, w.to, w.intention, "deep"); }));
  sheet.querySelector("[data-support]").addEventListener("click", openSupport);
  sheet.querySelector("[data-notify]")?.addEventListener("click", () => { close(); openNotify(); });
}

// Always reachable: free, private lines, open day and night. (The word "crisis" is never on screen.)
function openSupport() {
  openSheet(`<header class="sh-head"><div><h2 id="sheet-title">Someone’s there, any time</h2></div>${CLOSE}</header>
    <p class="sup-s">Free and private. You can just say you’re having a hard time.</p>${look.LINES}
    <p class="sup-n">This app isn’t therapy. If you’re in danger right now, call 000.</p>`);
}

// This week's one small thing. "Did it" can be tapped every time it happens.
function openIntention() {
  const s = store.get(), it = s.intention, p = s.pillars.find((x) => x.id === it?.pillarId);
  if (!it) return;
  const said = () => it.did.length ? `Kept in What helped. Done ${times(it.did.length)} so far.` : "Not yet. There’s time.";
  const { sheet, close } = openSheet(`<header class="sh-head"><div><p class="eyebrow-i">${p ? `<i style="background:${shade(p)}"></i>${esc(p.name)} · ` : ""}this week</p><h2 id="sheet-title">${esc(it.text)}</h2><p data-said>${said()}</p></div>${CLOSE}</header>
    <div class="i-row"><button type="button" class="pill-gold" data-did>${it.did.length ? "Did it again" : "Did it"}</button><button type="button" class="ghost" data-close>Not today</button></div>`);
  sheet.querySelector("[data-did]").addEventListener("click", () => {
    store.didIntention();
    close();
    toast("Nice. That’s kept in What helped.");
  });
}

/* ---------- Notifications: a nudge when a timer is up, the evening drop, and their settings ----------
   FIRST VERSION, NOT FINAL (alex, 29 Oct 2026): built as first drafted; words and design to be revisited. */

const clock = (v) => { const [h, m] = v.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const notReady = () => notify.SERVICE ? "Notifications are off for now. You can turn them on any time at the bottom of Record." : "Notifications arrive in an update soon.";

// A small card near the bottom of the screen, over the sky: one question, a gold yes and a quiet no.
function offer({ title, text, extra = "", yes, no, onYes, onNo }) {
  document.querySelector(".offer")?.remove();
  const el = document.createElement("section");
  el.className = "offer";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-labelledby", "offer-title");
  el.innerHTML = `<h2 id="offer-title">${esc(title)}</h2><p>${esc(text)}</p>${extra}
    <button type="button" class="primary" data-yes>${esc(yes)}</button><button type="button" class="of-no" data-no>${esc(no)}</button>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const go = () => { el.classList.remove("in"); setTimeout(() => el.remove(), still() ? 0 : 300); };
  el.querySelector("[data-yes]").addEventListener("click", () => { onYes(el); go(); });
  el.querySelector("[data-no]").addEventListener("click", () => { onNo(); go(); });
  el.querySelector("[data-yes]").focus();
  return el;
}

function askTimer(minutes) {
  offer({
    title: `Want a quiet nudge when your ${notify.upWords(minutes)} up?`,
    text: "Your phone will ask if Intentionally can send notifications. We’ll only send the ones you turn on, and your thoughts never show on your lock screen.",
    yes: "Yes, nudge me", no: "Not now",
    onYes: async () => {
      const ok = await notify.enable();
      store.update((s) => { s.notify.asked = true; s.notify.timer = ok; });
      if (!ok) toast(notReady());
    },
    onNo: () => store.update((s) => { s.notify.asked = true; }),
  });
}

// Offered once, on an evening when a few thoughts have been caught.
function eveningMoment() {
  const s = store.get(), n = s.notify;
  return notify.supported() && !notify.blocked() && !n.eveningOffered && !n.evening && s.thoughts.length >= 3 && new Date(now()).getHours() >= 17;
}

function offerEvening() {
  const yes = (v) => `Yes, at ${clock(v || "21:30")}`;
  const el = offer({
    title: "Would an evening nudge help?",
    text: "Once a day, a quiet question before bed: anything on your mind? Skip it whenever you like.",
    extra: `<label class="of-time"><span>Time</span><input type="time" value="21:30" data-tp></label>`,
    yes: yes(), no: "No thanks",
    onYes: async (card) => {
      const v = card.querySelector("[data-tp]").value || "21:30";
      const ok = await notify.enable();
      store.update((s) => { s.notify.eveningOffered = true; if (ok) s.notify.evening = v; });
      toast(ok ? `Evening drop set for ${clock(v)}.` : notReady());
    },
    onNo: () => store.update((s) => { s.notify.eveningOffered = true; }),
  });
  const pick = el.querySelector("[data-tp]");
  pick.addEventListener("input", () => { el.querySelector("[data-yes]").textContent = yes(pick.value); });
}

function openNotify() {
  const n = store.get().notify, off = !notify.supported() || notify.blocked() ? "disabled" : "";
  const { sheet } = openSheet(`<header class="sh-head"><div><h2 id="sheet-title">Notifications</h2></div>${CLOSE}</header>
    ${!notify.supported() ? `<p class="nt-why">Add Intentionally to your Home Screen first, then open it from there. Your phone only lets Home Screen apps send notifications.</p>`
      : notify.blocked() ? `<p class="nt-why">Notifications are turned off for Intentionally in your phone’s Settings. Turn them on there, then come back.</p>` : ""}
    <div class="nt-card"><label class="nt-row"><span>Timer nudges</span><input type="checkbox" class="sw" role="switch" data-n="timer" ${n.timer ? "checked" : ""} ${off}></label>
      <p class="nt-note">When a timer you gave a length is up, and a check if one has run for 3 hours.</p></div>
    <div class="nt-card"><label class="nt-row"><span>Evening drop</span><input type="checkbox" class="sw" role="switch" data-n="evening" ${n.evening ? "checked" : ""} ${off}></label>
      <label class="nt-row nt-sub"><span>Time</span><input type="time" class="nt-time" data-nt="evening" value="${n.evening ?? "21:30"}"></label></div>
    <div class="nt-card"><p class="nt-row">Quiet hours</p>
      <label class="nt-row nt-sub"><span>From</span><input type="time" class="nt-time" data-nt="q0" value="${n.quiet[0]}"></label>
      <label class="nt-row nt-sub"><span>Until</span><input type="time" class="nt-time" data-nt="q1" value="${n.quiet[1]}"></label></div>
    <p class="nt-foot">Your words never appear on your lock screen. No counts on the app icon, and we’ll never tell you you’ve missed anything.</p>
    <p class="nt-foot">More will arrive here as the rest of the app opens up.</p>`);
  sheet.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("change", async () => {
    const on = b.checked, k = b.dataset.n;
    if (on && !await notify.enable()) { b.checked = false; return toast(notReady()); }
    store.update((s) => {
      s.notify.asked = true;
      if (k === "timer") s.notify.timer = on;
      else { s.notify.eveningOffered = true; s.notify.evening = on ? sheet.querySelector("[data-nt=evening]").value || "21:30" : null; }
    });
  }));
  sheet.querySelectorAll("[data-nt]").forEach((el) => el.addEventListener("change", () => {
    if (!el.value) return;
    store.update((s) => {
      if (el.dataset.nt === "evening") { if (s.notify.evening) s.notify.evening = el.value; }
      else s.notify.quiet[el.dataset.nt === "q0" ? 0 : 1] = el.value;
    });
  }));
}

/* ---------- Test mode: example data and time travel, for checking weeks and seasons quickly ---------- */

function renderTestPanel() {
  document.querySelector(".testpanel")?.remove();
  const s = store.get(), d = new Date(now());
  const panel = document.createElement("aside");
  panel.className = "testpanel";
  panel.setAttribute("aria-label", "Test mode");
  panel.innerHTML = `<b>Test mode</b><span>Pretend date: ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${s.test.offsetDays ? ` (+${s.test.offsetDays} days)` : ""}</span>
    <div><button data-t="example">Example sky</button><button data-t="day">+1 day</button><button data-t="week">+1 week</button>
    <button data-t="today">Today</button><button data-t="look">Look back now</button><button data-t="labels" aria-pressed="${s.test.labels !== false}">Thought words: ${s.test.labels !== false ? "on" : "off"}</button><button data-t="reset">Reset all</button><button data-t="close">Close</button></div>`;
  document.body.append(panel);
  panel.addEventListener("click", (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    if (t === "close") { testMode = false; return panel.remove(); }
    if (t === "reset") { store.reset(); setOffsetDays(0); return; }
    if (t === "example") return loadExample();
    if (t === "look") return openLook();
    // Thought words are on unless turned off here.
    if (t === "labels") return store.update((x) => { x.test.labels = x.test.labels === false; });
    const days = t === "today" ? 0 : s.test.offsetDays + (t === "day" ? 1 : 7);
    setOffsetDays(days);
    store.update((x) => { x.test.offsetDays = days; });
  });
}

function loadExample() {
  const t0 = now();
  store.update((s) => {
    s.setup = true;
    if (!s.pillars.length) s.pillars = ["Friends", "Health", "Career", "Creativity"].map((name, i) => ({ id: store.uid(), name, tint: TINTS[i], focus: i === 1 || i === 2 }));
    // Until focus pillars can be chosen, the example sky picks the second and third.
    if (!s.pillars.some((p) => p.focus)) s.pillars.forEach((p, i) => { p.focus = i === 1 || i === 2; });
    const [a, b, c, d] = s.pillars;
    s.sessions.push(
      { pillarId: a.id, start: t0 - 2 * DAY, end: t0 - 2 * DAY + 70 * 60000 },
      { pillarId: b.id, start: t0 - DAY, end: t0 - DAY + 25 * 60000 },
      { pillarId: c.id, start: t0 - 3 * 3600000, end: t0 - 3 * 3600000 + 40 * 60000 },
    );
    if (d) s.sessions.push({ pillarId: d.id, start: t0 - 5 * 3600000, end: t0 - 5 * 3600000 + 15 * 60000 });
    const ex = [["I'm not good enough at work", "worry", 4], ["Call Nan this weekend", "want", 1], ["I handled today well", "kind", 1],
      ["I never reply fast enough", "worry", 2], ["Start running again", "want", 1], ["Jess made me laugh", "kind", 1], ["What if I can't keep this up", "worry", 1]];
    // Two of them are already sorted, so they circle their planets.
    const sorted = { "I'm not good enough at work": c.id, "Start running again": b.id };
    for (const [text, kind, count] of ex) s.thoughts.push({ id: store.uid(), text, kind, pillarId: sorted[text] ?? null, ...(sorted[text] && { sortedAt: t0 }), status: "active", count, ...placeStar(s.thoughts), createdAt: t0, helped: [] });
  });
  toast("Example sky loaded.");
}

/* ---------- Small shared bits ---------- */

let toastTimer = 0;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("out");
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("out");
    toastTimer = setTimeout(() => { el.hidden = true; el.classList.remove("out"); }, 250);
  }, 2600);
}

store.onChange(render);
render();

// Offline support. When a newer version has been published, it is picked up the next time the app opens,
// and the screen reloads once to show it.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update(); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (had && !reloaded && !document.querySelector(".sheet")) { reloaded = true; location.reload(); }
  });
}
