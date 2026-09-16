# W1a — close-out review r2 fix log

Scope: exactly the two MAJOR findings in
`w1a-close-review-r2-migrations.md` §4. Nothing else was touched; the eleven
MINOR findings in that review are left standing.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. `00594` is unapplied on prod, so it
is edited in place (no new migration number was minted; 00595–00620 stay
reserved).

---

## MAJOR-1 — adding a person to a second job DEMOTED the studio's standing grant

**Where it was.** `use-coordination.ts:461-471` called
`record_channel_consent(org, 'sms', phone, 'pending', …)` unconditionally
whenever "text updates" was ticked, and `00594`'s transition gate only refuses a
move *out of* `opted_out` — so `granted → pending` passed every leg.

**What changed.** The durable half plus the door, exactly as the review asked.

1. `supabase/migrations/00594_studio_channel_consent.sql`, the `DO UPDATE … WHERE`
   of `record_channel_consent` — a new final leg:

   ```sql
   AND NOT (EXCLUDED.status = 'pending' AND scc.status = 'granted')
   ```

   Stated inside the write like every other gate in that statement, so a grant
   that lands between a read and the write cannot be walked over.

2. The `IF NOT FOUND` branch names the refusal:

   ```sql
   IF p_status = 'pending'
      AND v_row.status = 'granted'
      AND v_row.refusal_unanswered IS NOT TRUE
      AND (v_row.opt_out_at IS NULL
           OR (v_row.consented_at IS NOT NULL
               AND v_row.consented_at > v_row.opt_out_at)) THEN
     RAISE EXCEPTION 'consent_already_granted' USING HINT = …
   ```

   The three extra conjuncts are the sibling's own refusal leg word for word.
   Without them a `granted` record carrying an unanswered refusal reported
   `consent_already_granted` where it had always reported
   `consent_awaiting_recipient` — caught by existing test block 26c, which
   failed on the first pass:

   ```
   ERROR:  FAIL 26c: pending over an unanswered refusal must be refused, got consent_already_granted
   ```

   Such a record is unsendable, not a grant to protect, so the refusal leg keeps
   it and `record_channel_reconsent()` stays the door that is named.

3. New RPC `public.record_channel_invite(uuid, text, text, text, text, text, uuid)`
   — plpgsql, SECURITY DEFINER, `SET search_path TO 'public'`,
   `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated,
   service_role`, `COMMENT ON FUNCTION`. Member-gated **before** its read (it is
   a definer, so RLS is not the backstop), normalises through the shared
   `normalize_channel_value()`, returns a standing sendable `granted` untouched,
   and otherwise delegates to `record_channel_consent(…, 'pending', …)` so every
   gate of that door still applies. A `consent_already_granted` raised by the
   statement-level leg in a race is caught and answered with the standing
   record; anything else is re-raised.

4. `packages/supabase/src/hooks/use-coordination.ts` — `useAddProjectParty` now
   calls `record_channel_invite` (no `p_status` argument). The seat is still
   inserted at `pending`, so 00284's opt-in dispatch is unchanged.

5. `supabase/seed/00-legacy-grants.sql` regenerated
   (`python3 scripts/generate-legacy-grants.py` → `baseline + 2640 replayed
   statements`; the diff is exactly the two new `record_channel_invite`
   statements).

6. `packages/supabase/src/database.types.ts` regenerated — `record_channel_invite`
   added, 38 lines.

**Tests added.** SQL block 39 (`supabase/tests/people/w1a_identity_channels_consent_test.sql`),
12 legs: the refusal by name; the record byte-for-byte unchanged after it
(status, source, evidence, disclosure version, `consented_at`, `recorded_at`);
the invite door returning the grant untouched and writing nothing; the room
still reading `granted`; negative control (no record → the `pending` IS minted
with the caller's evidence and origin project); a standing `pending` still
restated; the inherited refusal, evidence and channel-kind gates; one key for
both spellings; the unsendable-`granted` fall-through; the non-member refusal
before the read; and definer / `search_path` / grant assertions. This is the
block close-review r2 MINOR-11 said did not exist.

Vitest (`packages/supabase/src/hooks/__tests__/use-coordination-authority.test.ts`):
the existing MAJOR-2 case now asserts `record_channel_invite` with the
seven-argument payload, and one new case asserts the hook never asks for a
`pending` verdict at all (`expect(args).not.toHaveProperty('p_status')`) while
the seat is still born `pending`.

---

## MAJOR-2 — the readers printed `granted` for a record every send is refused on

**Where it was.** `channel_consent_status()` (`00594:903-920`) returned
`scc.status` and nothing else, while `refusal_unanswered` is verdict-bearing in
both other places it is read: `_shared/sms.ts:487` refuses every send on it and
`00594`'s `DO UPDATE … WHERE` refuses every studio-side write on it. The fold
mints `granted` + flag TRUE on purpose (`00594:655-666`).

**What changed.** One reader, one verdict — the rule stays in the reader, not in
the two views (R-AS):

```sql
SELECT CASE WHEN scc.refusal_unanswered IS TRUE THEN 'opted_out'
            ELSE scc.status END
  FROM public.studio_channel_consent scc
 WHERE …
```

`COMMENT ON FUNCTION` updated to say so. Neither view was touched — block 40h
asserts neither view mentions `refusal_unanswered`.

**Report.** `w1a-report.md` §2.2 records the new verdict rule and the new door;
§5.2 gains the sentence close-review r1/r2 MINOR-7 asked for — the fold's
cross-seat `refusal_unanswered` cost, and the note that since this fix the room
now prints "Opted out" for that population instead of "Texting".

**Tests added.** SQL block 40, 10 legs: the fold still mints `granted` + flag;
the reader says `opted_out`; the reader and `channelConsentVerdict`'s rule
(`status = 'opted_out' OR refusal_unanswered`) agree on the same row; both
shipped readers print it (`v_project_roster.sms_consent_status`,
`people_directory.status_raw` and `meta->>'sms_consent_status'`); negative
control — a clean grant still reads `granted` in the function and on the roster;
a folded `pending` and a folded `not_asked` winner with a refusing sibling both
read `opted_out`; no record is still NULL; and neither view restates the rule.

---

## Verification

`apps/designer-portal/.env.local` (the worktree has none of its own; the shared
checkout's is the one that is read):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Local, not Strata.

```
$ pnpm --dir … supabase:reset
…
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  38. one resolver for the seat's studio … (close-review r1 MAJOR-1): passed
NOTICE:  39. the add path never lowers a standing grant: pending over granted is
         refused by name and the invite door returns the grant untouched
         (close-review r2 MAJOR-1): passed
NOTICE:  40. one reader, one verdict: an unanswered refusal reads opted_out
         everywhere the room prints it (close-review r2 MAJOR-2): passed
NOTICE:  All W1a assertions passed.
# 43 NOTICE lines, 0 ERROR/FAIL, psql exit 0

$ SUPABASE_DB_URL=… pnpm --dir … db:generate
 packages/supabase/src/database.types.ts | 38 +++++++++++++++++++++++++++++++++

$ pnpm --dir … --filter @patina/supabase test
 Test Files  100 passed (100)
      Tests  1251 passed | 12 skipped (1263)
 ✓ src/hooks/__tests__/use-coordination-authority.test.ts  (25 tests)

$ pnpm --dir … --filter @patina/supabase type-check
 (clean)

$ deno test --allow-all --no-check supabase/functions/_shared/sms.test.ts
 ok | 40 passed | 0 failed
 (the root deno.lock it dropped was deleted again)
```

### Negative control — both fixes are load-bearing

`build/probe33-close-r2-fix-negative-control.sql` runs each half twice in one
rolled-back transaction: once against the shipped definitions, once against the
pre-fix body restored in place.

```
════ MAJOR-1 · AFTER (shipped): the add path leaves the grant alone ════
 status  | source  |             evidence              | disclosure_version |      consented_at
---------+---------+-----------------------------------+--------------------+------------------------
 granted | written | Signed the Lindqvist kickoff form | field-sms-v3       | 2025-05-02 00:00:00+00
-- and the record on disk: identical, recorded_at still 2025-05-02 00:00:00+00
NOTICE:  record_channel_consent(pending) over a standing grant -> consent_already_granted

════ MAJOR-1 · BEFORE (pre-fix WHERE restored): the grant is demoted ════
 status  | source |              evidence               | disclosure_version |      consented_at      |          recorded_at
---------+--------+-------------------------------------+--------------------+------------------------+-------------------------------
 pending | verbal | Said yes at the Okonkwo walkthrough | field-sms-v9       | 2025-05-02 00:00:00+00 | 2026-09-12 09:22:51.868797+00

════ MAJOR-2 · AFTER (shipped) ════
 status_column | refusal_unanswered | reader_word
---------------+--------------------+-------------
 granted       | t                  | opted_out
 Pete Rusk | roster_word: opted_out
 Pete Rusk | directory_word: opted_out | directory_meta_word: opted_out

════ MAJOR-2 · BEFORE (pre-fix reader restored) ════
 Pete Rusk | roster_word: granted
 Pete Rusk | directory_word: granted | directory_meta_word: granted
```

The BEFORE legs reproduce probe30 P1 / probe31 P4 and probe30 P2 exactly.

---

## Not done (deliberately)

The eleven MINOR findings of close-review r2 are untouched, except MINOR-7
(§5.2's sentence) and MINOR-11 (the missing test), both of which the two MAJOR
fixes were instructed to carry. In particular MINOR-8's raw
`consent_awaiting_recipient` string is unchanged — `record_channel_invite` does
not swallow it, and `asWrittenConsentRpcError` still has no branch for it.
