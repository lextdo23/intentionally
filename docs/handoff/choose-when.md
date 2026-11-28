# Handoff: the morning notification, card when-tags, and choosing when

Status as of 2026-11-28: **build 1 (the morning notification) is built** on the `choose-when` branch (see "Build 1" below). **Builds 2 and 3 (card when-tags, choosing when) are built** on `claude/choose-when` (app version d165). Build 9 waits for a few weeks of tester data. The full rules are in `CLAUDE.md` under "Choosing when to do the card".

- Plan doc: https://claude.ai/artifact/RkJHJcZ4mZQSZygZzqcmAZ ("Part 1" and "Card when-tags")
- Mockup canvas: https://claude.ai/artifact/RbbLTLQtdLBHdKFvBBsr66 (Keep it for, On home, The reminder, If the moment passed)
- Rules to check against: `DESIGN.md` (especially 13b same-size buttons, 27 no narration, 28 lead with what happened, 32 no streaks) and the "What this app is" section of `CLAUDE.md`.

Work in this order: build 1, then 2, then 3. Build 9 waits for a few weeks of tester data.

---

## Build 1: a morning notification worth tapping (BUILT, branch choose-when, app version d164)

### The problem
Today's morning notification is "Good morning" / "How did you sleep?" (`show()` in `sw.js`). alex: a reason like "Your card's ready" or "3 cards waiting" is not strong enough. **Something else has to reel people in; once they're in, they flip the card because it's there.** So the notification never mentions the cards.

### What alex agreed (2026-11-28)
Each morning the phone shows the **first of these that's true**:

1. **People reacting to them**: replies, comments, "I see you" ("Mia replied to you", "Sam saw your moment").
2. **Friends' moments they haven't seen**: "Sam and Mia shared moments last night".
3. **A real pattern about themselves** (a "finding"), worded so it's specific and interesting but **holds back the one piece that answers it**, so they open the app to see it. The answer is the first thing on home. Examples:
   - "You slept 1h 20m longer after one kind of day this week"
   - "One thing showed up on all 3 of your best days"
   - "Your mornings felt lighter on days you did one thing"
   - Hard stretch (comfort, never a bad fact): "Something helped on your harder days"

Other decisions:
- **Moods and sleep may show on the lock screen** (alex: if it's valuable and gets them in). Hard days get comfort lines only; never "You felt awful".
- **The teaser must always be true**, and the answer must be on home when they open. No clickbait.
- **No greeting** ("Good morning" goes). The bold title is the hook; the line under it adds detail.
- **Never**: streaks, "you haven't", "we miss you", how many friends already did theirs.
- **Timing (alex said yes):** send it about 10 minutes after the time they usually do the morning check-in (median of their last ~2 weeks of `days[k].sleep` check-in times); until there's a week of check-ins, use the time they set in Settings.
- Proposed, alex hasn't answered: a "Keep notifications private" switch in Settings, off by default, that falls back to plain lines with no moods, sleep or names.

### What was built
- `js/findings.js`: works out every true finding (`all`), picks one for a morning (`pick`: comfort only after a hard day, not the same as the last 3 days), and settles it per day in `s.finds` (`forMorning`, `today`).
- `js/notify.js`: `usualAM()` (about 10 minutes after their usual morning check-in, from 7 check-ins; else their set time), used for the morning ping and the Monday recap / date mornings; `keepCardPlan()` saves the morning's finding to the `nudge-plan` cache as `morning`.
- `js/checkin.js`: the sleep check-in now records when it was done (`d.sleep.at`, first time on the day only).
- `sw.js`: `showMorning()` picks friends > finding > plain words; `friendNote()` keeps the latest friend notification as `social`; taps record which words were used.
- `js/main.js`: `findLine()` shows the finding's answer on home in the recap line's place until the morning check-in; `seenSocial()` clears the friend record when the app opens.
- Tester logs `am_line`, `am_line_tap`, `find_seen`; tester page "Do nudges bring people in?".
- Tests: `tests/findings.test.cjs`, `tests/morning-nudge.test.cjs`.
- Not done: the private switch (not agreed), a better first-week line (open question). Settings shows the learned time under "Start your day"; choosing a time there keeps it (`am.fixed`).

### How the code worked before (background)
- The service (`push/worker.js`) only sends an **empty ping** at times the phone gave it. The words are chosen in the service worker, `show()` in `sw.js`, from copies the app keeps in the `nudge-plan` cache (`keepCardPlan()` in `js/notify.js`). So **findings must be worked out in the app** (whenever it's open, usually the evening before) and saved to `nudge-plan`, e.g. key `morning`: `{ k: dayKey, title, body, id }`.
- Friend notifications (`push/friends.js`, `pNote()`, `pDue()`) carry their own words and are **held overnight (10pm to 8am)**, so overnight news arrives around 8am, close to the morning nudge. Plan: in `friendNote()` in `sw.js`, also save the latest friend title/body and time to the cache; the app clears it when opened. At morning time:
  - unseen friend news shown in the last ~90 minutes: stay quiet (that notification already is the reel);
  - unseen friend news older than that: show it as the morning nudge (reuse its words, they're already ordered requests, dates, replies, comments, "I see you", moments);
  - otherwise the finding; otherwise a plain fallback line.
  - If Social notifications are off, there's no friend news, which is right.
- Data for findings already exists in `js/stats.js`: `helps()` (what went with better days; has the with/without day lists), `sleepPattern()`/`sleepHours()`, `lifts()` (cards that lifted you, and on harder days), `easier()` (a pillar that used to take a lot and lifts now).
- Rotate findings so the same one isn't shown two days running (keep which one was shown each day).
- The answer on home: a line at the top of Today until the morning check-in is done. Home's layout is tightly tuned (see Today in `CLAUDE.md`); put it where the recap line sits (only when the recap line isn't showing) so the card never moves.
- `CLAUDE.md` says "a thought never goes on the lock screen". Keep that: findings use moods, sleep, pillars and card texts, never typed thoughts.

### Open questions
- New people with no data and no friends: what's the fallback line? (Week one is the weak spot; a starter deck for days 1 to 3 is planned in another thread.)
- The private switch above.
- Tester logs to add: `am_line` (which kind was shown: social / finding id / fallback), and whether it was tapped (sw.js already logs `tap` with the kind).

---

## Build 2: a "when" tag on every card (BUILT: js/card-when.js, 306 live cards; letters a / n / t:moment / d / c / s)

Every one of the 301 live cards gets one tag:

| Tag | Meaning | About how many |
|---|---|---|
| any time | fits any moment | ~200 |
| tonight only | only works in the evening | ~20 |
| time of day | tied to one time (a morning thing, lunch) | ~7 |
| all day | runs through the day | ~20 |
| when it comes up | happens when the moment arises | ~20 |
| has a date / other people's schedule | dates and week cards (`js/later.js`) | ~30 |

Add the tag to `cards/RULES.md` and make the card checker require it (see "Cards: making and checking them" in `CLAUDE.md`).

---

## Build 3: choosing when (BUILT: js/when.js, the hand in js/draw.js, home chip in js/main.js, Still got a minute? in js/checkin.js, cardTimes in js/notify.js)

- **Setting up moments:** after the first End your day, people pick their moments from a list: Breakfast, On the way, Lunch, After work or After class, After dinner. Each has a rough time they can adjust. **Separate weekday and weekend sets.**
- **"Keep this one" becomes "Keep it for"** in the draw: their top 3 moments plus **Now**, all buttons one size (DESIGN.md 13b).
- **Tagged cards:** "tonight only" and "time of day" cards go straight to their moment (no question); "all day" and "when it comes up" skip the question; dated cards keep their own flow.
- **Home:** a small chip on today's card shows the moment; tapping it changes today's moment only.
- **Reminder:** one backup reminder a little after the moment (none for Now). It replaces the fixed card reminders in `cardTimes()` (`js/notify.js`: 12:30 and 3 hours before the evening nudge).
- **If the moment passes:** End your day shows "Still got a minute?" with **I did it** / **Let it rest**. Never "missed".
- **Tester logs:** `card_when` (moment chosen, or tag-skipped), and done time vs chosen time; add a section to `testers.html`.
- iPhone web notifications can't show buttons, so no snooze on the lock screen.

## Build 9: later, after a few weeks of data
- Order moments by done rate (not by how often they're picked), so it doesn't lock in putting things off.
- Tell self-started from reminder-driven; when cards mostly get done straight after the reminder, suggest **Now**.

---

## Things to watch
- Two other builds run in parallel and touch the same files. **Before bumping `VERSION` in `sw.js`, check main and every open PR for the highest version.** Update from main before merging.
- Dev account @test has DEV tools (`js/dev.js`) to move the clock and fake days; use it to try the morning line and moments.
- Run `tools/test-all.sh` before saving; the relevant single tests are `tests/recap-nudge.test.cjs`, `tests/notif-*.test.cjs`, `tests/helps.test.cjs`, `tests/sleep-pattern.test.cjs`.

## Notes from building 2 and 3
- Moments are asked after the first End your day, as the plan says. That's earlier than "night one stays quiet" (Crumbs and the tester invite wait); flagged for alex.
- Own cards picked with an extra ("Pick my own") don't get a moment yet.
- Moment times in the setup sheet step in 15 minutes.
