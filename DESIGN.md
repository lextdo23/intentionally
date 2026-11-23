# Daydeck design rules (new look)

Agreed with alex, 2026-11-23 and 2026-11-24. Every screen gets checked against these rules before it's called done. The rules are numbered so a check can say "breaks rule 7". If a rule turns out to be wrong for a screen, alex changes the rule here first, never makes a one-off exception on that screen.

Today (home) is the reference screen: when unsure, match it.

---

## 1. Colour

1. **Background is plain black `#0a0a0b`.** No gradients, no tinted night sky, no vignettes.
2. **Ink is off-white `#efede9`** for text and icons. Quieter text steps down: `#cfcac1` (second line), `#a9a59d` (notes), `#8d8981` (faint). Never pure white text on screens.
3. **Marigold `#ffa51f` is the one owned colour, and it has only these jobs:**
   - the Daydeck card back (and its edge);
   - the main button on a screen (always marigold with dark text `#1d1e22`, whatever card look is in use, because it's what draws the eye to press);
   - one line that needs to catch the eye (the recap line on Today);
   - the logo;
   - a short moment worth noticing ("Level 4.").

   Anything else that's marigold is a mistake. Only one marigold *button* on a screen.
4. **White (ink) shows plain facts:** the level row, numbers, counts.
5. **Gold `#e3c486` means only "Got it done"** (one of the three ways an activity felt, next to green "Lifted you" and blue "Took a lot"). Gold used for anything else is left over from the old look: headings, links, the level-up page, the tip outline, the focus outline, card rims, "made by you" words. Each one becomes ink or marigold, whichever job it's doing.
6. **Pillar tints stay** (`#d9b3a6 #cfc59b #a9c4b5 #a9b9d6 #c4b4c9`), used only for pillar dots and tags. Mood colours stay as they are (`CHART_COL` on dark, `MOOD_COL` on the light recap cards).
7. **Social screens** (Friends, You, profiles, sharing): no marigold or sun at all. Main buttons are off-white with dark text. Colour comes only from pillar dots, photos and profile pictures.
8. **Colour never works alone.** Anything a colour means is also said in words.

## 2. Light and glow

9. **No glow anywhere** except the sun in check-ins, which still tints with how the day felt. No coloured box-shadows, no drop-shadow halos, no breathing rims.
10. **Shadows are plain dark shadows,** only to lift something off the page (a card, the pill, a sheet).
11. **A finished card gets one shine that sweeps across,** never a glow.

## 3. Surfaces and buttons

12. **Glass is for things you tap:** round icon buttons, the Your days row, the pill. Use the same glass as the pill: `rgba(255,255,255,.07)`, blurred, with a fine light edge and a highlight on top. Things you only read are flat, with no glass.
13. **Everything pressable gives a little when touched:** shrinks to 96% and brightens. Not when reduce-motion is on.
14. **Buttons that are only an icon are round.** Everything you tap is at least 44 by 44 points.
15. **Corners:** sheet 26, card 16, button 14, field 12, chip 10. Nothing else unless it's a full circle.
16. **Spacing comes from 4 / 8 / 16 / 24 / 40,** with one 20-point left edge on every screen.

## 4. Type

17. **System font (SF Pro) at Apple's sizes, never scaled with the screen:** large title 34, titles 22 / 20, body and buttons 17, smaller 15, notes 13, tiny labels 12 / 11. Never below 11 as seen on the phone. (Inside the home card, sizes are drawn smaller and the card is enlarged, so check them on the phone, not in the code.)
18. **A label is never smaller than what it labels.** Each screen or card has one focal point, and everything else steps down.
19. **Wordmark:** the drawn lowercase "daydeck" (`js/wordmark.js`), in ink on dark, used only at the top of Today and on brand pieces. Never retyped in a font.

## 5. The Daydeck card

20. **The back is the marigold slab:** solid marigold, the eclipse cut into it in black, the day's date in its corner. The face stays dark and flat.
21. **Card looks (Chrome and others) bring their own material.** The screen around the card stays plain black, so any look can be the hero.
22. **The card sways gently** (5 degrees, slow). It's never static and never bouncy.

## 6. Layout

23. **Open, not empty.** Each screen has one clear thing to do, and no space that looks like something's missing.
24. **Optical centring:** centre a card or block between what's above and below it, as it looks to the eye, not by the numbers.
25. **The bottom pill is one single pill** (Today · Friends · You plus the screen's main action). Nothing else floats at the bottom.
26. **Mockups are drawn on alex's phone at real size:** 430 by 932, safe areas 59 top and 34 bottom.

## 7. Words

27. **No narration or AI-sounding greetings.** The card and the button say what's next. Short words only for a moment ("Card's done.") or as a first-week hint.
28. **Brief and steady everywhere; comforting at hard moments.** Lead with what happened, never gaps, comparisons or targets.
29. **No keys or legends on charts.** Words sit next to marks.
30. **Thoughts are always in quotation marks.**

## 8. Safety and care (unchanged by the new look)

31. **Lifeline stays one step away** in every check-in, card draw, Your days, Friends and sign-up. It's not on Today.
32. **No mascots, confetti, badges, streaks or targets.** (Cute characters only as art on an unlockable card look, and the default profile pictures.)
33. **Reduce-motion stops all motion, and nothing flashes.**

## 9. What a rework doesn't change

34. **Looks only.** A rework changes colour, light, surfaces, type and spacing. It doesn't change what a screen does, its words, its steps, or real elements like the crumbs icon, unless alex decides it. Anything that would change behaviour is asked about first.
35. **Every rework keeps the tests passing,** bumps `VERSION` in `sw.js`, and updates CLAUDE.md if a rule there changes.

---

## How each screen is checked

For each screen, in order:

1. Screenshot it as it is now, on alex's phone size, with a few months of sample data.
2. Go through rules 1 to 35 and list every rule it breaks.
3. Show alex the list and a mockup of the fix; alex picks.
4. Build it, screenshot again, and recheck every rule (not just the ones that were broken).
5. Mark it done in the list below, with the date.

## Screens

| Screen | Status | Known breaks before rework |
| --- | --- | --- |
| Splash and app icon | Done 2026-11-23 | |
| Today (home) | Done 2026-11-23 | Focus outline still gold (5) |
| Morning check-in | To do | |
| Evening check-in | To do | |
| Card draw, rating and "How did doing it feel?" | To do | Card face rim is gold (5) |
| Make your own card | To do | "Made by you" words in gold (5) |
| Level-up moment and level path | To do | Level numbers, bar and steps in gold (4, 5) |
| Tips | To do | Tip outline is gold (5) |
| Your days (charts, What lifts you, What seems to help you) | To do | Some notes and "more" links in gold (5) |
| Share with your doctor (sheet only; the PDF stays as it is) | To do | |
| Crumbs sheet | To do | |
| Weekly recap | To do | |
| Your photos | To do | |
| Cards library and boxes | To do | |
| Settings | To do | |
| Sign-up and Your account | To do | |
| Choosing pillars (first day) | To do | |
| Sorting thoughts and the sky | To do | |
| Friends, You, profiles, sharing, reports | To do | |
| Testers page, privacy and guidelines pages | To do | |
