# The Document: prior-art delta (August wayfinding work)

Scope: factual delta only — no recommendations. All commit hashes are from `git log` on this worktree; mark "unverified" where a live Sanity/PostHog state could not be checked from code.

## The chain of programs

| Date | Program | Artifact dir | Ruling(s) |
|---|---|---|---|
| 2026-08-13 | Early journey findings | `artifacts/doc-ux-review-2026-08-13/` | none (pre-ruling) |
| 2026-08-25 | Wayfinding Review (9 reviewers, 92 findings) | `artifacts/document-wayfinding-directions-2026-08-25/` | R124, R125 |
| 2026-08-26 | Build of Directions A + B | (same program, `build/`) | I146–I151 |
| 2026-08-28 | The Life Review (visual) | `artifacts/document-life-directions-2026-08-28/` | R126 |
| 2026-08-28/29 | The Smart Lens proposal + ruling | `artifacts/document-lens-proposal-2026-08-28/` | R127 |
| 2026-08-29/30 | Smart Lens build | `artifacts/document-lens-build-2026-08-29/` | I152 |
| 2026-09-03 | Onboarding/learning synthesis | `artifacts/designer-onboarding-learning-2026-09-03/` | R129, R130 |

**Key fact:** Direction B "The Shop Ticket" (R124/R125) was built (I149/I150) and deployed 2026-08-26, then **deleted four days later** by R127 "The Smart Lens" (2026-08-29), which replaced it with the lens band/ladder. R127's own "what R127 supersedes" section lists this explicitly.

## Promise/ruling table

| Promise/ruling | Landing commit(s) | Status today | Note |
|---|---|---|---|
| **R124** — wayfinding rulings (10 questions; B1/B2 amend I136) | `ae64147f4` | Superseded by R127 for B1/B2 | Ruling text stands as history; its deliverable (job ticket) is gone. |
| **R125** — no flags, 2 deploys, full build scope | `e539de77c` | Honored, then its deliverable superseded | "No flags" law repeated, not reversed, by R127. |
| **I146–I148** — Direction A waves (stage sentences, money ladder, ⌘K groups, mobile primary act, 390 wrap) | `chore(wayfinding): merge a1/a2/a3-*` | Largely live | F03/F07/F09/F18/F33/F49/F50/F51 confirmed fixed — see list below. |
| **I149/I150** — job ticket (Direction B "The Shop Ticket") | `0290cfb2c`/`47920a228`/`b132350cd`/`33ca84147` | **Deleted** | `job-ticket.tsx` and its test removed at `48d5b0de5` ("the lens band replaces the ticket"). Remaining `job.ticket`/`JobTicket` hits are comments/tests documenting the deletion (`table-frame.tsx:18`, `__tests__/call-sheet-doorways.test.tsx:445`). |
| **R126** — The Life Review (Ink on Paper + 3 grafts) | `2112655ef`, `543030d9f` | Live | Shadow budget confirmed at exactly 3 `doc-elevated` sites: `margin-item.tsx:74`, `studio-drawer.tsx:282`, `overlays/doc-sheet.tsx:384`. |
| **R127** — The Smart Lens (lens band/ladder; deletes job ticket, running index, shelved spine, spine timer) | `49115f1da`, `5178d7d8e`, `48d5b0de5`, `07c729f45` | Live | `lens-band.tsx` exists and is wired into `app/(document)/doc/[id]/page.tsx` (import `:176`, model built `:2337,2372`, rendered `:3005`). `components/document/spine/` now holds only `lens-ladder.tsx`. |
| **NG1** — one document at a time, no persistent global nav | n/a (no-go) | Holds | `app/(document)/layout.tsx:37-39` comment: "no zone nav, no sub-nav, no utility bar." |
| **NG2** — the shadow budget | n/a (no-go) | Holds, narrowly | `grep "shadow"` across `components/document/*.tsx` returns only test assertions of zero shadow utilities plus one explicit third-party override (`line-unfold.tsx:432`); the 3 legitimate elevation sites match R126/R127 exactly. |
| **R129** — tour's last step may act (amends R97) | `0f38b38a0`/`69cef9bbe`/`3d37524b3` | Ruled 2026-09-03 | Only the tour's final step performs a real act (opens Capture-a-Lead); the other five stay descriptive. |
| **R130** — "Show me later" third `WelcomeModal` state | same commits as R129 | Ruled 2026-09-03 | — |
| Onboarding synthesis — empty ⌘K "Help…" panel on Desk/Document | `7b9881160`, `8f6d42d71` | **Fixed in code** | `resolveIntroBlurb('designer-portal/document/desk'|'doc')` now matches real copy (`registry.test.ts:19,23`), consumed at `help/document-help.tsx:43,141`. |

**Later rulings touching R124–127:** R140 (2026-09-08) amends R126 on three narrow typography/plate/elevation points. R154 (2026-09-27) retires the ambient-motion ban R127 had reaffirmed. No ruling renumbers or voids R124/R125's *process* rulings (sequencing, no-flags law) — only R127 voids their *product*, the job ticket.

## 2026-08-13 findings — current status

Source: `artifacts/doc-ux-review-2026-08-13/03-ux-critique.md`.

1. **Orienting devices contradict each other** — no ruling closes this by name. Confirmed still true today: the 13 cross-device contradictions catalogued in `current-state.md` §2 are direct evidence (e.g. four different labels for the same Direction-stage act: `document-guide.ts:169,226`, `proposal-instruments.tsx:373,397`).
2. **Install is not a real mode** — explicitly **ruled open-by-choice**: R124 item 3 says "install stays a label on project mode, not a mode." Code confirms: `SectionKey` (`desk-derivation.ts:47`) lists `install` as a first-class union member, but at least one derivation rule (`needScheduleUnconfigured`, `desk-derivation.ts:1505-1522`) still groups it with `project` in one OR condition.
3. **Empty modules erode the document metaphor** — no ruling closes this by name.
4. **The document leaks its own machinery** — no ruling closes this by name.

## Still observable today (highest two severity tiers)

Source severity scheme used by `31-verified-findings.md`: `blocker > high > medium > low` (independent of a separate 0–1 confidence score). Of 92 findings, 6 are `blocker` and 27 are `high` (33 at the top two tiers — the document's equivalent of S1/S2). Below are the ones from that set of 33 that remain observable in code today, each with a citation; the rest were fixed or mooted by the Smart Lens rebuild (full accounting available on request, not repeated here to stay within scope).

- **F04** — ⌘K "install" has no match; nothing answers a phase-wide question. Still open-by-choice per R124 item 3.
- **F05** — FF&E lines still fall into an "Unsorted" bucket with zero rooms assigned. `components/document/schedule/line-card.tsx:505`, `schedule/add-line-sheet.tsx:62`.
- **F10** — `g`-chords are still printed nowhere on screen; `registry-shortcuts.tsx` comments confirm there is no visible "command bar is open" flag.
- **F17** — "three things called 'room'" — no wave names this closed; likely still open, unverified this pass.
- **F32** — the Worktable item-reach gap stays behind the pre-existing `worktable` flag, untouched by any wayfinding program; unverified live (flag-gated).
- **F35** — two regions both called "Schedule" — unverified this pass; no wave claims closure.
- **F52** — "MESSAGE THE CLIENT" still shown with no client linked: `letterhead-instruments.tsx:296` computes `canSendNote = Boolean(projectId || clientProfileId)`, never checking a client is actually attached — the bug is unchanged.
- **F53** — answering a client question happens off the document — unverified, no wave claims closure.
- **F54** — rooms rail is inconsistent across direction/project when the `worktable` flag is on — unverified, flag-gated, untouched.
- **F57** — FF&E spec attributes are editable only in the spec-book route, not on the paper — unverified, no wave claims closure.
- **T1 / "orienting devices contradict each other"** (2026-08-13, carried forward) — see "Still observable" item 1 above; same evidence.
- **T2 / "Install is not a real mode"** — ruled open-by-choice, still true by design (see above).
- **T5 / "empty modules erode the document metaphor"** and **T6 / "the document leaks its own machinery"** — neither is closed by any ruling found; not independently re-walked this pass.

## Onboarding synthesis (2026-09-03) — corroboration

`artifacts/designer-onboarding-learning-2026-09-03/synthesis/proposal.md` independently diagnosed the empty ⌘K "Help…" panel (both `/desk` and `/doc/[id]` resolved to "No articles for this surface yet," because both keys were excluded from the surface list) — **confirmed fixed in code**, per the promise table above. Its second finding, that "the tour teaches nouns, never an act," is **partially addressed**: R129 makes only the tour's *last* step a real act; the other five steps remain descriptive (`help/desk-walkthrough.tsx:131-229`). Its claim that ~142 of ~150 Sanity help docs were still placeholder stubs as of 2026-09-03 was **not re-verified** this pass — it depends on live Sanity state, outside repo-code scope.
