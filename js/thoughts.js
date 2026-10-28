// Reading a thought's words, all on the phone: a guess at its kind, and whether it echoes one already in the sky.
// Both are only suggestions. The person can change the kind with one tap, and says yes or no to a match.

const KINDS = ["kind", "worry", "want"];
export const KIND_LABEL = { kind: "Kind", worry: "A worry", want: "A want" };

const CUES = {
  worry: ["not good enough", "never", "cant", "cannot", "afraid", "scared", "worried", "worry", "what if", "fail", "behind",
    "anxious", "stressed", "hate", "too much", "should have", "nobody", "no one", "alone", "lonely", "tired", "overwhelmed",
    "wont", "dont", "bad", "wrong", "guilty", "ashamed", "lost", "stuck", "useless", "annoying", "mess", "messed up", "ruin"],
  want: ["i want", "want to", "i wish", "wish i", "id love", "would love", "would like", "hope", "one day", "someday",
    "plan to", "going to", "goal", "dream"],
  kind: ["proud", "grateful", "thankful", "good day", "happy", "enjoyed", "did well", "handled", "glad", "nice", "laugh",
    "calm", "love", "lucky", "better", "well done", "made it", "beautiful", "fun"],
};
// A thought that opens with a doing word ("Call Nan", "Start running") reads as something wanted.
const DOING = ["start", "call", "go", "finish", "learn", "try", "make", "get", "visit", "buy", "book", "plan", "save",
  "read", "write", "see", "message", "ask", "join", "find", "fix", "clean", "cook", "run", "walk", "travel", "move"];

const flat = (text) => " " + text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";

export function guessKind(text) {
  const t = flat(text);
  const score = Object.fromEntries(KINDS.map((k) => [k, CUES[k].filter((c) => t.includes(` ${c} `)).length]));
  if (DOING.includes(t.trim().split(" ")[0])) score.want += 1;
  const best = KINDS.reduce((a, b) => (score[b] > score[a] ? b : a), "worry");
  // With nothing to go on, "kind" is the gentlest guess; it's one tap to change.
  return score[best] ? best : "kind";
}

// Small words that don't change what a thought is about. "not", "never" and the like stay, because they do.
const FILLER = new Set(("i im ive id ill me my mine myself am is are was were be been being a an the to of and or but so " +
  "that this it its just really very feel feeling felt like think thinking thought always still too also kind of sort " +
  "about at in on for with as do does did have has had get got will would can could should maybe like").split(" "));
const NEG = ["not", "never", "no"];
const STEM = (w) => w.replace(/(ing|ed|es|s)$/, "");

function words(text) {
  const t = flat(text).replace(/ cant /g, " not can ").replace(/ dont /g, " not do ").replace(/ wont /g, " not will ")
    .replace(/ isnt /g, " not ").replace(/ arent /g, " not ").replace(/ nt /g, " not ");
  return new Set(t.trim().split(" ").filter((w) => w && !FILLER.has(w)).map(STEM));
}

// The closest thought already caught (in the sky now, or settled before), if it's close enough to be the same one.
export function findSimilar(text, thoughts) {
  const mine = words(text);
  if (!mine.size) return null;
  let best = null, bestScore = 0;
  for (const t of thoughts) {
    if (t.status === "let-go") continue;
    const theirs = words(t.text);
    // "I'm good enough" is not the same thought as "I'm not good enough".
    if (NEG.some((w) => mine.has(w)) !== NEG.some((w) => theirs.has(w))) continue;
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    const union = new Set([...mine, ...theirs]).size;
    const jaccard = union ? shared / union : 0;
    const contained = shared >= 2 && shared === Math.min(mine.size, theirs.size) ? 0.7 : 0;
    const score = Math.max(jaccard, contained);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : null;
}

// "Came up 4 times this month", "Came up twice", "Caught today", for the quiet line under a thought.
export function cameUp(t, now) {
  const n = t.count || 1;
  if (n === 1) {
    const days = Math.floor((now - t.createdAt) / 86400000);
    return days < 1 ? "Caught today" : days === 1 ? "Caught yesterday" : `Caught ${days} days ago`;
  }
  return `Came up ${n === 2 ? "twice" : `${n} times`}`;
}
