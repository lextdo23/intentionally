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
