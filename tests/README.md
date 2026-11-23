# Tests

Small checks Claude runs before a change goes in. They only use made-up data, never anyone's real moods or sleep.
They're not part of the app and nothing here is served to users.

Run one from the repo folder with Node and Playwright (already on Claude's machines):

    node tests/consent.test.cjs
    node tests/sleep-data.test.cjs
    node tests/tester-page.test.cjs
    node tests/support.test.cjs
    node tests/csp.test.cjs
    node tests/workflow.test.cjs
    node tests/tester-cap.test.cjs
    node tests/photo-copy.test.cjs    (Save a copy carries the photos; Restore puts them back)
    node tests/photo-clean.test.cjs   (nothing but the picture is kept: no location, time or phone details)
    node tests/signup.test.cjs        (the sign-up screens and Your account in Settings, with a pretend service and Face ID). Accounts are on for everyone, so tests about other things start as someone who chose "Use without an account" (daydeck-account = {"skip":1})
    node tests/launch.test.cjs        (opening: the splash, then home; coming back: just as it was)
    node tests/rate-pill.test.cjs     (the bottom pill hides while a card is rated, Show more included, and comes back on Done)
    node tests/test-account.test.cjs  (alex's test accounts: everything open, nothing in tester data)
    node tests/recap-nudge.test.cjs   (weekly recap notifications: Sunday's heads-up and Monday's catch-up, their times and words)
    node tests/pill.test.cjs          (the glass pill: Today, Friends, You; test mode only for now)
    node tests/tab-swipe.test.cjs     (tapping a tab switches straight away; swiping drags whole screens with a dark line between)
    node tests/sync.test.cjs          (backup and sync: two pretend phones and the real backup service)
    node tests/accounts.test.cjs      (sign up, Face ID sign in, backup, rename, delete: the whole account journey)
    node tests/origins.test.cjs       (the notifications service answers daydeck.day, and nobody else)
    node tests/library-service.test.cjs
    node tests/library.test.cjs
    node tests/card-fit.test.cjs      (every card fits the card at iPhone 15 Pro Max size)
    node tests/repick.test.cjs        (people with old pillar answers are asked once to pick again)
    node tests/crumbs.test.cjs        (Crumbs: off by default, the offer, the face button beside the week, the sheet, crumbs at the end of the day, Settings)
