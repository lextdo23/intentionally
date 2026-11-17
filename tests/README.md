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
