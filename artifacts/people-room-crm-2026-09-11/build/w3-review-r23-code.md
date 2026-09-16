# W3 (P2) — adversarial code review, round 23

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `b3f2515c4` ("merge asks the money question of the grant, not the seat (r22 MAJOR-1)").
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod touched.
No migration minted. No server started, no port taken, no Playwright run.** Nothing was written to
the worktree except this file.

Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src` across
`3d65f81e4..HEAD` (50 files, +12 632 / −189), read in full. Rulings §3 of `rulings.md` are settled
and not findings; anything the reports scope to W4 is out of scope.

**Verdict: NOT clean — two major, zero blocking, eight minor.**

---

## 1. Prior findings, re-checked at HEAD

`build/w3-fix-log-r22.md` assigned exactly one finding this cycle.

| id | claim | state at HEAD | evidence |
|---|---|---|---|
| r22-MAJOR-1 | R-BS's clamp re-opened r19 MAJOR-1 through the Bidding band: a seat dated by "They withdrew" keeps its open grants, `merge_seat_collision`'s `off_job_at IS NULL` predicate cannot see it, and the fold left one human holding two live money grants on one job | **FIXED** | the fourth pre-check raises by name at `supabase/migrations/00629_studio_contact_merges.sql:1815`; the sentence at `packages/supabase/src/hooks/use-studio-contacts.ts:1972-1973`; the DETAIL-aware branch at `:2015-2024`; block 13d's five new pins run green (below) |

Gate re-run for it, this round, on the already-migrated local database:

```
psql … supabase/tests/people/w3_merge_sweep_household_test.sql
  13d. r18 MAJOR-1 / r19 MAJOR-1 / r22 MAJOR-1 — … a seat dated by a recorded withdrawal keeps its
       open grant (R-BS) and is refused by a fourth name, merge_seat_authority_collision, until the
       still-open seat is closed …: passed
  13e. r20 BLOCKING-1 …: passed
  13f. r21 MAJOR-2 / R-BS …: passed
  W3 SQL suite: all blocks passed
  ROLLBACK      rc=0
```

Coverage of the token set was re-measured rather than taken on trust: `merge_studio_contacts()`
raises **fifteen** distinct `merge_*` tokens, and `MERGE_REFUSAL_SENTENCES` carries all fifteen —
no refusal falls through to `asMergeError`'s bare-token fallback. (The *word* "fourteen" is stale
in two places; that is major-1 below.)

---

## 2. Findings

### major-1 — the room report's §1 and §2 do not describe the sheet that shipped (seventh filing)

**Where:** `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:154` and the `### Changed`
table at `:1`; the same wrong word at `packages/supabase/src/hooks/use-studio-contacts.ts:1924`.

**What is wrong.** §2 reads "Each of `merge_studio_contacts()`'s **fourteen** refusals renders as a
sentence" and then enumerates them, ending at `merge_seat_collision`. The map holds **fifteen**, and
the fifteenth — `merge_seat_authority_collision` — is the entire subject of the r22 fix round that
produced HEAD. Measured:

```
grep -oE "^  [a-z_]+:" packages/supabase/src/hooks/use-studio-contacts.ts   # the map, :1925-1974
  … merge_seat_collision
  merge_seat_authority_collision                  <- 15th, named nowhere in §2

grep -oE "RAISE EXCEPTION 'merge_[a-z_]+'" supabase/migrations/00629_…sql | sort -u | wc -l
  15
```

The doc comment one line above the map (`:1924`, "`merge_studio_contacts()`'s fourteen named
refusals") is stale in the same way, in the file the r22 round edited.

§1's `### Changed` table is also short by four files that this branch changes:

| changed at HEAD | named in §1 |
|---|---|
| `apps/designer-portal/src/lib/document/people-derivation.ts` (M2R-6 — the predicate that decides whether "Compare these two" is offered at all) | no |
| `apps/designer-portal/src/lib/document/write-error.ts` (r21's two 00634 sentences) | no |
| `apps/designer-portal/src/components/document/overlays/doc-sheet.tsx` (r19 MAJOR-1's page label at 390) | no |
| `apps/designer-portal/src/components/document/roster/use-project-authority.ts` (r19 MAJOR-1's ended-with-its-seat filter) | no |

`git diff --stat 3d65f81e4..HEAD -- apps/designer-portal/src packages/supabase/src` lists all four.

**Why major.** The report is the record a reader (and Kody's walk) reads about what shipped. A
reader of §2 does not learn that the money gate the last round added exists, and a reader of §1 does
not learn that the duplicate band's own detection predicate was rewritten. This is the same defect
r7 M-4, r8 MAJOR-1, r15 MAJOR-3, r19 major-2, r20 major-2 and r21 major-5 filed — each time because
a fix round changed something an earlier round had already counted. §1 itself says every count was
re-measured "in the r21 fix round"; r22 changed the file and did not re-measure.

**Fix.** Change "fourteen" to "fifteen" in both places, add
`merge_seat_authority_collision`'s clause to §2's enumeration beside `merge_seat_collision`, and add
the four files to §1's `### Changed` table. Then state in §1 the round the re-measurement was taken
in, so the next round knows what it is inheriting.

**Confidence: high** (measured directly against HEAD and the migration).

---

### major-2 — the bring-forward picker's search denies the firm its own row prints

**Where:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:339-357`
(`hits`), against `:952` (`company={firmNameFor(c)}`) and `:514-518` (`firmNameFor`). The file's own
comment at `:264-270` states the opposite: "the search runs in memory over the name, the firm, the
email AND the prior job the history line already names."

**What is wrong.** `hits` matches over `c.full_name`, **`c.company_name`**, `c.email` and the prior
job names. `company_name` is 00417's typed-by-hand snapshot, and this same file's F1 comment
(`:492-512`) records that nothing since the affiliation model populates it. Re-measured on the local
database this round:

```sql
select count(*) filter (where company_id is not null)                                  as with_firm,
       count(*) filter (where company_id is not null and coalesce(btrim(company_name),'')='')
         as with_firm_no_name
from public.studio_contacts where entity_kind='person';
 with_firm | with_firm_no_name
-----------+-------------------
        22 |                22
```

So the field the search reads is NULL for **every** carded human with a firm, while the row two
elements away prints the firm resolved through `directoryFirmOf(wordsByCard.get(c.id))`. On the
shipped seed the gap is masked for most cards by the e-mail domain (`dana@northgate-electric.com`
matches "Northgate"), which is why a walk did not catch it. It is not masked where the card has no
e-mail:

| card | firm the mini row prints | e-mail | searching the firm |
|---|---|---|---|
| Luis Ochoa | Marrow & Sons | NULL | **misses** — "Marrow" returns Tom Marrow, Erin Sato and the firm card, not Luis |
| Joe Wozniak | Cedar & Iron Framing | NULL | **misses** — "Cedar" returns the firm card only |

The placeholder on the same input (`:868`) promises `a name, a company, a trade…`; the trade is not
searched at all either — `tradeFor(c)` prints "electrical" on Dana Kowalski's row (`:540-541`) and
typing `electrical` returns nothing, because her `trades` live on the FIRM's card.

**Why major.** This is the exact shape of r7 MAJOR-2, already filed and fixed in this build: "the
wave taught the row to read the firm's trade and left the filter behind, so the picker denied a fact
it printed" (`:309-321`). r7 fixed the *chip*; the free-text search beside it was left on the legacy
columns. Before W3 the picker's row printed no firm at all, so there was no contradiction — F1 put
the firm on the face and this half was not moved with it. One half of one sheet contradicting the
other half is the defect class this build calls major.

**Fix.** Search the resolved values, both of which already exist in this component:
`firmNameFor(c)` (hoist it above `hits`, or inline
`directoryFirmOf(wordsByCard.get(c.id) ?? …).name`) and `tradesOfCard(c, firmCardById)` — the same
resolver `scanned` already uses for the chip at `:326`. Keep `c.company_name` as the fallback term
for a book that really did type a firm name by hand.

**Confidence: high** (both the NULL population and the two missing cards measured on the local
database this round).

---

### minor-1 — a fold leaves the picker's history line stale

`packages/supabase/src/hooks/use-studio-contacts.ts:2097-2125` invalidates twelve roots on a merge.
`useStudioContactHistory`'s key is `['studio-contact-history', ids, excludeProjectId]` (`:541`) —
not `studioContactKeys.all` (`['studio-contacts']`) and not prefixed by any of the twelve. The fold
repoints `project_parties.studio_contact_id`, which is exactly what that rollup groups by, so with
`staleTime` five minutes and `refetchOnWindowFocus` false the picker opened shortly after a merge
prints the survivor's pre-merge count ("Worked 1 prior project…") over a card that now holds both
cards' seats — and `sharedJobName` / the search's `projectNames` leg read the same stale rollup.
Add `void queryClient.invalidateQueries({ queryKey: ['studio-contact-history'] })` beside the other
two roots r13 MAJOR-3 added. **Confidence: high** on the key gap; medium on how often a studio meets
it.

### minor-2 — `writeErrorMessage` has no bare-token backstop

`apps/designer-portal/src/lib/document/write-error.ts:94-102` suppresses a schema word only when the
message contains `duplicate key|violates|constraint|idx_|_fkey|_pkey|column |relation `; anything
else is returned verbatim. Every bare `snake_case` token therefore needs its own named branch, and
the file has twelve. `asMergeError` adopted the general posture at r13 MAJOR-1
(`use-studio-contacts.ts:2045-2047`: `if (/^[a-z][a-z0-9_]*$/.test(message.trim())) return …`) and
this translator — the one five W3 faces route through — did not. Any future trigger token, and any
00631 token `asBidError` passes through unmatched, still reaches a `role="alert"` as itself. Add the
same regex guard immediately above the final `return raw`. **Confidence: high** on the gap; no live
reproduction found at HEAD (all currently-raised tokens are named).

### minor-3 — one refusal spoken for several refused picks

`rolodex-picker.tsx:753-761` names every refused pick (`result.refused.map(row => row.name)`) and
then translates **`result.refused[0].reason`** alone. `useBringForward` inserts one at a time and
collects a reason per pick (`use-coordination.ts:2931-2941`), so two picks refused for two different
reasons read as one sentence asserting the first reason about both. Group the refusals by translated
sentence, or name only the first refusal's card beside its own reason.
**Confidence: high** on the code path.

### minor-4 — the merge sheet's heading is off the type ladder

`compare-merge-sheet.tsx:524` sets `font-heading text-[1.35rem]` (21.6 px). The `.t-*` display steps
are 34 / 26 / 20 px (`globals.css:2039-2041`) and the two sibling sheets in the same room use
`text-[1.6rem]` (`people/party-profile-sheet.tsx:583`, `people/view-shell.tsx:333`). 1.35 rem is a
third size, on neither ladder. Use `t-d3` or the sheets' own 1.6 rem.
**Confidence: high.**

### minor-5 — a comment still quotes the sentence M2R-1 removed

`roster-row.tsx:386` documents the clause as `"Northgate Electric's insurance lapses in 30 days, on
6 October 2026."` The interval was deliberately taken out — `compliance-notice.ts:52-66` explains
why at length, and `expiryNoticeClause` emits `lapses on <date>.` The next reader of this row will
believe the wrong string is shipped. **Confidence: high.**

### minor-6 — the duplicate band no longer sees a card colliding with a cardless seat

`lib/document/people-derivation.ts:1358-1370` narrowed the scan from "not a firm, not a legacy client
record" to `row.role !== "contact" → continue`. `people_directory` has six branches
(`client` / `lead` / `maker` / `<party_kind>` / `team` / `contact`, confirmed against
`pg_get_viewdef`), and only the `contact` branch carries a card id — so the narrowing is correct for
an act that merges two `studio_contacts` rows. But it also drops the **party** branch
(`studio_contact_id IS NULL` seats), which the old predicate did pair: a cardless seat sharing a
number with a card is now surfaced on no face at all. That is a deliberate-looking narrowing that
neither the room report nor the M2R-6 comment declares. Either say so in §10, or keep naming those
pairs in the band's sentence with no act beside them (R-Y's own P1 shape).
**Confidence: high** on the behaviour change; medium that it matters to a studio.

### minor-7 — the merge act is natively `disabled` with no reason on the face

`compare-merge-sheet.tsx:604-613` passes `disabled={!canMerge || merge.isPending}` and no `held`.
`DocumentAction` renders a native `disabled` button in that case (`document-action.tsx:309`), off the
tab order, with nothing beside it. `canMerge` is false for the whole window between the sheet opening
and both `useStudioContact` reads resolving, so a keyboard or screen-reader user who tabs in early
meets a dead primary act. Every other W3 act that can be un-pressable pairs `disabled` with `held`
and an `aria-describedby` sentence (`close-seat-act.tsx:116-118`, `household-band.tsx:941-949`,
`archive-card-door.tsx:97-99`, `roster-row.tsx:1271-1275`). **Confidence: high** on the attribute;
medium on the window's length.

### minor-8 — the close pre-read and the close write are not one statement

`use-coordination.ts:932-953` reads `off_job_at, off_job_reason` and then UPDATEs on the answer.
Two concurrent closes both read "not closed" and the second writes its own date; and a pre-read
refused by RLS returns `data: null, error: null` (`.maybeSingle()`), so `alreadyClosed` reads false
on a seat that may in fact be dated. The r20 invariant ("the day a seat left the job is written
once") holds under a single actor and is unenforced under two. 00634 is already the trigger on this
write — a `.is('off_job_at', null)` leg on the dated branch, or the whole rule moved into the
trigger, makes it an invariant rather than a convention.
**Confidence: medium** (no live reproduction; the RLS leg also fails the subsequent UPDATE, so the
realistic cost is a re-dated seat under concurrency, not a leak).

---

## 3. Checked and clean

**Travel list writes only the allowed facts.** `useBringForward`'s INSERT
(`use-coordination.ts:2916-2930`) names exactly `project_id`, `party_kind`, `display_name`,
`company_name`, `company_id`, `trade`, `phone`, `email`, `studio_contact_id`. No consent column, no
bid column, no `show_to_client`, no pricing, no notes — so the seat is born at PD-11's opt-in default
and reads Pete Rusk's refusal off the record with no write at all. `grep -rn "sms_consent"
packages/supabase/src/hooks/*.ts` returns type declarations and R-AS/R-AY comments only; nothing in
the portal writes the frozen columns. `TravelListPane`'s fixed contract (`travel-list-pane.tsx:20-34`)
matches: `show to client` under STAYS_BEHIND, `consent by channel value` under TRAVELS.

**Consent is never copied per seat.** The only consent writer remains `record_channel_consent`
through `useRecordPartySmsConsent`; the merge sheet's consequence sentence and the Room's
announcement both say so in the same words (`compare-merge-sheet.tsx:160`, `:461-465`), and 00629
writes nothing to `studio_channel_consent`.

**Merge sheet — survivor flip and a true consequence sentence.** `preferredSurvivorId` picks the
older card, ties broken on the id (`:64-72`); the pre-pick is taken once and never re-taken, so a
refetch cannot undo a flip (`:305-314`); both heads are `aria-pressed` buttons (`:484`). The
consequence sentence branches on the PAIR for the contact rule (`ruleMoves = mergedHasRule &&
!survivorHasRule`, `:131`; `ruleStays = survivorHasRule && mergedHasRule`, `:135`), splits trades /
specialties / sole proprietor out of "the survivor's own words stand" because 00629 UNIONs and ORs
them, and the `role="status"` announcement carries the same split (`:462-464`). `carriedRows`
resolves the three designation ids to names, never ids (`:214-217`, `:255-260`).

**PR-n gating.** Four surfaces, one shape, all with the reason on the face whether or not the act can
be pressed: the household figure (`household-band.tsx:716-719` + `:780-788`), "Add to the household"
(`:941-949`, `householdAddIsHeld` mirrors 00632's own grant leg), "Record the authority"
(`:837-844`), and both close surfaces (`close-seat-act.tsx:116-133`, `roster-row.tsx:1271-1296`,
both off `seatCloseIsHeldForMoney`, which mirrors 00634:156-160). The held sentence and the hook's
own refusal sentence are deliberately different strings and both are correct.

**"Close this seat" replaced every hard delete.** `grep -rn "useRemoveProjectParty\|removeParty\b"`
over `apps` + `packages` (tests excluded) returns exactly one call site,
`roster-row.tsx:1175`, inside the close-confirm block, held behind `seatDeleteRefusal` with its
reason printed at `:1194-1198`. The only `.delete()` on `project_parties` in the repo is
`use-coordination.ts:1117`, behind the same predicate re-checked server-side over
`identity_paper_state` and `channel_consent_status`. The word "Remove" appears on no roster or
people face.

**Invalidations.** Every W3 mutation was traced to its readers' keys. `useMergeStudioContacts`
reaches twelve roots including `partyBidKeys.all`, `clientHouseholdKeys.all` and
`resolvedContactKeys.all`; `useCloseProjectPartySeat` and `useSetPartyBid` both reach
`partyAuthorityKeys.all` (which `projectAuthorityKeys.project` nests under,
`use-project-authority.ts:24-27`) and the household keys; all six seat writers plus `useBringForward`
call `invalidateClientHouseholds`; `clientHouseholdKeys.all` is a prefix of
`['client-households','project',…]`, so the band refetches. The one gap is minor-1.

**Cross-tenant.** RLS re-read on the live database: `client_households` selects on
`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`,
`studio_contact_merges` and `studio_compliance_notices` on `is_active_studio_member(organization_id)`.
`useProjectHousehold`'s unfiltered `.overlaps("member_person_ids", …)` is therefore tenant-scoped by
the policy, not by the query, which is the right place for it. No portal path reads or writes across
a studio boundary.

**Hooks above early returns, hydration.** `CompareMergeSheet`, `CloseSeatAct`, `ArchiveCardDoor`,
`HouseholdBand` (early return at `:582`, every hook above it), `RosterRow` and `RolodexPicker` (no
return before `useBringForward()` at `:629`) all order correctly. No width branch in JS — the Call
Sheet renders both authority phrases and lets CSS choose (`roster-row.tsx:419-433`).

**aria rules.** Every gated act carries `aria-disabled` (via `held`) plus `aria-describedby` plus a
visible sentence; `data-open-household` uses a bare `aria-disabled` with a live handler that explains
(`household-band.tsx:592-615`). The multi-pick control is `role="checkbox"` + `aria-checked` on a
square mark with no tick glyph (`party-mini-row.tsx:245-246`, `:150-170`); the single-add control is
a SIBLING of the row button, never nested (`rolodex-picker.tsx:999-1008`). Refusals are `role="alert"`
on every W3 surface; successes go to the surface's one `role="status"`. The one exception is
minor-7.

**Document grammar.** Zero `shadow`, `drop-shadow`, raw hex or off-scale radius across the seven new
and rewritten face files. Tokens are the house set (`--ink*` / `--paper` / `--rail` /
`--hairline-strong` / `--terracotta-ink` in `people/`, `--color-*` in `roster/` — both families
defined in `globals.css`, same values). `.t-*` steps are used throughout except minor-4.

**SPEC vocabulary.** No schema word reaches a face: `MERGE_MATCHED_ON_LABELS`,
`SEAT_BID_OUTCOME_ACTS` / `_LABELS`, `HOUSEHOLD_MEMBER_ROLE_LABELS` ("decides the work" / "signs for
the household"), `AUTHORITY_SCOPE_LABELS`, `heldClausePaperNoun` as the single noun map for the
notice clause, and four translators (`asMergeError`, `asBidError`, `asHouseholdError`,
`asSeatCloseError`) each throwing a sentence out of its hook rather than a token. `asMergeError`
additionally answers any unmatched bare token with a sentence (minor-2 is that this posture is
missing one layer down).

**DocSheet.** `CompareMergeSheet` and `RolodexPicker` are both DocSheets; `CloseSeatAct`,
`ArchiveCardDoor`, `HouseholdBand` and the bid editor are in-place regions, not sheets, and correctly
carry no chrome of their own.

**Playwright.** `e2e/people/merge.spec.ts` and `e2e/people/bring-forward.spec.ts` are chromium-pinned
(`test.skip(({browserName}) => browserName !== "chromium", …)`), use web-first `expect` with explicit
timeouts and `expect.poll` over `e2e/helpers/supabase-admin.ts`, write their own fixtures and tear
them down. Not run this round (no port taken, per the round's own rule).

**No trade or homeowner writing surface** was added in this wave — every new act is a studio act on a
studio surface.

---

## 4. Gates, run this round

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | **rc=0** (`tsc --noEmit`, clean) |
| `pnpm --filter designer-portal type-check` | **rc=0** (`tsc --noEmit`, clean) |
| `pnpm --filter admin-portal build` | **rc=0**, full route table printed (the strictest gate, after the shared `@patina/supabase` edits) |
| `npx jest` over the eleven W3 face/lib suites | **11 suites, 214 tests, all passed** — `compare-merge-sheet` 17 · `close-seat-act` 9 · `archive-card-door` 8 · `travel-list-pane` 5 · `household-band` 45 · `rolodex-picker` 38 · `roster-row` 56 · `use-project-authority` 3 · `bring-forward` 17 · `compliance-notice` 10 · `write-error` 6 — matching §1's stated per-file counts exactly |
| `npx jest src/components/document/overlays/doc-sheet.test.tsx` | **1 suite, 10 tests, passed** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts src/hooks/__tests__/use-households-r16.test.ts` | **2 files, 70 passed** (66 + 4) |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | **rc=0** — "W3 SQL suite: all blocks passed", 13f last, 13d reporting the fourth refusal |
| migration numbering | `ls supabase/migrations \| tail` still ends at `00634`; nothing minted, nothing in the reserved `00595`–`00620` |

§1's test counts and §9's gate claims are accurate at HEAD. §2's refusal count is not (major-1).

One note on the gate, not a product finding: `next build` run inside this session's default sandbox
exits 0 having written only `.next/diagnostics` with `"buildStage": "compile"` and no `BUILD_ID`.
Re-run outside the sandbox it compiles fully and prints the route table. A green `rc=0` from that
command inside a sandbox proves nothing — check `apps/<portal>/.next/BUILD_ID` exists before
believing it.
