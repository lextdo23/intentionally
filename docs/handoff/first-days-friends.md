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
3. Starter list approved by alex as it is (2026-11-28).
4. Card with a friend, the day 2 "Add a friend" sheet (option A) and the quiet row now and then (option C), all as agreed with alex on 2026-11-28: `js/together.js`, service `push/friends.js` ("Card with a friend", table `kept`), hand in `js/draw.js`, home in `js/main.js`. Details in `CLAUDE.md` ("Card with a friend"). Tests: `tests/kept-cards.test.cjs`, `tests/together-app.test.cjs`. Privacy policy has a line for it.
5. `CLAUDE.md` updated (Social, Levels, Cards).

## Left to do

- People you may know moved to its own thread (merged separately).
- Open question: the quiet row stops after 4 times in total (alex asked "4 times a week??"; answered 4 in total, no reply yet).
