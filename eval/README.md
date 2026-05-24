# `eval/` — Laya quality gate

Cf. spec §10. This folder holds the 50-question eval set that gates the closed-beta opening.

## Files

- **`BRIEF.md`** — the packet to send to a beta tester who'll fill in the 50 questions. Self-contained: explains the corpus, the 5 categories, and how to fill the spreadsheet.
- **`template.csv`** — empty spreadsheet, 50 rows pre-numbered with the right category distribution (10 per category). Tester fills, returns, you drop the filled version back in this folder.
- **`round-2-CDI-CDD.md`** — follow-up packet sent to the first tester after his initial 11 rows showed Laya was missing CDI/CDD clarification. 5 targeted questions to verify a prompt fix actually worked. Reuse this pattern when a future tester's findings expose another specific weak spot.
- **`filled/`** — dropzone for returned spreadsheets, one per tester (`filled/admin-kodit-2026-05-XX.csv`).

## Flow

1. Send `BRIEF.md` + `template.csv` to a tester. Make sure their email is on `BETA_ALLOWLIST_EMAILS` and `NEXT_PUBLIC_APP_URL` in `BRIEF.md` §2 points to the deployed URL.
2. They fill the spreadsheet over a few sessions, return it.
3. Drop their file into `filled/`.
4. Read the qualitative findings (comment columns) **immediately** — they're more actionable than the binary verdict and can drive same-day prompt tuning. Don't wait for the full 50 to take action.
5. Hold runner scaffolding until **≥25 filled rows from 2+ testers**. With <25 rows, a quantitative pass-rate isn't statistically meaningful, but the qualitative findings already drive prompt improvements. Once the threshold is hit, scaffold Vitest + LLM-as-judge for soft criteria + exact-match for cited article refs. The CSV columns already match what the runner will need.

## Bar to open closed beta (spec §10)

1. ≥80% pass-rate on the eval set
2. 5 hand-picked testers (1 salarié, 1 RH, 1 avocat, 2 friends) say *"yes I'd use this"* after 10 min each

The CSV's `friend_verdict` column captures (2) implicitly — if every tester comes back with mostly `OK` verdicts and an unsolicited "I'd use this", that's the signal.

## Don't commit filled CSVs to a public branch

If `xkodit/Laya` becomes public later, scrub `filled/` first — friend names and unfiltered judgments aren't meant for the world.
