// Everything lives on this phone, in localStorage under "daydeck". Nothing is sent anywhere.
const KEY = "daydeck";
export const SCHEMA = 1;
const fresh = () => ({
  v: SCHEMA, started: null,
  days: {},                         // "2026-11-12": { sleep: {bed, wake, rested, tags}, mood, feel: [], pil: [], rest }
  sleepTags: { last: {}, own: [] }, // when each tag was last picked (day number), and the person's own words
  feel: { last: {}, own: [] },      // last[band][word] = day number
  order: ["A", "B", "C", "D"], hidden: {}, notes: {}, test: { offset: 0 },
});
let state;
export function load() {
  try { state = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { state = fresh(); }
  state = Object.assign(fresh(), state);
  return state;
}
export function get() { return state || load(); }
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ } }
export function reset() { state = fresh(); save(); return state; }
export function day(k) { const s = get(); return (s.days[k] = s.days[k] || {}); }
