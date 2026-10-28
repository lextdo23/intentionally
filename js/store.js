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
  sessions: [],     // finished timers: { pillarId, start, end }
  running: null,    // the one timer allowed at a time: { pillarId, start }
  thoughts: [],     // { id, text, kind: "kind"|"worry"|"want", pillarId, status: "active"|"settled"|"let-go",
                    //   count, x, y, createdAt, helped: [{ text, at }] }
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
export function toggleTimer(pillarId) {
  update((s) => {
    const was = s.running;
    if (was) s.sessions.push({ pillarId: was.pillarId, start: was.start, end: now() });
    s.running = was && was.pillarId === pillarId ? null : { pillarId, start: now() };
  });
}

// Time given to a pillar since `from`, including a timer that is still running.
export function timeSince(pillarId, from) {
  let ms = 0;
  for (const x of state.sessions) if (x.pillarId === pillarId && x.end > from) ms += x.end - Math.max(x.start, from);
  const r = state.running;
  if (r && r.pillarId === pillarId) ms += now() - Math.max(r.start, from);
  return ms;
}
