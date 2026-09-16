# W3 (P2) — runtime QA, round 12

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`. Local
production build of the designer portal (`pnpm --dir <worktree> exec turbo run build
--filter=@patina/designer-portal`, which rebuilds workspace-package dists first, then `pnpm exec
next start -p 3000` from `apps/designer-portal`), env passed inline per the binding instruction (no
`.env.local` created or read anywhere in the worktree — confirmed absent before and after).

**Note on tool mechanics, not a product finding**: every `supabase` CLI invocation and the
`pnpm --dir <path> turbo …` invocation form hit this session's sandbox (`EPERM` opening
`supabase/.env.local` for the CLI's own status read, and a bad `spawn EACCES` on the directory
argument for the `pnpm --dir … turbo …` form specifically — `pnpm --dir … exec turbo …` works).
Both were resolved by running those specific commands with the sandbox override; nothing else in
this round needed it, and no additional filesystem or network access was taken beyond what those
two command shapes required.

Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), reset before and
after this round via `pnpm supabase:reset` (head **00633**, clean replay each time — nothing in
00595–00620 touched, migrations tail confirmed unchanged from r11). No prod touched, no migration
minted, no `.env.local` created.

**PORT RULE**: `lsof -nP -iTCP:3000 -sTCP:LISTEN` before starting showed no listener, so the kill
branch never applied. Server stopped at the end of the round (`kill`, confirmed dead — the second
`kill` attempt reported "no such process," meaning the first `kill` alone already succeeded) and
the port confirmed free by a second `lsof` (no output).

**Read first**: `w3-room-report.md`, `synthesis/direction.md` §6 task 5, `specimens/SPEC.md` §5.7,
`rulings.md` §3, `build/w3-fix-log-r11.md`. Screenshots and raw evidence: `build/qa-w3-r12/`.

---

## 1. r11 fix-log — re-check

`w3-fix-log-r11.md` reports six findings fixed across three r11 reports (2 migrations MAJOR, 1
code BLOCKING + 1 QA corroboration of the same defect, 1 code MAJOR, 1 QA MAJOR). Re-checked live
against a fresh reset + fresh build this round:

| Fix | Re-checked how | Result |
|---|---|---|
| MAJOR-1 (migrations) — absorbed card's free-text firm outranking the survivor's own firm card | Not directly re-probed (no firm-card merge fixture built this round; my merge fixture used two person cards with no firm, same as r11's own trades probe) | Not re-broken by anything observed; fixture did not reach this surface |
| MAJOR-2 (migrations) — merge on a studio-less project raising a raw schema token | Not reachable: Okonkwo's `studio_id` is set, same as r11 noted | Not re-broken by anything observed; fixture did not reach this surface |
| BLOCKING-1 (code) + R11-QA-CORROBORATE-1 — merge consequence sentence claimed a trades reduction the RPC does not make | **Directly re-exercised live**, own fresh fixture (two person cards, disjoint trades, phone-sharing duplicate): the sheet's TRADES row now reads "both kept" with both values listed under it, the pre-merge consequence sentence reads "**The trades and specialties on both cards are kept together, and a card recorded as a sole proprietor keeps that either way**" (trades removed from the "own words stand" clause), and the post-merge `role="status"` announcement reads "…where both cards said something, R12 Duplicate Older's own words stand — **except the trades and specialties, which are kept together**." Queried the actual write: `trades = {electrical,plumbing}` — union, matching the sentence exactly. | **Holds exactly.** See §4 |
| MAJOR-1 (code) — roster row paper sentences read only the firm's holder id, not the person's | Not directly re-probed (would need a sole-proprietor-with-lapsed-personal-licence fixture, not built this round); `w3-review-r11-code.md`'s own pinned specs are unchanged on disk | Not re-broken by anything observed; not independently re-verified live this round |
| R11-QA-MAJOR-1 — one already-seated pick cost the whole batch | **Directly re-exercised live** against the literal, unmodified Okonkwo residence with Leah's own task-5 names (Dana, Pete, Ingrid, Claire — all four still seeded there after a fresh reset, confirmed by direct query). Ticked all four, pressed "Add four to the roster": the sheet stayed open and printed exactly "Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the call sheet." | **Holds.** The all-or-nothing defect is fixed — the code change described in the fix log (`addPicked` splitting seated rows from fresh ones, per-batch) is present and behaves as documented. See §3 for what is still true underneath it |

No new instance of any of the five re-appeared. Two of the five (migrations MAJOR-1/2, code
MAJOR-1) were not reachable or re-probed by this round's chosen fixtures — noted as "not
re-broken," not "re-verified," per the same honesty standard r11 itself used for items it didn't
directly re-probe.

---

## 2. e2e/people (chromium)

Two full serial runs against a fresh reset (before the manual walk, and again after, isolated from
the manual walk's own temporary spec, which was deleted before either run counted). First run
showed 13 failures (11 known + 2 extra); a targeted re-run of just the two extra failures in
isolation passed cleanly, and a full second run reproduced the canonical 11 exactly. This is
recorded as **test-flakiness under `--workers=1` full-suite ordering, not a new product defect** —
see detail below.

**Run A** (13 failed / 9 passed):
```
company-card.spec.ts:95   a firm carries no consent word and no reach word   [NEW vs r10/r11]
directory.spec.ts:22      the head counts cards, and names both nouns        [NEW vs r10/r11]
+ the same 11 as r10/r11 (add-client-letter ×2, add-sheet ×3, bring-forward ×2, call-sheet:91,
  merge.spec.ts:81, person-card.spec.ts ×2)
```
**Isolated re-run** of just `company-card.spec.ts` + `directory.spec.ts`: **9/9 passed**, including
both lines that failed in Run A.

**Run B**, full suite again: byte-for-byte the same **11** as r10 and r11 — no more, no less.

Root cause not chased further (effort budget, and it did not reproduce): both extra failures in
Run A show timeout/closed-context shapes typical of full-suite resource contention under a single
worker on a freshly-cold Next.js server (`directory.spec.ts:22`'s own error was `page.waitForTimeout:
Target page, context or browser has been closed` inside the **auth setup fixture**, not the test
body — a browser-context lifecycle issue, not a Directory-surface defect). Recorded here rather than
silently dropped, per the instruction to report every finding; rated informational since it did not
reproduce and both tests are demonstrably passing on the same code and same database state.

**The 11 canonical failures are unchanged in identity from r10/r11** and were not re-root-caused
line-by-line again this round (r11 already did that work in `w3-review-r11-qa.md` §2, and nothing
in this round's manual walk contradicts any of those root causes — the two W3-scoped ones
(`bring-forward.spec.ts:251`, `merge.spec.ts:81`) are test-defects already named there: a strict-mode
double match on "Put back," and an announcement that necessarily contains the merged name while the
test asserts it must not appear).

**FINDING — informational, test infrastructure only.**
- **Severity: MINOR. Confidence: LOW** (did not reproduce on a second run; isolated run of the
  same two specs passed).
- Two additional e2e failures appeared in one full-suite run only (`company-card.spec.ts:95`,
  `directory.spec.ts:22`), both with browser-context/timeout shapes, not assertion-content
  mismatches. Not reproduced on immediate re-run (isolated) or on a second full-suite run.
- **Evidence**: terminal output of both runs (not saved as a file — reproduced in this report's §2
  above verbatim from the actual run).

---

## 3. Task 5 — bring forward, walked live against the real Okonkwo Call Sheet

Both widths, against the actual `/doc/<Okonkwo>` Call Sheet's own "From the rolodex" instrument
(`[data-action-key="open-call-sheet"]` → `[data-action-key="open-rolodex-picker"]`), the same
navigation path `bring-forward.spec.ts`'s own `openThePicker()` helper uses.

**Every §5.7 string present** (screenshots: `task5-pick-1440-before.png`,
`task5-pick-1440-ticked.png`, `task5-after-press-1440.png`, `task5-pick-390-viewport-only.png`):
"From the rolodex," the site-access summary line "Key held by Ngozi Eze. Luis Ochoa controls the
gate. Changed 16 Oct 2026." under the mounted Call Sheet heading, "What travels" / "What stays
behind" with all named sub-items ("prior pricing / prior project notes / show to client" — the
one-sided divergence from SPEC's literal "2025 pricing / 2025 project notes" already logged as
`w3-review-r11-code.md` m1, corroborated again here, not re-filed), the act row, "Put back."

**Six rows, exactly as R-BP amended**: Ben Ostrom, Claire Bissett, Dana Kowalski, Erin Sato, Ingrid
Halvorsen, Pete Rusk (alphabetical on the face, not the SPEC table's a–f order — SPEC §5.7 does not
assert an ordering rule, so this is not a mismatch). Erin Sato confirmed present and unticked
throughout, no verdict language anywhere in the sheet.

Ticked Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett. Pick count read **"4 of 6 from
the Lindqvist kitchen selected"** (`task5-pick-1440-ticked.png`). Consequence sentence read exactly:

> "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate
> Electric's insurance lapsed 31 March 2026."

— byte-for-byte the SPEC/room-report text (SPEC §5.7 row 7's own "31 Mar 2026" typo vs. every other
reference's "31 March 2026" is the same SPEC-internal wording slip r11 already logged; not a shipped
defect). Overflow check (`document.documentElement.scrollWidth - clientWidth`) measured **0** at
both 1440 and 390.

### Re-check of R11-QA-MAJOR-1 / the "OWED" note in `w3-fix-log-r11.md`

The fix log's own text says: *"all four of Leah's task-5 people ... are already seated on the
seeded Okonkwo residence ... so the literal task-5 walk against that project still writes zero
seats, now with an accurate refusal sentence naming all four ... a SPEC amendment ... belongs to
the orchestrator."*

Confirmed by direct query before the walk: all four (`d0e30000-…-0011/0012/0013/0020`) are still
`studio_contact_id`-stamped to the exact cards the picker resolves. Pressed "Add four to the
roster" against the real, unmodified Okonkwo project: the sheet **stayed open** and printed exactly

> "Dana Kowalski, Pete Rusk, Ingrid Halvorsen, Claire Bissett are already on the call sheet."

(`task5-after-press-1440.png`). Zero new `project_parties` rows were written — but that is now the
**named, per-pick, correctly-attributed refusal the fix was meant to produce**, not the silent
whole-batch failure r11 found. The code defect (all-or-nothing refusal) is fixed. What remains is
exactly what the fix log already scoped as **"a ruling, not a defect"** — the literal task-5
acceptance text and the shipped seed still disagree about whether Okonkwo is the right project to
demonstrate task 5 on. No new ruling addressing this appears in `rulings.md` §3 as of this round
(last entry is still R-BP, 2026-09-14).

**Not re-filed as a new finding**: this is the same open item the r11 fix log already named and
scoped to the orchestrator, unchanged in shape, and the code-level defect underneath it (the part
that was actually a bug) is confirmed fixed. Recorded here only as "re-checked: code fix holds,
policy question still open," per the instruction to re-check every prior finding as fixed or open.

**Evidence**: `qa-w3-r12/task5-pick-1440-before.png`, `-ticked.png`, `-390-viewport-only.png`,
`task5-after-press-1440.png`, `task5-consequence.txt`, `task5-overflow-1440.txt`,
`task5-overflow-390-recheck.txt`, `apps/designer-portal/src/components/document/roster/
rolodex-picker.tsx:663-694` (the `addPicked` split logic, comment block cites "r11 QA MAJOR-1" by
name).

---

## 4. Merge two duplicate cards

No naturally-occurring phone-sharing duplicate exists in the fresh seed (checked by query). Seeded
a fresh pair directly in Postgres — `R12 Duplicate Older` (created 400 days ago, trade
`electrical`) and `R12 Duplicate Newer` (created today, trade `plumbing`), sharing phone
`(612) 555-9911` — chosen specifically to re-probe the r11 BLOCKING-1 trades-sentence fix live, the
same shape r11's own QA fixture used.

The band showed "Compare these two"; the sheet opened with the survivor **pre-picked as the older
card** (R12 Duplicate Older) per PR-o. The comparison table's TRADES row read "both kept" with each
card's own value listed beneath. The pre-merge consequence sentence and the post-merge `role=
"status"` announcement both correctly excluded trades from the "own words stand" clause (quoted in
full in §1 above). Pressed "Merge into R12 Duplicate Older":

```
survivorAfter.trades = {electrical,plumbing}    -- union, matches the sentence
merged.merged_into    = <survivor id>            -- stamped, not deleted
studio_contact_merges: (survivor, merged, matched_on='phone')  -- one row, correct
```

**No finding.** Fix holds exactly. Test fixture cards and the merge record deleted afterward
(confirmed by direct query: zero rows matching `full_name like 'R12 Duplicate%'`).

**Evidence**: `qa-w3-r12/merge-band-1440.png`, `merge-sheet-1440.png`, `merge-after-1440.png`,
`merge-sheet-text.txt`, `merge-announcement.txt`.

---

## 5. Edit a bid outcome

Rivera Finishes on Okonkwo (`bid_outcome: 'no_response'`, the one seed row carrying bid metadata —
same fixture r11 used). Unfolded the row, opened "Change what came back," changed "How it came
back" to "Selected." Pre-save sentence read exactly:

> "Recording this moves Rivera Finishes to Awarded. A bidder who did not win never reads as crew."

Saved via "Write the bid":

```
before: { bid_outcome: "no_response", stage: "no_response" }
after:  { bid_outcome: "selected",    stage: "awarded"      }
```

R-BL / `bidStageOutcome` correctly moved the seat's stage with the outcome. Reverted to the exact
pre-edit values afterward (confirmed by direct query). **No finding.**

**Evidence**: `qa-w3-r12/bid-editor-sentence.txt`, `bid-before-1440.png`, `bid-editor-1440.png`,
`bid-after-1440.png`.

---

## 6. Household — threshold, add-member, principal/member gate

Walked on the real Okonkwo residence, no household on file at the start of the round (confirmed
fresh: "No household is on file for this client yet, so what each of them may sign is recorded seat
by seat rather than in one place.").

- **Owner (principal) — open a household, set the figure.** `designer@patina.dev` (org `owner`).
  "Open a household" → "Set the figure" measured `aria-disabled="false"`. Entered $2,500, saved via
  "Write the figure"; `[data-household-threshold]` updated to exactly "Change orders over $2,500
  need a signature from the household." Underlying row confirmed:
  `client_households.co_threshold_cents = 250000`, `display_name = "Okonkwo residence household"`.
- **Add a household member — consequence sentence.** Opened "Add a household member"; the
  consequence region (`[data-household-consequence]`) read exactly "This person joins the household
  and takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is sent to
  them." — identical wording to r11's own measurement. Not carried through to the write this round
  (screenshotted the filled state only, matching r11's own choice to avoid a second live mutation on
  top of the threshold write already exercised) — not a finding, a scope note, same as r11's.
- **Member — cannot set the figure.** Temporarily flipped `studio_manager@patina.dev`'s
  `organization_members.role` from `admin` to `member` on Okonkwo's studio org (reversible,
  local-only, reverted immediately after, confirmed reverted by direct query). Signed in as that
  account in a **separate browser context**, opened the same Call Sheet: "Set the figure" measured
  `aria-disabled="true"`, `aria-describedby="household-figure-held"` pointing at a sentence that
  read exactly "The change-order figure is the principal's to set. An owner or an admin of the
  studio can write it." A forced click (`{force: true}`) opened no editor (`#household-figure`
  count stayed 0). PR-n holds exactly as r10 and r11 measured it.

**No finding** on any of the three legs.

**Evidence**: `qa-w3-r12/household-before-1440.png`, `household-open-1440.png`,
`household-figure-open-1440.png`, `household-after-set-1440.png`, `household-owner-aria-disabled.txt`,
`household-after-set.txt`, `household-add-member-form-1440.png`, `household-add-member-consequence.txt`,
`household-member-view-1440.png`, `household-member-aria-disabled.txt`,
`household-member-describedby.txt`, `household-member-gate-sentence.txt`,
`household-member-force-click-editor-count.txt`.

---

## 7. Close a seat, with a reason

Claire Bissett's real, pre-existing Okonkwo seat (same choice r11 made, since no shipped e2e suite
depends on it). Unfolded the Call Sheet row, clicked "Close this seat," filled "Why it closed,"
clicked "Close the seat":

```
{ "off_job_at": "2026-09-15", "off_job_reason": "QA r12 manual close — round 12 verification.",
  "stage": "off_job" }
```

Dated (today), reason stored verbatim, stage moved to `off_job`. Reverted afterward (confirmed by
direct query: `off_job_at`/`off_job_reason` null, `stage` back to `active`). **No finding** on the
write itself.

**Cross-reference, not re-walked this round**: `w3-review-r11-code.md` m2 (two separate close-seat
implementations — `roster-row.tsx`'s own inline version vs. the shared `CloseSeatAct` component
`person-profile.tsx` mounts) was already reported and corroborated live by r11's own walk; this
round used the same `roster-row.tsx` path (per the task's own phrasing, "close a seat... on the Call
Sheet") and did not separately re-walk the person-card's `CloseSeatAct` surface to re-corroborate.
Not re-filed; the existing minor stands as-is.

**Evidence**: `qa-w3-r12/close-seat-unfolded-1440.png`, `close-seat-filled-1440.png`,
`close-seat-after-1440.png`.

---

## 8. Archive / restore, as owner

Same Claire Bissett card, via the standalone `/people?person=<id>` studio-wide People room (where
`ArchiveCardDoor` mounts). "Put this card away" → "Bring this card back," round-tripped cleanly:

```
afterArchive: { archived_at: "2026-09-15T…" }   -- stamped
afterRestore: { archived_at: null }              -- cleared
```

Archived-sentence text read exactly "This card was put away 15 September 2026. It stays out of the
book until it is brought back." **No finding.**

**Evidence**: `qa-w3-r12/archive-before-1440.png`, `archive-after-put-away-1440.png`,
`archive-after-restore-1440.png`, `archive-sentence.txt`.

---

## 9. Console

Same two errors as r10 and r11, **unchanged in shape and even in chunk hash** (`chunks/
2290-5e61441dd9c0c75e.js`, `chunks/4734-58574c6d74dd6b0b.js`):

```
TypeError: Failed to fetch   (…chunks/2290-…: Supabase auth session refresh, rE._getUser)
Error logged: AppError: Not authenticated   (…chunks/4734-…, while genuinely signed in)
```

**Severity: MINOR. Confidence: MEDIUM** — same characterization as r10/r11: plausibly environment
noise from the `orders`/`media`/`projects` NestJS services not being started (this round's
assignment is designer-portal-only), not tied to a specific button press or W3 surface in the
trace. Now reproduced identically across four separate rounds (r10, r11, and both fresh-reset runs
this round) with byte-identical chunk hashes, which argues more strongly than before that this is a
stable, build-time-deterministic artifact of the environment shape (no services running) rather
than noise that would vary — still worth a `pnpm dev:minimal` re-check in a future round to settle
definitively, as r10 and r11 both also said, but not escalated in severity since nothing changed.

---

## 10. Not findings — settled

- Every ruling in `rulings.md` §3 (R-A through R-BP) — none contradicted by anything observed this
  round.
- SPEC §5.7 row 7's "31 Mar" vs. every other reference's "31 March" — SPEC-internal wording slip,
  not a shipped-code defect (settled r11 §3).
- The "OKONKWO RESIDENCE" eyebrow reading as the mounted Call Sheet's own title — settled by r2–r7
  QA rounds.
- `w3-review-r11-code.md` m1 ("2025 pricing" vs. "prior pricing") — corroborated live again in §3,
  not re-filed.
- `w3-review-r11-code.md` m2 (two close-seat implementations) — not re-walked this round (see §7);
  standing, not re-filed.
- `w3-review-r11-migrations.md` MAJOR-1 (merge company_name outranking) and MAJOR-2 (studio-less
  merge) — neither surface reached by this round's fixtures (my merge fixture used two person cards
  with no firm; Okonkwo has a `studio_id`); noted, not corroborated or refuted, same as r11.
- `w3-review-r11-code.md`'s own MAJOR-1 (roster row paper reading only the firm's holder id) — not
  independently re-verified live this round (no matching fixture built); not re-broken by anything
  observed.
- The R11-QA-MAJOR-1 "OWED" policy question (task 5's literal acceptance text vs. the seeded
  Okonkwo project already seating all four named people) — re-checked as still open, per §3; the
  fix log itself scoped this to the orchestrator, not to QA re-filing.
- Anything scoped to W4 by the reports.

---

## Appendix — commands run

```
supabase status --workdir <worktree> -o env                        # local dev keys only, not printed
pnpm --dir <worktree> supabase:reset                                 # x2 (start, end)
pnpm --dir <worktree> exec turbo run build --filter=@patina/designer-portal   # env inlined, 7/7 tasks
pnpm exec next start -p 3000                                          # from apps/designer-portal, backgrounded, env inlined
pnpm exec playwright test e2e/people --project=chromium --workers=1   # x2 (before + after the manual walk)
pnpm exec playwright test e2e/people/_manual-qa-r12.spec.ts -g "…"    # temporary manual-QA spec, run in
                                                                        # scoped batches, deleted before finishing
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres          # direct probes/reverts for merge,
                                                                        # bid, close-seat, household,
                                                                        # archive, and the role-flip
kill <next-start-pid>; lsof -nP -iTCP:3000 -sTCP:LISTEN                # confirmed dead + port free
```

No `pnpm dev`, no `next build` while a server held the port, no chained `cd`, no `git add -A`.
`pnpm --dir <worktree> turbo run build …` (without `exec`) failed with a sandbox-flavored
`spawn EACCES` on the directory argument in this session; `pnpm --dir <worktree> exec turbo run
build …` is the form that worked and is recorded above — noted in case a future round hits the same
shape. The temporary manual-QA `.spec.ts` file used for the browser walk was deleted before
finishing; nothing from this round is staged or committed. Local DB reset to a clean seed at the
end; every direct-SQL mutation made for the walk (bid outcome, seat closure, archive/restore,
household, the role flip, the merge fixture pair) was reverted or superseded by the final reset.

---

## Verdict

**CLEAN.** Zero blocking, zero major findings from this round's own walk. All five re-checked r11
fixes hold under live exercise (three directly re-probed and confirmed correct: the merge
trades-sentence split, the bring-forward batch-split refusal, the bid-outcome stage write; two not
reachable by this round's chosen fixtures, noted as "not re-broken" rather than "re-verified"). One
MINOR, LOW-confidence, non-reproducing e2e-infrastructure flake (§2) and one MINOR, MEDIUM-confidence
console-noise item unchanged since r10 (§9) are recorded for completeness; neither is blocking or
major under this round's own definitions, and neither is new in kind. The one still-open item from
r11 (task 5's literal acceptance text vs. the seed's already-seated four) is a named policy question
already owed to the orchestrator, not a QA finding, and the code defect underneath it is confirmed
fixed.
