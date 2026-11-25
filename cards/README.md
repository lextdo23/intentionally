# Making and checking Daydeck cards

The same way every time, for a new pillar, a new mindset, or a check of the cards already in the app (agreed with
alex, 25 Nov 2026). Nothing in this folder is part of the app or reaches anyone's phone.

| File | What it is |
| --- | --- |
| `RULES.md` | Every rule for a card, with why, and who checks it. Read it first. |
| `people.json` | 48 pretend people, aged 18 to 30, with at least 6 for every mindset. |
| `check.cjs` | The checker: fit on today's card sizes, counts, words, look-alikes. |
| `report.cjs` | Builds the review page from the results. |
| `results/` | The latest results: `check.json`, and `people/<Pillar>.json` from the pretend-person check. |

## Making new cards

You (alex) are asked to look at steps 3 and 7. Nothing goes into the app until step 8, and step 8 waits for your yes.

1. **Research.** For each mindset: who picks it, what they want, and what stops them. Search for studies on what they
   want (rule D6), read each abstract or paper, and save a link plus a note of what was checked.
2. **Draft.** Write the cards from `RULES.md` into a draft file shaped like `card-review/rounds/*_final.json`
   (`{ "pillar", "mindsets": [...], "cards": [{ id, size, for, card, why, src, chk }] }`). Each card is tied to one study
   that tested that exact task.
3. **alex checks the plan:** the mindsets, plus who / wants / stops for each, before any cards are shown.
4. **Pretend-person check.** Add people to `people.json` for any new mindset until it has at least 6, each with a
   different life outside it (work or study, living situation, money, health, culture, faith, sexuality and gender,
   and mood: good weeks as well as flat ones). Each person reads every card they'd be dealt, as part of a hand of
   three, and answers only: *does this make sense for the pillar and mindset I chose?* Whether they could do it today
   doesn't matter, because the other two cards in the hand cover that (alex, 25 Nov). Look for **splits**: a card
   that clicks for some of the group but not for others, because of something in their life. Write each split to
   `results/people/<Pillar>.json` (`{ card, missed: [ids], why, fix }`). Then rewrite the card, or keep it and note
   why, if a rewrite would make it worse for everyone else.
5. **Study second look.** A fresh read of every why line against its study: does it only say what the study did and
   found (rules D3 to D5)?
6. **Checker.** `node cards/check.cjs drafts.json` (about 1 to 2 minutes). Fix every problem. Look at every warning.
7. **alex reviews** the page made by `node cards/report.cjs /mnt/project-files/card-system/card-check.html`, published
   as an Artifact: each card at real size, with what the pretend people said and what the checker found.
   Keep / Change / Cut, in rounds as before. Cards alex keeps aren't rated again.
8. **Build, only after alex says yes.** The cards go into `js/cards-data.js`, keeping every old number (a retired card
   keeps its row with a 1 at the end, so tester data still reads). New numbers carry on from the last one. Then
   rerun `node cards/check.cjs` on the live cards, run the app's tests, and bump `VERSION` in `sw.js`.

## Checking the cards already in the app

    node cards/check.cjs                          # all live cards, about 1.5 minutes
    node cards/report.cjs /mnt/project-files/card-system/card-check.html

Rerun the checker whenever a card's look or size changes: it measures the app's own card each time, so it never
relies on a remembered size. Rerun the pretend-person check when cards or mindsets change, or when testers' thumbs
or "Not for me" answers point at a card.

## About the pretend people

They're Claude playing a person. They're good at catching cards that drift from the mindset, assume something about
someone's life, or don't suit a uni student. What they can't tell us is what real people will actually do. That's
what tester data is for.
