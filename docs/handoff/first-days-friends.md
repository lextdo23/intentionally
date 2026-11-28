# Handoff: first days, People you may know, card with a friend

Builds 5, 6 and 8 from the plan doc "Daydeck: getting people to do their card"
(https://claude.ai/artifact/RkJHJcZ4mZQSZygZzqcmAZ, sections "The first days" and "Part 2").
Branch: `claude/first-days`. Owner: alex (no coding experience, explain in plain English). Read `CLAUDE.md` first.

Last updated: 2026-11-28.

## Decisions so far (alex)

- **Friends is open from day one** for everyone. It is no longer in `UNLOCKS` (`js/levels.js`), so `levels.isOpen("friends")` is always true, even with Dev tools' "Real levels".
- **Level 3 is just a box** (alex picked this over moving every unlock up a level, 2026-11-28). Your days 2, weekly recap news 4, Cards 5, own card 6 stay where they were.
- **People you may know:** do NOT build until alex has shown the changes they want on the Add friends page. Screenshots of the page as it is now were sent (project files `add-friends/`).
- **Starter deck list** (below) is drafted and built, but alex has not said yes to the card list yet. Card choices go through alex (see `cards/README.md`).

## Done (on the branch)

1. Friends from day one: `js/levels.js` (UNLOCKS, BASICS line), comments in `js/main.js`, `js/pill.js`, `js/friends.js`. Tests updated: `tests/levels.test.cjs`, `tests/pill.test.cjs`, `tests/friends-app.test.cjs`.
2. Starter deck: `STARTER`, `STARTER_DAYS` and `starterPool()` in `js/deck.js`, used by `draw3`. Days 1 to 3 deal only starter cards from the person's own deck; if fewer than three, other tiny cards from their deck fill in; then the whole deck. Test: `tests/starter.test.cjs`. Every mindset has at least one starter card.
3. `CLAUDE.md` updated (Social, Levels, Cards). `sw.js` VERSION d165 (after merging main at d163; another open branch had d164).

## Left to do

1. **Starter list: get alex's yes** (or changes). Cards are listed in `js/deck.js` by number, grouped by pillar.
2. **Day 2 "Add a friend" moment** (not started). Plan: a gentle moment on day 2 with the friend card as the reason to invite someone. Ideas not yet agreed: when home is quiet after the day-2 card is kept, a sheet with one reason ("some days you and a friend draw the same card"), Invite a friend / Add by username / Not now; never if they already have a friend or no account; once only (`seen.*`); tester log. alex cares that the reason actually makes people tap, so show a mockup first (iPhone 15 Pro Max frame, `/mnt/project-files/phone-frame/`).
3. **People you may know** (build 6), after alex's Add friends changes. Agreed shape: up to 5 under the search box, each with picture, name, @username, the existing "Friends with Sam" line, Add, and × to dismiss for good. Order: friends of friends (most in common first, reuse `fCommon` data in `push/friends.js`), then the invite chain (who invited you, who they invited). No friends yet: alex and partner (usernames still needed from alex). Respect "Show my friends", skip people with requests off and blocked people, 18+ only. Remind alex to pull up the Add friends page first (they asked for that reminder).
4. **Card with a friend** (build 8, not started): at most once a week, two friends who both drew that day get the same card, offered in the hand ("You and Sam drew this today"), never forced. Needs a service side in `push/friends.js` (who drew today, which card) and the hand in `js/draw.js`. Tester logs: offered and done.
5. Before merging: check main and open PRs for the highest `sw.js` VERSION (two other threads bump it too), update from main, run `tools/test-all.sh`.

## Open questions for alex

- Usernames for alex and partner (suggestions for brand-new people).
- The changes they want on the Add friends page.
- Yes or changes to the starter card list.
- A "People you may know ›" line at the end of the feed: yes or no.
- The day 2 moment's words and reason (mockup first).
