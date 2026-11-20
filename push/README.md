# Notifications service

A tiny service that sends Intentionally's notifications. **First version, not final.**

It only ever knows two things per phone: an anonymous address to ping, and *when* to ping it
(when a timer's time is up, and the evening drop time). It never sees a thought, a name or a pillar.
The ping is empty; the app on the phone decides the words. A phone that hasn't opened the app
for two weeks stops getting the evening question.

It runs free on Cloudflare. The `Push service` workflow in GitHub puts it there.

## Switching it on (about 10 minutes, once)

1. Sign up free at **dash.cloudflare.com**. Open **Workers & Pages** once and pick a name
   when it asks for your `workers.dev` subdomain.
2. Make a key for GitHub: top right **profile icon → My Profile → API Tokens → Create Token**,
   use the **Edit Cloudflare Workers** template, then **Continue → Create Token**. Copy it.
3. Copy your **Account ID** (shown on the right of the Workers & Pages page).
4. On GitHub, open the repo's **Settings → Secrets and variables → Actions → New repository secret**.
   Add `CLOUDFLARE_API_TOKEN` (the key) and `CLOUDFLARE_ACCOUNT_ID` (the ID).
5. Open the **Actions** tab → **Push service** → **Run workflow**.
6. Its address will be `https://intentionally-push.<your-subdomain>.workers.dev`. That address goes into
   `SERVICE` at the top of `js/notify.js`, and notifications are on.

## Tester mode (Daydeck beta)

The same service stores what beta testers choose to share (see `js/tester.js`). To read it on `testers.html`:

1. Make up a long password (at least 12 characters).
2. On GitHub: Settings → Secrets and variables → Actions → New repository secret. Name `TESTER_KEY`, value = the password.
3. Actions tab → "Push service" → Run workflow.
4. Open https://daydeck.day/testers.html and enter the password.

Testers join from https://daydeck.day/?tester, or from Notifications → "Help test Daydeck".

## Accounts (accounts.js)

Sign up with an email code, a username and a passkey (Face ID); sign in with the passkey; back up days. No
passwords. Everything is under `/a/`:

| Step | Address |
| --- | --- |
| Email a 6-digit code | `POST /a/code` `{ email }` |
| Check the code, get a ticket | `POST /a/verify` `{ email, code }` |
| Is a username free? | `GET /a/name?u=...` |
| Options for saving a passkey | `POST /a/passkey/options` `{ ticket, username }` |
| Finish (account made or found, passkey saved, signed in) | `POST /a/finish` `{ ticket, username, credential }` |
| Sign in with a passkey | `POST /a/signin/options`, then `POST /a/signin` `{ credential }` |
| Signed in (send `Authorization: Bearer <session>`) | `GET /a/me`, `POST /a/username`, `POST /a/signout`, `POST /a/delete`, `GET` / `POST /a/backup` |

It needs one more repository secret, **RESEND_API_KEY** (Resend, sending access only, for daydeck.day). Without it
the service still runs, but codes aren't sent. Limits keep email inside Resend's free plan: one code a minute per
email, 5 a day per email, 8 an hour per network, and 90 a day in all.
