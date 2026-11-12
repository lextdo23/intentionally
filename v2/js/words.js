// Word lists for the check-ins. Small sets first (research: Apple's State of Mind and How We Feel
// show a handful that fit the mood, with more one tap away).

export const SLEEP_TAGS = ["Took ages to fall asleep", "Mind wouldn't switch off", "Woke in the night", "Woke too early", "Stayed up later than I meant to", "Something woke me"];
export const SLEEP_MORE = ["Bad dreams", "Napped", "Unwell or sore", "On my period", "Caffeine late", "Had a few drinks", "Sleep aid", "Late shift"];
export const RESTED = ["Not at all", "A little", "Okay", "Well", "Very well"];

// Feelings, grouped by the mood band they usually go with (0 hard … 4 great).
export const FEELINGS = [
  ["overwhelmed", 0], ["numb", 0], ["sad", 0], ["anxious", 0], ["lonely", 0], ["angry", 0], ["exhausted", 0], ["hurt", 0],
  ["stressed", 1], ["worried", 1], ["flat", 1], ["tired", 1], ["frustrated", 1], ["irritable", 1], ["disappointed", 1], ["insecure", 1],
  ["calm", 2], ["bored", 2], ["distracted", 2], ["restless", 2], ["meh", 2], ["unsure", 2], ["busy", 2], ["okay", 2],
  ["content", 3], ["relaxed", 3], ["hopeful", 3], ["grateful", 3], ["peaceful", 3], ["focused", 3], ["relieved", 3], ["cared for", 3],
  ["happy", 4], ["proud", 4], ["excited", 4], ["connected", 4], ["energised", 4], ["loved", 4], ["inspired", 4], ["joyful", 4],
];
// Mood 0-6 -> band 0-4. Awful and Rough share the hard band.
export const band = (m) => (m <= 1 ? 0 : m - 2);
// Okay days often feel tired too, so it leads the mid list.
const LEAD = { 2: ["calm", "bored", "distracted", "restless", "meh", "tired"] };
export function firstSix(b) { return LEAD[b] || FEELINGS.filter((w) => w[1] === b).slice(0, 6).map((w) => w[0]); }
export function nearestOrder(b) {
  return FEELINGS.slice().sort((x, y) => Math.abs(x[1] - b) - Math.abs(y[1] - b)).map((w) => w[0]);
}

// The six most recently picked tags show first; everything else waits under "Show more". Nothing is ever deleted.
export function rankRecent(base, last) {
  const ranked = base.slice().sort((a, b) => ((last[b] || 0) - (last[a] || 0)) || base.indexOf(a) - base.indexOf(b));
  const main = ranked.slice(0, 6).sort((a, b) => base.indexOf(a) - base.indexOf(b));
  return { main, more: ranked.filter((x) => !main.includes(x)) };
}
