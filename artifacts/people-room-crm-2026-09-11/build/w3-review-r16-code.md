# W3 adversarial code review — round 16

Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src` on
`build/people-room-crm-2026-09-11`, read in full against `b3f3907fd..HEAD` (45 files,
+9928 / −172). Working tree is CLEAN for both paths — the wave is committed, latest
`aa615473e` (r15). Rulings §3 and anything the reports scope to W4 are settled and not
re-filed.

**Verdict: NOT clean — 2 major, 11 minor, 0 blocking.**

---

## 1. Prior findings, re-measured

Every r15 finding re-checked against HEAD.

| Finding | State |
|---|---|
| r15-major-1 / r15-qa-major-1 — closed seat reused by the household | **FIXED** in SQL (`00632:386-392` carries `AND pp.off_job_at IS NULL`; `set_household_threshold` ends a grant on a closed seat). **But the FACE half was not carried into the hook** — see r16-major-1 below, which is the same defect one layer up |
| r15-code-major-1 — household band refetches with the seats | **FIXED**. `invalidateClientHouseholds()` (`use-coordination.ts:38-40`) is called from all six named writers: `useAddProjectParty`, `useUpdateProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty`, `useSetPartyAuthority`, `useBringForward`. Pinned by six vitest cases |
| r15-code-major-2 — the CloseSeatAct "one component" claim | **FIXED in two of three places.** `close-seat-act.tsx:14-24` and `roster-row.tsx`'s `closing` block both name the second copy; `person-profile.tsx:141-142` still says "One component, two surfaces (W3/P2)." — r16-minor-1 |
| r15-code-major-3 — the report re-measured against HEAD | **PARTLY.** Gate numbers, test counts, refusal count (13) and export list all verified correct. Two §2/§3 strings are still stale — r16-minor-2, r16-minor-3 |
| r13 MAJOR-1 archived estimator · r12 MAJOR-1 `samePaper` leg · r11 BLOCKING-1 split trades clause · r10 BLOCKING-1 standing grant · r9 MAJOR-1 cleared outcome · r8 BLOCKING-1 `bidStageOutcome` shared with the face · r7 BLOCKING-1 correction-is-not-a-transition · r5 M-1 `set_household_threshold` · r4 MAJOR-1 one consent composer · r3 MAJOR-2 door gated on findability · r1 BLOCKING-1 household born with members · M2R-3/5/6/7 | **all present at HEAD**, re-read line by line |

## 2. Contract checks

| Check | Result |
|---|---|
| Travel list writes only the allowed facts | **PASS.** `useBringForward`'s INSERT (`use-coordination.ts:592-606`) names exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id`. No pricing, no notes, no `show_to_client`, no bid column, no consent column |
| Consent never copied per seat | **PASS.** No `sms_consent_*` write anywhere in the wave; the only mentions are the frozen-legacy type and R-AS/R-AY comments |
| Merge sheet: survivor flip + a true consequence sentence | **PASS.** `preferredSurvivorId` pre-picks the older, `aria-pressed` heads flip it, the pre-pick is taken once (`compare-merge-sheet.tsx:305-314`); the sentence branches on the rule PAIR and splits the UNIONed trades/specialties/sole-proprietor clause |
| PR-n gating | **PASS** on the figure acts (`set_household_threshold` gates on `v_h.organization_id`, which is exactly what `isPrincipal` reads) and on the add act's held reason. One legacy-population gap — r16-minor-5 |
| "Close this seat" replaced every hard delete | **PASS.** `grep` over both trees returns ONE seat delete — `use-coordination.ts:1019` in `useRemoveProjectParty`, called only from `roster-row.tsx:1085` behind `seatDeleteRefusal`, whose `hasBid` now reads the bid COLUMNS as well as `stage`. The other `.delete()` in scope (`use-studio-contacts.ts:1225`) is `useClearContactRule`, pre-existing and not a seat |
| Invalidations complete | **MOSTLY.** Merge, bid, bring-forward, household-member and threshold fan-outs each reach every key their write touches (pinned by test). One incomplete — r16-minor-8 |
| aria-disabled not disabled | **TWO EXCEPTIONS** — r16-minor-4 |
| Document grammar | **PASS.** Zero `box-shadow` in any new file; house tokens on the people surface (`--ink`, `--rail`, `--hairline-strong`, `t-body-sm`), the roster palette on the roster surface, matching each surface's shipped neighbours |
| DocSheet for every sheet | **PASS.** `CompareMergeSheet` and `RolodexPicker` are the only sheets and both render inside `DocSheet` |
| SPEC vocabulary | **PASS.** Outcomes read as acts (`SEAT_BID_OUTCOME_ACTS`), roles as `HOUSEHOLD_MEMBER_ROLE_LABELS`, evidence as `MERGE_MATCHED_ON_LABELS`; `asMergeError` answers a bare snake_case token with a sentence; `writeErrorMessage` guards RLS strings and schema words |

## 3. Gates — run this round, output pasted

| Gate | Result |
|---|---|
| `pnpm --dir packages/supabase type-check` | exit 0, no output |
| `pnpm --dir apps/designer-portal type-check` | exit 0, no output |
| `pnpm --dir apps/admin-portal build` | exit 0, full route table printed (the strictest gate, after the shared `@patina/supabase` edits) |
| `cd apps/designer-portal && npx jest` | `Test Suites: 593 passed, 593 total · Tests: 7675 passed, 7675 total · Snapshots: 1 passed` |
| `cd packages/supabase && npx vitest run` | `Test Files 105 passed (105) · Tests 1346 passed | 12 skipped (1358)` |
| the wave's nine jest files alone | `9 passed · 181 passed` — exactly the report's 34+49+37+17+6+8+5+15+10 |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 40 passed |

Every number the room report §9 claims is correct as measured. No server was started, no port
taken, no prod contact; the one database probe below ran inside a ROLLBACKed transaction.

---

## 4. Findings

### r16-major-1 (major · high) — the household's "already signs money" sentence reads a grant on a seat the studio CLOSED

`packages/supabase/src/hooks/use-households.ts:272-341`

r15 taught `add_household_member()` to skip a closed seat (`00632:386-392`, `AND pp.off_job_at
IS NULL`). The hook that feeds the face was not told. It reads **every** `client` /
`client_rep` seat on the job with no `off_job_at` filter (`:272-277`), and its own comment at
`:286-288` still states the retired rule:

> `add_household_member()` reuses the EARLIEST seat for a (project, card, kind) — `ORDER BY pp.created_at LIMIT 1` (00632 §4) — so the grant the band must read is that seat's.

So `clientSideMoneyGrants` can carry a grant standing on a closed seat, and
`household-band.tsx:299-305` hands it to `householdMemberConsequence`
(`household-band.tsx:197-204`), which prints, before the press:

> "Chidi Okonkwo already signs money to $2,500 on the Okonkwo residence, recorded outside the household, and that figure stands."

while the write opens a NEW seat and mints the household's own figure on it. That is the exact
class of wrong fact r10 BLOCKING-1 added this parameter to prevent, reintroduced by r15's own
fix one layer down. Run the other way (household clause on the closed seat, a foreign clause on
the open one) the sentence promises "They may sign money to $5,000." over a grant the write will
leave standing.

**Measured**, `psql` against the local database inside a ROLLBACKed transaction: one closed
`client_rep` seat carrying an open `money` grant, one later open `client_rep` seat for the same
card carrying none —

```
A) RPC would reuse seat: dd390fa3-f879-4aae-8c17-e764c2cf1def        ← the OPEN seat, no grant
B) open money grants the hook reads:
   seat=90f49e4d-… off_job_at=2026-08-16 threshold=250000 clause=the agreement   ← the CLOSED seat
   seat=d0e30000-…-05 off_job_at= threshold=250000 clause=Owner agreement, Exhibit B §4.2
```

**Second defect in the same block**: the dedupe at `:326-332` keeps the first match in the
GRANT query's arbitrary order, not the seat `created_at` order the sort at `:289-290` computes
(that sort feeds only `memberCardIds` and `seatById`). So even between two OPEN seats the
"earliest seat wins, because that is the one the RPC reuses" claim does not hold, and which
figure the face prints can change between refetches.

**Third, smaller**: `clientSideHasAuthority` (`:320`) counts grants on closed seats too, so
`householdEmptySentence`'s "recorded seat by seat rather than in one place" can stand on
authority belonging to somebody who left the job.

**Fix**: read `off_job_at` on the seat rows, drop closed seats from the grant candidates (or
carry `offJobAt` on `ClientSideMoneyGrant` and skip them at the choice), pick the FIRST OPEN
seat per (card, kind) by `created_at`, and rewrite the `:286-288` comment to 00632's current
lookup. Pin with a vitest case that stages a closed seat with a grant plus a later open seat and
asserts the returned grant is the open seat's (none).

---

### r16-major-2 (major · medium) — the bring-forward consequence sentence counts seats the press will refuse

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:567-595`, `:1010-1015`,
against `:679-698`

`pickedFacts` is built from **every** ticked card, and `bringForwardConsequence` prints
"Adds four seats to the Okonkwo residence." r11 QA MAJOR-1 then taught `addPicked` to drop
already-seated rows from the batch (`:679-694`) and, where every pick is seated, to write
nothing at all and answer "Claire Bissett, Dana Kowalski, Ingrid Halvorsen, Pete Rusk are
already on the call sheet." The sentence in front of the act was never taught the same rule.

`rosterRows` is already in hand at render (`:358-360`) and `rosterHasIdentity` is pure, so the
seated set is knowable BEFORE the press — this is not a fact the face could not have.

Leah task 5, performed on the seeded Okonkwo exactly as SPEC §5.7 and direction §6 draw it,
therefore reads "Adds four seats to the Okonkwo residence." and then adds zero. `w3-review-r15-qa.md:85-93`
measured this same press, read the sentence byte-for-byte as correct against the SPEC literal,
and ruled the REFUSAL path "not a finding" — correctly; this finding is about the sentence
before it, which the QA round did not reach.

**Fix**: memoise the seated split and feed `bringForwardConsequence` only the fresh picks, with
a clause naming who is already on the sheet ("Dana Kowalski is already on the call sheet.") so
the count and the act label agree with what the press writes. Note the count in
`bringForwardActLabel` (`:999`) carries the same over-count.

---

### r16-minor-1 (minor · high) — the retired "one component, two surfaces" invariant survives in the third file

`apps/designer-portal/src/components/document/people/views/person-profile.tsx:140-142`

> `{/* direction §3.2 R4 names this act on the person card … One component, two surfaces (W3/P2). */}`

r15-code-major-2 corrected this claim in `close-seat-act.tsx:14-24` and added the matching note
to `roster-row.tsx`'s `closing` block. The call site still asserts the invariant the code does
not have. A reader arriving from the person card is told there is one component.

---

### r16-minor-2 (minor · high) — the room report still quotes the merge announcement r5 B-1 retired

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:132-133` reads:

> the Room's `role="status"` line says "Two cards are now one. &lt;survivor&gt; carries everything &lt;merged&gt; held."

The shipped string (`compare-merge-sheet.tsx:461-466`) is:

> "Two cards are now one. &lt;survivor&gt; carries what &lt;merged&gt; held, and where both cards said something, &lt;survivor&gt;'s own words stand — except the trades and specialties, which are kept together."

`compare-merge-sheet.tsx:454-460` records "carries everything <merged> held" as the FALSE claim
r5 B-1 replaced. r15-code-major-3 was scoped to re-measuring §2 and re-measured the consequence
sentence but not the announcement.

---

### r16-minor-3 (minor · high) — the room report's pick-count example predates R-BP

`w3-room-report.md:154` — "`data-pick-count` reads '4 of 5 from the Lindqvist kitchen selected'".

R-BP (rulings §3) amends SPEC §5.7 from five to six ("on the dev seed 'Lindqvist' returns six
people … Erin Sato listed, not selected"), and the code's own docblock
(`lib/document/bring-forward.ts:68-70`) says "4 of 6". The report contradicts the ruling it
was written after.

---

### r16-minor-4 (minor · medium) — two acts render a NATIVE `disabled` in reachable, non-pending states

`document-action.tsx:309` is `disabled={unavailable && !held}`, so `held` is the only thing that
keeps an unavailable act focusable with its reason reachable.

- `household-band.tsx:719` — `disabled={addHeld || !personId || addMember.isPending} held={addHeld}`.
  With nobody chosen yet (`!personId`) and `addHeld` false, "Add to the household" is natively
  disabled, out of the tab order, with no sentence saying why.
- `compare-merge-sheet.tsx:608` — `disabled={!canMerge || merge.isPending}` with no `held` at all.
  Before both cards resolve, "Merge into …" is natively disabled and unreachable.

`archive-card-door.tsx:97-99` (`disabled` + `held` + `aria-describedby` + a standing sentence) is
the wave's own correct shape and shows the pattern the other two should take.

---

### r16-minor-5 (minor · medium) — "Open a household" is live on the studio-less legacy population, and mints a row the next act refuses

The band's org comes from `project_consent_org()` (`call-sheet.tsx:109` → `consentOrg` →
`roster-groups.tsx:132`), while `add_household_member()`'s seat guard and its PR-n check read
`project_recorded_studio()` / `project_party_recorded_studio()`. Measured on the local seed, the
two disagree on six of eight projects:

```
Aspen Loft Refresh    consent_org=6f05d9a3-…   recorded=<null>   tenant=<null>
Birch Hollow          consent_org=6f05d9a3-…   recorded=<null>   tenant=<null>
Chen Residence        consent_org=6f05d9a3-…   recorded=<null>   tenant=<null>
…
Okonkwo residence     consent_org=b0000000-…-01 recorded=b0000000-…-01 tenant=b0000000-…-01
```

On such a job (R-BI / R-BD's named legacy population), if a `designer_clients` row resolves then
`householdWouldBeFindable` is true, "Open a household" renders live, the INSERT succeeds into the
designer's own studio — and the very next act is refused by `party_card_project_has_no_studio`
(translated, `write-error.ts:33-35`), because the seat may not be stamped with a card. 00632 has
no uniqueness constraint and the room offers no delete, so the household row stands.

Not cross-tenant (the consent org IS the designer's studio) and not data loss, which is why this
is minor. **Fix**: hold the door with a stated reason where `useProjectRecordedStudio` answers
null — the picker already does exactly this for the stamp (`rolodex-picker.tsx:1140-1145`,
"This job isn't attached to a studio yet…").

---

### r16-minor-6 (minor · medium) — a named refusal on the person card's "Close this seat" reads as a shrug

`close-seat-act.tsx:126-130` — `setError(e instanceof Error ? e.message : "Could not close the seat.")`.

`useCloseProjectPartySeat` (`use-coordination.ts:872`) throws the **raw PostgREST object**, which
is not an `Error`, so every refusal — 00624's card guard, an RLS rejection, a trigger token —
reaches the person card as the generic fallback. `write-error.ts:1-15` records this exact trap
by name ("PostgREST rejections arrive as a PLAIN OBJECT … both submit paths tested
`e instanceof Error` and fell through"), and every other face in this wave routes through
`writeErrorMessage`. The Call Sheet's own copy of this act does not share the defect.

---

### r16-minor-7 (minor · medium) — a new import cycle between `use-coordination` and `use-households`

`use-coordination.ts:11` imports `clientHouseholdKeys` from `./use-households`;
`use-households.ts:25` imports `partyAuthorityKeys` from `./use-coordination`. Both bindings are
read only inside callbacks, so nothing breaks today (593 jest suites and 105 vitest files are
green). It is a latent trap: a future top-level reference in either module — a derived key
constant, a frozen array — TDZ-crashes at import, and the crash surfaces as a blank portal
rather than a type error. A shared `keys.ts` (or moving `partyAuthorityKeys` beside
`clientHouseholdKeys`) removes it.

---

### r16-minor-8 (minor · medium) — `useCreateClientHousehold` writes `designer_clients` and invalidates nothing there

`use-households.ts:435-441` UPDATEs `designer_clients.household_id`, and `onSuccess`
(`:444-449`) invalidates only `clientHouseholdKeys.all` and `.detail`. `use-clients.ts` reads
`designer_clients` under its own keys and goes stale. Harmless today — no surface prints
`household_id` — but it is the binding rule ("mutations invalidate every touched key") broken on
a table the mutation really does write.

---

### r16-minor-9 (minor · low) — the household resolver's overlap read is unordered

`use-households.ts:384-388` — `.overlaps("member_person_ids", memberCardIds).limit(1)` with no
`.order()`. A card that belongs to two households (nothing forbids it; 00632 has no uniqueness
constraint) resolves to an arbitrary one, and the answer can change between refetches. An
`.order("created_at")` makes it stable.

---

### r16-minor-10 (minor · low) — `rosterWindowClause` now outranks the `later` band's own clause

`roster-row.tsx:107-124` (the r15 change). The off-job clause is composed from the row's record
BEFORE the band is consulted, so a row banded `later` that carries an `off_job_at` prints "Off
the job &lt;date&gt;." instead of "From &lt;date&gt;" — the arrival date the band exists to show
disappears. Narrow (a seat closed before its window opens), and the r15 fix is right for the
`clientSide` case it was written for; the `later` leg could keep both clauses.

---

### r16-minor-11 (minor · low) — `CompareMergeSheet`'s survivor pick is not reset when the PAIR changes

`compare-merge-sheet.tsx:305-314` resets `survivorId` only when `open` goes false. If `leftId` /
`rightId` ever change while `open` stays true, a stale `survivorId` survives; `survivor` /
`merged` then resolve by `survivorId === rightId` (`:437-441`) and `run()` would call
`merge_studio_contacts` with a `survivorId` naming a card the sheet is not showing. Not reachable
through `directory-view.tsx:207-234` today — the sheet is a modal `DocSheet`, so the band's
"Compare these two" buttons cannot be pressed behind it — so this is a latent trap, not a live
defect. Adding `leftId`/`rightId` to the reset predicate closes it.

---

## 5. Evidence

- `git -C … diff b3f3907fd..HEAD -- apps/designer-portal/src packages/supabase/src` — read in full.
- Probe for r16-major-1: staged a closed + later-open `client_rep` pair on
  `d0e00000-…-000a` inside `BEGIN … ROLLBACK`, comparing 00632's own lookup against the shape
  `useProjectHousehold` reads. Output quoted in the finding; zero residue (the transaction was
  rolled back).
- Probe for r16-minor-5: `select p.id, p.name, project_consent_org(p.id), project_recorded_studio(p.id), project_tenant_org(p.id) from projects` — read-only.
- Gates in §3, all run this round.
