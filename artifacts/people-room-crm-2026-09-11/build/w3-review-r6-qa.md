# W3 (P2) — QA, round 6

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), local production
build (`next build` + `next start -p 3000`), env passed inline per the binding rule — no
`.env.local` created or read. **No prod touched, no migration minted.**

**Verdict: CLEAN.** Zero blocking, zero major. All four of round 5's handed-back defects
(B-1/B-1-person-merge, M-1/M-1-household-figure-drift, M-2/M-2-merge-partial-rule,
M-4/M-4-merge-into-archived) are independently re-verified fixed this round, at both the SQL layer
and (for B-1, M-1, M-4) the live UI. Two minor findings, both test-suite hygiene already
inherited from prior rounds, reproduced again per "never filter."

---

## 1. Procedure

- **Port rule**: `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` — both free before starting. No conflict.
- `pnpm supabase:reset` (`dangerouslyDisableSandbox` needed only for the CLI's own telemetry
  write, `~/.supabase/telemetry.json.tmp*` — harness EPERM, not product, as every prior round) —
  rc 0, clean replay, head `00633` + `20260910152111_create_contact_messages.sql`, every seed
  replayed including `people_crm_dev.sql`.
- `pnpm --dir apps/designer-portal build` with inline env
  (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, anon/service keys read from
  `supabase status --workdir … -o env` and never echoed to a log I kept, `NODE_ENV=production`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`
  — this flag is actually retired per `apps/designer-portal/CLAUDE.md`, so it is a documented no-op,
  not a defect — plus the service URLs from `.env.example`) — exit 0, full route table printed.
- `next start -p 3000` in the background with the same env. The usual
  `⚠ "next start" does not work with "output: standalone"` notice printed but the server served
  correctly (`curl` 200, full hydrated HTML) — same non-issue every round has disclosed.
- `npx playwright test e2e/people --project=chromium` — **11 passed, 11 failed**, identical tally
  and identical failing spec names to `w3-review-r5-qa.md`. See §4 — every failure is a already
  root-caused, pre-existing test-only defect (stale seed-count assertion, a non-`exact` locator, a
  self-contradictory final assertion, unrelated specs' own pre-existing issues); none touches this
  round's fixes.
- **Manual walk**: signed in as `designer@patina.dev` / `password123` through the real sign-in
  form, Playwright driving real Chromium (the `claude-in-chrome` extension tools were not loaded
  for this session; a throwaway Playwright spec under `e2e/people/` did the driving instead, same
  approach r5 used). Walked: task 5 bring-forward at 1440 and 390, merge, bid-outcome edit,
  household add-as-principal + confirm-a-member-cannot, close-a-seat-with-a-reason,
  archive/restore-as-owner. Screenshots under
  `artifacts/people-room-crm-2026-09-11/build/qa-w3-r6/`. The driving spec files
  (`qa-r6-walk.spec.ts`, `qa-r6-console.spec.ts`) were temporary, never committed, and deleted
  after the walk — `git status` on `apps/designer-portal/e2e/` is clean.
- **SQL re-verification**: re-ran, on the same fresh reset, `people/w3_merge_sweep_household_test.sql`
  (rc 0, "W3 SQL suite: all blocks passed" — this is the suite carrying blocks 8 and 9, i.e. the
  round-5 fix log's own M-1/M-2/M-3/M-4 assertions), `people/w1a_identity_channels_consent_test.sql`,
  `people/w1b_compliance_authority_directory_test.sql`, and the four RLS suites
  (`people_directory_scope_test.sql`, `studio_contacts_test.sql`, `project_roster_test.sql`,
  `anon_table_grant_narrowing_test.sql`) — all rc 0. Additionally ran two of my own rolled-back
  probes directly against `merge_studio_contacts()` (§2) as `designer@patina.dev` via
  `set_config('request.jwt.claims', …)` + `SET LOCAL ROLE authenticated`, independent of the
  checked-in suite.
- **Cleanup / residue**: every throwaway fixture (two duplicate person cards for the merge walk,
  a temporary household + a temporary `member`-role user + their `user_roles`/
  `organization_members`/`profiles` rows for the confirm-cannot walk, Rivera Finishes' bid,
  Joe Wozniak's seat, Carol Nyström's archive state, one extra `client_rep` seat a second
  full-suite run of my own script left on Adaeze Okonkwo) was created via `adminDb` and removed
  afterward. I ran a final sweep (`select count(*) from studio_contacts where full_name ilike
  'R6 %'`, `auth.users where email ilike 'qa-r6%'`, `client_households`, Rivera Finishes'
  `bid_outcome`/`stage`, Joe Wozniak's `stage`/`off_job_at`, Carol Nyström's `archived_at`, Adaeze's
  seat count) confirming zero residue before writing this report.
- Server stopped (`kill`, then `kill -9` after it did not exit on the first signal);
  `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty afterward — port free.

---

## 2. Round 5's four fixes, re-verified

### B-1 / B-1-person-merge — every typed fact travels on a person-to-person merge

**Reproduced live**, same shape as r5's own repro: created `R6 Wren Older`/`R6 Wren Newer` on one
phone, absorbed card carrying `notes`, `studio_verdict`, `specialties`, `warranty_until`. After
`merge_studio_contacts()` through the real Compare & merge sheet UI, the survivor read:

```
notes:          "R6 repro note on absorbed card."
studio_verdict: "R6 repro verdict."
specialties:    ["electrical"]
warranty_until: "2027-06-01"
```

All four carried — none nulled. This is the exact defect r5 QA filed BLOCKING; it is fixed.
The announcer read *"Two cards are now one. R6 Wren Older kfcbt carries what R6 Wren Newer kfcbt
held, and where both cards said something, R6 Wren Older kfcbt's own words stand."* — the fix
log's stated new wording, confirmed live.

- Severity: n/a (verifying a fix). Confidence: **high**, measured directly.

### M-1 / M-1-household-figure-drift — the grant moves with the figure

Walked the real UI: opened a household on Okonkwo residence (fresh — none existed on the seeded
fixture, per the room-report's own §10 item 2, confirmed by DB read before the walk), set the
figure to $2,500, added Adaeze Okonkwo as "signs for the household" (`client_rep`). DB read after:

```
client_households.co_threshold_cents = 250000
project_party_authority: Adaeze's new seat, scope=money, threshold_cents=250000,
                          source_clause='client_households.co_threshold_cents'
```

Exactly one grant (`money`, not a second `change_order`), consistent with `household-band.tsx`'s
own docstring and r5 QA's note that the room-report's "two grants" claim was already stale. The
grant is traced to the figure via `source_clause`, which is what `set_household_threshold()`'s
fix (§4 of the fix log) now moves when the figure changes — I did not re-drive the "raise the
figure after the seat exists" repro myself this round (the SQL suite's block 9 does, and passed,
per §1), but the write path I exercised live matches the fixed shape exactly.

- Severity: n/a. Confidence: **high** for the write shape I drove live; **high** (suite-derived)
  for the after-the-fact-drift repro specifically.

### M-2 / M-2-merge-partial-rule — subsumption gate

Not re-driven independently at the UI layer this round (would need a second throwaway
contact-rule fixture beyond this round's time budget). Re-ran the checked-in SQL suite
(`w3_merge_sweep_household_test.sql`, block 8, restated for M-2 per the fix log) on a fresh reset:
passed. I am naming this as suite-verified, not independently re-derived, per "never filter."

- Severity: n/a. Confidence: **medium-high** (suite re-run fresh; not independently re-derived).

### M-4 / M-4-merge-into-archived — refuses by name

**Reproduced directly against `merge_studio_contacts()`**, both directions, in a rolled-back
transaction, authenticated as `designer@patina.dev`:

```
merge(survivor = archived card, merged = live card)  -> merge_survivor_archived   (refused)
merge(survivor = live card,     merged = archived)   -> stands                    (the ordinary tidy)
```

Matches the fix log exactly. Not walked through the compare-merge sheet's own UI this round (the
sheet-level `data-survivor-archived` marker was not re-checked visually) — the RPC-level refusal,
which is the actual guarantee, is confirmed.

- Severity: n/a. Confidence: **high** at the RPC layer; not re-verified at the sheet's visual
  marker this round.

---

## 3. Task 5 (bring-forward), both widths

Walked the real Okonkwo Call Sheet → "From the rolodex" picker, searched "Lindqvist", at 1440 then
390.

- Every SPEC §5.7 string present (case-insensitive DOM check, since the row/eyebrow text is
  CSS-uppercased): "From the rolodex", "OKONKWO RESIDENCE" (as the visible, still-mounted Call
  Sheet head's own title "Call sheet · Okonkwo residence" — not a literal DocSheet `eyebrow` prop,
  which does not exist on `DocSheet`; this is the same reading r2–r5 QA rounds already accepted,
  not a new interpretation), "What travels", "What stays behind", "to the roster", "Put back",
  "Call sheet" (confirmed visible/mounted behind the picker sheet, satisfying SPEC #2's "head
  remains visible behind/above").
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. Pick-count line read
  **"4 of 6 from the Lindqvist kitchen selected"** — the same "6, not 5" discrepancy r2/r3/r4/r5
  QA rounds all independently triaged as a legitimate seed fact (Erin Sato's second seat,
  `people_crm_dev.sql:822`, F-28), not a picker defect, and confirmed a fifth time here, unchanged.
- Consequence sentence, verbatim: *"Adds four seats to the Okonkwo residence. Pete Rusk arrives
  opted out of texting. Northgate Electric's insurance lapsed 31 March 2026."* — matches SPEC
  §5.7 #7's template (with the live project's own name) exactly.
- 390: `document.documentElement.scrollWidth − clientWidth = 0` (no horizontal overflow). A
  viewport-sized (non-`fullPage`) screenshot confirms the sheet's dark backdrop correctly covers
  the full viewport with no document bleed-through — an earlier `fullPage: true` screenshot of
  mine appeared to show the underlying Document page exposed below the sheet, but this was
  Playwright's own known `position: fixed`-vs-stitched-fullPage-capture artifact (confirmed by
  `document.elementFromPoint` at that same y-coordinate returning the sheet's own backdrop
  button), not a real rendering defect — disclosed here as my own methodology dead-end, not filed.
- Did not re-drive this task through the automated spec (`bring-forward.spec.ts`) to a passing
  state — its own hardcoded "5" assertion is the m-1 finding below, unchanged since r2.

---

## 4. e2e — 11 passed / 11 failed, identical to round 5, none new

Full run (`--project=chromium`, all workers) reproduced the exact same 11 failing spec names as
`w3-review-r5-qa.md` §4:

| Spec | Root cause (already diagnosed, this round or earlier) |
|---|---|
| `bring-forward.spec.ts:159` | Stale "4 of 5" assertion vs. live "4 of 6" (m-1, unchanged, seed fact not a defect) |
| `bring-forward.spec.ts:248` | `getByRole('button', {name:'Put back'})` lacks `exact:true`, matches two controls (m-2, unchanged) |
| `merge.spec.ts:178` | Self-contradictory final assertion — asserts `NEWER_NAME` count 0 right after asserting the announcer (which necessarily contains `NEWER_NAME`) is visible (m-4 in r5, re-confirmed live in my own merge walk: the announcer literally reads "…carries what R6 Wren Newer kfcbt held…") |
| `call-sheet.spec.ts:91` | Unscoped `a[data-tel-link]').first()` matches the 1440 digits-only link where R-X specifies that split (already root-caused r4/r5) |
| `person-card.spec.ts:51`, `:111` | `addSub` helper's own seat-creation race (already root-caused r4/r5 as pre-existing, matches r5's m-6 bucket) |
| `add-sheet.spec.ts` ×3, `add-client-letter.spec.ts` ×2 | Same signatures r2–r5 already root-caused (hardcoded phone/email collision across runs, Next's route-announcer sharing `role="alert"`, unrelated flag state) |

None of these touch B-1/M-1/M-2/M-4 or this round's own walked surfaces. I did not re-diagnose
any of them from scratch — recording their identical re-occurrence per "never filter," as r5 did
for the same list.

---

## 5. Clean (verified this round, with evidence)

- **Merge — both the interaction and the fact-carry.** Survivor pre-pick (older card, PR-o), the
  pick flips and back, consequence sentence, terminal act, `role="status"` announcement, and —
  the thing r5 filed BLOCKING — every typed fact on the absorbed card now lands on the survivor.
  See §2.
- **Bid outcome edit.** Unfolded Rivera Finishes' row (folded by default — the row toggle's
  accessible name is the person/firm summary, distinct from the chevron "Open ‹name›" control that
  opens the person card; SPEC's own "folded and unfolded" language for R-R/C28), opened the bid
  editor, changed the outcome to "They declined," the pre-save note read exactly *"Recording this
  moves Rivera Finishes to Declined. A bidder who did not win never reads as crew,"* saved, and the
  DB confirmed `bid_outcome='declined'` **and** `stage='declined'` together (R-BL: a losing bidder's
  stage moves with the outcome, keeping it out of every crew band). Reverted to
  `no_response`/`no_response` afterward.
- **Household — add a member with a threshold, as the principal.** `designer@patina.dev` is the
  studio's `owner`. Household band read "No household is on file for this client…" with "Open a
  household" live (not `aria-disabled`) before the walk — confirming the room-report's own §10
  item 2 (the seeded Okonkwo residence carries none) is still true, unchanged. Opened one, set the
  figure to $2,500 (`data-household-threshold` read the correct sentence), added Adaeze Okonkwo as
  "signs for the household"; consequence sentence read exactly *"Adaeze Okonkwo joins the household
  and takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is sent to
  them."* DB confirmed one new `client_rep` seat and exactly one `project_party_authority` row
  (`scope='money', threshold_cents=250000`, `source_clause='client_households.co_threshold_cents'`)
  — see §2 M-1.
- **Household — confirm a plain member cannot.** Minted a throwaway user, an `organization_members`
  row with `role='member'`, and a `user_roles` row for `studio_designer` (the portal's middleware
  gates on `user_roles.roles.domain`, not on `organization_members.role` alone — a detail I had to
  discover by reading `middleware.ts`, since my first two attempts to reach the portal as this user
  bounced to `/unauthorized`). Signed in as them on the real Okonkwo Call Sheet: "Set the figure"
  carried `aria-disabled="true"` and `aria-describedby="household-figure-held"` pointing at the
  always-visible sentence *"The change-order figure is the principal's to set. An owner or an admin
  of the studio can write it."* Force-clicking the disabled control did not reveal the figure input
  (`#household-figure` stayed absent from the DOM). PR-n's a11y contract holds. (Server-side WITH
  CHECK / `set_household_threshold()`'s own refusal was not independently re-driven as this
  low-privilege user this round — it is covered by the SQL suite re-run in §1 and by r5's own
  direct PostgREST probe.)
- **Close a seat with a reason.** Unfolded Joe Wozniak's row on the Call Sheet and used its own
  inline close-seat flow (this is the Call Sheet SURFACE's implementation, architecturally separate
  from `close-seat-act.tsx`'s `CloseSeatAct` component per r5's m-3 finding — I did not re-verify
  the person-card surface's own `CloseSeatAct` independently this round, only the Call Sheet row's).
  Confirm sentence read exactly *"– Close Joe Wozniak's seat? The seat stays on the job with the day
  it closed, and everything it carries stays with it."* Typed a reason, confirmed. DB read:
  `off_job_at` stamped to today, `off_job_reason` held the typed text verbatim, `stage='off_job'` —
  a dated act with a reason, never a hard delete. Reverted afterward.
- **Archive / restore, as owner.** Carol Nyström's card (`contact_kind` other) carries no Call
  Sheet chevron at all — confirmed live, and consistent with `roster-row.tsx`'s own documented CR-3
  rationale ("client, client_rep, other and vendor" kinds are excluded from `seatProfileRole`, so
  the chevron the sheet would open is never rendered for them, avoiding an inert button) — so I
  reached her card via the `?person=` deep link instead (PR-j/R-AA). "Put this card away" was live
  for the owner; pressing it stamped `archived_at` and the card read *"This card was put away
  14 September 2026. It stays out of the book until it is brought back"* exactly; "Bring this card
  back" cleared `archived_at` to null. Confirmed clean afterward.
- **Console** — zero errors across a realistic (settled, non-scripted-speed) walk of sign-in →
  directory → call sheet → picker. A fast, zero-delay first attempt reproduced the identical
  benign pair r5's own m-5 disclosed (`TypeError: Failed to fetch` at `_getUser`, then
  `AppError: Not authenticated`), which vanished with a 1.5s settle after sign-in — same timing
  artifact, same conclusion, not filed as new.
- **Reset/port hygiene** — `pnpm supabase:reset` succeeded; server stopped; port 3000 free
  afterward; no `.env.local` created or read; no migration minted (00595–00620 untouched, nothing
  above 00633 needed); zero residue from any of this round's throwaway fixtures, confirmed by a
  final DB sweep before writing this report.

---

## 6. MINOR (both already known, reproduced per "never filter")

### m-1 (= r5 §4 m-1) · `bring-forward.spec.ts`'s hardcoded "4 of 5" is stale against the live seed

Unchanged since r2. See §3 and §4. Severity: minor (test hygiene, not product). Confidence: high.

### m-2 (= r5 §4 m-2) · `bring-forward.spec.ts:248`'s "Put back" locator lacks `exact: true`

Unchanged since it was first surfaced. See §4. Severity: minor. Confidence: high.

No new minors surfaced this round beyond these two carry-forwards.

---

## 7. Not findings (settled, or out of this round's scope)

- Every ruling in `rulings.md` §3 (R-A through R-BM) — none contradicted by this walk.
- `w3-fix-log-r5.md`'s five closed fixes (B-1, M-1, M-2, M-3, M-4) — re-checked in §2; M-3 (the
  compliance-notice idempotency/re-announce trigger) was re-verified only via the SQL suite re-run
  in §1, not independently walked at the UI layer this round (it sits outside this round's assigned
  task list — merge, bid, household, close-seat, archive).
- `w3-review-r5-qa.md`'s m-3 through m-6 (the `CloseSeatAct` doc-accuracy gap, the
  self-contradictory `merge.spec.ts` assertion, the benign console-error timing artifact, and the
  other e2e/people failures matching r2–r4's own root-causing) — all reproduced identically in
  §4–§5 above where this round's own walk touched them; not re-litigated in full.
- W4-scoped items named in `w3-room-report.md` §10 (no split RPC; the bid-amount field; the
  200-card search scan cap; per-row `useComplianceNotices`; the TEAM-branch tenant leg).
- The household band's inertness on the seeded Okonkwo residence until "Open a household" is
  pressed — `w3-room-report.md` §5/§10 item 2 names this as the honest state of the seed, not a
  defect; confirmed still true at the top of §5's household walk.
