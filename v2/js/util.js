// Small shared helpers: building elements, dates, mood words and colours.
import { now } from "./clock.js";

// h("div.card", { onclick }, child, "text") -> element. Strings become text, never HTML.
export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split(".");
  const el = name === "svg" || SVG_TAGS.has(name) ? document.createElementNS("http://www.w3.org/2000/svg", name) : document.createElement(name || "div");
  if (cls.length) el.setAttribute("class", cls.join(" "));
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const SVG_TAGS = new Set(["path", "circle", "rect", "line", "g", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "text"]);

// Mood: 0 Awful … 6 Great. Colours run blue (hard) through warm sand (okay) to green (great).
export const MOODS = ["Awful", "Rough", "Low", "Okay", "Good", "Really good", "Great"];
export const MOOD_COL = ["#4a4fa8", "#6a6aa6", "#8e87a0", "#bdae8e", "#a3b384", "#7ab57a", "#56b56c"];
export const moodWord = (m) => MOODS[m].toLowerCase();
export const isGood = (m) => m >= 4;

// A day starts at 4am, so a check-in at 1am still counts for the day before.
export function dayKey(t = now()) {
  const d = new Date(t - 4 * 3600e3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function keyDate(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); }
export function addDays(k, n) { const d = keyDate(k); d.setDate(d.getDate() + n); return dayKey(d.getTime() + 4 * 3600e3); }
export const DAY_LETTER = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dayTitle(k) {
  const d = keyDate(k), today = dayKey();
  if (k === today) return "Today";
  if (k === addDays(today, -1)) return "Yesterday";
  return `${DAY_NAME[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

// Minutes after midnight -> "11:15 pm".
export function clock12(m) {
  m = ((m % 1440) + 1440) % 1440;
  let hh = Math.floor(m / 60); const mm = m % 60, ap = hh < 12 ? "am" : "pm";
  hh = hh % 12 || 12;
  return `${hh}:${String(mm).padStart(2, "0")} ${ap}`;
}
// Sleep length is always written in words: "7 hours 30 minutes", "6 hours".
export function hoursWords(mins) {
  const hh = Math.floor(mins / 60), mm = Math.round(mins % 60);
  return `${hh} ${hh === 1 ? "hour" : "hours"}${mm ? ` ${mm} minutes` : ""}`;
}
export const sleepMins = (s) => (s.wake - s.bed + 1440) % 1440;

export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Most-picked value (ties go to the higher mood).
export function mostPicked(arr) {
  const c = {}; arr.forEach((m) => (c[m] = (c[m] || 0) + 1));
  const ks = Object.keys(c); if (!ks.length) return null;
  return +ks.sort((a, b) => c[b] - c[a] || b - a)[0];
}
export const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// Smooth line through points [[x,y],…].
export function smoothPath(p) {
  let s = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    s += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}, ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return s;
}
export const LIFELINE = () => h("a.lifeline", { href: "tel:131114" }, "Need to talk to someone? Lifeline 13 11 14");
