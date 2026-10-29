// The week, read back: when the look back is due, and what the week held, in numbers and in plain sentences.
import { now, DAY } from "./clock.js";

const MIN = 60000;

// Since the last look back (or since the very start).
export const lastLook = (s) => s.weeks.at(-1)?.at ?? s.createdAt;

// The look back is due from the start of the chosen day. It waits for you (a late return just folds the weeks
// together), and the very first one waits until there are at least three days to look back on.
export function due(s, t = now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - s.lookDay + 7) % 7));
  const since = d.getTime();
  if (since <= lastLook(s)) return null;
  if (!s.weeks.length && since - s.createdAt < 3 * DAY) return null;
  return { since, days: Math.floor((t - since) / DAY) };
}

// "40 min", "2 h", "2 h 10 min".
export function long(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
export const times = (n) => n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
const WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const count = (n) => WORD[n] ?? String(n);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayName = (t) => DAYS[new Date(t).getDay()];
export const range = (from, to) => {
  const f = (t) => new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return `${f(from)} to ${f(to)}`;
};

// Everything the week held, per pillar: time, how often, which activities, and the thoughts about it.
export function stats(s, from, to = now()) {
  const per = Object.fromEntries(s.pillars.map((p) => [p.id, { p, ms: 0, n: 0, acts: {}, thoughts: [] }]));
  let n = 0;
  const sessions = [...s.sessions, ...(s.running ? [{ ...s.running, end: now() }] : [])];
  for (const x of sessions) {
    if (x.end <= from || x.start >= to || !per[x.pillarId]) continue;
    const ms = Math.min(x.end, to) - Math.max(x.start, from), o = per[x.pillarId];
    o.ms += ms; o.n++; n++;
    const label = x.activity || `Time on ${o.p.name}`, a = (o.acts[label] ??= { label, n: 0, ms: 0, last: 0 });
    a.n++; a.ms += ms; a.last = Math.max(a.last, x.end);
  }
  // A thought belongs to the week if it was caught or came up during it.
  const touched = s.thoughts.filter((t) => (t.seen ?? [t.createdAt]).some((x) => x >= from && x < to));
  for (const t of touched) per[t.pillarId]?.thoughts.push(t);
  const rows = Object.values(per);
  const total = rows.reduce((a, o) => a + o.ms, 0);
  return { rows, n, total, touched, from, to };
}

// The week in a few plain sentences, for Notice. One at a time, with numbers only where they mean something.
export function sentences(s, st, intention) {
  const out = [];
  const byTime = [...st.rows].sort((a, b) => b.ms - a.ms), top = byTime[0];
  const byMind = [...st.rows].sort((a, b) => b.thoughts.length - a.thoughts.length), mind = byMind[0];
  if (!st.n && !st.touched.length) return { quiet: true, lines: ["A quiet week.", "You got through it. That counts.", "Nothing to catch up on. Next week starts fresh."] };
  if (st.n) {
    out.push(`You made time for yourself ${st.n === 1 ? "once" : st.n === 2 ? "twice" : `${count(st.n)} times`} this week.`);
    const acts = Object.values(top.acts).sort((a, b) => b.n - a.n || b.ms - a.ms);
    const what = acts.slice(0, 2).map((a) => a.label.startsWith("Time on") ? `${long(a.ms)} in all` : `${a.label.toLowerCase()} ${times(a.n)}`).join(", and ");
    if (top.ms) out.push(`Mostly ${top.p.name}: ${what}.`);
  } else out.push("No timers this week, and that’s okay.");
  if (mind?.thoughts.length >= 2) out.push(mind === top ? `${mind.p.name} was on your mind most too.` : `${mind.p.name} came up most in your thoughts.`);
  // One small win, in gold, if there was one.
  let win = null;
  if (intention?.did?.length) win = `And you did your one small thing${intention.did.length > 1 ? `, ${times(intention.did.length)}` : ""}: ${intention.text.charAt(0).toLowerCase() + intention.text.slice(1)}.`;
  else {
    const kind = st.touched.filter((t) => t.kind === "kind" && !t.heavy).at(-1);
    if (kind) win = `And on ${dayName(kind.createdAt)}, you noticed something good.`;
  }
  return { quiet: false, lines: out, win };
}

// How heavy each week felt (0 light to 3 very heavy), for the last few look backs that asked.
export const feelings = (s, n = 6) => s.weeks.filter((w) => w.feel != null).slice(-n).map((w) => ({ at: w.at, feel: w.feel }));

// One plain pattern, once there are enough weeks: an activity that was more common in the lighter weeks.
export function noticed(s) {
  const ws = s.weeks.filter((w) => w.feel != null);
  if (ws.length < 4) return null;
  const light = ws.filter((w) => w.feel <= 1), heavy = ws.filter((w) => w.feel >= 2);
  if (!light.length || !heavy.length) return null;
  const avg = (list, label) => list.reduce((a, w) => a + (w.acts?.[label] ?? 0), 0) / list.length;
  const labels = new Set(ws.flatMap((w) => Object.keys(w.acts ?? {})).filter((l) => !l.startsWith("Time on")));
  let best = null, gap = .9;
  for (const l of labels) { const g = avg(light, l) - avg(heavy, l); if (g > gap) { best = l; gap = g; } }
  return best ? { label: best, text: `Your lighter weeks had more ${best.toLowerCase()}.`, series: ws.slice(-6).map((w) => w.acts?.[best] ?? 0) } : null;
}
