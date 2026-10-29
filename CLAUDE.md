# Intentionally: notes for Claude

The owner, alex, has no coding experience. Explain changes in plain English, no jargon.

## Tech
- Plain HTML, CSS and JavaScript modules. No build step, no frameworks, no dependencies. Open `index.html` through any static server.
- All data lives in `localStorage` under the key `intentionally` (see `js/store.js`). Bump `SCHEMA` and migrate when the shape changes.
- `sw.js` caches the app for offline use. **Bump `VERSION` and update `FILES` whenever any file changes or is added.**
- Time always comes from `now()` in `js/clock.js`, never `Date.now()` directly in app logic, so test mode's time travel works. (The sky's orbit phase uses the real clock on purpose.)

## Design rules (agreed with alex; don't drift from these)
- Feeling: wonder, grown-up, calm. No mascots, confetti, badges, streaks, targets or bright saturated colours.
- Palette: sky `#24262b / #141518 / #08090a`, ink `#efede9`, sun `#f2c08f`, gold accent `#e3c486`, pillar tints `#d9b3a6 #cfc59b #a9c4b5 #a9b9d6 #c4b4c9`.
- Font: system stack (SF Pro on Apple). Apple's standard text sizes, never scaled with the screen: large title 34, titles 22 / 20, body and buttons 17, smaller 15, notes 13, tiny labels 12 / 11 (never below 11). Only the sky scales to fill the screen.
- No decorative stars. Every star is a thought the person wrote. Kind thought = 4 points, worry = 6, want = 8. Never colour alone.
- Planets: still, set evenly around the sun (focus pillars either side). Flat, lit from the sun with a crisp shadow on the far side; surface marks, craters and bumps rotate on a sphere (all flat, same colour, light on the sun side). No orbit lines. Each name is a level ring round its planet (name twice, 13px weight 500), a lap every 20s, turning so names slide in from the left; near side readable, far side faint and mirrored behind the planet.
- Sun: the one hero, a wide warm glow that breathes slowly (about 4s in, 5s out). Greeting is quiet and centred (22). Fewer colours: only focus pillars keep their tint.
- Thoughts never pass behind the sun or a planet; sorted thoughts circle their pillar.
- Stars roam the whole open sky on slow Lissajous laps (6 to 10 minutes), starting from where they landed.
- Running a timer zooms the sky into that planet (only the planet and the passing sun remain), then the time fades in under it.
- Sorting (`js/sort.js`): one card at a time, in the sky or on a page (planets in a row above a stack of cards). Drag the card up onto a planet, or the sun ("Just me"), to sort; swipe left to let go, right for "not sure yet". No labels on screen: the words fade in behind the card while swiping. A one-line tip shows only on the first few sorts. The round × at the top right always stops sorting. Letting go sinks down and crumbles away, with a line of relief (worries: "That was a moment, not the truth."; others: "You felt it. You don't have to keep it.").
- Thoughts are always shown in quotation marks.
- One focal point per card; everything else steps down. A label is never smaller than what it labels.
- One 20px left edge; spacing 4 / 8 / 16 / 24 / 40. Corners: sheet 26, card 16, button 14, field 12, chip 10. Buttons that are only an icon are round.
- Tap targets at least 44px. Respect reduce-motion (stop all motion) and nothing flashes.
- Voice: comforting at hard moments (worries, reflection, repeats), brief and steady everywhere else.
- Features are revealed slowly and we say so up front.
- Not therapy: crisis support (Australian lines) must always be reachable.
- Notifications (`js/notify.js`, `push/`) are a FIRST VERSION, NOT FINAL: built as first drafted at alex's request; words and design get revisited. The service only knows times, never words; a thought never goes on the lock screen.
