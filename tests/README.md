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
    node tests/accounts.test.cjs      (sign up, Face ID sign in, backup, rename, delete: the whole account journey)
    node tests/origins.test.cjs       (the notifications service answers daydeck.day, and nobody else)
    node tests/library-service.test.cjs
    node tests/library.test.cjs
    node tests/card-fit.test.cjs      (every card fits the card at iPhone 15 Pro Max size)
    node tests/repick.test.cjs        (people with old pillar answers are asked once to pick again)
