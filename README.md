# Daydeck

A calm iPhone web app for people aged 18 to 30 who are burnt out or low. Start and end your day with a small check-in,
draw one small, research-backed card to do each day, and see how your days really feel.

Live at **https://daydeck.day**.

Right now everything stays on your phone, and nothing typed is ever sent anywhere. Deleting the app deletes everything.
(Optional accounts for backup are planned; this line changes when they arrive.)

## Trying it

Open https://daydeck.day in Safari on your iPhone, tap Share, then **Add to Home Screen**. It then opens full screen
like a normal app and works offline.

## Test mode

Add `?test` to the end of the link, or tap the greeting at the top of the home screen five times. A small panel
appears where you can fill in made-up days, move a day forward, or start again.

## Beta testers

Testers join from https://daydeck.day/?tester, or from Settings. They share only choices and numbers, never typed
words. The tester dashboard is at https://daydeck.day/testers.html (see `push/README.md`).

## What's in here

- The app itself: `index.html`, `css/`, `js/`, `icons/`, `img/`, `sounds/`, `sw.js` (offline copy).
- `push/`: the small Cloudflare service for notifications, tester data and the card library.
- `tests/`: checks run before changes go in (made-up data only).
- `v2/`: only forwards old links to the front page.
