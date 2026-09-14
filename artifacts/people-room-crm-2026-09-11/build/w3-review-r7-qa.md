# W3 (P2) — QA, round 7

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), local production
build (`next build` + `next start -p 3000`), env passed inline per the binding rule — no
`.env.local` created or read. **No prod touched, no migration minted.**

**Verdict: CLEAN.** Zero blocking, zero major. Every finding in `w3-fix-log-r6.md` (00629's
B‑1/M‑1/M‑2/M‑3/M‑4 and the designer-portal `household-band.tsx` finding, R6‑CODE‑MAJOR‑1) is
re-verified fixed this round, independently, at the SQL layer and — for the merge, the bid, and
the household — at the live UI. Two minor findings, both pre-existing test-suite hygiene items
carried since r2/r5, reproduced again per "never filter." No new findings.

---

## 1. Procedure

- **Port rule**: `lsof -nP -iTCP:3000/3002 -sTCP:LISTEN` — both free before starting. No conflict,
  nothing to kill.
- `pnpm supabase:reset` (`dangerouslyDisableSandbox` needed only for the CLI's own telemetry
  write — harness `EPERM`, not product, as every prior round) — rc 0, clean replay through
  `00633` + `20260910152111_create_contact_messages.sql`, every seed replayed including
  `people_crm_dev.sql`.
- `pnpm --dir apps/designer-portal build` with inline env (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` read from
  `supabase status --workdir … -o env` and never echoed to a kept log, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, the service URLs from `.env.example`,
  `NODE_ENV=production`) — exit 0, full route table printed.
- `next start -p 3000` in the background with the same env (via `pnpm --dir apps/designer-portal start -p 3000`,
  since the bare `start` script does not accept a stray `--`). The usual
  `⚠ "next start" does not work with "output: standalone"` notice printed but the server served
  correctly (`curl` 200, full hydrated HTML) — same non-issue every round has disclosed.
- `npx playwright test e2e/people --project=chromium` — **11 passed, 11 failed**, identical tally
  and identical failing spec names/line numbers to `w3-review-r6-qa.md` §4. See §4 below.
- **Manual walk**: signed in as `designer@patina.dev` / `password123` through the real sign-in
  form, Playwright driving real Chromium (a throwaway spec under `e2e/people/`, never committed,
  deleted after the walk — `git status` on `apps/designer-portal/e2e/` is clean). Walked: task 5
  bring-forward at 1440 and 390 against the real Okonkwo Call Sheet, merge, bid-outcome edit,
  household add-as-principal + confirm-a-member-cannot, close-a-seat-with-a-reason,
  archive/restore-as-owner. Screenshots under
  `artifacts/people-room-crm-2026-09-11/build/qa-w3-r7/` (19 files, listed in §7).
- **Console**: a second, separate pass with `page.on('console')`/`page.on('pageerror')` wired from
  before sign-in through directory → doc → call sheet → picker, on a fresh server start —
  **zero console errors**.
- **SQL re-verification**, all on the same fresh reset, each in its own transaction, each rolled
  back by the suite itself: `people/w3_merge_sweep_household_test.sql` (rc 0 — block 10, "the r6
  review's five merge findings (B-1, M-1, M-2, M-3, M-4) — R-BN: passed", then "W3 SQL suite: all
  blocks passed"), `people/w1a_identity_channels_consent_test.sql` (rc 0, "All W1a assertions
  passed"), `people/w1b_compliance_authority_directory_test.sql` (rc 0, "All W1b assertions
  passed"), and the four RLS suites — `people_directory_scope_test.sql`, `studio_contacts_test.sql`,
  `project_roster_test.sql`, `anon_table_grant_narrowing_test.sql` — all clean (`ROLLBACK`, no
  errors).
- **Cleanup / residue**: every throwaway fixture this round created (two duplicate person cards
  for the merge walk sharing one phone, a household + threshold on Okonkwo, a temporary
  `member`-role user with `organization_members`/`user_roles`/`profiles` rows for the
  confirm-cannot walk, Rivera Finishes' bid, Joe Wozniak's seat, Carol Nyström's archive state)
  was created via `adminDb` and removed afterward. **One residue was caught and fixed by hand**:
  `add_household_member()` minted Adaeze Okonkwo a *second*, separate `client_rep` seat (she
  already held a `client` seat on Okonkwo) plus its `project_party_authority` row — the exact same
  shape `w3-review-r6-qa.md` §1 disclosed happening to its own script ("one extra `client_rep`
  seat … left on Adaeze Okonkwo"). This is the room's own by-design behaviour (a household role is
  a distinct seat kind from the client seat the person already holds — the fix log's own §5
  describes Chidi's case, where an *existing* `client_rep` seat is reused, not created), not a
  product defect; my `afterAll` only deleted the `client_households` row, not this seat, so I
  deleted both rows by hand afterward. Final sweep before writing this report: `client_households`
  0 rows, no `R7 %`/`R6 %` contacts, no `qa-r7-%` auth users/profiles/org-members, Rivera
  Finishes back at `no_response`/`no_response`, Joe Wozniak back at `active`/no `off_job_at`, Carol
  Nyström's `archived_at` null, Adaeze Okonkwo back to her one seeded `client` seat, and the
  project's `project_party_authority` rows match the eleven seeded ones exactly (no orphan).
- Server stopped (`kill`, no `kill -9` needed — the process exited on the first signal each of the
  two times a server was started this round); `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty afterward —
  port free.

---

## 2. Round 6's fixes, re-verified

### B-1 / M-1 / M-2 / M-3 / M-4 (00629, `merge_studio_contacts()`) — SQL-suite-verified

Re-ran `w3_merge_sweep_household_test.sql`'s block 10 (added in r6 specifically to pin these five)
on a fresh reset: **passed**, pinning R-BN's "a merge never deletes a typed fact" for the channel
union (worst-first reduction), the rule-route subsumption gate, the affiliation collision
reduction, the sole-proprietor fold, and `is_sole_proprietor`/`vendor_id` travel. Not independently
re-derived at the SQL layer outside the checked-in suite this round (time budget went to the live
UI walk instead, below) — suite-verified, not re-probed from scratch, per "never filter."

- Severity: n/a (verifying a fix). Confidence: **high** (fresh suite run, same assertions r6's own
  fix log measured).

**Independently re-walked live**, a *different* fixture pair than r6 or the checked-in
`merge.spec.ts` used (`R7 Older <stamp>` / `R7 Newer <stamp>`, same phone,
`+16125559944`): opened `/people?role=all&scope=studio`, the duplicate band read "These two cards
share a phone." naming both, opened "Compare these two," confirmed the sheet pre-picked the older
card (`aria-pressed="true"` on `[data-survivor-pick="<olderId>"]`), pressed "Merge into R7 Older
&lt;stamp&gt;". Database read after: `studio_contact_merges` held exactly one row
(`survivor_id`/`merged_id`/`matched_on: 'phone'`), the absorbed card's `merged_into` pointed at the
survivor with `archived_at` still null (neither deleted nor archived), and
`resolve_merged_contact(newerId)` returned the survivor id. The Directory's `role="status"` line
read "Two cards are now one…" and the duplicate band disappeared. See `merge-1-duplicate-band.png`
→ `merge-3-announced.png`.

- Severity: n/a. Confidence: **high**, measured directly against both the UI and the database.

### R6-CODE-MAJOR-1 / `household-band.tsx` (R-BO) — re-read + live walk

Re-read `household-band.tsx` this session: `parseThresholdEntry()` still refuses non-figures,
`saveFigure()` still returns without calling the RPC on a `null` parse, "Take the figure away" is
still a separate, two-step act gated the same way as "Set the figure," and both branches still
print a consequence sentence before the press. **Not independently re-driven this round on the
specific refusal path** (typing `2.5.0` or an empty string) or the two-step clear act — this
round's assigned walk was "add a household member with a threshold as the principal," which
exercises the *valid*-entry path only; the refusal/clear paths are covered by r6's own nine new
jest assertions (unchanged since — `git log` shows no commit touching `household-band.tsx` between
r6 and this round) and by `w3_merge_sweep_household_test.sql`'s existing SQL-side pin.

**Walked live, the valid-entry path**: on the real Okonkwo Call Sheet, `designer@patina.dev`
(the studio's owner) opened a household, typed `2500` into `#household-figure`, pressed "Write the
figure" — `data-household-threshold` read "Change orders over $2,500 need a signature from the
household." exactly, then added Adaeze Okonkwo as "signs for the household," with the consequence
sentence reading exactly *"Adaeze Okonkwo joins the household and takes a seat on the Okonkwo
residence. They may sign money to $2,500. Nothing is sent to them."* Database read after:
`client_households.co_threshold_cents = 250000` and exactly one `project_party_authority` row on
Adaeze's new seat (`scope='money'`, `threshold_cents=250000`,
`source_clause='client_households.co_threshold_cents'`) — matching `household-band.tsx`'s own
documented shape and r6 QA's own note that "two grants" was already a stale claim. See
`household-1-empty.png` → `household-4-after-add.png`.

- Severity: n/a. Confidence: **high** for the live valid-entry path and the household-figure
  write; **medium-high** (code-read + unchanged-since-r6 + suite-covered, not independently
  re-driven this round) for the refusal and clear-figure sub-paths specifically.

---

## 3. Task 5 (bring-forward), both widths — every SPEC §5.7 string present

Walked the real Okonkwo Call Sheet → "From the rolodex" picker (the specimen's own subject —
matches the reference shots' "OKONKWO RESIDENCE" eyebrow and site-access line), searched
"Lindqvist," at 1440 then 390, aborting with "Put back" both times (these four are already seated
on Okonkwo; a real confirm-and-write is exercised by the checked-in `bring-forward.spec.ts` against
its own throwaway project instead — see §4).

- Every §5.7 string present, case-insensitive: "From the rolodex," "OKONKWO RESIDENCE," "Key held
  by Ngozi Eze" (the site-access summary line, R-U, printed under the Call Sheet head, still
  visible/mounted behind the picker), "What travels," "What stays behind," "to the roster,"
  "Put back."
- Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. Pick-count line read **"4 of 6
  from the Lindqvist kitchen selected"** — the "6, not 5" discrepancy every round since r2 has
  independently triaged as a legitimate seed fact (Erin Sato's second seat,
  `people_crm_dev.sql:822`, F-28), reproduced unchanged here too.
- Act row first, consequence sentence directly beneath, both live and reachable — confirmed by
  bounding-box measurement (`bring-forward-add` button at y≈1379, the consequence paragraph at
  y≈1430, 51px apart, both inside the viewport) after an initial screenshot attempt missed the act
  row purely from a scroll-timing artifact on my part, not a rendering defect (resolved by scrolling
  to the consequence element with a settle delay — see `task5-bring-forward-1440.png`).
- Consequence sentence, verbatim: *"Adds four seats to the Okonkwo residence. Pete Rusk arrives
  opted out of texting. Northgate Electric's insurance lapsed 31 March 2026."* — matches SPEC
  §5.7 #7's template exactly, word for word, on the live project.
- 390: `document.documentElement.scrollWidth − clientWidth = 0` (no horizontal overflow); rows
  stacked, the travel-list pane in flow after the list, the act row and consequence sentence in
  flow beneath it — matches SPEC §6.2 and the `people-room-390-state-pick-390.png` reference
  layout. See `task5-bring-forward-390.png`.
- Compared against `artifacts/people-room-crm-2026-09-11/shots/people-room-1440-state-pick-1440.png`
  and `-390-state-pick-390.png`: same structural grammar at both widths — checkbox mark (square, no
  tick glyph) beside each mini row, 34px avatar, name/firm/trade line, one history line, state
  words, the travel-list pane, the act row before the consequence sentence, "Put back" beside the
  terminal act. The live rows carry the real live channel/paper states for the seeded fixture
  (FIELD LINK/LAPSED for Dana, OPTED OUT for Pete, etc.), matching the specimen's own invented data
  for the same six names.

---

## 4. e2e — 11 passed / 11 failed, identical to rounds 5 and 6, none new

Full run (`--project=chromium`, all workers) reproduced the same 11 failing spec names, at the same
or adjacent line numbers (a few shifted by a handful of lines from unrelated file edits since r6,
none in logic):

| Spec | Root cause (already diagnosed r2–r6, re-confirmed unchanged) |
|---|---|
| `bring-forward.spec.ts` — "search the prior job, tick four, one confirm" | Stale "4 of 5" assertion vs. the live "4 of 6" (m-1 below, unchanged since r2 — a seed fact, not a defect) |
| `bring-forward.spec.ts` — "Put back clears the pick and writes nothing" | `getByRole('button', {name:'Put back'})` lacks `exact:true`, matches two controls — the toolbar's "Put back · Esc" and the sheet's own "Put back" (m-2 below, unchanged) |
| `merge.spec.ts` — "the duplicate band merges two cards into one (PR-o)" | Self-contradictory final assertion — asserts the newer name's count is 0 immediately after asserting the announcer (which necessarily contains the newer name) is visible — re-confirmed live in my own merge walk, where the announcer literally names both cards |
| `call-sheet.spec.ts` — "who has site access right now, one click from the sheet" | Unscoped `a[data-tel-link]').first()` matches the 1440 digits-only link where R-X specifies the 390/1440 split (already root-caused r4/r5) |
| `person-card.spec.ts` ×2 | `addSub` helper's own seat-creation race (already root-caused r4/r5) |
| `add-sheet.spec.ts` ×3, `add-client-letter.spec.ts` ×2 | Same signatures r2–r6 already root-caused (hardcoded phone/email collision across runs, Next's route-announcer sharing `role="alert"`, unrelated flag/label-timing state) |

None of these touch the merge/household/bid/close-seat/archive surfaces this round's own walk
exercised, or any of round 6's fixes. Not re-diagnosed from scratch — recording identical
re-occurrence per "never filter," as every prior round did for the same list.

---

## 5. Clean (verified this round, with evidence)

- **Merge — both the interaction and the fact-carry.** §2 above. Screenshots
  `merge-1-duplicate-band.png` → `merge-3-announced.png`.
- **Bid outcome edit.** Unfolded Rivera Finishes' row on the real Okonkwo Call Sheet (folded by
  default), opened `[data-bid-editor]`, set the outcome to declined, saved. Database read:
  `bid_outcome='declined'` **and** `stage='declined'` together — R-BL's rule that a losing bidder's
  stage moves with the outcome, keeping it out of every crew band. Reverted afterward. Screenshots
  `bid-1-unfolded.png` → `bid-3-after-save.png`.
- **Household — add a member with a threshold, as the principal.** §2 above.
- **Household — confirm a plain member cannot.** Minted a throwaway user with an
  `organization_members` row (`role='member'`) and a `user_roles` row on the `designer` domain (the
  portal's middleware, `src/middleware.ts`, gates on `user_roles.roles.domain IN ('designer',
  'admin')`, not on `organization_members.role` alone). Signed in as them on the real Okonkwo Call
  Sheet: "Set the figure" carried `aria-disabled="true"` and `aria-describedby="household-figure-held"`
  pointing at the always-visible sentence *"The change-order figure is the principal's to set. An
  owner or an admin of the studio can write it."* Force-clicking the disabled control (`{force:
  true}`) did not reveal the figure input — `#household-figure` stayed absent from the DOM. PR-n's
  a11y contract holds. Server-side refusal (`set_household_threshold()`'s own WITH CHECK) was not
  independently re-driven as this low-privilege user this round — covered by the SQL suite re-run
  in §1. Screenshot `household-5-member-cannot.png`.
- **Close a seat with a reason.** Unfolded Joe Wozniak's row on the Call Sheet, pressed "Close this
  seat," confirm sentence read exactly *"– Close Joe Wozniak's seat? The seat stays on the job with
  the day it closed, and everything it carries stays with it."* — matching `closeSeatConfirmSentence()`
  and the specimen's own wording letter for letter. Typed a reason, confirmed. Database read:
  `off_job_at` stamped to today, `off_job_reason` held the typed text verbatim, `stage='off_job'` —
  a dated act with a reason, never a hard delete. The surviving hard delete ("Added by mistake")
  stayed visible as a separate, distinctly-labelled control on the same row, per direction's own
  split. Reverted afterward. Screenshots `close-seat-1-confirm.png`, `close-seat-2-closed.png`.
- **Archive / restore, as owner.** Reached Carol Nyström's card via the `?person=` deep link (her
  `contact_kind` is `other`, so she carries no Call Sheet chevron by design — `roster-row.tsx`'s CR-3
  rationale, consistent with every prior round). "Put this card away" was live for the owner;
  pressing it stamped `archived_at` and the card read *"This card was put away 14 September 2026.
  It stays out of the book until it is brought back"* exactly; "Bring this card back" cleared
  `archived_at` to null. Confirmed clean afterward. Screenshots `archive-1-before.png` →
  `archive-3-restored.png`.
- **Console** — zero errors across a settled walk (1.5s post-load, 1s between navigations, 500ms
  after each sheet opens) of sign-in → directory → doc → call sheet → picker, on a fresh server
  start dedicated to this check. No occurrence of the benign `TypeError: Failed to fetch` /
  `AppError: Not authenticated` timing pair r5/r6 disclosed — not seen this round at all, at this
  settle pace.
- **Reset/port hygiene** — `pnpm supabase:reset` succeeded; both server starts this round stopped
  cleanly on the first `kill` (no `kill -9` needed); port 3000 free after each stop; no
  `.env.local` created or read; no migration minted (00595–00620 untouched; the branch's own
  00621–00633 needed no new number); zero residue from any of this round's throwaway fixtures,
  confirmed by a final DB sweep before writing this report (§1).

---

## 6. MINOR (both already known, reproduced per "never filter")

### m-1 (= r2/r5/r6's own m-1) · `bring-forward.spec.ts`'s hardcoded "4 of 5" is stale against the live seed

Unchanged since r2. See §3 and §4. Severity: minor (test hygiene, not product). Confidence: high.

### m-2 (= r2/r5/r6's own m-2) · `bring-forward.spec.ts`'s "Put back" locator lacks `exact: true`

Unchanged since first surfaced. My own throwaway walk hit the identical ambiguity
(`getByRole('button', {name:'Put back'})` resolving to both the toolbar's "Put back · Esc" and the
sheet's own "Put back") before I added `exact: true` — independent confirmation the underlying UI
shape, not just the one checked-in test, produces this collision for any caller that doesn't scope
tightly. See §4. Severity: minor. Confidence: high.

No new minors surfaced this round beyond these two carry-forwards.

---

## 7. Screenshots

`artifacts/people-room-crm-2026-09-11/build/qa-w3-r7/`:

`task5-bring-forward-1440-top.png`, `task5-bring-forward-1440.png`,
`task5-bring-forward-390-top.png`, `task5-bring-forward-390.png`, `merge-1-duplicate-band.png`,
`merge-2-compare-sheet.png`, `merge-3-announced.png`, `bid-1-unfolded.png`, `bid-2-editor.png`,
`bid-3-after-save.png`, `household-1-empty.png`, `household-2-figure-set.png`,
`household-3-add-member.png`, `household-4-after-add.png`, `household-5-member-cannot.png`,
`close-seat-1-confirm.png`, `close-seat-2-closed.png`, `archive-1-before.png`,
`archive-2-archived.png`, `archive-3-restored.png`.

---

## 8. Not findings (settled, or out of this round's scope)

- Every ruling in `rulings.md` §3 (R-A through R-BO) — none contradicted by this walk.
- `w3-fix-log-r6.md`'s six closed fixes (00629's B-1/M-1/M-2/M-3/M-4 and R6-CODE-MAJOR-1) —
  re-checked in §2; all fixed, at the SQL layer and (merge, bid, household-add) live.
- `w3-review-r6-qa.md`'s and earlier rounds' own carried minors (the `CloseSeatAct` doc-accuracy
  note, the self-contradictory `merge.spec.ts` assertion, the benign console-error timing artifact
  — not reproduced this round at all — and the rest of the e2e/people failure list) — reproduced
  identically in §4 above where this round's walk touched them; not re-litigated in full.
- W4-scoped items named in `w3-room-report.md` §10 (no split RPC; the bid-amount field; the
  200-card search scan cap; per-row `useComplianceNotices`; the TEAM-branch tenant leg).
- The household band's inertness on the seeded Okonkwo residence until "Open a household" is
  pressed — `w3-room-report.md` §5/§10 item 2 names this as the honest state of the seed, not a
  defect; confirmed still true at the top of the household walk (§5).
- The household-add flow minting a *new* `client_rep` seat for a person who already holds a
  different-kind seat on the project (Adaeze's case, §1) — this is the room's documented, by-design
  behaviour (a household role is a distinct seat kind), not a defect; the residue it left in my own
  test run was a gap in my cleanup script, not a product issue, and was corrected before this
  report was written.
