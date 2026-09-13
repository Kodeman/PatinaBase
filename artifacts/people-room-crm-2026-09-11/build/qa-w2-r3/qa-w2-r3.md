# People room W2 — round 3 runtime QA (Leah, local production build)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local production build (`next build` + `next start -p 3000`),
against local Supabase (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, the W1 schema +
Okonkwo dev seed), signed in as `designer@patina.dev`. No prod touched. Port 3000 confirmed free
before start and after stop.

Env used (per the binding instructions — no `.env.local` exists in this worktree by design):
`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon/service-role keys from
`supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, service URLs pointed at localhost per
`.env.example`. Playwright ran against the already-running server
(`reuseExistingServer` — `CI` unset).

**One environment note, not a people-room finding:** `next start` printed
`⚠ "next start" does not work with "output: standalone" configuration. Use "node
.next/standalone/server.js" instead.` The server still served every route correctly for the whole
walk (built and verified against it below) — flagged for whoever owns the build config, not scored
against this feature.

## 1. What ran

- **Build**: `pnpm --filter @patina/designer-portal build` — clean, full route table printed,
  `/people` and `/api/people/chase-renewal` present.
- **Server**: `next start -p 3000` in the background — `✓ Ready in 130ms`.
- **Playwright**, `apps/designer-portal/e2e/people/` against the running server:
  `pnpm --dir <worktree> --filter @patina/designer-portal exec playwright test --config
  playwright.config.ts --project=chromium e2e/people` (run with `CI` unset so the config's
  `reuseExistingServer: !process.env.CI` picked up the server already on :3000, rather than
  starting a second one) → **10 passed, 9 failed** (full breakdown in §3).
- **Manual walk**: a small Playwright script (kept at
  `artifacts/people-room-crm-2026-09-11/build/qa-w2-r3/` is screenshots/JSON only — the script
  itself lived in scratch) signed in as the designer and drove the six Leah tasks at 1440 and 390,
  capturing screenshots, `console`/`pageerror` events and non-2xx network responses, then a few
  targeted DOM inspections to run down the automated failures to a root cause.
- **DB checks**: direct `psql` reads to confirm/deny what the UI implied (channel rows, unique
  index definition, seat rows left behind by a failed add).

## 2. Task table

| Task | Acts | Pass/fail | Evidence |
|---|---|---|---|
| 1 — Add Dana Kowalski text only | Add sheet → a sub → fill phone `(612) 555-0111` (her real, already-on-file mobile) → rule sentence → Add to the roster | **FAIL** | `task1-addsheet-after-submit-1440.png`; alert "Could not add them just now. Try again."; QA-1 below |
| 2 — Give Adaeze the app; record Chidi signs >$2,500 | Add sheet → a household member → fill name → Authority | **PASS** (once understood) | `task2-addsheet-household-1440.png`; "Nothing defaulted from the agreement." renders correctly; the Authority *field* is behind a disclosure act by design (R-J) — my first pass mis-drove it exactly as `add-sheet.spec.ts` does (QA-5) |
| 3 — Who has site access on Okonkwo right now | Open Call sheet → "Open the site access card" | **PASS** | `task3-siteaccess-1440.png` — one screen: who to call first (Luis Ochoa, then owner, then architect, then three site-only lines), the way in with no code, key holder, hours, receiving, who was told. `call-sheet.spec.ts`'s own automated assertion fails here, but on inspection the room is correct and the test is mis-scoped (QA-3) |
| 4 — Mark Frank Bauer do not contact; route to Rosa | Directory search "Frank Bauer" → open card | **PASS** | `task4-frank-card-1440.png`, `task4-directory-search-1440.png` — already seeded this way; row clause, card's Contact rule, Channels-collapsed state, and the blocked Send-a-text reason all read correctly and match SPEC's routed-line rule (email + tel-linked office phone, never a bare string) |
| 5 — Bring Dana, Pete, Ingrid, the Stonehaven rep onto Okonkwo | *(not attempted — out of scope this wave)* | **N/A** | The travel-list "Bring forward" picker is W3 scope per R-BM; W2 keeps the single-add picker. Correctly out of the acceptance list this round (task explicitly excludes `pick` from the required states) |
| 6 — Everyone on Okonkwo by role, this week | Open Call sheet | **PASS, with one confirmed defect** | `task6-callsheet-1440.png` — six bands render in the right order with the right rows (Dana in this-week, Pete in later, held/opted-out notes on collapsed rows, no "Remove", no "Build & supply"); QA-2 below is a real, narrow copy/markup bug in the band heading, not a missing feature |

Both widths were walked for Directory, Roster/Call sheet, Site access and Add (screenshots
`state-directory-1440.png` / `-390.png`, `state-roster-390.png`, `state-access-390.png`,
`state-add-390.png`, plus the pre-existing round-2 shots already in this folder from 00:2x). No
horizontal overflow at 390 on Directory or Roster (`document.documentElement.scrollWidth >
clientWidth` both `false`).

## 3. Playwright, `e2e/people/`

```
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  --filter @patina/designer-portal exec playwright test --config playwright.config.ts \
  --project=chromium e2e/people
```
10 passed, 9 failed (60.6s + retries). All of `directory.spec.ts` (7/7) and
`company-card.spec.ts` (2/2) passed. Failures, triaged against the live room:

| Spec | Failure | Root cause (confirmed) | Classification |
|---|---|---|---|
| `add-sheet.spec.ts:37` task 1 | timeout — card never appears | **QA-1**, real product bug | Product, BLOCKING |
| `add-sheet.spec.ts:103` task 2 | timeout filling `Authority` | Test fills the field before clicking "Record the authority", which is what reveals it (R-J/C20 by design) | Test bug |
| `add-sheet.spec.ts:145` trade validation | `getByRole('alert')` strict-mode: 2 matches | Matches the app's own alert **and** Next's `#__next-route-announcer__` (also `role="alert"`) | Test bug |
| `call-sheet.spec.ts:48` task 6 | `getByText('Studio side', {exact:true})` never visible | **QA-2**, real product bug | Product, MAJOR |
| `call-sheet.spec.ts:91` task 3 | first `a[data-tel-link]` is `(612) 555-0104`, not Luis Ochoa | **QA-3** — locator unscoped, matches an `inert`+`aria-hidden` background sheet | Test bug (product is correct) |
| `person-card.spec.ts:51` task 4 | `addSub` helper: card never appears | Same root cause as QA-1 (helper's hardcoded phone `(612) 555-0115` collides with the real Frank Bauer card) | Product, same as QA-1 |
| `person-card.spec.ts:111` R-V | same `addSub` helper | Same as above | Product, same as QA-1 |
| `add-client-letter.spec.ts:47`, `:115` | timeout on "A line for Dave" / "Send them the letter" | The letter-line UI is gated on the `client-invite-letter` PostHog flag (fail-closed when PostHog can't answer); this run's env only set `the-document-pilot:true` per the task's own env prescription | Environment gap, not a W2 CRM finding |

Full traces/`error-context.md` under each spec's own `test-results/` (Playwright's default location,
not copied into `qa-w2-r3/` — happy to copy specific ones on request).

## 4. Findings

| # | Severity | Confidence | Where | Finding |
|---|---|---|---|---|
| QA-1 | **BLOCKING** | High (reproduced live + DB-confirmed, 3 independent automated tests hit it) | `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx:704-728` | **Adding a sub/crew member through the Add sheet fails with a generic error whenever the typed phone or email matches a number/address already on an existing rolodex card — which is exactly Leah's task 1 scenario (a returning sub).** Sequence: `addParty` succeeds and 00626's trigger auto-links the new seat to the existing card (`party.studio_contact_id` comes back non-null — confirmed in `project_parties`: seat `7f75c7a9-…` for "QA Dana Kowalski hncfv" carries `studio_contact_id = d0e10000-…-011`, the real Dana Kowalski/Northgate Electric card). `chain.cardId` is then set to that **existing** card, but the code at line 710 unconditionally calls `addChannel.mutateAsync` with the typed phone, with no check for whether that (owner, kind, value) triple already exists. It does (the seed already carries `mobile → +16125550111` for that card), so Postgres returns `409` on `idx_studio_contact_channels_owner_kind_value`, surfaced verbatim in the console as `Error logged: AppError: duplicate key value violates unique constraint "idx_studio_contact_channels_owner_kind_value"`, and the sheet shows only `writeErrorMessage(e, "Could not add them just now. Try again.")` (line 806-807) — no indication that the seat itself was in fact written. **The seat is left on the roster (confirmed via `psql`: the `project_parties` row for "QA Dana Kowalski hncfv" persists, correctly linked, correctly `party_kind = 'sub'`), so the user sees an outright failure for a write that mostly succeeded, and — because `chain.mobileWritten` never flips true — pressing "Add to the roster" again reproduces the identical 409 for as long as the phone field is filled, with no way forward from the sheet itself except clearing the phone.** Reproduced live with a fresh, uniquely-named person (`QA Dana Kowalski hncfv`, mobile `(612) 555-0111`); also the exact mechanism behind both `person-card.spec.ts` failures, whose `addSub` helper hardcodes mobile `(612) 555-0115` — which is the real seeded Frank Bauer's number. **Fix shape:** before the `addChannel` call, check `chain.cardId`'s existing channels for a matching `(channel_kind, value)` and skip the write (treating "already on file" as success, not merely as `mobileWritten = true` without writing) rather than attempting a doomed insert; surface the collision plainly if it *is* worth telling the studio about ("Dana Kowalski already has this number on file"). |
| QA-2 | MAJOR | High (confirmed via `textContent`, and it is the literal cause of one automated failure) | `apps/designer-portal/src/components/document/section-eyebrow.tsx:14-24`, consumed by `apps/designer-portal/src/components/document/roster/roster-groups.tsx:108-118` | **Every Call sheet band heading's count is glued to the label with no separating space or element boundary**, so the real DOM text is `"Studio side2"`, `"Client side3"`, `"On the job · this week4"`, `"On the job · later17"`, `"Bidding1"`, `"Done1"` — confirmed by evaluating `textContent` directly in the running page. `SectionEyebrow` renders `{children}{count}` as two adjacent nodes inside one `<h2>` with only a flex `gap` for *visual* spacing; the visual gap reads fine (screenshot shows "STUDIO SIDE 2" apart, all-caps via CSS `uppercase`), but there is no text character between them, so no element's text is ever exactly `"Studio side"`. This breaks SPEC §5.4 #4's literal contract ("Band 'Studio side'…") and is the direct, sole cause of `call-sheet.spec.ts:48`'s failure (`getByText('Studio side', {exact:true})` times out). **Fix shape:** put the count in its own accessible unit with a real separator, e.g. render `{children}` then a literal `" "` text node (or `aria-label`d wrapper) before the count span, or move the count out of the `<h2>` entirely as a sibling with its own labelled text ("Studio side, 2"). |
| QA-3 | Minor (test-suite reliability; **product behavior is correct**) | High (DOM-inspected: the matched element is `inert` + `aria-hidden`) | `apps/designer-portal/e2e/people/call-sheet.spec.ts:111` | `page.locator('a[data-tel-link]').first()` is unscoped to the site-access sheet. When the site-access card opens on top of the Call sheet, the Call sheet's own DocSheet layer is correctly marked `aria-hidden="true"` and `inert` (confirmed live) — but a plain CSS `locator()` still matches elements inside an `inert` subtree, so `.first()` picks up a Client-side row's tel link (`(612) 555-0104`, Adaeze Okonkwo) from the dimmed background sheet, which sits earlier in DOM order than the site-access card's own list. Visually and functionally the real "Who to call first" list is correct (`task3-siteaccess-1440.png`: Luis Ochoa, then the owner, then the architect, in order, each `tel:`-linked). Recommend scoping the spec's locator to `[role="dialog"]:not([inert])` or the site-access card's own container. |
| QA-4 | Minor (test-suite only) | High | `apps/designer-portal/e2e/people/add-sheet.spec.ts:154` | `page.getByRole('alert')` matches two elements once the alert renders: the app's own `<p role="alert">` and Next's `<div id="__next-route-announcer__" role="alert">`, causing a strict-mode violation rather than a real assertion failure. The app's own alert text is correct ("A sub or an installer needs the trade they work in."). Recommend `page.getByRole('alert').filter({ hasNotText: '' }).first()` or a `data-` selector. |
| QA-5 | Minor (test-suite only) | High | `apps/designer-portal/e2e/people/add-sheet.spec.ts:117` | The test fills `getByLabel("Authority")` before the field is disclosed. By design (R-J/C20), the Authority *input* only appears after pressing the act ("Confirm from the agreement" / "Record the authority") that the "Nothing defaulted from the agreement." sentence sits beside; the test never clicks it. Reproduced live: with no click, `Authority` is not in the DOM; SPEC §5.5 #16's two branches otherwise render correctly. |
| QA-6 | Informational / carried forward, not new | Medium | `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:469` | Still open from the round-2 fix log ("What was NOT changed this pass"): `createLink.mutateAsync({ partyId })` omits `projectId`, so a field-link mint from the party sheet does not invalidate `['project-roster', …]` the way the Add sheet's own mint does. Confirmed unchanged at this line in the current HEAD. Not re-verified end-to-end this round since it wasn't in this round's briefed scope; flagging only because the task asked to re-check every prior finding as fixed or open. |
| QA-7 | Informational / carried forward, not new | Medium | `packages/supabase/src/hooks/use-studio-contacts.ts:501-536` | `usePromoteToStudioContact` still inserts `company_name` as free text with no `company_id`/affiliation (round-2 fix log's own note). In the Add sheet's own call chain this is compensated — a separate `setAffiliation.mutateAsync` call links the card to `matchedFirm.id` right after — so the sheet's own end-to-end behavior is fine; any *other*, future caller of the bare hook would not get the same compensation. |
| QA-8 | Minor / environment | Medium | console, on `/desk` immediately after sign-in, both widths | `TypeError: Failed to fetch` (session check) followed by `Error logged: AppError: Not authenticated`, on every sign-in, before navigating anywhere in the People room. Reproducible on both 1440 and 390 runs, always on `/desk` right after the auth redirect, never afterward. Looks like a session-cookie race on first paint rather than anything People-room-specific — flagging per the "check console for errors" instruction rather than asserting a cause, since it sits outside this wave's files. |
| QA-9 | Informational | High | build output | `next start` warns `"next start" does not work with "output: standalone" configuration`. The server ran and served every route correctly for the whole session; noted for whoever owns the Next config, not scored against the room. |

No hydration warnings were observed in the console at any point (only the two auth-race errors in
QA-8 and the QA-1 409/AppError pair).

## 5. Round-2 findings, re-checked

Per the fix log at `build/w2-fix-log-r2.md`: QA‑R2‑1…7, 9 and CR‑1…16 (round 2) plus the CR‑1…10
re-dispatch were all reported fixed and verified at HEAD by the fix-log's own second pass. Spot-
checked live in this round rather than retaken on trust:

- **Frank Bauer's do-not-contact + routed line** (CR‑9/QA‑R2‑3/CR-10 territory): confirmed correct
  on the real card and Directory row — clause, routed email + tel-linked office phone, Channels
  collapsed, blocked Send-a-text reason. See task 4 above.
- **Company card Paper region, order and "no paper is held" exemption** (CR‑16, C13/C21): Northgate
  Electric's card renders the fixed order (table → leading-rule clause → consequence sentence → act
  row) correctly; the blocked-things sentence is correctly *data-driven* ("Site access and the draw
  are held…" — Northgate's real seed data has no payment-blocking document lapsed, unlike SPEC's
  illustrative fixture, so the shorter sentence is correct, not a regression).
- **R‑V absent-record fallbacks**: "No grant on file.", "No closed seat on file." both render
  verbatim on Frank Bauer's card.
- Only the two new items above (QA‑1, QA‑2) and the two already-known, still-open items (QA‑6,
  QA‑7) came out of this pass — everything else briefed in round 2 held up.

## 6. Clean?

**Not clean.** One BLOCKING finding (QA‑1) and one MAJOR finding (QA‑2), both newly found this
round, both product bugs with direct evidence (live reproduction, DB state, and/or `textContent`
inspection) and each independently confirmed as the root cause of real automated-suite failures.
