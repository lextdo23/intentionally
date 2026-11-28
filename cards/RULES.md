# Card rulebook

Every rule for writing a Daydeck card, in one place. It brings together alex's 25 rules from the card review
(19–20 Nov 2026, first kept in `card-review/card-rules.md`), the lessons from each pillar's hand-over note, the safety
rules, and the fit rules. Each rule says why, so the next card gets it right the first time.

Each rule is marked with who checks it:

- **[checker]**: `node cards/check.cjs` checks it by itself.
- **[people]**: the pretend-person check (see `README.md`, step 4).
- **[Claude]**: Claude checks it by reading, before alex sees anything.
- **[alex]**: only alex can judge it, at review.

## A. Mindsets (before any card)

A1. **Start from the person, not the card.** For each mindset, write who picks it, what they want and what stops them.
Then aim every card at what they want. [Claude] *Why: round 1 Friends cards were "a bit weird and didn't relate"
because they were written from a topic, not a person.*

A2. **One mindset, one kind of person.** If a mindset hides two different needs, split it ("I'm stuck" became "I keep
putting things off" and "I'm not sure I'm on the right path"). [Claude, alex] *Why: stranger cards were showing up for
people who wanted to feel closer to their own friends.*

A3. **At least 4 mindsets per pillar.** They mustn't overlap with each other or with another pillar's mindsets. Names
must explain themselves: no brackets, no subtitle, no grey line underneath. [Claude, alex] *Why: Meaning review; alex's
picker rule of 13 Nov.*

A4. **No "Something else" mindset**, on any pillar. Cards for everyone still go to anyone who picked the pillar.
[checker] *Why: alex, 19 Nov: "pretty irrelevant".*

A5. **Each pillar means its own kind of thing.** Love is love with another person. Self-kindness is Self. Switching off
after hours is Rest. Learning for its own sake is Learn. Confidence is Self. Sport is Move. Groups are Community.
Novelty and gigs are Meaning. Games night is Friends. Phone at bedtime is Rest. Comparing yourself is Self.
[Claude, people] *Why: Love, Work and Play reviews.*

## B. How many cards

B1. **At least 8 cards of its own for each mindset.** A card shared between two mindsets counts for each one. Cards
for everyone don't count towards the 8. [checker] *Why: alex, Self round 1.*

B2. **Tiny, Small and Bigger in every mindset.** [checker] *Why: alex, round 1 answers.*

B3. **Cards for everyone must fit every mindset in the pillar.** Usually 1 to 3. A pillar can have none.
[people] *Why: almost all of the old cards for everyone fitted only one mindset.*

B4. **Share a card across mindsets when it fits more than one, and never write near-copies,** in the same pillar or
any other. That includes two cards that are both "write tomorrow's tasks" with different studies. [checker finds
look-alikes, Claude decides] *Why: alex cut copies in Friends, Rest and Community.*

## C. The task (the card's main words)

C1. **One clear thing you can do.** Not open-ended ("reconnect with an old friend"), not only a thought ("remind
yourself…"), never "next time…". Name the actual thing ("put up a photo, poster or plant", not "make one small
change"). [checker catches the usual words, Claude the rest]

C2. **It must clearly lead to the mindset's goal.** "Meet someone" cards are clearly about meeting a partner. A look
back at an old hobby leads straight into doing the hobby. [people] *Why: "Go back to a class or club" (Love); the
nostalgia card (Play).*

C3. **It must make sense for the pillar and mindset the person chose, whatever else is going on in their life.** Two
people with the same mindset live different lives. A card can't quietly assume a car, money, a partner, friends
nearby, a close parent, living alone, drinking, a 9-to-5 job, or being out to family. Examples must suit uni
students as well as workers. Whether someone can do it *today* doesn't matter: they're dealt 3 cards, and the other
two cover that (alex, 25 Nov). [people] *Why: "sit near the same people at the gym", Family notes, alex 25 Nov.*

C4. **The task matches the mindset's own words.** "See them more" means seeing them, for example a video call rather
than a phone call. [people]

C5. **Nothing pushy, nothing like barging in.** If people won't pick a card, it doesn't help, however good the study.
[people] *Why: "ask to come along to something a friend is already doing"; alex cut improv ("a bit much").*

C6. **Nothing to buy.** No gear, apps, classes or tickets someone must pay for unless that is the point of the card,
and then say so. [checker catches the usual words, Claude the rest] *Why: Rest "use a cheap alarm clock".*

C7. **Name what to do; don't leave people to think of it.** Not "a clip that makes you laugh": say what to search
for. [Claude, people] *Why: Play review.*

C8. **Lengths that feel right.** About 45 minutes for an activity and one week for a longer card felt right to alex;
20 minutes and 4 weeks didn't. If a study fixes a length, keep the study's length or swap the card.
[Claude, alex] *Why: Play review.*

C9. **Awe and wonder cards get people out doing something in the real world,** never watching or reading online.
[Claude] *Why: Meaning review.*

C10. **New-hobby cards are for fun:** never practising or getting better. [Claude] *Why: alex, Play review.*

C11. **Every card says when it fits in someone's day,** with one tag in `js/card-when.js` (a draft carries it as
`"when"`): **a** any time (the person picks a moment when they keep it), **n** tonight only, **t:breakfast / t:way /
t:lunch / t:work / t:dinner** tied to one time of day, **d** runs all day, **c** happens when the moment comes up (a
queue, a hard feeling), **s** has a date, runs over a week, or follows other people's schedule (a class, a gig; every
card in `LATER` is s). Pick the tightest that's true: a card that says "tonight" is n, not a. [checker: a tag is there
and valid; Claude: it's the right one] *Why: alex, 2026-11-28: people choose when they'll do their card, and a card that
only works at one time shouldn't ask.*

## D. The why line

D1. **Two parts: the takeaway, then the study.** The first few words give the point ("Long breaths out lift your
mood."), then what the study did and found. [checker checks for two sentences, Claude the rest]

D2. **Back what the card is for.** A club card shows clubs lead to friends. Easing the worry is a bonus. Avoid
studies about a side benefit (stress) instead of the mindset's goal. [Claude, people]

D3. **The study's people match the card's people and pillar.** No stranger study on a card about your own friends, no
friends study on a Family card, no over-50s depression study on a student's card. When the match isn't exact, flag
it for alex. [Claude]

D4. **Make the point obvious.** If alex has to work out what the study means, rewrite it. No odd conditions ("when
families were warm"). [people, alex]

D5. **Only what the study did and found, nothing made up.** No numbers the paper doesn't give. [Claude, second look]

D5b. **A few studies: just say "Studies show".** When a paper has only a handful of studies (two to five), don't
   count them ("In four studies…"); write "Studies show…". The count adds nothing for the reader and is easy to get
   wrong. A big number that is the point, like a review of 146 studies, can stay. (alex, 25 Nov 2026) [checker]

D6. **Search for the study; don't rely on memory.** For each mindset, search for research on what it wants and what
stops it. Check each study against the paper, its abstract, or a reliable write-up, and record which (`chk`).
Prefer a single trial that tested the exact task over a broad review. [Claude] *Why: checking caught "40 vs 50
hours" and "much closer vs stronger bond".*

D7. **No backing, no card.** If no study backs a card, or the study didn't hold up (replication doubts, not
significant), swap the card. [Claude] *Why: Ariely deadlines, job crafting, Sheldon and Elliot 1999.*

D8. **Length: about 12 to 25 words** (live cards: 14 to 23, most about 18), so the card fits.
[checker] *Why: alex, 20 Nov: shorten the why line first, give the step back its words.*

D9. **Source written "Surname and colleagues, 2017"** (or two names with "and"), with a year. [checker]

## E. Safety (never broken)

E1. **Never the word "crisis"** on a card. [checker]

E2. **"I want to feel okay in my body" and the rest of Self: never appearance, food, weight, calories or exercise.**
Body cards are about what your body does and how it feels. [checker catches the words, Claude the rest]

E3. **Nothing that could push someone already low:** no "you should", no guilt, no targets or streaks.
[checker catches the usual words, people]

E4. **Never assume or name an identity** (sexuality, gender, culture, faith). People work it out at their own pace.
[Claude, people]

E5. **Food and Money pillars** (set aside), when they come back: no good or bad foods, calories or weight; no
shaming about money. [Claude]

## F. Fitting the card

F1. **Every card fits every place it shows, at alex's phone size (430 × 932),** measured against the app's own
current card each time, never against a remembered number: in the hand of three, the kept card (with "Back again"),
today's card on home (face up and done) and What lifts you. [checker] *Why: 278 of 280 approved cards didn't fit
on 20 Nov, and the card sizes have changed since.*

F2. **Shorten the why line first, then the step,** and only take out examples last (keep none or one).
[Claude] *Why: alex, 20 Nov.*

## G. Words

G1. **Australian spelling** (colour, organise, programme for TV but program for software, mum), plain words, no slang.
[checker catches common US spellings]

G2. **Brief and steady; comfort only at hard moments.** Say the real thing once. [Claude]

G3. **Straight quotes are fine in steps; curly quotes for a quote the person writes** (“At [time] today, I'll…”).
[Claude]

## H. Reviewing with alex

H1. **Cards alex keeps aren't rated again.** The next round shows them as kept, unless a note asks for a change.

H2. **Show alex the plan first** (mindsets, who / wants / stops), then the cards.

H3. **Nothing goes into the app until alex says build.**
