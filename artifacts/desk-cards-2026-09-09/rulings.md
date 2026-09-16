# Desk project cards — rulings (Kody, 2026-09-09)

Interview conducted against the panel proposal "Three Cards for the Desk"
(`three-cards-for-the-desk.html`, artifact d822749c). Each ruling was taken one at a time with a recommendation;
"(rec)" marks where Kody took the recommendation.

| # | Question | Ruling |
|---|---|---|
| D1 | Which card shape | **Hybrid**: Claim cards on top for jobs with a need; Ledger-style aligned rows for at-rest jobs beneath. |
| D2 (R2) | Replace the roster or a third facet | **Replace, one rendering** (rec). No view switcher. Facets stay: "Only what needs me" hides the ledger; "By person" regroups both halves by assigned designer. |
| D3 (R3) | Rank or mark | **Rank by need** (rec): bands your pen + overdue → your pen → with the client → with the maker; oldest need first within a band; ties on name. The reason is printed on the card. |
| D4 (R4) | Card edge | **Add one boundary grey** (~3:1 on paper, near #8F8C88) — amends "no new token" once. |
| D4a | Scope of the grey | **Claim cards only** (rec). Ledger rows keep the existing hairline. |
| D5 (R1) | Which jobs earn a card | **Needs only** (rec) — `mark !== null` in the shipped derivation. In-motion chips and quiet jobs are ledger rows. |
| D6 | Custody word for the 10 unowned need kinds | **Default to "Your pen"** (rec); fill `owner` in the need table in code, never guess at render. |
| D7 | The day's line | **Quotes the top three cards in rank order** (rec), plus an answered client note (≤24h) as a fourth line. |
| D8 | At-rest ledger grouping | **Under the seven stage plates** (rec); headings never fold. Columns: mark ring · name with person · phase beneath · in-motion sentence · its date · Open. |
| D9 | Wave-1 a11y fixes | **Yes** (rec): roster mark → `-ink` pigments; portal focus ring `--color-clay` → clay-ink. Own commit, first. |
| D10 | Hit model | **Upper block, 88px** (rec): custody row + name + person line is one link zone (text stays selectable above the overlay); act is a full-width 44px band below. |
| D11 | Program end | **Build, verify, ship to prod** (rec); then Kody's signed-in walk. |
| R5 | Amend the rules in writing | Yes — the 2026-08-26 "never a card" rule and "no new token" are amended in `docs/design/the-document/DECISIONS.md` in wave 1. |

Assumptions confirmed with the rulings: 390px reflow = day's line first, cards single column, ledger rows stack to
name / state / act (closes the unbuilt 390 Desk reflow); boards rail, studio index, footer untouched; work from
origin/main in a fresh worktree (local main checkout is 88 commits stale).
