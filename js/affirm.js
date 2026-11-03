// Words of affirmation: one kind, believable line that answers a thought, written for it and tied to what the person
// cares about. Research behind the style (see the psychology doc): self-compassion and values affirmation work best;
// big "I am amazing" lines are avoided because they're hard to believe on a bad day.
// Worries get reassurance, kind thoughts a line that helps them stick, wants some encouragement.
// Heavy thoughts never get one: they get the calm support line instead (decided before this is called).
import { about } from "./helps.js";

// Worries, by what they're most about. Two lines each, so a repeat can show the other one.
const WORRY = {
  overwhelmed: ["I can only do one thing at a time, and that's enough.", "Behind isn't the same as failing. I'll start with one small part."],
  notgood: ["I'm still learning, and that's allowed.", "One hard moment doesn't decide who I am."],
  tired: ["Being tired means I've been carrying a lot. Rest counts.", "I can go gently today."],
  sleep: ["My body knows how to rest. I don't have to force it.", "Even lying still and quiet is rest."],
  switchoff: ["It will still be there tomorrow. I'm allowed to stop for today.", "I don't have to solve it tonight."],
  putoff: ["Starting small still counts as starting.", "Five minutes is a real beginning."],
  lonely: ["Wanting connection is human. One small reach-out is enough.", "I matter to more people than I can see right now."],
  conflict: ["I can care about them and still look after myself.", "One hard conversation doesn't undo everything good."],
  money: ["Money stress is hard. Taking one look at it is a brave step.", "I can sort this one piece at a time."],
  stuck: ["Small changes still move things. I don't need a big one.", "Feeling stuck is a moment, not my whole story."],
  body: ["My body is doing its best for me today.", "Looking after myself is the point, not looking perfect."],
  ask: ["I'm allowed to ask for what I need.", "I can take my time with this decision."],
  focus: ["Scattered days happen. One thing, then the next.", "My worth isn't measured in focus."],
  grief: ["Missing them shows how much it mattered.", "There's no right speed for this."],
  sayno: ["No is a whole sentence, and I'm allowed to use it.", "Looking after my time is looking after myself."],
  someone: ["Caring this much about them says something good about me.", "I can support them without carrying all of it."],
  pain: ["Healing takes the time it takes.", "I can be patient with my body."],
  belong: ["I belong here as much as anyone.", "I don't have to change who I am to be enough."],
  rejected: ["Who I am is worth accepting.", "The right people will see me as I am."],
  anxious: ["This feeling is strong, and it will pass.", "I've got through anxious moments before."],
  caring: ["Looking after them is love. Looking after me matters too.", "I'm doing more than enough."],
  heard: ["What I have to say matters.", "My voice counts, even when it isn't heard."],
  job: ["My job isn't my worth.", "This is a hard chapter, not the whole book."],
  coming: ["I've prepared for hard things before. One step at a time.", "Whatever happens, I'll still be me afterwards."],
  pressure: ["I'm allowed to want my own life.", "I can love my family and still choose my own path."],
  routine: ["Change takes getting used to. I'm allowed to feel off for a while.", "I'll find my rhythm again."],
};
const WORRY_ANY = ["It's okay to find this hard.", "This is a moment, not the whole story."];

// Kind thoughts: help the good moment stick. Wants: a nudge that small steps count. {p} is their planet's name.
const KIND = ["I'm allowed to enjoy the small things.", "Good moments count too. This one's mine.", "I noticed something good. That's worth keeping."];
const KIND_P = ["{p} gave me something today.", "Time for {p} was worth it."];
const WANT = ["Small steps still count.", "Wanting it is the first step.", "I can start smaller than I think."];
const WANT_P = ["{p} matters to me, so this is worth a small step.", "Every small step for {p} counts."];

const pick = (list, seed) => list[Math.abs(seed) % list.length];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

// pillarName: the planet the thought sits by, if any.
export function affirm(text, kind, pillarName = "") {
  const seed = hash(text);
  const p = pillarName && pillarName !== "me" ? pillarName : "";
  if (kind === "worry") {
    const { struggle } = about(text, p);
    return pick(WORRY[struggle] ?? WORRY_ANY, seed);
  }
  const plain = kind === "want" ? WANT : KIND, tied = kind === "want" ? WANT_P : KIND_P;
  return p && seed % 2 ? pick(tied, seed).replace("{p}", p) : pick(plain, seed);
}
