# W3 round-25 — adversarial code review

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`,
HEAD `9a9d11d6e`. Local only; no prod anything, no migration minted, no server started, no port
taken. Read: `w3-room-report.md` (whole file), `w3-fix-log-r24.md`, `w3-review-r24-code.md`,
`rulings.md` §3, and the full diff `3d65f81e4..HEAD` over `apps/designer-portal/src` and
`packages/supabase/src` (50 files).

**Verdict: NOT clean — two major, zero blocking.** Both majors are the same defect the wave has now
filed nine times: the room report states a fact HEAD does not support. Nothing in the room's
behaviour is wrong this round; every behavioural check below came back clean and every gate is
green at HEAD.

---

## 1. Prior findings, re-checked at HEAD

The r24 fix round was documentation-only (`w3-fix-log-r24.md`: `git status --porcelain -- apps
packages supabase services` empty at its end, re-verified empty at HEAD), so only r24 major-1 was
worked. Every minor r24 left open is still open, re-measured:

| Finding | State at HEAD | Evidence |
|---|---|---|
| r24 major-1 — §3 row 3's pick count, §5's writer count | **FIXED** | §3 row 3 reads "4 of 6 from the Lindqvist kitchen selected" and names all six (`w3-room-report.md:199`); `bring-forward.ts:68-69` and `bring-forward.test.ts` agree (17/17 green). §5 reads "All **seven** writers" and enumerates `useSetPartyBid`; `grep -n "invalidateClientHouseholds(queryClient)" packages/supabase/src/hooks/use-coordination.ts` → **7** call sites at 588 · 755 · 978 · 1126 · 2101 · 2845 · 2956, exactly the lines and hooks the report names. |
| r24 minor-1 — a folded FIRM card invisible to id-resolvers | OPEN | no `resolve_merged_contact` call on the firm-card path outside `people-room.tsx`'s deep-link effect. |
| r24 minor-2 — the merge sheet is the one W3 write surface not routing its refusal through `writeErrorMessage` | OPEN | `compare-merge-sheet.tsx:468-472` — `setError(e instanceof Error ? e.message : …)`. (Mitigated: `useMergeStudioContacts` throws `new Error(asMergeError(error))`, `use-studio-contacts.ts:2123`, and `asMergeError` has its own bare-token backstop at `:2072`.) |
| r24 minor-3 — the consequence sentence lists "firm designations" among what moves | OPEN | `compare-merge-sheet.tsx:132-134`. |
| r24 minor-4 — the pick count and the act label count different people | OPEN | `rolodex-picker.tsx:955` (`picked.length`) vs `:1072` (`pickedSplit.fresh.length`). |
| r24 minor-5 — "Added by mistake" announces its refusal in the success voice | OPEN | `roster-row.tsx`'s remove path still routes through `setNote`. |
| r24 minor-6 / r23 minor-1 — the merge's fan-out does not reach the picker's history | OPEN | `useMergeStudioContacts.onSuccess` (`use-studio-contacts.ts:2126-2153`) names thirteen roots; `['studio-contact-history', …]` (`:541`) is not one. |
| r24 minor-7 — `CloseSeatAct`'s alert is never cleared | OPEN | `close-seat-act.tsx` — `setError` appears at `:81` (declaration) and `:179` (the catch) only; the confirm handler at `:164-181` never resets it. |
| r24 minor-8 — §2's invalidation enumeration is short by three | OPEN | `w3-room-report.md:185-188` still lists ten. |
| r24 minor-9 — §1's `### Changed` omits `database.types.ts` | OPEN — **and wider than filed**; see major-2. |
| r24 minor-10 — §5's "PR-n, twice" is now four | OPEN — **and the quoted sentence is wrong**; see major-1. |
| r24 minor-11 — the picker's checkbox rows are not a named group | OPEN | `rolodex-picker.tsx:961` — a bare `<ul>`; the kind chips at `:911` carry `role="group"` + `aria-label`. |
| r24 minor-12 — `useRemoveProjectParty` does not invalidate `partyBidKeys` | OPEN | `use-coordination.ts:1121-1127`. |
| r23 minor-2 — `writeErrorMessage` has no bare-token backstop | OPEN | `write-error.ts` still ends `return raw` after the schema-word guard. |
| r23 minor-3 — one refusal spoken for several refused picks | OPEN | `rolodex-picker.tsx:792-800`, the reason at `:797`. |
| r23 minor-4 — the merge sheet's heading is off the type ladder | OPEN | `compare-merge-sheet.tsx:524` — `font-heading text-[1.35rem]`. |
| r23 minor-5 — a comment quotes the sentence M2R-1 removed | OPEN | `roster-row.tsx:386`. |
| r23 minor-6 — the duplicate band no longer sees a card colliding with a cardless seat | OPEN, as M2R-6 intended | `people-derivation.ts:1370`. |
| r23 minor-7 — the merge act is natively `disabled` with no reason on the face | OPEN | `compare-merge-sheet.tsx:608` — `disabled` with no `held`; `document-action.tsx:309` renders `disabled={unavailable && !held}`. |
| r23 minor-8 — the close pre-read and the close write are not one statement | OPEN | `use-coordination.ts:933-951`. |

---

## 2. Findings

### major-1 (confidence: high) — §5 quotes a sentence the held "Set the figure" act does not carry (ninth filing)

`w3-room-report.md:293-299`:

> "Set the figure" is `aria-disabled` for a plain member with `aria-describedby` pointing at a
> sentence that is **always on the face**, pressed or not — and that sentence is the BAND's own
> (`household-band.tsx:721-724`, the held act's click handler): "A change-order figure is the
> principal's to set. Ask an owner or an admin of the studio."

Three claims, and the identification of the sentence is false. Measured at HEAD:

* `household-band.tsx:716-719` — `aria-disabled={!isPrincipal}` and
  `aria-describedby={!isPrincipal ? "household-figure-held" : undefined}`. So the describedby target
  is `#household-figure-held`.
* `household-band.tsx:780-788` — that element. It reads
  **"The change-order figure is the principal's to set. An owner or an admin of the studio can
  write it."**
* `household-band.tsx:721-724` — the lines the report cites — are the click handler's
  `setError(…)`, which reads "A change-order figure is the principal's to set. Ask an owner or an
  admin of the studio." That string lands in the band's `role="alert"` paragraph
  (`:973-980`) and is therefore **not** always on the face: it appears only after a press, and it
  is not what `aria-describedby` points at.

So the report names the wrong element, cites lines that hold a different string, and quotes on a
face a sentence that face does not print in that position. The two strings differ in the article
("A" / "The"), in the verb phrase ("Ask an owner or an admin" / "An owner or an admin … can write
it") and in when each is reachable.

This is the same class as r7 M-4, r8 MAJOR-1, r15 MAJOR-3, r19 major-2, r20 major-2, r21 major-5,
r23 major-1 and r24 major-1 — a quoted face string the code does not print. r24's own minor-10
touched this paragraph ("PR-n, twice is now four") and the fix round did not open it, so the
quotation went unmeasured for a ninth round.

**The one command that settles it:**

```bash
sed -n '716,719p;721,724p;780,788p' apps/designer-portal/src/components/document/roster/household-band.tsx
```

**The fix.** §5 should say: the describedby target is `#household-figure-held`
(`household-band.tsx:780-788`), always on the face, reading "The change-order figure is the
principal's to set. An owner or an admin of the studio can write it."; the click handler's own
string (`:721-724`) is the ALERT a press raises; and the hook's `household_threshold_forbidden`
(`use-households.ts:116-117`, correctly cited) is the third. Three sentences for one rule, not two —
which is also r24 minor-10's point.

---

### major-2 (confidence: high) — §1's enumeration is short by five of the fifty files its own re-measure command returns

The report's banner (`w3-room-report.md:37-40`) names the command that settles the `### Changed`
table:

```bash
git diff --stat 3d65f81e4..HEAD -- apps/designer-portal/src packages/supabase/src
```

Run at HEAD: **50 files changed, 12804 insertions(+), 189 deletions(-)**. The report accounts for
45 of them — 8 under `### New` (7 portal + `use-households.ts`), 18 rows in `### Changed`, and 19
test files across `### Tests` and the "Mock factories widened" list. **Five are named nowhere in the
file** (`grep -n "database.types\|use-households-r16\|people-room-address\|people-directory-derivation\|people-room-nudge-scope" w3-room-report.md` → no match):

| Unnamed file | Diff |
|---|---|
| `packages/supabase/src/database.types.ts` | +348 — the generated types for 00628–00634 that the whole data layer rides on (r24 minor-9) |
| `packages/supabase/src/hooks/__tests__/use-households-r16.test.ts` | +267, **4 tests**, new this branch |
| `apps/designer-portal/src/components/document/people/__tests__/people-directory-derivation.test.ts` | +23 |
| `apps/designer-portal/src/components/document/people/__tests__/people-room-address.test.tsx` | +51 |
| `apps/designer-portal/src/components/document/people/__tests__/people-room-nudge-scope.test.tsx` | +2 |

"Short by N files this branch changes" is exactly the shape r23 major-1 was filed as, and the
report's §1 header block says the table was re-measured with this command in the r23 round and the
command "verified to run: 50 files changed" in the r24 round — so the command was run twice and the
table was reconciled against it neither time. r24 major-1 states "§1's `### Tests` counts
re-measured below and **all correct**": the counts are correct (see §4 below — the twelve
designer-portal files sum to exactly the 226 tests I measured, and `people-crm-w3.test.ts` is
exactly 66), but the LIST is short by four test files, one of which is a 267-line new suite in
`packages/supabase`.

r24 filed the `database.types.ts` half alone as minor-9. Filed here as major because the defect is
not one omitted generated file but an enumeration that misses five files after two rounds of
explicitly re-running the command that produces them — the drift class, not a single row.

**The fix.** Add `database.types.ts` to `### Changed` ("00628–00634's generated types,
`pnpm db:generate`"), add `use-households-r16.test.ts` (4, vitest) to `### Tests`, and add the three
people-surface test files to the "Mock factories widened" list. Then re-run the command and check
that New + Changed + Tests = 50.

---

### minor-1 (confidence: medium) — the close gate's face and 00634's own gate resolve the studio two different ways

`roster-row.tsx:255-263` computes `isPrincipal` against `consentOrg`, which
`call-sheet.tsx:109` takes from `useProjectConsentOrg` → `project_consent_org(project)`:

```sql
SELECT COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))
```

00634's own gate reads `project_party_recorded_studio(NEW.id)` →
`project_recorded_studio(project)` → `SELECT p.studio_id` with **no fallback**
(`00634:184-196`; both definitions read off the local catalog). The two answers diverge on exactly
the population R-BI and R-BD name — a project whose `studio_id` is NULL. There, the face can read
`isPrincipal = true` off the designer's primary studio and offer "Close this seat" live on a seat
carrying an open grant, while the trigger computes `v_recorded = NULL`, fails
`is_active_studio_member(NULL)`, and raises `seat_close_authority_forbidden` — the gated act
offered unqualified, which is the harm r21 MAJOR-1 fixed for the ordinary case.

Narrow: it needs a studio-less project AND an open grant on the seat (`v_open = 0` returns early),
and 00628 backfills `projects.studio_id`. But R-BD also rules `project_consent_org()` retired from
guards, and this is a new guard reading it. `close-seat-act.tsx:93-101` uses the CARD's
`organizationId` instead, which 00624's own card guard holds equal to the project's recorded studio
— a third resolution for one rule.

**The fix.** Read the seat's own recorded studio (`useProjectRecordedStudio`, already in the
codebase and already used by `rolodex-picker.tsx:279`) for the close gate on both surfaces, or say
in §6 why the two faces resolve it differently.

---

### minor-2 (confidence: medium) — a reasonless hand-close is indistinguishable from a withdrawal, so R-BR's clearing branch can null a recorded close date

`use-coordination.ts` `seatClosedByHand()` (`:1056-1068` region) returns true only when the seat
carries a date AND either the outcome is not `withdrawn` or **a reason stands beside it**:

```ts
return (previous.bidOutcome ?? null) !== 'withdrawn' || !!(previous.offJobReason ?? '').trim();
```

`useCloseProjectPartySeat` does not require a reason — `close-seat-act.tsx:149-154` and
`roster-row.tsx:1268` both write `off_job_reason = input.reason?.trim() || null`, and neither field
is validated. So the three-press path r21 major-4 closed for a reasoned close is still open for a
reasonless one: hand-close with an empty "Why it closed" → "They withdrew" (moved, no re-stamp,
`!previous.offJobAt` is false) → "They quoted" → `seatClosedByHand` is false, the R-BR branch runs,
and `off_job_at` — the day the studio's own act recorded — is nulled with no audit row.

Milder than r21 major-4 (no typed sentence is lost, and after the correction the seat genuinely is
back in the bidding, so an empty `off_job_at` is the state R-BR wants), but the studio's hand-close
is undone by a bid correction rather than by a named act.

**The fix.** Either require a reason on the hand-close (the field is already labelled "Why it
closed"), or give the close its own signal — R-BS's clamp already distinguishes the two statements
in `00634`'s WHEN clause and the same distinction could be carried on the row.

---

### minor-3 (confidence: high) — the person card's held close act says nothing when pressed; the Call Sheet's says why

`close-seat-act.tsx:113-122` passes `disabled` + `held` + `aria-describedby` but **no
`onHeldActivate`**, so `DocumentAction` swallows the activation and calls nothing
(`document-action.tsx:286-289`). `roster-row.tsx:1276` passes
`onHeldActivate={() => setNote(closeHeldSentence)}` for the identical rule. The reason is visible
beside both, so this is not an a11y contract break — but §6 calls the two copies "hand-kept in
step" and this is a step they are out of.

---

### minor-4 (confidence: high) — a partly successful bring-forward is announced in the refusal voice

`rolodex-picker.tsx:801-809` builds `"N people went on the call sheet. "` and hands it to
`setError(…)`, which renders in the sheet's `role="alert"` paragraph in
`--color-terracotta-ink` (`:1119-1123`). A studio that ticks six, four of which land, is told so in
red, under an alert, by the same element that carries a refusal. The wave's own grammar splits
these everywhere else (`roster-row.tsx:282` `closeError` vs `setNote`; r7 MAJOR-4, r21 major-2).

---

### minor-5 (confidence: high) — the merge announcement names two of the three facts the survivor flip does not decide

`compare-merge-sheet.tsx:461-466` announces "… except the trades and specialties, which are kept
together." The consequence sentence three elements above (`:158-159`) names a third: "a card
recorded as a sole proprietor keeps that either way", and 00629 ORs `is_sole_proprietor` exactly as
it UNIONs the two arrays (r11 BLOCKING-1's own measurement). The report §2 says the announcement
"carries the same split the consequence sentence does"; it carries two thirds of it.

---

## 3. Checked and clean

Every item the brief names, measured at HEAD.

**The travel list writes only the allowed facts.** `useBringForward`'s INSERT
(`use-coordination.ts:2914-2926`) names exactly nine columns: `project_id`, `party_kind`,
`display_name`, `company_name`, `company_id`, `trade`, `phone`, `email`, `studio_contact_id`. No
consent column, no bid column, no `show_to_client`, no pricing, no notes — matching `TRAVELS` /
`STAYS_BEHIND` (`travel-list-pane.tsx:20-34`) and PR-b. `people-crm-w3.test.ts` sweeps the payload
with `/studio_contact_id|party_kind|sms_consent|project_parties|show_to_client/`.

**Consent is never copied per seat.** No `+` line anywhere in the diff writes an
`sms_consent_*` column or calls `record_channel_consent`; the only `sms_consent_status` strings
added are a test's forbidden-key list. `useAddProjectParty` still records through
`record_channel_invite` alone (`:537`), R-AY's record-only posture. The picker reads the verdict
live off `useChannelConsentRecords` (`:419-426`) and composes it through the one composer
(`consent-sentence.ts`, `bring-forward.ts:163-177` records why a second one was deleted).

**Merge: survivor flip and a true consequence sentence.** `preferredSurvivorId` picks the older
card, ties on the id (`:64-72`); the pre-pick is taken once and guarded by `if (survivorId || !left
|| !right) return;` (`:312`), so a refetch cannot undo a flip; both column heads are `aria-pressed`
buttons (`:481-484`). `mergeConsequenceSentence` branches the contact-rule clause on the PAIR
(`ruleMoves = mergedHasRule && !survivorHasRule`, `:131`; `ruleStays = survivorHasRule &&
mergedHasRule`, `:135-138`) and splits trades/specialties/sole-proprietor out of "the survivor's own
words stand". `MERGE_REFUSAL_SENTENCES` has **15** keys, counted programmatically over
`use-studio-contacts.ts:1925-1974` — exactly the fifteen §2 enumerates, ending at
`merge_seat_authority_collision`, whose `details` third word steers the repair to the seat that left
(`asMergeError` `:2024-2050`). No data loss on merge: `merged_into` is set, the card is kept, and
`resolve_merged_contact` is wired to the Room's address (`people-room.tsx:126-131, 328-350`).

**PR-n gating.** Four held acts on the household band, all `aria-disabled`/`held` with a visible
reason and an `onHeldActivate` where an act is offered: "Set the figure" (`:713-741`), "Take the
figure away" (`:743-767`), "Record the authority" (`:833-849`), "Add to the household"
(`:937-961`). `householdAddIsHeld` mirrors 00632's grant leg; `seatCloseIsHeldForMoney`
(`use-coordination.ts:897-905`) mirrors 00634's second leg with the same `effective_to IS NULL`
predicate. `useSetHouseholdThreshold` translates a zero-row RPC answer into
`household_threshold_forbidden`'s sentence rather than swallowing it (`use-households.ts:610-615`).
R-BQ holds: `set_household_threshold` opens nothing and the band's own named per-member act is the
only door (`:797-852`).

**"Close this seat" replaced every hard delete.** `grep -rn "useRemoveProjectParty|\.delete()"` over
`apps/designer-portal/src` and `packages/supabase/src/hooks/use-coordination.ts` returns exactly one
party/seat delete: `use-coordination.ts:1117`, reached only through `useRemoveProjectParty`, whose
only importer is `roster-row.tsx:43,329` ("Added by mistake"), held behind `seatDeleteRefusal` over
consent + bid + paper, with the bid leg reading the 00631 columns as well as `stage`
(`:1035-1042`). No other surface added one.

**Invalidations.** `useCloseProjectPartySeat` and `useSetPartyBid` both reach
`partyAuthorityKeys.all` and the household keys (R-BS); all seven seat/authority writers call
`invalidateClientHouseholds`; `useMergeStudioContacts` reaches thirteen roots including
`partyBidKeys.all`, `clientHouseholdKeys.all` and `resolvedContactKeys.all`;
`useCreateClientHousehold` / `useSetHouseholdThreshold` / `useAddHouseholdMember` all invalidate
`clientHouseholdKeys.all`, which is a prefix of `useProjectHousehold`'s
`["client-households","project",projectId]`; the archive/restore RPCs invalidate
`studioContactKeys.all`, which is what `roster-groups.tsx:96` reads the archived-inclusive book
through. The two gaps are minor-6 and minor-12 of r24, both still open.

**aria rules.** Every gated act in the wave uses `held` beside `disabled`, and `DocumentAction`
renders `disabled={unavailable && !held}` plus an `aria-disabled` mark, so the control stays in the
tab order and its `aria-describedby` is reachable — `close-seat-act.tsx:116-118`,
`archive-card-door.tsx:97-99`, `household-band.tsx:837-843, 941-949`, `roster-row.tsx:1168-1175,
1221-1228, 1271-1275, 1344-1345`, `person-profile.tsx:491-492`. `household-band.tsx:592, 716, 746`
use raw `aria-disabled` on plain buttons that stay focusable. The only bare `disabled` left in W3
code is on pending states (`rolodex-picker.tsx:1032, 1043, 1265`, `party-mini-row.tsx:247`) and on
the merge act (r23 minor-7, open). `PartyMiniRow` takes `role="checkbox"` + `aria-checked` under
`multi` (`:245-246`).

**Document grammar.** Zero `box-shadow` / `shadow-` in any W3 file (the only hits are
`state-word.tsx`'s comment and `doc-sheet-elevation.test.ts`'s own guard). All colour goes through
house tokens. The roster surface's files use the `--color-*` family and raw `text-[0.…]` sizes; that
is the pre-existing convention of every file in that directory (`roster-row.tsx` 0 `t-*` / 30 raw,
`call-sheet.tsx` 0/4), and the new `people/` files use `t-body-sm` + `--ink*` like their
neighbours — one off-ladder size, r23 minor-4, still open.

**DocSheet for every sheet.** `CompareMergeSheet` (`:515-521`, `wide`) and `RolodexPicker`
(`:894-900`, with `pageLabel`) are the wave's two sheets and both are `DocSheet`s; the page label no
longer hides below `sm` (`doc-sheet.tsx:161-176`).

**SPEC vocabulary.** No schema word reaches a face on any W3 path I could reach: `asMergeError`
(with a bare-token backstop), `asBidError`, `asSeatCloseError`, `asHouseholdError`, `asArchiveError`
and `writeErrorMessage` sit between every write and every alert, and `write-error.ts` gained 00634's
two seat-close tokens (`:78-90`). The residues are r23 minor-2 and r24 minor-2, both open.
`HOUSEHOLD_MEMBER_ROLE_LABELS` keeps `client_rep` off the face; `SEAT_BID_OUTCOME_ACTS` keeps
`no_response` / `off_job` off it, and `roster-row.test.tsx` sweeps the DOM for them.

**Playwright.** `apps/designer-portal/e2e/people/bring-forward.spec.ts` and `merge.spec.ts` are both
chromium-pinned by `test.skip(({browserName}) => browserName !== "chromium", …)` (`:30-33` and
`:23-26`), both go through `../fixtures/auth` and `../helpers/supabase-admin`'s `adminDb`, and
`bring-forward.spec.ts` runs `sweep_compliance_expiries()` in `beforeAll` and tears its own project
down. Not re-run this round (a review takes no port); the report declares that honestly at §10
item 1.

**Scope.** No trade or homeowner writing surface anywhere in the diff. No migration minted — branch
head is `00634`, nothing entered `00595`–`00620`. `git status --porcelain -- apps packages supabase
services` is empty at HEAD.

---

## 4. Gates, run this round at HEAD `9a9d11d6e`

| Gate | Result |
|---|---|
| `pnpm --dir packages/supabase type-check` | `tsc --noEmit` — **exit 0**, clean |
| `pnpm --dir apps/designer-portal type-check` | `tsc --noEmit` — **exit 0**, clean |
| `pnpm --dir apps/admin-portal build` | **exit 0**, full route table printed (the strictest gate, after the shared `@patina/supabase` edits) |
| `npx jest` over the twelve W3 designer-portal suites | **12 suites passed, 226 tests passed**, 3.8 s — compare-merge-sheet 17 · close-seat-act 9 · archive-card-door 8 · household-band 45 · rolodex-picker 40 · roster-row 56 · travel-list-pane 5 · use-project-authority 3 · bring-forward 17 · compliance-notice 10 · write-error 6 · doc-sheet 10 = 226, so every count in §1's `### Tests` is right |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts src/hooks/__tests__/use-households-r16.test.ts` | **2 files, 70 passed** — `people-crm-w3` **66** (the report's figure), `use-households-r16` **4** (named nowhere; major-2) |

No server was started, no port taken, no database was written to (the only DB access was a
read-only `pg_get_functiondef` over four tenant-resolution functions, for minor-1).

---

## 5. Bottom line

Zero blocking. Two major, both documentation: §5 quotes a sentence the held act does not carry
(major-1, the ninth filing of the drift defect), and §1's enumeration is short by five of the fifty
files its own re-measure command returns (major-2, subsuming r24 minor-9). Five new minors and the
twenty carried from r23/r24. The room itself — the merge, the picker, the bidding band, the
household and both close surfaces — measured clean against every check the brief names, and every
gate is green at HEAD.
