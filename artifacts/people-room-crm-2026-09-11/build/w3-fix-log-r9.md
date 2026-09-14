# W3 (P2) — fix log, round 9

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `c0149d3a4`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** Migrations **00629**, **00630** and **00632**
edited in place (the 00621–00633 block is unapplied on Strata). **No migration minted** — nothing
here needs a number above 00633, and 00595–00620 stay reserved to the hour-tracking program.

Four findings handed back — three in the data lane (`B-1`, `B-2`, `M-1`), one in the designer
portal (`R9-MAJOR-1`). All four closed; nothing else changed. The rulings that govern them, all
already on `rulings.md` §3: **R-BN** ("a merge never deletes a typed fact"), **R-BO** (a money
field never revokes authority by accident), **PR-h**, **PR-n**, **PR-c**, **R-J**, **R-G**,
**R-K**, **R-AI**, **R-AO**, **R-BD**, **R-BJ**, and r1 M-5's "a notification IS a face".

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay, head **00633** (`supabase_migrations.schema_migrations`; the CLI telemetry `EPERM` again needed the sandbox off — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (**three new blocks: 11d, 11e, 11f**) | rc=0 — "11d. r9 B-1 … passed", "11e. r9 B-2 … passed", "11f. r9 M-1 … passed", "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**. No GRANT or REVOKE changed this round |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift (no column, table or function signature changed) |
| `cron.job` | `compliance-document-expiry-sweep · 0 6 * * * · active` after the clean reset |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table printed (the strictest gate after the shared `@patina/supabase` read) |
| `cd apps/designer-portal && npx jest src/components/document/roster` | **10 suites, 165 tests green** (`roster-row.test.tsx` **42**, was 40 — two new r9 cases) |
| `cd apps/designer-portal && npx jest` (whole portal) | **593 suites, 7658 tests, 1 snapshot, all green** (was 7656) |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **30 passed** (was 29 — one new `bidStageOutcome` case) |
| `cd packages/supabase && npx vitest run` (whole package) | **105 files, 1336 passed, 12 skipped** (was 1335) |

No Playwright run and no dev server this round; **no port was taken**.

---

## B-1 — the nightly expiry notice named the FIRM for a paper the PERSON holds

**Closed.** `supabase/migrations/00630_compliance_expiry_sweep.sql` (`sweep_compliance_expiries()`,
the cursor's `holder_name`).

### What was wrong

The cursor asked `company_name` FIRST whatever the holder's kind was:

```sql
COALESCE(NULLIF(btrim(sc.company_name), ''), NULLIF(btrim(sc.full_name), ''), 'this card')
```

On a `company` card that is right. On a **person** card `studio_contacts.company_name` is 00417's
typed-by-hand FIRM snapshot — the same column `people_directory`'s CONTACTS branch reads as the
person's firm — and `usePromoteToStudioContact()`
(`packages/supabase/src/hooks/use-studio-contacts.ts:640-650`) stamps it from the seat on every
promotion. So a master licence the PERSON holds, which is the reason `holder_type = 'person'`
exists at all (00623), was announced as the firm's.

Measured before the fix (`build/probe46-r9-holder-name.sql`, fresh reset, rolled back): holder_type
`person`, holder_name **`Northgate Electric`**, subject "Northgate Electric's paper has lapsed",
message "The licence for Northgate Electric lapsed 11 Sep 2026.", deep link `/people?person=…`.
Northgate Electric held no lapse; every owner and admin was told a firm's paper had gone and the
link opened a person. PR-h puts the paper word on the firm card AND the roster row from ONE source;
this was a second source disagreeing with both. r1 M-5 already ruled a notification IS a face.

### What changed

The name keys on `holder_type`, exactly as `v_link` two statements later already did:

```sql
CASE WHEN d.holder_type = 'company'
     THEN COALESCE(NULLIF(btrim(sc.company_name), ''), NULLIF(btrim(sc.full_name), ''), 'this card')
     ELSE COALESCE(NULLIF(btrim(sc.full_name), ''), NULLIF(btrim(sc.company_name), ''), 'this card')
END AS holder_name
```

The `'this card'` floor and the two-step fallback are kept in both legs, so a card with neither
name still reads a sentence rather than an empty string.

### Measured after

Same probe, fresh reset: holder_name **`Marco Feliz`**, subject "Marco Feliz's paper has lapsed",
message "The licence for Marco Feliz lapsed 11 Sep 2026.", deep link `/people?person=196bdcd7-…`.

**Negative control**, same run, over the seeded book's own three firm-held papers:
`Lakeshore Painting Co.`, `Northgate Electric`, `Ostrom Builders` — each still announced under its
own `company_name`, with `/people?firm=…` links.

### Pinned by

`supabase/tests/people/w3_merge_sweep_household_test.sql` **block 11d** — a person card carrying
`company_name = 'R9 Holder Firm'` holding his own lapsed `license`, asserting holder_name, subject,
message and deep link; plus the control, a firm card whose own `coi_gl` must still be announced as
`R9 Firm Holder Co` with `/people?firm=…`.

---

## B-2 — the sole-proprietor fold stripped the firm's own name off the surviving identity

**Closed.** `supabase/migrations/00629_studio_contact_merges.sql` (`merge_studio_contacts()`'s
"every other typed fact" COALESCE, and the cross-kind affiliation DELETE; plus the §5 banner and
§4e's note).

### What was wrong

r6 M-3 fixed the CREW's half — their affiliations are CLOSED with `to_date` inside the
`patina.suppress_affiliation_sync` window and their legacy `company_id` deliberately keeps naming
the folded card, so `people_directory`'s `company_name` COALESCE still resolves the firm. **The
survivor's own half was not fixed**, by two independent routes:

1. the COALESCE statement carried `legal_name`, `dba_name`, `company_kind`, `remit_to`,
   `retainage_bps`, `tax_id_last4`, `w9_on_file_at`, `warranty_until`, `notes`, `studio_verdict`,
   trades, specialties, `is_sole_proprietor` and the three designations — but **not
   `company_name`**, which is where a firm card's NAME lives (a company row's `full_name` is never
   set; 00629 §6 says so);
2. `DELETE FROM studio_person_affiliations WHERE company_id = p_merged AND person_id = p_survivor`
   ran **outside** the suppression window the next statement opened, and
   `sync_studio_contact_company_pointer_trg` is `AFTER INSERT OR DELETE OR UPDATE` — so the
   survivor's `company_id` was re-derived over zero open affiliations and landed NULL.

Measured before the fix (`build/probe47-r9-soleprop-firm-name.sql`, fresh reset, rolled back) on the
fixture's own motivating pair, F-11 Dana Kowalski + Northgate Electric: `meta.company_name` went
`Northgate Electric` → empty; the card read `company_name NULL, company_id NULL`. Three faces lost
it — the Directory identity line (direction §3.1), the person card's R1 line
(`views/person-profile.tsx:344-354`), and the bring-forward picker mini row (SPEC §5.7 #4a) — while
the SEATS kept their free-text snapshot, so the Call Sheet went on printing the firm. One screen
named it, the other did not. R-BN: a merge never deletes a typed fact.

### What changed

Both halves, as the review said either alone would do:

- `company_name = COALESCE(NULLIF(btrim(s.company_name), ''), v_merged.company_name)` joins the
  COALESCE statement. `NULLIF(btrim(…))` because 00417 lets the column hold `''` as well as NULL. It
  is safe for a firm-into-firm merge: a survivor with its own name keeps it, and `display_name` is
  `COALESCE(full_name, company_name)`, so a person survivor's own name still wins the display.
- the cross-kind DELETE moved **inside** the `patina.suppress_affiliation_sync` window that the
  `to_date` UPDATE beside it already opened, so the survivor's pointer keeps naming the folded card
  exactly as the crew's does.

§4e's own note and the file's §5 banner now say so, since §4e's `merged_into` leg
(`sync_person_affiliation_from_pointer()`, r7 M-2) is what keeps that pointer from being re-derived
into a fresh affiliation by the next ordinary card save — measured this round: after the fold, a
whole-row save of the survivor's card left `open affiliations = 0`, pointer still
`d0e20000-…-000000000003`, `company_name = Northgate Electric`, Directory row firm
`Northgate Electric`.

### Measured after

Same probe, fresh reset: `meta.company_name` reads **`Northgate Electric`** both BEFORE and AFTER;
the card reads `company_name = 'Northgate Electric', company_id = d0e20000-…-000000000003,
is_sole_proprietor = t, trades = {electrical}`.

**Controls** (`build/probe49-r9-fix-controls.sql`):

- firm-into-firm merge — the survivor `Beck + Rowe Architects` keeps its **own** name; the folded
  firm's does not overwrite it;
- the crew's half is untouched: a third party affiliated with the folded firm comes out with
  `affil rows=1 to_date=2026-09-14 role=Foreman pointer=<folded firm>` (r6 M-3 / R-BN intact).

### Pinned by

**Block 11e** — a sole-proprietor fold with a third-party crew member, asserting (1) the survivor's
`company_name` and `company_id`, (2) the Directory identity line's both halves, (3) the crew's
CLOSED row, its role, and its standing pointer, (4) no self-affiliation, and (5) the negative
control: a survivor carrying its own firm name keeps it through a firm-into-firm merge.

---

## M-1 — `add_household_member()` overwrote a money grant the household did not source

**Closed.** `supabase/migrations/00632_client_households.sql` (`add_household_member()`, and its
`COMMENT`).

### What was wrong

The `ON CONFLICT (engagement_id, scope) WHERE effective_to IS NULL` arbiter is "the seat's OPEN
money grant" — **whatever wrote it and whatever it is sourced from** — and the RPC deliberately
REUSES an existing `(project_id, studio_contact_id, party_kind)` seat two statements above. So the
ordinary act (seat the rep from the agreement, R-J's "Confirm from the agreement"; then add them to
the household) rewrote the agreement's grant in place and re-stamped its clause.

Its own sibling refuses to do this: `set_household_threshold()` moves only grants
`WHERE source_clause = 'client_households.co_threshold_cents'`, and the file states the rule in
words at `:465-466` — *"A grant the studio re-sourced by hand (its own clause from the agreement) is
NOT the household's to move"*. The two halves of one feature disagreed about who owns a seat's money
authority.

Measured before the fix (`build/probe48-r9-household-grant-clobber.sql`): `1000000 cents /
Agreement clause 7` became `250000 cents / client_households.co_threshold_cents`, `effective_to`
NULL, **one** open money row — nothing closed, the old grant gone rather than ended. The Call Sheet
client-side row then prints "Signs money to $2,500." over an agreement that says $10,000 (SPEC §5.4
#5); run the other way it silently over-authorises an approval nobody granted, which is the failure
00624's own COMMENT names and PR-n puts under the principal.

### What changed

The open row is READ FIRST and a foreign clause is left exactly as the studio wrote it — the
sibling's rule, on the same column:

```sql
SELECT * INTO v_grant FROM public.project_party_authority
 WHERE engagement_id = v_seat_id AND scope = 'money' AND effective_to IS NULL LIMIT 1;

IF NOT FOUND THEN
  INSERT …  -- the household opens the grant
ELSIF v_grant.source_clause = 'client_households.co_threshold_cents' THEN
  UPDATE … SET threshold_cents = v_h.co_threshold_cents,
               granted_by = COALESCE(auth.uid(), granted_by)
   WHERE id = v_grant.id;
END IF;
```

`updated_at` is left to `set_updated_at_project_party_authority` (00624:908-910) rather than written
by hand, and `granted_by` takes the sibling's `COALESCE` shape. Every gate above it is unchanged:
PR-n's owner/admin narrowing on `project_party_recorded_studio()` (R-BD) still refuses rather than
skipping, and the `household_grant_project_has_no_studio` refusal still stands. The function's
`COMMENT` now states the narrowing, so the record and the code agree.

### Measured after

Same probe, fresh reset: `AFTER : 1000000 cents, source=Agreement clause 7, effective_to=<null>`,
one open money row, one seat (reused). The agreement's grant stands.

**Controls** (`build/probe49-r9-fix-controls.sql`, and block 11f):

- a seat with **no** standing grant still gets the household's: `250000 cents /
  client_households.co_threshold_cents`;
- a seat carrying the **household's own** grant still moves with the figure: `250000` then `500000`,
  one open row throughout.

### Pinned by

**Block 11f** — the agreement's seat and its `Agreement clause 7` grant, then the household add;
asserts the seat was REUSED (the fixture reproduces), the figure, the clause, `effective_to IS NULL`
and exactly one open money row; then control A (household opens a grant where none stands) and
control B (the household's own grant moves with its figure, still one open row).

---

## R9-MAJOR-1 — "Nothing recorded yet" erased a recorded outcome under a sentence describing a different press

**Closed.** `apps/designer-portal/src/components/document/roster/roster-row.tsx`.

### What was wrong

r8 BLOCKING-1 taught the consequence sentence to read the same `bidStageOutcome()` the write reads,
and gave it three branches. It left the **fourth** press the select offers — clearing the outcome —
on the pre-r8 sentence, because the guard was `!bidDraft.outcome` with no second leg.

`<option value="">Nothing recorded yet</option>` is the first option, and `openBidEditor` seeds the
draft from the seat's existing `bid_outcome`, so on a seat that already carries one, choosing it is
one click. `saveBid` then sends `bidOutcome: null`; `useSetPartyBid`'s
`if (patch.bidOutcome !== undefined)` is true for null, so `dbPatch.bid_outcome = null` is WRITTEN
(the recorded outcome is erased), while `bidStageOutcome(previous, null)` returns `stage: null`
(`writesStage = !!outcome && …`), so no stage is written and the seat keeps the band the erased
outcome put it in. The studio read *"The outcome is what moves them out of the bidding band.
Nothing else on this row does."* — a different press entirely — and `bidNote` prints no outcome
word, so nothing on the row showed what changed. This is the room's only writer of that fact.

### What changed

R-BO's second option (make the clear its own two-step act) was NOT taken: the review offered
either, and the narrower one keeps the editor's single-press shape while making the face describe
the write, which is r8 BLOCKING-1's own remedy one branch over. The clear gets its own branch off
the same object:

```tsx
const clearedOutcome =
  !bidWrite.outcome && bidWrite.moved ? (bid?.bidOutcome ?? null) : null;
const heldStageLabel = getSeatStageLabel(row.stage);
const bidSentence = !bidWrite.outcome
  ? clearedOutcome
    ? `Clearing the outcome takes ${SEAT_BID_OUTCOME_ACTS[clearedOutcome]} off ${row.name}’s record. ${
        heldStageLabel ? `The seat stays at ${heldStageLabel}.` : 'The seat stays where it is.'}`
    : 'The outcome is what moves them out of the bidding band. Nothing else on this row does.'
  : …
```

- the outcome is named in the **picker's own words** (`SEAT_BID_OUTCOME_ACTS`, what the studio
  reads in the select it is looking at), never a schema token;
- the stage word comes from `getSeatStageLabel()` (`@patina/types`), the one reduction the row's
  own `StateWord` already uses, so the sentence and the word on the row cannot disagree; a seat
  with no stage word reads "The seat stays where it is." rather than an empty phrase;
- the ternary's guard moved from `bidDraft.outcome` to `bidWrite.outcome` — the same value, read
  off the object the write uses — and the "moves them to" branch follows it
  (`SEAT_BID_OUTCOME_LABELS[bidWrite.outcome]`), which is also what keeps `designer-portal
  type-check` green.

No hook change: `bidStageOutcome()` already answered this case correctly (`moved: true`,
`stage: null`); only the face was wrong.

### Pinned by

- `roster-row.test.tsx` — **"says what clearing a recorded outcome takes away, and what stays"**
  (`bidOutcome: 'selected'`, `stage: 'awarded'`, outcome set to `''`): asserts the sentence reads
  *"Clearing the outcome takes Selected off Rivera Finishes’s record. The seat stays at Awarded."*,
  that the bidding-band sentence is NOT shown, and that the press then sends
  `patch.bidOutcome === null` with `previous = { bidOutcome: 'selected', stage: 'awarded' }`;
- `roster-row.test.tsx` — **"keeps the bidding-band sentence where no outcome was ever recorded"**,
  the negative control for the other leg of the same branch;
- `people-crm-w3.test.ts` — **"says a cleared outcome moves the seat nowhere"**:
  `bidStageOutcome({bidOutcome:'selected',stage:'awarded'}, null)` →
  `{outcome:null, moved:true, pastTheBid:false, stage:null}`, the same on `stage:'active'`, and the
  already-empty case pinned as `moved: false` so the face cannot call it a clear.

---

## What was NOT changed

- The **21 carried migration MINORs** from r8 and the **5 new MINORs** of r9 (`n8`–`n12`), and the
  **12 code MINORs** of r9. None was in the hand-back.
- No migration minted; 00595–00620 untouched; the branch head stays 00633.
- No consent table, `record_channel_consent` call or frozen `project_parties.sms_consent_*` read
  entered this round — R-AY holds.
- No trade or homeowner writing surface.
