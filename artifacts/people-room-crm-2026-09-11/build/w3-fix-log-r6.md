# W3 (P2) — fix log, round 6

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `e7c60adaa`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started.** Migration **00629** edited in place (the 00621–00633 block
is unapplied on Strata). **No migration minted** — nothing here needs a number above 00633, and
00595–00620 stay reserved to the hour-tracking program.

Six findings handed back — five in `00629` (`B-1`, `M-1`, `M-2`, `M-3`, `M-4`) and one in the
designer portal (`R6-CODE-MAJOR-1`). All six closed; nothing else changed. The two rulings that
govern them, both already on `rulings.md` §3, are **R-BN** ("a merge never deletes a typed fact")
and **R-BO** ("a money threshold field never revokes authority by accident"). Also re-read and
named where they bear: **PR-o**, **PR-n**, **PR-c**, **R-BL**, **R-AY**, **R-BD**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay, head `20260910152111` (the CLI telemetry `EPERM` again needed `dangerouslyDisableSandbox` — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (**new block 10**) | rc=0 — "10. the r6 review's five merge findings (B-1, M-1, M-2, M-3, M-4) — R-BN: passed" then "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no diff** — no GRANT or REVOKE moved this round |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift (no column, table or function signature changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0 |
| `npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2885 tests, all green** (2876 before; **+9** new) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |
| `npx eslint` on the three touched designer files | clean |

No e2e run (the brief forbids taking a port this round). `e2e/people/merge.spec.ts` asserts the
announcer's prefix only and touches no household act, so nothing there is owed by these edits.

Probe: `artifacts/people-room-crm-2026-09-11/build/probe-w3-r6-fix.sql` — one transaction,
ROLLBACKed, re-measuring exactly the shapes the r6 review measured (`pA`, `pB`, `pC`, `pF`, `pG`).

---

## B-1 · the channel union reduces worst-first instead of deleting — CLOSED

`00629` — the dedupe DELETE is now preceded by a reduction onto the surviving row.

```sql
UPDATE public.studio_contact_channels s
   SET status      = CASE WHEN u.merged_rank > u.survivor_rank THEN u.merged_status ELSE s.status END,
       status_at   = CASE WHEN u.merged_rank > u.survivor_rank THEN u.merged_status_at ELSE s.status_at END,
       verified    = s.verified  OR u.merged_verified,
       verified_at = CASE WHEN s.verified THEN s.verified_at
                          WHEN u.merged_verified THEN u.merged_verified_at
                          ELSE s.verified_at END,
       preferred   = s.preferred OR u.merged_preferred,
       label       = COALESCE(s.label, u.merged_label)
  FROM ( … CASE status WHEN 'unsubscribed' THEN 4 WHEN 'dead' THEN 3 WHEN 'bounced' THEN 2 ELSE 1 END … ) u
 WHERE s.id = u.survivor_channel_id;
```

The ranking is stated on the file and is **unsubscribed > dead > bounced > active**: a recorded
refusal outranks every technical failure, because the cost of a missed refusal is a compliance
violation and the cost of a missed bounce is a bounce. `status_at` travels with the status that
wins (a held date belonging to another verdict is a worse fact than no date); `verified_at` travels
with the `verified` that wins, the verdict/date shape r5 B-1 already uses.
`idx_studio_contact_channels_owner_kind_value` is UNIQUE on `(owner_id, channel_kind, value)`, so at
most one absorbed row answers each surviving row — the join cannot be ambiguous.

**Measured**, the reviewer's own fixture (older card survives, PR-o's pre-pick):

```
before  …0001 email dana@example.invalid  active        (no date)  verified f  preferred f  label (null)
        …0002 email dana@example.invalid  unsubscribed  2025-12-03 verified t  preferred t  label 'Shop address'
after   …0001 email  unsubscribed | 2025-12-03 | t | 2025-11-01 | t | Shop address
        rows_on_folded_card: 0
```

`heldChannelReason()` therefore still prints "They unsubscribed, 3 December 2025. Calls still reach
them." after the merge, with direction §5.4's held treatment, and `channelRowParts()` still prints
"preferred · verified 1 Nov 2025".

**Negative control** (same probe): a survivor reading `unsubscribed 2025-01-05` absorbing a row
reading `active` keeps its own refusal and its own label, and takes the absorbed row's `verified` /
`verified_at` / `preferred` up — `unsubscribed | 2025-01-05 | t | 2026-02-02 | t | Survivor label`.

---

## M-1 · a rule routing at the other card of the pair — CLOSED

Three changes in `00629`, all of them "drop the route, never write a self-route":

1. the subsumption gate gains `OR v_merged_rule.route_to_person_id = p_survivor` — a route at the
   card you are keeping is **answered** by the fold, not lost by it, so it is subsumed rather than
   a conflict;
2. before the conditional repoint, the absorbed rule's route at the survivor is nulled (under the
   same `NOT EXISTS` the repoint carries, so a rule that stays on the folded card keeps its route
   as the record of what the studio wrote);
3. the survivor's own route at the folded card is nulled, and the "routes AT the merged card"
   repoint now excludes the survivor's own rule.

**Measured** — all three shapes the review reported aborting now merge, and the rule arrives whole:

```
A  absorbed routes at survivor, survivor has no rule   -> merged; survivor rule {sms,email}, route NULL,
                                                          reason "This card is the old one."
C  survivor routes at absorbed, absorbed has no rule   -> merged; survivor rule {sms}, route NULL
D  both rules, absorbed routes at survivor             -> merged; survivor rule {sms,email}, route NULL
                                                          (was: merge_contact_rule_conflict, and the
                                                           repair the refusal named was itself refused
                                                           rule_route_is_self — a closed loop)
```

**Negative control**: an absorbed rule forbidding `office` where the survivor's forbids only `sms`
is still refused, by name — `merge_contact_rule_conflict`. R-BL's hard-block formula is untouched;
only the route leg of the subsumption test moved.

---

## M-2 · the affiliation collision reduces instead of deleting — CLOSED

Before each collision DELETE, the absorbed open row now reduces onto the survivor's: `role_at_firm`
COALESCEs, `is_paperwork_contact` / `is_signer` / `holds_trade_license` are OR'd, `from_date` takes
`LEAST()` of the two (the earlier start is the true one). **Both** collision statements carry it —
the person-survivor branch the review measured, and its mirror image in the company-survivor branch,
which is the same statement shape reached by folding two firm cards that each hold an open row for
one human.

**Measured**: older row `role NULL / from 2024-01-01` absorbing `Foreman, paperwork, signer,
licence, from 2019-03-01` now leaves one row reading `Foreman | t | t | t | 2019-03-01`. The crew
line keeps "Foreman · paperwork contact · signer · holds the trade licence" and the person card
prints "since 2019", the date the studio actually typed.

---

## M-3 · the sole-proprietor fold keeps the rest of the crew — CLOSED

The unconditional `DELETE … WHERE company_id = p_merged` is now scoped to the fold itself
(`AND person_id = p_survivor`), and the blanket `UPDATE studio_contacts SET company_id = NULL` is
gone. Everyone else's open affiliation at the folded firm is **closed**, not erased:

```sql
PERFORM set_config('patina.suppress_affiliation_sync', '1', true);
UPDATE public.studio_person_affiliations
   SET to_date = GREATEST(COALESCE(from_date, CURRENT_DATE), CURRENT_DATE)
 WHERE company_id = p_merged AND to_date IS NULL;
PERFORM set_config('patina.suppress_affiliation_sync', '', true);
```

The GUC is 00592's own flag for "the pointer is being managed deliberately by this statement", and
it is what makes R-BN's two halves consistent: close the row **and** leave the legacy pointer
standing. Without it `sync_studio_contact_company_pointer()` would re-derive `company_id` to NULL as
a consequence of the close — the very blanking the finding is about. `GREATEST(…, CURRENT_DATE)`
keeps `studio_person_affiliations_dates_check` satisfied for a row whose `from_date` is in the
future.

**Measured**: after folding R6 J Firm into R6 J Owner, J Bookkeeper reads
`company_id = <J Firm> | role Bookkeeper | from 2021-01-01 | to 2026-09-14`, and their
`people_directory` row still carries `company_name = "R6 J Firm"` through §6's COALESCE — so
direction §1 line 2 / SPEC §5.1 #8's "Northgate Electric · electrical" does not degrade to the bare
kind word. The survivor's own self-affiliation is gone (0 rows), which is what
`studio_person_affiliations_distinct_cards_check` requires.

---

## M-4 · `is_sole_proprietor` and `vendor_id` travel — CLOSED

`is_sole_proprietor` joins the r5 B-1 statement as `s.is_sole_proprietor OR
COALESCE(v_merged.is_sole_proprietor, false)` — the `trades`/`specialties` treatment, because it is
NOT NULL and has no NULL to coalesce.

`vendor_id` could **not** join that statement: `idx_studio_contacts_org_vendor` is
`UNIQUE (organization_id, vendor_id) WHERE vendor_id IS NOT NULL` and both cards are in one studio,
so writing it onto the survivor while the folded card still holds it is a constraint violation. It
moves in its own guarded pair beside the login and the address, which is the same COALESCE by
another shape:

```sql
IF v_survivor.vendor_id IS NULL AND v_merged.vendor_id IS NOT NULL THEN
  UPDATE public.studio_contacts SET vendor_id = NULL  WHERE id = p_merged;
  UPDATE public.studio_contacts SET vendor_id = v_merged.vendor_id WHERE id = p_survivor;
END IF;
```

**Measured**: older survivor `is_sole_proprietor t | vendor_id 11111111-…-1104`; the folded card's
pointer is released in the same transaction.

And the sheet now shows it: `compare-merge-sheet.tsx` `carriedRows()` gains a **"Sole proprietor"**
row (rendered only where at least one card holds it, like every other carried row), so the fact the
fold decides is in the table the studio decides the survivor from — R-BN's "the compare sheet shows
both values wherever a reduction will pick one". `vendor_id` is an id and not a face value, so it
is deliberately not a row.

---

## R6-CODE-MAJOR-1 · the change-order figure — CLOSED (R-BO)

`apps/designer-portal/src/components/document/roster/household-band.tsx`. Four faults, four fixes:

1. **An unparsable entry is refused, not written as NULL.** `parseThresholdEntry()` accepts
   `2500`, `$2,500`, `2500.50` and refuses `""`, `"   "`, `abc`, `2.5.0`, `-500`. `saveFigure()`
   returns on `null` with the sentence *"Write the change-order figure in dollars — 2500, or 2,500.
   To take the figure away, use “Take the figure away”."* on the `role="alert"` line, and calls the
   RPC not at all. The figure on file — and every grant it authorises — stands.
2. **Taking the figure away is its own named two-step act.** A "Take the figure away" control
   appears beside "Set the figure" only while a figure is on file, carries PR-n's owner/admin
   narrowing with `aria-disabled` and the same `household-figure-held` reason (never `disabled`),
   and opens a confirm row — "Take it away" / "Leave it" — under its own consequence sentence.
   Only the second press writes `coThresholdCents: null`.
3. **Both acts print a consequence sentence**, which the figure editor had none of:
   *"Change orders over $5,000 will need a signature from the household. Every household member who
   already signs money from this figure moves to $5,000, on every job. Nothing is sent to them."*
   and *"Taking the figure away ends the signing authority it gave: every household member's money
   grant of $2,500 closes today, on every job. The record of it stays. Nothing is sent to them."*
   Before a legible figure is typed the line reads *"Nothing is written until this reads as a figure
   in dollars. The figure on file stands until then."*
4. **The announcement is the sentence the band itself prints.** `onAnnounce` now passes
   `householdThresholdSentence(cents)` — the same function `data-household-threshold` renders — so
   the `role="status"` line and the band cannot state two contradictory facts about one household on
   one screen, which is the harm this component's own banner exists to prevent.

Nine new jest assertions cover all four (refusal on `2.5.0`, refusal on empty, the consequence
sentence, the announcement, the two-step clear, no clear door with no figure on file, and PR-n's
hold on the clear act), plus a unit spec for `parseThresholdEntry`.

---

## Files touched

| File | Why |
|---|---|
| `supabase/migrations/00629_studio_contact_merges.sql` | B-1, M-1, M-2, M-3, M-4 — edited in place (unapplied on Strata); file banner and the RPC's `COMMENT` restated to match |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | new **block 10** pinning all five, with the M-1 negative control |
| `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx` | M-4 — the "Sole proprietor" comparison row |
| `apps/designer-portal/src/components/document/roster/household-band.tsx` | R6-CODE-MAJOR-1 |
| `apps/designer-portal/src/components/document/roster/__tests__/household-band.test.tsx` | +9 assertions |
| `artifacts/people-room-crm-2026-09-11/build/probe-w3-r6-fix.sql` | the round's measurement |

Not touched, deliberately: the fourteen r6 MINORs (`m-1 … m-14`), which the brief scopes out of this
round.
