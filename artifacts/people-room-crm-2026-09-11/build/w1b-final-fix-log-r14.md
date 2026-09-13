# W1b — final review round 14, fix log

Scope: exactly the two findings handed to this pass — `MAJOR-1` from
`w1b-final-review-r14-migrations.md` (with its named companion `p2`, which its own fix text folds in)
and `BLOCKING-1` from `w1b-final-review-r14-tests.md` §8. **Nothing else was touched**: none of r14's
other MINORs (`p1`, `p3`, `n1–n9`, `m1–m19`) moved.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata** — no
`supabase db push`, no `supabase functions deploy`, no `wrangler`.

**No new migration minted.** `00594` and `00626` are both unapplied on prod — `00594`'s own §3
banner says so in as many words (*"this file has only ever run locally"*) — so both were edited in
place, as r11/r12/r13 did. The ledger still reads
`00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111`; the
reserved block `00595–00620` is untouched.

---

## BLOCKING-1 — the `opted_out` phone freeze asked a column R-AY froze at `not_asked`

**Fixed, in both places the finding names**, and the fix is the one the finding states: the guard asks
the record.

### The walk, before (`build/probe214-before.out`)

As `designer@patina.dev`, studio `b0000000-…-0001`, on an **uncarded** seat — the population whose
Directory row is keyed on the phone number itself:

```
--- 2. an UNCARDED seat carrying that number ---
 id                                   | phone_e164   | legacy_column | the_record
 4bfe2f67-d64d-405f-a3a4-0581d62b212e | +15005550001 | not_asked     | opted_out

--- 3. BEFORE: what the room says ---
 P214 Uncarded Sub | (500) 555-0001 | consent_status opted_out

--- 4. move the number (the exploit shape: phone only) ---
NOTICE:  PHONE MOVE SUCCEEDED — the freeze did not fire

--- 5. AFTER: what the room says now ---
 P214 Uncarded Sub | (500) 555-9999 | consent_status not_asked
```

An opt-out lost with zero newly recorded consent, through an ordinary RLS-permitted edit.

### The change

1. **`supabase/migrations/00594_studio_channel_consent.sql` — `refuse_legacy_consent_write()`.**
   The phone-freeze clause now reads

   ```sql
   IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164
      AND ( public.channel_consent_status(
              public.project_consent_org(OLD.project_id), 'sms', OLD.phone_e164
            ) = 'opted_out'
         OR OLD.sms_consent_status = 'opted_out' ) THEN
   ```

   `project_consent_org()` and not `project_tenant_org()`: R-BD retires the consent resolver from
   **guards and reducers**, and 00624's own banner states the counterpart rule — the tenant resolver is
   caller-relative and *"must never resolve a consent record's studio"*. This is a consent-record read,
   so it is `project_consent_org()`'s one remaining job.

   **The frozen column is kept as a SECOND leg, not removed.** Deviation from the finding's literal
   "change X to Y", and deliberate: a pre-R-AY row whose project resolves no consent org has no record
   for 00622's backfill to fold it into, and dropping the leg would silently un-freeze exactly those
   rows. It also keeps W1a block 43 — which constructs its fixture by writing the column directly —
   meaningful rather than rewritten. The record is the live leg; the column can now only add refusals,
   never remove one.

2. **The trigger body became `SECURITY DEFINER`** (search_path already pinned to `public`), because
   `channel_consent_status()` is INVOKER and `studio_channel_consent`'s only policy is
   `is_active_studio_member(organization_id)` (`00594:343-346`), while `project_parties`' UPDATE policy
   is the wider `is_studio_comember(designer_id)` (`00584:895-921`). An invoker read would have handed
   the very caller this freeze exists to stop — a member of another of the designer's studios — a NULL
   verdict and an open door. The body only reads and RAISEs; it returns `NEW` unchanged. Grants both
   directions follow the wave's trigger-body pattern: `REVOKE ALL … FROM PUBLIC, anon, authenticated`,
   `GRANT EXECUTE … TO service_role`. `scripts/generate-legacy-grants.py` regenerated —
   baseline + **2724** replayed statements (was 2723), the diff being exactly those two lines.

3. **`packages/supabase/src/hooks/use-coordination.ts` — `useUpdateProjectParty`.** The current-row
   read now takes `project_id` beside the two columns, and a genuine phone change asks
   `rpc('project_consent_org')` then `rpc('channel_consent_status')` for the number **currently on
   file** before anything else, throwing `OPTED_OUT_PHONE_EDIT_SENTENCE` on `opted_out`. Same two
   functions, same order as the trigger, so the portal refuses what the database would refuse instead
   of surfacing a raw trigger error. `currentStatus === 'opted_out'` survives as the same second leg.
   The pattern is `useAddProjectParty`'s own (`:471`), not a new one.

### The walk, after (`build/probe214-after-r14-fix.out`)

```
--- 4. move the number (the exploit shape: phone only) ---
NOTICE:  REFUSED: consent_opted_out_phone_frozen

--- 5. AFTER: what the room says now ---
 P214 Uncarded Sub | (500) 555-0001 | consent_status opted_out

--- 7. control: a CARDED, granted seat's number still moves freely ---
NOTICE:  CONTROL: an unrefused seat's number still moves
```

### New coverage

**`supabase/tests/people/w1a_identity_channels_consent_test.sql` block 46** — the block 43 the finding
says is green over a row shape the room can no longer produce, asked of the record instead. It records
the refusal through `record_channel_consent()` (the only door R-AY allows), seats an uncarded human on
that number at the frozen column's default, and asserts: the move is refused (46b) and nothing moved
(46b2); a cosmetic reformat still lands (46c); an unrefused number still moves (46d); **another
studio's** refusal does not freeze this studio's seat (46e); `app.consent_legacy_write` still opens the
repair door (46f); and the guard is `SECURITY DEFINER`, search_path-pinned, callable by no PostgREST
role, and names `channel_consent_status` in its body (46g–46g4).

---

## MAJOR-1 — the reach word crossed the tenant boundary the row's own seats do not

**Fixed as the finding states**: `reach_state_for_identity()` now carries the `identity_seats` CTE's
WHERE verbatim.

### The change

`supabase/migrations/00626_people_directory_v4_seats.sql` — the EXISTS gains
`JOIN public.projects pj ON pj.id = pp.project_id` and

```sql
AND ( public.is_active_studio_member(public.project_tenant_org(pp.project_id))
   OR pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) )
AND ( public.is_studio_comember(pj.designer_id)
   OR public.is_studio_comember(pj.lead_designer_id)
   OR public.is_studio_comember(pj.created_by) )
```

R-BG's one predicate is now written four times rather than three (`identity_seat_count()`, the
`identity_seats` CTE, `people_directory_seats`' WHERE, and this). r11 MAJOR-1 is untouched (the solo
designer keeps her own job's links through the disjunction) and r6 MAJOR-1 is untouched (the working
studio's admin still enters through the tenant leg) — both asserted, see 24c/24d below.

### `p2` — the three false COMMENTs, fixed in the same edit

`00626:96-99` (the §2 banner), `:652-655` (`reach_state_for()`'s COMMENT) and `:846-847`
(`reach_state_for_identity()`'s) claimed `field_link_tokens` is *"designer-only RLS (00283)"*. It has
not been since `00584:982-992` added `field_link_tokens_studio_rw FOR ALL TO authenticated` on
`is_studio_comember(the project's designer_id)` — exactly as wide as `project_parties`' own policy. All
three now say so, name the real policy, and say what actually happens without a tenant predicate (the
opposite direction: another studio's door deciding this studio's word). The narrower degrade is
described as what it really is — a caller sharing no active organization with the designer of record,
who reads no seat either.

### The walk (`build/probe212-w1b-final-r14-reach-cross-studio.sql`, the review's own probe, re-run)

Before, per `w1b-final-review-r14-migrations.md`: `reach_state = field_link`, `seat_count 1`, seat line
`on_paper`. After (`build/probe212-after-r14-fix.out`):

```
--- the Directory / seats views correctly refuse studio B's seat ---
 b_seat_rows_in_seats_view 0 | a_seat_rows_in_seats_view 1
--- but project_parties RLS and field_link_tokens RLS both admit studio B's rows ---
 b_seat_readable_raw       1 | b_link_readable_raw       1
--- THE WORD ---
 R14 Shared Human | sub | on_paper | seat_count 1
--- and the seat line beneath it ---
 R14 Shared Human | Okonkwo residence | on_paper
--- the function, asked directly ---
 reach_state_for_identity(NULL,'+16125559911') = on_paper
```

The two columns agree, and **no read door changed**: the caller still reads both base rows raw, which
is r6 MAJOR-2's recorded ruling.

### New coverage

**`supabase/tests/people/w1b_compliance_authority_directory_test.sql` block 24** — the two-studio
shared-number shape the finding asks for, in the suite: a second design studio of the same designer,
one unstamped seat in each on one number, a live link on studio B's seat only, read as studio A's admin
(asserted a non-member of B). 24a/24a2 pin what the seats view nests; **24b** is the finding
(`on_paper` on both lines, and the function asked directly); **24c** is the control that the predicate
refuses a foreign door and not every door (studio A's own live link turns both lines to `field_link`);
**24d** is the r11 MAJOR-1 regression leg (the designer of record, member of both, still reads her own
job's link). The number is `+16125558844` — `+16125559911` and `+16125559933`, the obvious choices,
are already claimed by blocks 22 and 21 respectively and auto-stamp to a card.

---

## Gates

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2724 replayed statements

$ pnpm --dir … supabase:reset
RESET_EXIT=0        # zero /error/i lines but the "Applying migration …458_sms_message_error_capture.sql" filename
$ psql … -At -c "select string_agg(version,' ' order by version) … where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111

$ psql … -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  46. … (r14 BLOCKING-1): passed
NOTICE:  All W1a assertions passed.
W1A_EXIT=0          # 50 NOTICE lines (was 49)

$ psql … -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  24. … (r14 MAJOR-1): passed
NOTICE:  All W1b assertions passed.
W1B_EXIT=0          # 25 NOTICE lines = 24 blocks + summary

$ SUPABASE_DB_URL=… pnpm --dir … db:generate
GEN_EXIT=0 ; git diff --stat packages/supabase/src/database.types.ts   → empty

$ pnpm --dir … --filter @patina/supabase type-check      → 0
$ pnpm --dir … --filter @patina/designer-portal type-check → 0
$ pnpm --dir … --filter @patina/supabase test            → 100 files, 1255 passed | 12 skipped
$ pnpm --dir … --filter @patina/designer-portal test -- --testPathPattern "(roster|party-profile)"
                                                          → 13 suites, 282 passed
```

**Cost.** `EXPLAIN (ANALYZE) SELECT * FROM people_directory` as the studio owner, 62 rows:
`Planning 3.817 ms`, **`Execution 79.806 ms`** — against r13/r14's measured 101.7 / 102.4 ms on the
same shape. The added predicate does not regress m17; it narrows a scan that was unbounded.

## What this pass did NOT do

- No MINOR of r14 or r13 was touched (`p1`, `p3`, `n1–n9`, `m1–m19` all remain open as filed).
- W1a block 43 is unchanged — it still constructs its fixture by writing the frozen column, and it
  still passes, now covering the second leg rather than the only one.
- `m8`'s two live portal writers of the frozen consent columns are untouched; W2 still owns them.
