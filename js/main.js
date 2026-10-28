import * as store from "./store.js";
import { now, weekStart, greeting, formatTotal, formatRunning, setOffsetDays, DAY } from "./clock.js";
import { renderSky, fitTags, startSpin, planet, sparkle, placeStar, esc, POINTS } from "./sky.js";
import { guessKind, findSimilar, cameUp, KIND_LABEL } from "./thoughts.js";
import { TINTS, SUGGESTED, ACTIVITIES, MIN_PILLARS, MAX_PILLARS, MAX_NAME } from "./pillars.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
let testMode = params.has("test");
setOffsetDays(store.get().test.offsetDays);

// Keep the approved proportions: everything was designed on a 300-wide screen.
let zoom = 1;
const fit = () => {
  zoom = Math.min(Math.max(innerWidth / 300, 1), 1.4);
  document.documentElement.style.setProperty("--z", zoom.toFixed(3));
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
  unzoom(app.querySelector("#own-name"), { font: 16, padY: 0, padX: 16, radius: 12, height: 44 });
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

// Which timer the screen showed last time, so the running view only animates in when a timer has just started.
let shownRunning = null;
// A thought caught a moment ago, so its star floats up the next time the sky is drawn.
let arriving = null;
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function renderHome(s) {
  const active = s.thoughts.filter((t) => t.status === "active").length;
  const sub = active ? `${active} star${active === 1 ? "" : "s"} in your sky` : "Your sky is clear";
  const run = s.running && s.pillars.find((p) => p.id === s.running.pillarId);
  const was = shownRunning, starting = run && was !== run.id, ending = !run && was;
  shownRunning = run?.id ?? null;
  app.innerHTML = `<section class="home ${run && !starting || ending ? "timing" : ""}">
    <div class="sky-wrap">${renderSky({ pillars: s.pillars, thoughts: s.thoughts, runningId: run?.id, arriving: still() ? null : arriving, labels: s.test.labels })}</div>
    <header class="greet"><h1 id="greet">${greeting()}${s.name ? `, <span>${esc(s.name)}</span>` : ""}</h1><p>${sub}</p></header>
    ${run ? `<div class="running ${starting ? "enter" : ""}" style="--c:${run.tint}">
      <p class="rl"><i aria-hidden="true"></i>${esc(run.name)}${s.running.activity ? ` · ${esc(s.running.activity)}` : ""}</p>
      <p class="big" data-run aria-label="Time so far"></p>
      <button type="button" class="stop" id="stop">Stop</button></div>` : ""}
    <nav class="dock" aria-label="Your pillars and actions">
      <div class="pillars">${s.pillars.map((p, i) => `
        <button type="button" class="pl ${run?.id === p.id ? "run" : ""}" data-timer="${p.id}" style="--c:${p.tint}"
          aria-label="${esc(p.name)}: ${run?.id === p.id ? "timer running, tap to stop" : "tap to start a timer"}">
          <svg viewBox="-15 -15 30 30" aria-hidden="true">${planet("dock", i, 8, p.tint)}</svg>
          <b>${esc(p.name)}</b><small data-time="${p.id}"></small></button>`).join("")}
      </div>
      <div class="actions">
        <button type="button" class="round" data-soon="Sort" aria-label="Sort">${ICON.sort}</button>
        <button type="button" class="catch" id="catch" aria-label="New thought"><span class="dot">${ICON.star}</span><span class="lab">New thought</span></button>
        <button type="button" class="round" data-soon="Record" aria-label="Record">${ICON.record}</button>
      </div>
    </nav></section>`;
  fitTags(app);
  startSpin(app);
  tick();
  // Let the sky dim (or brighten) smoothly rather than snapping.
  if (starting || ending) {
    const home = app.querySelector(".home");
    void home.offsetWidth;
    home.classList.toggle("timing", !!starting);
  }
  app.querySelectorAll("[data-timer]").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.timer;
    if (store.get().running?.pillarId === id) stop();
    else start(id);
  }));
  app.querySelector("#stop")?.addEventListener("click", stop);
  arriving = null;
  // Planets in the sky open their card (ideas, adding time by hand); stars open the thought they hold.
  const tappable = (sel, key, open) => app.querySelectorAll(sel).forEach((el) => {
    el.addEventListener("click", () => open(el.dataset[key]));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el.dataset[key]); } });
  });
  tappable("[data-planet]", "planet", openPillar);
  tappable("[data-star]", "star", openStar);
  app.querySelector("#catch").addEventListener("click", openCatch);
  app.querySelectorAll("[data-soon]").forEach((b) => b.addEventListener("click", () => toast(`${b.dataset.soon} arrives in an upcoming step.`)));
  let taps = 0;
  app.querySelector("#greet").addEventListener("click", () => { if (++taps >= 5) { taps = 0; testMode = true; renderTestPanel(); } });
}

function start(pillarId, activity) {
  const before = store.get().running;
  const ran = store.startTimer(pillarId, activity);
  if (before && ran >= 60000) toast(`Logged ${formatTotal(ran)} to ${pillarName(before.pillarId)}.`);
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
      <svg viewBox="-15 -15 30 30" aria-hidden="true">${planet("sheet", i, 11, p.tint)}</svg>
      <div><h2 id="sheet-title">${esc(p.name)}</h2><p>This week <span data-week="${id}"></span></p></div>
      ${CLOSE}
    </header>
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
  sheet.querySelector("[data-go]").addEventListener("click", () => { close(); running ? stop() : start(id); });
  sheet.querySelectorAll("[data-idea]").forEach((b) => b.addEventListener("click", () => { close(); start(id, b.dataset.idea); }));
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
      </div></form>`;
    const form = card.querySelector("form"), box = card.querySelector("textarea"), go = card.querySelector(".send"), pick = card.querySelector(".kindpick");
    unzoom(box, { font: 19, padY: 0, padX: 0, radius: 0 });
    // One quiet line: our guess. Tapped, it opens into the three choices; choosing closes it again.
    const showGuess = () => {
      pick.innerHTML = box.value.trim() ? `<button type="button" class="guess" aria-label="Kind: ${KIND_LABEL[kind]}. Tap to change.">${starIcon(kind, 13)}${KIND_LABEL[kind]}<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg></button>` : "";
    };
    pick.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.classList.contains("guess")) {
        form.classList.add("choosing");
        pick.innerHTML = ["kind", "worry", "want"].map((k) => `<button type="button" class="opt" data-kind="${k}" aria-pressed="${k === kind}">${starIcon(k, 13)}${KIND_LABEL[k]}</button>`).join("");
        return pick.querySelector("[aria-pressed=true]").focus();
      }
      kind = b.dataset.kind; chosen = true;
      form.classList.remove("choosing");
      showGuess();
      box.focus();
    });
    box.value = draft;
    const changed = () => {
      go.disabled = !box.value.trim();
      if (!chosen && box.value.trim()) kind = guessKind(box.value);
      if (!pick.querySelector(".opt")) showGuess();
    };
    changed();
    box.addEventListener("input", changed);
    box.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = box.value.trim().replace(/\s+/g, " ");
      if (!text) return;
      const echo = findSimilar(text, store.get().thoughts);
      if (echo) return familiar(echo, text);
      draft = "";
      closeSheet();
      catchIt(text, kind);
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
    card.querySelector("[data-diff]").addEventListener("click", () => { draft = ""; closeSheet(); catchIt(text, kind); });
  };

  write();
}

function catchIt(text, kind) {
  arriving = store.uid();
  store.addThought(text, kind, placeStar(store.get().thoughts.filter((x) => x.status === "active")), arriving);
  toast(kind === "worry" ? "It's in your sky now. You don't have to hold it in your head."
    : kind === "want" ? "It's in your sky. Something to grow towards." : "Kept. That one's worth remembering.");
}

/* ---------- A star: the thought it holds ---------- */

function openStar(id) {
  const t = store.get().thoughts.find((x) => x.id === id);
  if (!t) return;
  const { sheet, close } = openSheet(`
    <header class="sh-head star-head"><div><p class="eyebrow k-${t.kind}">${starIcon(t.kind, 14)}${KIND_LABEL[t.kind]}</p></div>${CLOSE}</header>
    <blockquote class="big-quote" id="sheet-title">“${esc(t.text)}”</blockquote>
    <p class="meta">${cameUp(t, now())}</p>
    <p class="hint later">You'll sort it and decide what to do with it at your weekly reflection.</p>
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

/* ---------- Test mode: example data and time travel, for checking weeks and seasons quickly ---------- */

function renderTestPanel() {
  document.querySelector(".testpanel")?.remove();
  const s = store.get(), d = new Date(now());
  const panel = document.createElement("aside");
  panel.className = "testpanel";
  panel.setAttribute("aria-label", "Test mode");
  panel.innerHTML = `<b>Test mode</b><span>Pretend date: ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${s.test.offsetDays ? ` (+${s.test.offsetDays} days)` : ""}</span>
    <div><button data-t="example">Example sky</button><button data-t="day">+1 day</button><button data-t="week">+1 week</button>
    <button data-t="today">Today</button><button data-t="labels" aria-pressed="${!!s.test.labels}">Thought words: ${s.test.labels ? "on" : "off"}</button><button data-t="reset">Reset all</button><button data-t="close">Close</button></div>`;
  document.body.append(panel);
  panel.addEventListener("click", (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    if (t === "close") { testMode = false; return panel.remove(); }
    if (t === "reset") { store.reset(); setOffsetDays(0); return; }
    if (t === "example") return loadExample();
    if (t === "labels") return store.update((x) => { x.test.labels = !x.test.labels; });
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
