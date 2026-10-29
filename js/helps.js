// The helps bank: what a thought is most about (its "struggle"), and small things that could help with it.
// Everything is read from the words on the phone. Nothing is sent anywhere.
// The full bank, with the research behind each help, is in the "What helps" doc.

// Heavy thoughts are checked first, before anything else. They never get suggestions, never grow, and are never
// quoted back. The net is wide on purpose (grouped by meaning, not exact phrases), and the answer is always soft.
const HEAVY = [
  // not being here
  /\b(not|never) (be )?(here|around|alive)\b/, /\bwasn ?t here\b/, /\bnot wake up\b/, /\bdisappear(ed)? (forever|for good|completely)\b/,
  /\bend (it|it all|my life|things)\b/, /\bkill(ing)? (my ?self|me)\b/, /\bsuicid/, /\b(want|wanna|wish i could|going) to die\b/, /\bbetter off (dead|without me)\b/,
  /\bnobody would (notice|care|miss)\b/, /\bno one would (notice|care|miss)\b/,
  // being a burden
  /\b(i m|im|i am|feel like) a burden\b/, /\bburden (to|on) (everyone|everybody|them|my)\b/,
  // hurting yourself, and ways of doing it
  /\bhurt(ing)? my ?self\b/, /\bself ?harm/, /\bcut(ting)? my ?self\b/, /\bdriv(e|ing) (off|into)( the)? (road|cliff|tree|wall)/, /\bjump(ing)? off\b/,
  /\bin front of a (train|car|bus|truck)\b/, /\btake all (my|the) (pills|tablets)\b/, /\boverdose\b/, /\bhang(ing)? my ?self\b/,
  // no point, in any form
  /\b(no|whats the|what s the|dont see the|don t see the|cant see the) point\b/, /\bpointless\b/, /\bwhats the use\b/, /\bwhy bother\b/,
  /\bno reason to (live|keep|go on|be here|try|get up)\b/, /\bcant (do this|go on|keep going)( any ?more)?\b/, /\bgive up on (life|everything)\b/,
];
const SOFT = [/\bdisappear for\b/, /\brun away from (it all|everything)\b/, /\bwant to disappear\b/, /\bjust disappear\b/, /\bvanish\b/];
// Eating needs a sign of restricting, bingeing or purging; "skipped breakfast, running late" alone is not enough.
const EATING = [/\bskip(ped|ping)? (meals|lunch|dinner|breakfast)( (again|and))?\b.*\b(easier|again|on purpose|dont deserve|don t deserve|not hungry|fat)\b/,
  /\b(not|stopped|haven ?t been|havent been) eating\b/, /\bbing(e|ed|eing)\b/, /\bpurg/, /\bthrow(ing)? up after\b/, /\bdon ?t deserve (to eat|food)\b/];

const flat = (text) => " " + text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";

// "heavy", "soft" or null. Tilted to caution: a soft false alarm costs one quiet line.
export function heaviness(text) {
  const t = flat(text);
  if (HEAVY.some((r) => r.test(t))) return "heavy";
  if (SOFT.some((r) => r.test(t))) return "soft";
  return null;
}
export const aboutEating = (text) => EATING.some((r) => r.test(flat(text)));

// Each struggle: a name for the "What's this most about?" chips, word cues, and up to three helps as the card says them.
// `feel` marks feelings, which outrank topics. `weak` cues ("never", "always") only count with a second clue.
export const STRUGGLES = {
  overwhelmed: { name: "Too much on", cues: ["too much", "behind", "so many", "so much", "deadline", "swamped", "drowning", "snowed under", "flat out", "under the pump", "workload", "overloaded"],
    helps: ["Write it all down, pick one", "25 minutes on just one thing", "Ask for help or more time"] },
  notgood: { name: "Not good enough", feel: 1, cues: ["not good enough", "failure", "useless", "stupid", "everyone else", "give up", "im the problem", "not smart", "loser", "pathetic", "hopeless at", "worthless", "embarrass", "ashamed", "guilty", "mistake"],
    weak: ["always", "never"], helps: ["Talk to yourself like a friend", "Write down one thing you did well", "Do one kind thing for someone"] },
  tired: { name: "Always tired", cues: ["tired", "exhausted", "no energy", "drained", "burnt out", "burned out", "burnout", "wiped", "knackered", "cooked", "buggered", "fatigue", "rooted"],
    helps: ["Step outside for 2 minutes", "A walk, even 10 minutes", "Get up at the same time"] },
  sleep: { name: "Can't sleep", cues: ["sleep", "awake", "insomnia", "3am", "2am", "4am", "cant fall asleep", "up all night", "bed late"],
    helps: ["Same wake-up time, every day", "Phone out of bed", "Awake 20 minutes? Get up a while"] },
  switchoff: { name: "Can't switch off", cues: ["cant stop thinking", "switch off", "on my mind", "emails", "slack", "after hours", "keep thinking", "overthinking", "overthink", "racing"],
    helps: ["Close work with a full stop", "Give it 15 minutes tomorrow", "No work messages after a set time"] },
  putoff: { name: "Putting it off", cues: ["procrastinat", "avoid", "putting off", "put off", "haven t started", "havent started", "keep leaving", "last minute"],
    helps: ["Just start for 5 minutes", "Plan it: “When ___, I’ll ___”", "Forgive yourself for last time"] },
  lonely: { name: "Lonely", feel: 1, cues: ["lonely", "alone", "no one", "nobody", "left out", "miss", "haven t talked", "havent talked", "haven t seen", "havent seen", "drifted", "no friends", "nobody gets me", "isolated"],
    helps: ["Message one person today", "Find people who get it", "Invite someone to hang out"] },
  conflict: { name: "Fighting with someone", cues: ["fight", "argue", "argument", "upset with", "annoyed", "ignored", "yelled", "blew up", "falling out", "not talking"],
    helps: ["Write it out before you talk", "Pick a calm time to talk", "Take a breather first"] },
  money: { name: "Money", cues: ["money", "rent", "afford", "bills", "broke", "debt", "pay", "payday", "savings", "bank", "cost", "expensive", "afterpay", "loan"],
    helps: ["Write down the one cost that worries you", "One money task, 20 minutes", "Free help: 1800 007 007"] },
  stuck: { name: "Stuck", feel: 1, cues: ["stuck", "no motivation", "unmotivated", "same every day", "going nowhere", "pointless job", "bored", "flat", "meh", "nothing changes", "nothing s changing"],
    helps: ["Plan one small thing you enjoy", "15 minutes making something", "5 minutes of something you used to like"] },
  body: { name: "Body and health", cues: ["weight", "body", "sick", "unfit", "gym", "fat", "ugly", "skin", "out of shape"],
    helps: ["Be kind to your body today", "Move in a way you like", "Time outside"] },
  ask: { name: "A big ask or decision", cues: ["ask for", "should i", "decide", "decision", "tell them", "quit", "resign", "raise", "promotion", "move out", "confront"],
    helps: ["Write down what you’d say", "Pick the day you’ll ask", "Talk it through with someone"] },
  focus: { name: "Can't focus", cues: ["focus", "concentrate", "distracted", "scattered", "brain fog", "adhd", "zoned out", "cant think"],
    helps: ["One thing on the desk", "15 minutes with a timer", "Work next to a friend"] },
  grief: { name: "Grief and loss", feel: 1, cues: ["passed away", "died", "funeral", "grief", "grieving", "lost my", "broke up", "breakup", "break up", "dumped", "moved out", "my ex", "sorry business", "miscarriage"],
    helps: ["Let it be heavy today", "Tell one person how you are", "Griefline 1300 845 745"] },
  sayno: { name: "Saying no", cues: ["say no", "cant say no", "people pleas", "said yes again", "pushover", "doormat"],
    helps: ["Say no to one small thing", "Practise: “I can’t this week”"] },
  someone: { name: "Worried about someone", feel: 1, cues: ["what if she", "what if he", "worried about my", "worried about him", "worried about her", "is he okay", "is she okay", "so stressed", "mum is", "dad is", "dads", "mums", "sick mum", "sick dad"],
    helps: ["Ask them how they are", "Write down the question for the right person", "Look after yourself too"] },
  pain: { name: "Pain or injury", cues: ["sore", "pain", "hurt my", "injured", "injury", "ache", "migraine", "headache"],
    helps: ["Rest it today", "See a GP or physio", "Tell work if it happened there"] },
  belong: { name: "Belonging", feel: 1, cues: ["dont fit", "don t fit", "treat me different", "outsider", "left out at", "belong", "dont belong", "don t belong", "the only one"],
    helps: ["Find one person to talk to", "Find people who get it", "Give it a few more weeks"] },
  rejected: { name: "Family won't accept me", feel: 1, cues: ["wont accept", "won t accept", "wont use my name", "disowned", "kicked out", "deadname", "won t use my"],
    helps: ["Talk to someone who gets it", "QLife 1800 184 527, 3pm to 10pm"] },
  anxious: { name: "Anxious", feel: 1, cues: ["anxious", "anxiety", "panic", "nervous", "scared", "afraid", "on edge", "dread", "what if", "freaking out", "shaking"],
    helps: ["Breathe in, then a long, slow breath out", "Name 5 things you can see", "Give it 15 minutes tomorrow"] },
  gambling: { name: "Gambling", cues: ["bet", "betting", "pokies", "gambl", "sportsbet", "lost it all on", "punt"],
    helps: ["Delete one betting app today", "Gambling Help 1800 858 858", "Tell one person"] },
  drinking: { name: "Drinking", cues: ["drink", "drinking", "drunk", "hungover", "hangover", "beers", "wasted", "smashed", "pissed last night"],
    helps: ["Two days off this week", "Water between drinks", "Alcohol and drug help 1800 250 015"] },
  caring: { name: "Caring for someone", cues: ["caring for", "look after mum", "look after dad", "carer", "take care of", "nan needs", "appointments for"],
    helps: ["Ask for one hour of help", "Carer Gateway 1800 422 737", "Ten minutes just for you"] },
  heard: { name: "Not being heard", feel: 1, cues: ["not listening", "doesnt listen", "doesn t listen", "talks over me", "ignored me", "nobody listens", "dismissed", "brushed off"],
    helps: ["Write down the one thing you need them to hear", "Say it in writing", "Talk to someone who will listen"] },
  job: { name: "Losing a job", cues: ["redundant", "redundancy", "laid off", "fired", "sacked", "lost my job", "unemployed", "job hunt", "no job", "applications", "rejections"],
    helps: ["One application, then stop for the day", "Tell one person how it's going", "Keep one part of your day the same"] },
  coming: { name: "Something hard coming up", cues: ["exam", "interview", "test", "presentation", "surgery", "court", "tomorrow", "next week", "results"],
    weak: ["tomorrow", "next week"], helps: ["Picture it going okay, then plan one step", "Prepare for 20 minutes, then stop", "Plan something nice for after"] },
  pressure: { name: "Pressure from family", cues: ["parents want", "parents expect", "family expects", "disappoint", "my parents", "family pressure", "be a doctor", "be a lawyer"],
    helps: ["Write down what you want, for you", "Talk to someone outside the family", "Pick one thing to say no to"] },
  racism: { name: "Racism", feel: 1, cues: ["racist", "racism", "my people", "where are you really from", "because i m black", "because im black", "because i m asian", "because im asian", "slur", "my skin"],
    helps: ["This isn't on you", "Tell your uni's Indigenous support unit or HR", "Yarn with someone you trust"] },
  far: { name: "Help is far away", cues: ["3 hours away", "hours away", "nearest psych", "no psych", "waitlist", "wait list", "too far", "cant get an appointment", "can t get an appointment", "no gp"],
    helps: ["Free phone and online counselling comes to you", "Beyond Blue 1300 22 4636", "Head to Health 1800 595 212"] },
  routine: { name: "A change of routine", cues: ["changed my routine", "routine", "new schedule", "new job", "moved", "new city", "new house", "everything changed", "thrown off"],
    helps: ["Keep one part of your day the same", "Plan tomorrow’s first hour", "Give it two weeks"] },
};
// The helps for a worry that matches nothing: soothing, never a planet's activities.
export const GENERAL_WORRY = ["Talk to yourself like a friend", "2 minutes outside"];
// A want with no match gets the general ladder for wants.
export const GENERAL_WANT = ["Write down the first small step", "Pick a day for it", "Tell someone you’re doing it"];
// Eating gets small and kind, never body or exercise.
export const EATING_HELPS = ["Something small to eat now", "Eat with someone today"];

// The likeliest struggles under each pillar. Pillars people named themselves fall back to the general three.
const BY_PILLAR = {
  career: ["overwhelmed", "notgood", "switchoff", "ask", "stuck"], work: ["overwhelmed", "notgood", "switchoff", "ask", "stuck"],
  study: ["overwhelmed", "putoff", "notgood", "tired", "focus", "coming"], health: ["tired", "body", "sleep", "putoff", "pain"],
  rest: ["sleep", "switchoff", "tired"], friends: ["lonely", "conflict", "notgood", "belong"], family: ["conflict", "pressure", "someone", "ask", "lonely"],
  love: ["conflict", "lonely", "ask", "notgood", "grief"], money: ["money", "putoff", "overwhelmed", "gambling"], home: ["overwhelmed", "putoff", "money"],
  creativity: ["stuck", "notgood", "putoff"], fun: ["tired", "lonely", "stuck"], purpose: ["stuck", "notgood", "ask"],
};
const GENERAL = ["overwhelmed", "notgood", "stuck"];
export const likely = (pillarName) => BY_PILLAR[String(pillarName || "").toLowerCase()] ?? GENERAL;

// Words that mean nothing on their own here, so a remembered answer isn't tied to "the" or "really".
const FILLER = new Set(("i im ive id ill me my mine myself am is are was were be been a an the to of and or but so that this it its just really very " +
  "feel feeling felt like think thought still too also about at in on for with as do does did have has had get got will would can could should " +
  "dont cant wont not no").split(" "));
export const keyWords = (text) => [...new Set(flat(text).trim().split(" ").filter((w) => w.length > 2 && !FILLER.has(w)))];

const hits = (t, cue) => {
  const c = ` ${cue}`;
  return cue.includes(" ") || cue.length < 4 ? t.includes(`${c} `) : t.includes(c);
};

// What a thought is most about. Returns { struggle, sure, chips }:
//   sure  - a clear match, so the card goes straight to helps
//   chips - for "What's this most about?": best guess first, then the planet's top two (always 3 at most)
// `learned` maps words to struggles the person picked before, so the same words match next time.
export function about(text, pillarName, learned = {}) {
  const t = flat(text), mine = likely(pillarName);
  const score = {};
  for (const [id, s] of Object.entries(STRUGGLES)) {
    let n = s.cues.filter((c) => hits(t, c)).length;
    const weak = (s.weak ?? []).filter((c) => hits(t, c)).length;
    if (weak) n += n ? weak : .5;
    if (n) score[id] = n * (s.feel ? 1.5 : 1) + (mine.includes(id) ? .25 : 0);
  }
  for (const w of keyWords(text)) if (learned[w]) score[learned[w]] = (score[learned[w]] ?? 0) + 2;
  const ranked = Object.keys(score).sort((a, b) => score[b] - score[a]);
  const best = ranked[0] ?? null, second = ranked[1];
  // A cue for a struggle that isn't usual on this planet needs a second clue.
  const strong = best && (score[best] >= 1.5 || (mine.includes(best) && score[best] >= 1));
  const sure = !!(strong && (!second || score[best] - score[second] >= .75));
  const chips = [...new Set([best, ...mine.slice(0, 2), ...mine.slice(2)].filter(Boolean))].slice(0, 3);
  return { struggle: best, sure, chips };
}
