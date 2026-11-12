// Test mode: two months of made-up days, so Your days has something to show.
import { addDays, dayKey } from "./util.js";
import { FEELINGS, band, SLEEP_TAGS, SLEEP_MORE } from "./words.js";

export const SAMPLE_PILLARS = [["Friends", 1.1], ["Move", 0.7], ["Play and create", 0.5], ["Rest", 0.1], ["Work and study", -0.4]];

export function makeSample(n = 60) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const days = {}, today = dayKey();
  for (let i = n; i >= 1; i--) {
    const k = addDays(today, -i);
    if (rnd() < 0.08) continue;                                      // a few days not noted
    const hrs = Math.max(5, Math.min(10, 7.2 + (rnd() - 0.5) * 3.4));
    const mins = Math.round(hrs * 12) * 5;
    const bed = Math.round((22 * 60 + 30 + (rnd() - 0.3) * 120) / 5) * 5;
    const wake = (bed + mins) % 1440;
    let rested = Math.max(0, Math.min(4, Math.round((hrs - 5) * 1.0 + (rnd() - 0.5) * 1.6)));
    if (hrs > 9.4) rested = Math.min(rested, 1);
    const tags = [];
    if (rested <= 1) tags.push(SLEEP_TAGS[Math.floor(rnd() * 6)]);
    if (rnd() < 0.08) tags.push(SLEEP_MORE[Math.floor(rnd() * 8)]);
    const rest = rnd() < 0.12;
    const p = Math.floor(rnd() * 5), pil = rest ? [] : [SAMPLE_PILLARS[p][0]];
    if (!rest && rnd() < 0.35) { let q; do { q = Math.floor(rnd() * 5); } while (q === p); pil.push(SAMPLE_PILLARS[q][0]); }
    const lift = rest ? 0.3 : SAMPLE_PILLARS[p][1];
    const late = bed % 1440 > 23 * 60 + 30 || bed % 1440 < 4 * 60;
    const mood = Math.max(0, Math.min(6, Math.round(1.6 + rested * 0.6 + lift * 0.9 - (late ? 0.5 : 0) + (rnd() - 0.5) * 2)));
    const b = band(mood), pool = FEELINGS.filter((w) => Math.abs(w[1] - b) <= (rnd() < 0.3 ? 1 : 0));
    const feel = [...new Set([0, 1, 2].slice(0, 1 + Math.floor(rnd() * 3)).map(() => pool[Math.floor(rnd() * pool.length)][0]))];
    days[k] = { sleep: { bed: bed % 1440, wake, rested, tags }, mood, feel, pil, rest };
  }
  return days;
}
