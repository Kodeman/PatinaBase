# W3 (P2) — adversarial migration review, round 23

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`, HEAD `b3f2515c4`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted, no product file edited.**

Read in full this round: `00628`–`00634`; `supabase/tests/people/w3_merge_sweep_household_test.sql`
(block headers, 13d/13e/13f, transaction boundaries); `w3-data-report.md`; `w3-fix-log-r22.md`;
`w3-review-r22-migrations.md`; `rulings.md` §§1–6; `direction.md` §3.1/§3.4/§5/§7/§8/§9;
`crm-model.md` §4 + CRM-24; `w1a`/`w1b`/`w2a`/`w2b`/`w2c` reports; `w2-review-r15-qa.md`;
`briefing/fixture.md` §4. Plus the three readers the r22 fix lands on:
`packages/supabase/src/hooks/use-studio-contacts.ts` (`MERGE_REFUSAL_SENTENCES`, `asMergeError`),
`apps/designer-portal/src/components/document/roster/use-project-authority.ts`,
`apps/designer-portal/src/lib/document/write-error.ts`, and
`packages/supabase/src/hooks/use-households.ts`.

**Verdict: NOT clean — ZERO BLOCKING, TWO MAJOR, SIX MINOR.**

r22's single major is **fixed and re-measured at HEAD** (§1.2). Both of this round's majors sit on
that fix: the new refusal fires correctly, but the repair it names on the face is the wrong one for
the shape it actually catches (§2), and `w3-data-report.md` does not know the refusal exists (§3).

---

## 1. Gates run this round

Two full resets this round (§4, m-leak note). All figures below are from the second, clean one.

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | **clean**, rc=0 — "Finished supabase db reset on branch main." Hand numbers end at `00634` |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed"; **21 top-level blocks, `13f` last** (headers counted in the file: 1 · 1b · 1c · 2 · 2b · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 13b · 13c · 13d · 13e · 13f). Run a SECOND time against the already-run database: **leaks no committed row** (job_runs 1→1, `studio_compliance_notices` 0→0, `notification_log` 0→0) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — "baseline + **2767** replayed statements" |
| migration numbering | `00628`–`00634`, all above `00627`, none inside the reserved `00595`–`00620`; nothing minted |
| function census (22 wave functions, `pg_proc`) | every one pins `search_path=public` **except `resolve_merged_contact` (proconfig NULL — m1)**. **Zero `anon` EXECUTE** anywhere in the wave |
| table ACL / RLS (`studio_contact_merges`, `studio_compliance_notices`, `client_households`) | RLS on all three; `authenticated` holds **SELECT only** on the two ledgers, full CRUD on households behind four policies; **zero `anon` privileges** |
| trigger census (`pg_get_triggerdef`) | the eight wave triggers present; 00634's WHEN is the R-BS clamp read off the catalog, both legs COALESCE-first |
| cron | `compliance-document-expiry-sweep`, `0 6 * * *`, active, body `SELECT public.sweep_compliance_expiries();` |
| `client_decisions_court_check` | eleven words, strict superset of 00212/00281's seven; ledger 6 rows, all `client` — every row still valid |
| 00628 backfill | 8 projects, **5 still `studio_id IS NULL`** (all `designer@patina.dev`, who owns two studios — ambiguous, stays NULL as R-BD rules) |
| `studio_compliance_documents` | **36** rows: 9 `current`, 24 `held`, 2 `lapsed`, 1 `lapses_soon` — §2 of the report reproduces exactly |
| "no closed seat carries an open grant" | `SELECT count(*) … pp.off_job_at IS NOT NULL AND pa.effective_to IS NULL` = **0** on the seeded book |
| `people_directory` v4→v5 code-only diff | **exactly two deltas**, as the file's banner claims: the CONTACTS branch's `AND sc.merged_into IS NULL`, and the TEAM branch's tenant leg. Nothing else moved |
| merge orphan census (probe A2, measured) | after a real person→person fold carrying channels, a supersession chain, an affiliation, a rule, three designations, a household membership, a seat and a bid pointer: **0 rows** left naming the merged card across all 17 readable FK columns into `studio_contacts` plus the household array |
| gate probes (probe E2, each in its own transaction) | a plain `member` is refused `studio_contact_archive_forbidden` on archive AND restore; a person into a firm and a firm into a non-sole-proprietor person are both `merge_kind_mismatch`; a hand-written `merged_into` is `studio_contact_merge_pointer_forbidden`; a hand-written lineage row and a hand-written notice row are both `permission denied for table`; a plain member's household INSERT carrying `co_threshold_cents` violates the RLS policy |
| sweep (probe E, rolled back) | first call `{"scanned":3,"notices":3,"notified":6}`, second `{"scanned":3,"notices":0,"notified":0}`; **2 distinct recipients**, the seeded studio's one owner and one admin, no plain member |
| consent (R-AY) | no W3 migration reads or writes `studio_channel_consent`, `record_channel_consent` or a `project_parties.sms_consent_*` column for a verdict. The only `sms_consent_*` appearances are `people_directory`'s meta bag at `00629:3064-3065`, fed by `q.consent_word` (the RECORD), not by the frozen column |

### 1.2 r22's finding, re-checked at HEAD

| r22 | State at HEAD |
|---|---|
| **MAJOR-1** — R-BS's clamp re-opened r19 MAJOR-1 through the Bidding band | **FIXED.** `merge_studio_contacts()` carries a fourth seat pre-check (`00629:1795-1824`) asking the openness question **of the grant**: a seat is live where `off_job_at IS NULL` **OR** an open `project_party_authority` row stands on it. Reproduced the r22 repro at HEAD (probe C): one press of "They withdrew" on a `sub` seat carrying a grant, the fold is now **refused `merge_seat_authority_collision`**, `DETAIL Okonkwo residence · sub`. Block 13d pins it. The predicate is also exactly right against the reader: `use-project-authority.ts:74` drops a grant on a dated seat unless `effective_to IS NULL`, so "live to the merge" and "still prints a present-tense figure" are the same set — a future-dated grant on a dated seat is dropped by both |
| the thirty-two minors carried in r22 §4 | **carried.** Three re-verified at HEAD and restated below (m1, m5, m6); the rest not re-walked this round |

---

## 2. MAJOR-1 — `merge_seat_authority_collision` names a repair that closes the LIVE seat and leaves the standing grant standing

**Severity: major. Confidence: high (measured twice on the freshly reset database, room acts only,
both transactions ROLLBACKed — `/tmp/claude/r23-probe-c.sql`, `/tmp/claude/r23-probe-c2.sql`).**

Filed major rather than blocking because nothing is written and no tenant boundary moves: it is a
broken Leah task (the duplicate fold, direction §3.1's band / §8 P2 "duplicates converge") and a
sentence on a face naming the wrong act.

### The shape the gate actually catches

The new pre-check refuses where **both** seats are "live", and live now means *open* **or**
*carrying an open grant*. The commonest way to satisfy that is asymmetric:

* one seat **open**, the human actually on the job — usually carrying **no** grant, and
* one seat **dated by "They withdrew"** and still carrying an open grant, which is precisely the
  state R-BS rules must persist (`00634:91-99`).

Measured, on the Okonkwo residence with two duplicate person cards for one human:

```
before  seat …c001  sub  off_job 2026-09-15  withdrawn  grant schedule  effective_to (none)
        seat …c002  sub  off_job (none)                 no grant
fold ->  ERROR merge_seat_authority_collision
         DETAIL  Okonkwo residence · sub
         HINT    One of these two seats has left the job but still carries a standing grant, …
                 Close the seat that is still open — closing a seat ends what it carried — then
                 merge. Where both seats have already left the job, put one back in the bidding
                 first and close it by hand.
```

### The repair it names is the destructive one, and it does not repair the thing complained of

"The seat that is still open" is the **live crew seat**. Taking the refusal at its word, measured
end to end with a `money` grant on the withdrawn seat so the harm statement is r18 MAJOR-1's own:

```
repair  "Close this seat" on …c002 (the LIVE sub)      -> stage off_job, off_job_at today
fold    LANDED
after   seat …c001  sub  stage active   off_job 2026-09-15  withdrawn  money 250000  effective_to (none)
        seat …c002  sub  stage off_job  off_job 2026-09-15  "Closed to fold the cards"  no grant
```

The studio has now taken a working sub off the job, and the surviving identity holds **no live seat
on that job while still signing for $2,500** on a seat that left it. The standing grant the refusal
was about is untouched: 00634 fires on the seat being closed, and the seat being closed is the one
that carried nothing.

### The repair that works is in the room and is gated on the wrong condition

The HINT's second sentence — "put one back in the bidding first and close it by hand" — is the
correct act for this shape (R-BR clears `off_job_at` on a correction away from `withdrawn`; the
hand close then fires 00634 and ends the grant; the gate lifts with the live seat intact; r22's own
fix log measured that sequence at C3/C4). But it is scoped in words to *"Where both seats have
already left the job"*, which is not this case and not the common one.

The other obvious instruction — end the grant on the seat that left the job — has **no act behind
it**. `useSetPartyAuthority` is called from exactly one place in the portal
(`add-person-sheet.tsx:295`), nothing anywhere passes `effectiveTo`, and the `Revoke` in
`access-grant-list.tsx` is the access-grant/field-link rail, a different table. So "Revoke on its
grant" — which `merge_seat_collision`'s own prose still offers as an alternative
(`00629:1702-1703`) — is not reachable either.

### And the face says the same thing

This is not a DB-only HINT. `packages/supabase/src/hooks/use-studio-contacts.ts:1972-1973` and the
DETAIL-aware branch at `:2015-2024` both end on *"Close the seat that is still open — closing a
seat ends what it signed for — then merge."*, and `compare-merge-sheet.tsx:469` prints it into its
`role="alert"` paragraph.

**Where:** `supabase/migrations/00629_studio_contact_merges.sql:1814-1824`;
`packages/supabase/src/hooks/use-studio-contacts.ts:1972-1973`, `:2015-2024`.

**Fix (one of):**
1. Make the primary sentence the one that matches the asymmetric shape — *"One of these seats left
   the job but still signs for something. Put that seat back in the bidding, then close it by hand:
   closing a seat ends what it carried."* — and keep "close the still-open seat" only for the case
   where the **still-open** seat is the one carrying the grant. The DETAIL already carries the job
   and the kind; adding which of the two seats holds the grant would let the sentence be exact.
2. Or give the room the act the refusal keeps implying — an "End this grant" on the seat line
   (PR-n-gated) — and name it.

---

## 3. MAJOR-2 — `w3-data-report.md` does not know the fourth refusal exists, and its refusal count is wrong at HEAD

**Severity: major. Confidence: high (counted from the file body at HEAD and grepped in the report).**

The same class this program filed at major in r19 (MAJOR-2, "the report's counts stale again") and
r21 (MAJOR-3, "the report described a six-migration wave"). The report is the record the W7 deploy
preflight reads.

Measured from `merge_studio_contacts()`'s own body at HEAD:

```
RAISE EXCEPTION sites   17
distinct tokens         15   (merge_contact_not_found x3; the other fourteen once each)
```

`w3-data-report.md:52` says:

> Fourteen distinct tokens, not eight and not eleven … sixteen `RAISE EXCEPTION` sites over
> fourteen names — `merge_seat_collision` is raised from more than one branch.

Three things are wrong with that sentence at HEAD:

1. **fifteen** names over **seventeen** sites, not fourteen over sixteen;
2. the enumerated list stops at `merge_seat_collision` and never names
   **`merge_seat_authority_collision`** — r22's whole fix;
3. the parenthetical misnames the repeated token: `merge_seat_collision` is raised from exactly one
   branch; the one raised three times is `merge_contact_not_found`. (That was already wrong before
   r22 — it is not a consequence of the fix.)

And the omission is not confined to one sentence. `grep -n "merge_seat_authority_collision\|fourth\|r22"` over
`build/w3-data-report.md` returns **nothing**: §0's `00629` row ("…the merged-card seat guard,
`people_directory` v5, and the archive/restore door") does not name the fourth pre-check; §1's "The
seat guard (not in the brief, and why it is here)" does not; §9/§10 do not. A reader of the report
would ship believing the merge has fourteen refusals and that a withdrawal-dated seat carrying a
grant folds freely.

**Where:** `artifacts/people-room-crm-2026-09-11/build/w3-data-report.md:22` (the `00629` row),
`:52` (the refusal list and count), §1's seat-guard paragraph, §9, §10.

**Fix:** add `merge_seat_authority_collision` to §1's ordered list and to the `00629` row; restate
the count as fifteen names over seventeen sites; correct the parenthetical to
`merge_contact_not_found`; add one paragraph to §1 stating the fourth pre-check and its premise
(R-BS makes `off_job_at IS NOT NULL` stop implying "the grant was ended"), the way §1 already states
the third.

---

## 4. Minor

**m1 · `resolve_merged_contact(uuid)` pins no `search_path`.** Measured: `pg_proc.proconfig` is
NULL for it and `search_path=public` for all twenty-one other wave functions. It is SECURITY
INVOKER, so the exposure is small, but it is the one function in the wave that reads
`studio_contacts` unqualified-schema-resolvable and it is granted to `authenticated`. Carried from
r22 m3; still open. `00629:382-399`.

**m2 · `add_household_member()` on a studio-less job raises 00624's token, not 00632's own
refusal.** Measured (probe D, ROLLBACKed) on `Aspen Loft Refresh`, one of the **5 of 8** local
projects R-BI names: `add_household_member(h, card, 'client_rep', <studio-less job>)` answers
`ERROR: party_card_project_has_no_studio` **from the seat INSERT at `00632:463-470`**, before the
file's own `household_grant_project_has_no_studio` at `00632:482-487` can run. The named refusal is
therefore unreachable on the commonest path (it only fires where an OPEN seat already exists and no
INSERT happens), and the sentence `HOUSEHOLD_REFUSAL_SENTENCES.household_grant_project_has_no_studio`
(`use-households.ts:113`) is dead there. The face does not print a schema word — `household-band.tsx`
routes through `writeErrorMessage`, which maps the token at `write-error.ts:32-34` — but the sentence
it prints is the seat-card one ("…a firm from the studio's book can't be put on its seats") for an
act that named no firm. Move the recorded-studio check above the seat INSERT, or widen the sentence.

**m3 · The sweep's notification renders a double possessive.** Measured: the seeded book's second
lapse writes subject `Ostrom Builders's paper has lapsed` and message `The certificate of insurance
for Ostrom Builders lapsed 31 Dec 2025.` The `'''s'` concatenation at `00630:411-414` has no rule
for a holder name already ending in `s`. It reaches an in-app notice the principal reads.

**m4 · 00634's one-off backfill contradicts the clamp it sits beside.** `00634:276-283` ends every
open grant on every seat with `off_job_at IS NOT NULL`, which includes a seat dated by a recorded
withdrawal — the one population R-BS rules must **keep** its open grants. It is a no-op today (both
`off_job_at` and `bid_outcome` ship in this same chain, so Strata has no such row at apply time, and
locally the count after reset is 0), but a re-apply over a book that has since used the Bidding band
would end grants the clamp exists to preserve. Either exclude `bid_outcome = 'withdrawn'` from the
backfill or say in the banner why the backfill deliberately does not honour the clamp.

**m5 · `contact_rule_blocks_contact()` still has no caller, and its COMMENT still misstates the
merge.** Re-verified at HEAD: `grep -rn contact_rule_blocks_contact supabase/ packages/ apps/`
returns only `00629` itself, `seed/00-legacy-grants.sql` and `database.types.ts`. Its COMMENT
(`00629:942-947`) says "merge_studio_contacts() refuses on it", while the merge in fact refuses on
**subsumption** (`00629:1494-1509`, r5 M-2 widened it away from R-BL's formula). Carried from
r21-n2/r22; still open.

**m6 · 00631's prose names a trigger body that is no longer there.** `00631:315` and `:327` both
name `update_updated_at_column()` as the body behind `set_updated_at_project_parties`, which
`00629:1244-1275` replaced with `project_parties_touch_updated_at()`. The bracketing
`DISABLE/ENABLE TRIGGER` at `00631:335`/`:404` still names the right trigger, so nothing is broken —
only the comment. Carried from r20-n3; still open.

---

### A note that is not a finding

On this shared local database I found **3 committed `studio_compliance_notices` rows, 6
`notification_log` rows and 2 `job_runs` rows** for the sweep, written at `16:23:23Z` by two
concurrent transactions. They are not the migrations' doing and not the suite's: a second full
`supabase db reset` leaves `0 / 0` and one `job_runs` row (`marketplace-vitals-refresh`), and
running the W3 suite against that clean database leaves the counts unchanged. Nothing in the
repository calls `sweep_compliance_expiries()` except the test. It is another session's probe
residue on the shared box, not a product defect — recorded here only so the next round does not
file it.
