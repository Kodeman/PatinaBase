# W3 (P2) — adversarial code review, round 9

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD
`c0149d3a4`. Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src`
across `3d65f81e4..HEAD` (45 files, +8809/−157), read in full, against
`build/w3-room-report.md`, `build/w3-fix-log-r8.md` and `rulings.md` §3.

**Verdict: not clean — 1 major, 12 minor. No blocking.**

---

## 0. Gates re-run this round (not taken on trust)

| Gate | Measured here |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output |
| `pnpm --filter designer-portal type-check` | rc=0, no output |
| `pnpm --filter admin-portal build` | **exit 0** |
| `npx jest` over the 9 W3 suites | **9 suites, 162 tests, all green** — 15+9+5+15+29+6+8+35+40 = 162, matching §1's per-file counts exactly |
| `npx jest` over the 10 adjacent/mock-factory suites | **10 suites, 132 tests, all green** |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **29 passed** |
| `supabase_migrations.schema_migrations` | applied through **00633**; nothing minted this round; 00595–00620 untouched |

`grep` over the whole W3 diff for a consent write (`sms_consent*`, `studio_channel_consent`)
returns only comments, test mock rows and the bring-forward forbidden-key sweep. **No consent write
outside `record_channel_consent` exists in this wave.** R-AY holds.

## 1. Prior findings, re-checked

| r8 finding | State |
|---|---|
| B-1 — a renewal's `doc_type` laundered the lapse it retired | **Fixed.** `compliance_state()` carries `root_doc_type` through the recursive walk and the `retired` CTE asks for it; `compliance_document_state()` likewise. Verified in `pg_proc`. |
| M-1 — `designated_person_is_self` aborted a person↔person merge | **Fixed.** All three designation repoints are `SET <col> = NULLIF(p_survivor, id)` (measured at `merge_studio_contacts` §, lines 884–893 of the installed body). |
| R8-BLOCKING-1 — the bid editor promised a stage move the write does not make | **Fixed for the three branches it names.** `bidStageOutcome(previous, next)` is exported from `use-coordination.ts:…` and read by BOTH `useSetPartyBid` (`dbPatch.stage = written.stage`, `off_job_at` only on a real transition) and `roster-row.tsx:432` (`bidWrite`). A **fourth** branch was not covered — see MAJOR-1. |
| R8-MAJOR-1 — the wave's record described faces the code does not have | **Fixed.** Spot-checked: fifteen carried facts (`carriedRows`, `compare-merge-sheet.tsx:176-209`), eleven merge refusals (`MERGE_REFUSAL_SENTENCES`), seven bid fields, six `asBidError` refusals, per-file test counts. All match. |

Every ruling in `rulings.md` §3 and everything the reports scope to W4 was treated as settled.

---

## MAJOR-1 — "Nothing recorded yet" erases a recorded outcome, and the sentence beside it describes a different press

`apps/designer-portal/src/components/document/roster/roster-row.tsx:436-443`, `:465`
`packages/supabase/src/hooks/use-coordination.ts:2528-2531`

r8 BLOCKING-1 taught the editor's consequence sentence to read the same `bidStageOutcome()` the
write reads, and gave it three branches: the write moves the seat, the seat is past the bid, the
outcome is unchanged. It left the **fourth** press the select offers — clearing the outcome — on
the pre-r8 sentence:

```tsx
// roster-row.tsx:436
const bidSentence = !bidDraft.outcome
  ? 'The outcome is what moves them out of the bidding band. Nothing else on this row does.'
  : bidWrite.stage ? … : bidWrite.moved ? … : …
```

`<option value="">Nothing recorded yet</option>` is the first option in the select, and
`openBidEditor` seeds `bidDraft.outcome` from the seat's existing `bid_outcome` — so on a seat that
already carries one, choosing the first option is one click. The press then:

- sends `bidOutcome: bidDraft.outcome || null` → `null` (`roster-row.tsx:465`);
- `use-coordination.ts:2528` — `patch.bidOutcome !== undefined` is **true** for `null`, so
  `dbPatch.bid_outcome = null` is written: the recorded outcome is dropped;
- `bidStageOutcome(previous, null)` returns `stage: null` (`writesStage = !!outcome && …`), so the
  stage is **not** written and the seat keeps the band the erased outcome put it in.

Failure scenario, on the shipped faces: Rivera Finishes carries `bid_outcome = 'selected'`,
`stage = 'awarded'`, and sits in "On the job · later". The studio opens **Change what came back**,
picks "Nothing recorded yet" (to undo a mis-record), reads *"The outcome is what moves them out of
the bidding band. Nothing else on this row does."*, and presses **Write the bid**. Afterwards the
record says the studio never answered the bid, while the seat still reads **Awarded** in a crew
band; `bidNote` prints no outcome word, so nothing on the row shows what changed, and the row's
status line says only "The bid is written on Rivera Finishes's seat." This is exactly the harm r8
BLOCKING-1 names — a press with no readable trace and a face that does not describe it — one branch
over, plus the loss of a fact the room has no other writer for.

No test covers it: `roster-row.test.tsx:988` asserts the option LIST only, and
`people-crm-w3.test.ts:319` pins `bidStageOutcome({bidOutcome: null, …}, null)` — the already-empty
case, never the clear.

**Fix.** Either give the clear its own sentence off the same object —
`bidWrite.moved && !bidWrite.outcome` → *"Clearing the outcome takes &lt;Outcome&gt; off this
seat's record. The seat stays at &lt;stage word&gt;."* — or, in R-BO's shape for a destructive
field, refuse the bare clear and make taking an outcome away its own named two-step act. Whichever
is chosen, pin it with a `roster-row.test.tsx` case (`bidOutcome: 'selected'`, `stage: 'awarded'`,
outcome set to `''`) and a `people-crm-w3.test.ts` case for
`bidStageOutcome({bidOutcome:'selected',stage:'awarded'}, null)`.

---

## Minors

**MINOR-1 · high — `ProjectTeamRoster` mounts `RosterGroups` with no `projectId`, so the bid half of the wave is inert there.**
`apps/designer-portal/src/components/document/roster/project-team-roster.tsx:134`. `CallSheet`
gained `projectId={projectId}` (`call-sheet.tsx:259`); this second mount did not, and the component
already holds `projectId` (it passes it to `RolodexPicker` eleven lines later). Consequences on that
surface: `useProjectPartyBids` never runs, so `data-bid-note` never prints (R-R says the bid history
prints at both widths on a row that has one); the editor is offered by `band === 'bidding'` alone;
and `hasBid` in the row's `seatDeleteRefusal` is permanently `false`, re-opening r1 MAJOR-1's
face-level hole — "Added by mistake" is offered live on an `awarded`/`off_job` seat carrying a
written bid. No data loss: `useRemoveProjectParty` re-reads `SEAT_BID_COLUMNS` server-side
(`use-coordination.ts:949-953`) and throws the refusal. Held at minor because
`grep -rn ProjectTeamRoster` finds no production mount — only
`__tests__/project-roster-surfaces.test.tsx`. Fix: pass `projectId`.

**MINOR-2 · high — the merge's invalidation list misses three keys it touches.**
`packages/supabase/src/hooks/use-studio-contacts.ts` (`useMergeStudioContacts.onSuccess`). It
invalidates ten key roots but not `resolvedContactKeys.all` (the `resolve_merged_contact` cache the
same file mints for PR-o's deep link), not `['studio-contact-history']` (the merge repoints every
`project_parties.studio_contact_id`, which is exactly what that rollup groups by — the picker's
history line and its prior-job search go stale), and not `partyBidKeys` (00629 repoints
`bid_quoted_by_person_id` onto the survivor, so an open Call Sheet keeps resolving the folded id and
drops "Priced by …" from `bidNote`). The brief's rule is "mutations invalidate every touched key".

**MINOR-3 · high — the household pointer write cannot fail loudly.**
`packages/supabase/src/hooks/use-households.ts:358-364`. The
`designer_clients.household_id` UPDATE carries no `.select()`, so PostgREST answers 204 on a 0-row
match and `pointerError` is null. On the leg where `householdWouldBeFindable` is true *only* because
`designerClientId` resolved (`household-band.tsx:284`), a silently-unmatched pointer leaves a
household with an empty `member_person_ids`, which `useProjectHousehold`'s overlap cannot find —
the band re-prints "No household is on file", offers the door again, and mints another orphan on
every press (00632 has no uniqueness constraint and the room offers no delete). That is r1
BLOCKING-1's shape, narrowed rather than closed. Not reachable through today's RLS
(`designer_clients_studio_rw` admits exactly the callers `client_households`' INSERT admits), which
is why it is a minor and not the blocking it would otherwise be. Fix: `.select('id').single()` and
throw, or seed `memberPersonIds` unconditionally. Separately, nothing invalidates any
`designer_clients` query key after the pointer moves.

**MINOR-4 · medium — the household resolver's overlap read is unordered `.limit(1)`.**
`use-households.ts:308-312`. A client side whose cards sit in two households resolves to an
arbitrary row, and Postgres may return a different one between refetches — the band's
`data-household-threshold` figure can change with nothing pressed. Add an `.order('created_at')`.

**MINOR-5 · high — the compare sheet asserts an absence while it is still reading.**
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:343-347`.
`String((leftPaper ?? []).length || "None")` prints **"None"** for both columns during the
`useComplianceDocuments` fetch, and `seatCount` prints "0" during `usePeopleSeats`. The sheet whose
whole job is to show what each card holds before one folds states a fact it has not read yet — the
same argument r7 MAJOR-1 made about the Firm row's "—". Branch on `isLoading` and print an ellipsis
or "reading…".

**MINOR-6 · high — two terminal acts leave the tab order with no reason beside them.**
`household-band.tsx:671` (`disabled={addHeld || !personId || addMember.isPending}` with
`held={addHeld}` only) and `compare-merge-sheet.tsx:537` (`disabled={!canMerge || merge.isPending}`,
no `held`). `DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:309`),
so in the `!personId` / `!canMerge` states the control gets the native attribute: no
`aria-disabled`, no focus, no `aria-describedby` target, nothing on the face saying what is missing.
Every other gated act in this wave (`archive-card-door.tsx:97-99`, the household figure acts, "Open
a household") uses the `held` / `aria-disabled` + always-visible-reason grammar the brief binds.

**MINOR-7 · medium — PR-n is predicted against a different org than the one the RPC checks.**
`household-band.tsx:211-216, 263` computes `isPrincipal` from the caller's membership in
`household.organization_id ?? organizationId`; `add_household_member()` gates the money grant on
`is_org_admin_or_owner(project_party_recorded_studio(v_seat_id))` — the **job's** recorded studio
(verified in the installed body). Where a job records a different studio than the household's org,
the face either holds an act that would succeed or promises "They may sign money to $2,500." on a
press the database refuses `household_grant_forbidden`.

**MINOR-8 · high — `off_job_at` is stamped on the way into `withdrawn` and never cleared on the way out.**
`use-coordination.ts:2543-2545`. Correcting a mis-recorded "They withdrew" to "Selected" writes
`stage = 'awarded'` and leaves `off_job_at` on the row. `CallSheetRow.offJobAt`
(`roster-derivation.ts:519, 643`) then carries a day the seat left a job it is on. Latent today
because `rosterWindowClause` prints it in the Done band only, and the row is no longer banded there.

**MINOR-9 · medium — the change-order figure can overflow its own column.**
`household-band.tsx:92-98` accepts any `\d+(\.\d{1,2})?`; `client_households.co_threshold_cents` is
`integer`, so anything over $21,474,836 raises a numeric-overflow whose raw Postgres text reaches
the face through `writeErrorMessage`'s fallback. Cap the entry in `parseThresholdEntry` and refuse
it in the room's own words, beside `HOUSEHOLD_FIGURE_REFUSAL`.

**MINOR-10 · medium — a partial bring-forward names only who did NOT go on.**
`rolodex-picker.tsx:668-686`. On `result.refused.length > 0` the sheet stays open, re-ticks the
refused rows and prints their names; the seats that **did** land are never named, `onAdded` is not
called, and the Call Sheet's announcer stays silent about rows that appeared under the studio. Add
the landed names to the sentence, or announce them through `onAdded` before the refusal line.

**MINOR-11 · medium — an owner/admin can still take the figure away without moving the grants.**
`client_households`' UPDATE policy (`with_check … (co_threshold_cents IS NULL) OR
is_org_admin_or_owner(...)`) plus `assert_household_threshold_principal()` correctly refuse a plain
member's direct PATCH — that leg is closed. A **principal** PATCHing `co_threshold_cents` to NULL
through PostgREST still bypasses `set_household_threshold()`'s close-the-grants loop, leaving open
`money` grants whose `source_clause` names a figure the household no longer holds — r5 M-1's exact
divergence, outside the room. Recorded because PR-n gating is a named check; the file is a migration
(00632) and outside this review's diff scope.

**MINOR-12 · medium — `directoryDuplicatePairs`' new `role !== "contact"` skip is not pinned by a
negative test on a lead/team row.** `people-derivation.ts:1358-1370` is the guard that keeps the
merge act off a non-card identity (M2R-6), and it is the only thing standing between a lead row and
a `merge_contact_not_found` on a face. `people-directory-derivation.test.ts` gained 23 lines this
wave; a case asserting that a `lead` row sharing a phone with its own card produces **no** pair
would hold the guard where a later branch rename cannot quietly drop it.

---

## What was checked and found sound

- **Travel list writes only the allowed facts.** `useBringForward`'s INSERT names
  `project_id, party_kind, display_name, company_name, company_id, trade, phone, email,
  studio_contact_id` and nothing else — no consent column, no bid column, no `show_to_client`, no
  pricing, no notes. `phone_e164` is derived by `normalize_phone_project_parties` (00281), so the
  consent record keyed on the number is found without the seat writing a verdict. `fc_optin_invite_dispatch`
  dispatches only after recorded express consent, so a fresh seat sends nothing.
- **Consent never copied per seat.** No write, anywhere in the diff. R-AY / R-AS hold.
- **Merge survivor flip.** `preferredSurvivorId` picks the older card, ties on the id; the pre-pick
  is taken once (`compare-merge-sheet.tsx:248-257`) and a flip survives a refetch; both heads are
  `aria-pressed` buttons; `survivor_flipped` is measured. The consequence sentence branches on
  `survivorHasRule` and its closing clause is about the ID, which is what the record guarantees.
  The RPC's installed body was read: seats, channels (including minted scalars), affiliations,
  rules, documents, designations, `bid_quoted_by_person_id`, agreement tokens, waivers and the
  household array are all repointed, and `merged_into` is a tombstone — no data loss on merge.
- **Close this seat replaced every hard delete.** `grep` over `apps/` and `packages/` for
  `useRemoveProjectParty` returns exactly one call site (`roster-row.tsx:245`), behind
  `seatDeleteRefusal`; the word "Remove" appears on no People-room or roster face.
- **Cross-tenant.** `studio_compliance_notices`, `studio_contact_merges` and `client_households`
  are all `is_active_studio_member(organization_id)`-scoped (read from `pg_policies`); every new
  list hook filters by `organization_id` or by `project_id` under RLS. No unscoped read found.
- **Hooks above early returns.** `CompareMergeSheet`, `HouseholdBand`, `CloseSeatAct`,
  `ArchiveCardDoor`, `RosterRow`, `RolodexPicker` all declare every hook before their first return.
- **Document grammar.** No `box-shadow` / `shadow-*` in any new file; `DocSheet` wraps both new
  sheets; the merge sheet uses the `--ink`/`--rail`/`--hairline-strong` + `.t-*` family, the roster
  files the `--color-*` family their neighbours already use.
- **`aria-disabled` not `disabled`** on "Open a household", "Set the figure", "Take the figure
  away", the archive door and the add act's held state (MINOR-6 covers the two exceptions).
- **Analytics** go through `people-events.ts` only; three new acts, none an engagement metric.
- **Playwright** — `e2e/people/{merge,bring-forward}.spec.ts` are chromium-pinned via
  `test.skip(({browserName}) => browserName !== 'chromium')`, use web-first `expect(...)` with
  explicit timeouts and `expect.poll` over `e2e/helpers/supabase-admin.ts`'s `adminDb`, and tear
  down what they create. Not run (the brief forbids it).
- **No trade or homeowner writing surface** appears anywhere in the diff.
