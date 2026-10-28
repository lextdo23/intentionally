// Everything the app knows lives on this phone, in localStorage, as one small JSON record.
// Nothing is sent anywhere. Deleting the app (or clearing site data) removes it all.
import { now } from "./clock.js";

const KEY = "intentionally";
const SCHEMA = 1;

const fresh = () => ({
  schema: SCHEMA,
  createdAt: now(),
  name: "",
  pillars: [],      // { id, name, tint, focus }
  sessions: [],     // finished timers: { pillarId, start, end, activity?, manual? }
  running: null,    // the one timer allowed at a time: { pillarId, start, activity? }
  thoughts: [],     // { id, text, kind: "kind"|"worry"|"want", pillarId, status: "active"|"settled"|"let-go",
                    //   count, seen: [times it came up], x, y, createdAt, helped: [{ text, at }] }
  season: null,     // { name, startedAt } once seasons have opened up
  unlocked: {},     // features revealed so far, e.g. { seasons: 1730000000000 }
  test: { offsetDays: 0 },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const saved = JSON.parse(raw);
    return saved.schema === SCHEMA ? { ...fresh(), ...saved } : fresh();
  } catch {
    return fresh();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode or full: keep going in memory */ }
}

export const get = () => state;

export function update(change) {
  change(state);
  save();
  listeners.forEach((fn) => fn(state));
}

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function reset() {
  state = fresh();
  save();
  listeners.forEach((fn) => fn(state));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Timers: starting one stops whichever was running, so only one ever runs.
// Anything under a minute is treated as a mis-tap and not kept.
const MIN_SESSION = 60000;

function finish(s) {
  const r = s.running;
  if (!r) return 0;
  const ms = now() - r.start;
  if (ms >= MIN_SESSION) s.sessions.push({ pillarId: r.pillarId, start: r.start, end: now(), ...(r.activity && { activity: r.activity }) });
  s.running = null;
  return ms;
}

// Returns how long the stopped timer ran (0 if none), so the screen can say what was logged.
export function startTimer(pillarId, activity) {
  let stopped = 0;
  update((s) => {
    stopped = finish(s);
    s.running = { pillarId, start: now(), ...(activity && { activity }) };
  });
  return stopped;
}

export function stopTimer() {
  let stopped = 0;
  update((s) => { stopped = finish(s); });
  return stopped;
}

// For time given without a timer running: ends now (or `daysAgo` days back) and lasts `minutes`.
export function addTime(pillarId, minutes, daysAgo = 0) {
  update((s) => {
    const end = now() - daysAgo * 86400000;
    s.sessions.push({ pillarId, start: end - minutes * 60000, end, manual: true });
  });
}

// Thoughts: each one caught becomes a star. A thought that comes up again joins its star, which grows.
export function addThought(text, kind, spot, id = uid()) {
  const t = { id, text, kind, pillarId: null, status: "active", count: 1, seen: [now()], ...spot, createdAt: now(), helped: [] };
  update((s) => { s.thoughts.push(t); });
  return t;
}

export function thoughtCameBack(id) {
  update((s) => {
    const t = s.thoughts.find((x) => x.id === id);
    t.count = (t.count || 1) + 1;
    (t.seen ??= []).push(now());
    t.status = "active";
  });
}

export function removeThought(id) {
  update((s) => { s.thoughts = s.thoughts.filter((t) => t.id !== id); });
}

// Time given to a pillar since `from`, including a timer that is still running.
export function timeSince(pillarId, from) {
  let ms = 0;
  for (const x of state.sessions) if (x.pillarId === pillarId && x.end > from) ms += x.end - Math.max(x.start, from);
  const r = state.running;
  if (r && r.pillarId === pillarId) ms += now() - Math.max(r.start, from);
  return ms;
}
