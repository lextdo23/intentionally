# Handoff: Reasons to open Daydeck (builds 4 and 7)

Written 2026-11-28 so another developer can pick this up. Plan doc: https://claude.ai/artifact/RkJHJcZ4mZQSZygZzqcmAZ
("Part 2" and "Something worth seeing in week one"). Branch: `claude/week-one-worth-seeing`.

## Build 7: Week one, worth seeing (built, in review)

All three parts are agreed in the plan and built on this branch.

1. **"Your first three days"** (`js/first3.js`). Once, after a new person's third End your day, when home is quiet,
   a sheet shows the cards from their first three days, drawn like What lifts you's cards, with how each one felt
   and "2 of them lifted you." when any did.
   - Who: third evening with a mood, within 2 days of it, first day in the last 10 days, at most 4 evenings ever.
     So people already using Daydeck never see it. Seen once: `notes.first3` (the day it showed).
   - Undone cards are left out, never "missed". A rest day shows as "A rest day, on purpose". Nothing if no card
     was done.
   - If Daydeck closed first, it comes on the next open (the boot chain in `js/main.js`).
   - Sample days never count; dev tools' made-up days do, so the @test dev account can try it.
   - The Crumbs offer used to come after the third evening too. It now waits for another night (`offerOK` in
     `js/crumbs.js`), so there's one sheet a night.
2. **First "Lifted you" straight away.** This already worked: What lifts you shows any lift from the last 4 weeks,
   and Your days opens at level 2. Fixed on the way: long card words on those cards showed a cut-off fifth line
   (`.lifts-t` in `css/app.css`).
3. **"So far" sleep-and-mood line** (`sleepFirst` in `js/stats.js`, used in `secSleep` in `js/days.js`). From 2
   nights with a mood until 7, when there's no real pattern yet: "So far, your best day came after 7h 40m of
   sleep.", "So far, your best days came after 7 to 8 hours of sleep." or "So far, your days have felt okay,
   after about 7h 30m a night." The usual sleep rule (`sleepPattern`) is unchanged.

Tester logs: `first3_seen` ({n, l}), `first3_close` (done / days), `sleep_seen` gains `first_one`, `first_best`,
`first_same`. Testers page section "Is "Your first three days" seen?" (Check-ins tab).
Tests: `node tests/week-one.test.cjs` (SHOTS=1 saves pictures). `tests/friends-app.test.cjs` now marks the sheet as
seen so it doesn't cover the screens it tests. Full suite (`tools/test-all.sh`) passes.

**Waiting on alex:** a look at the sheet and the wording on the phone.

## Build 4: Daydeck before scrolling (not started, blocked on a decision)

The plan was an opt-in iPhone Shortcuts automation that opens Daydeck when Instagram or TikTok opens, offered as a
setup tip and in Settings.

**The problem:** a Shortcut can't open a Home Screen web app. "Open App" only lists real apps, and "Open URLs"
with daydeck.day opens Safari, which keeps its own separate copy of Daydeck (setup, none of their days). Apple's
forums confirm there's no way to open an installed web app from a Shortcut or link:
https://developer.apple.com/forums/thread/762073

**Options put to alex (decision card in the project thread, no answer yet):**
- **A notification to tap (recommended).** The automation runs "Get Contents of URL" on a personal address for
  that phone (runs silently on iOS 17+). The service sends that phone a Daydeck notification such as "Your card
  first?". Tapping a Daydeck notification opens the real Home Screen app. Needs: a per-phone secret token, a new
  service route in `push/` that sends one push (rate-limited, e.g. at most one every 30 minutes and none at night),
  the notification words in `sw.js`, picture steps for setting up the automation, a setup tip and a Settings
  page, a tester log for "set up yes/no", and a privacy policy line (the service learns when the Shortcut fires).
- Open daydeck.day in Safari: not recommended, for the reason above.
- Wait for the native iPhone app (Capacitor is planned), which Shortcuts can open directly.

## Things to watch

- Two other threads build in parallel and touch `sw.js` VERSION and levels. Check main and open PRs for the
  highest VERSION before bumping, and update from main before merging.
- Thread B is moving Friends to day one and adding a day 2 "Add a friend" moment and a starter deck. Day 3 now has
  "Your first three days"; keep it to one sheet a night.
