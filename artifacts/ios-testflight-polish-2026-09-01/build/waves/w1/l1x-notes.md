# First Flight · W1 · L1-X — integration notes

Lane **L1-X** (PROGRAM.md §3 calls it W1 · L0.2), branch `first-flight/w1-l1x`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-ff-w1-l1x`. One finding: **`L07-01`**.

No Swift, no simulator, no clone. **Nothing in this file authorises a production write.** §3 is the
Kody-run block.

**Notes addressed TO this lane: none.** `build/waves/w1/*-notes.md` held `l1-a-notes.md`,
`l1-b-notes.md` and `l1-c-notes.md` at start; none of the three mentions L1-X, L0.2 or `L07-01`
(`grep -n "L1-X\|L0.2\|L07-01"` returned nothing across all three). `build/waves/w1/l1-e-copy-deck.md`
**does not exist** as of this lane's close, so no copy-deck rows were applied; the deck pass at
integration owns any that land later. L1-X owns no user-facing string in any case — the migration
changes no message text, and the sheet copy the client sees (`ProposalSignError`) belongs to L1-B.

---

## 1. What shipped

| File | State |
|---|---|
| `supabase/migrations/00559_proposal_signing_multi_studio.sql` | new, **not applied anywhere** |
| `supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql` | new |
| `supabase/tests/edge_api/public_sd_hardening_contract_test.sql` | one pinned body hash updated |

Commits: `ea85416db` (the failing test), `0058771ec` (the migration + the hash).

**Number.** Repo head in both this worktree and the main checkout is `00557`; `00558`
(`feedback_bug_reports_github`) is a peer session's, applied to the shared local DB but present in no
first-flight branch. **00559 was free and is taken.** Re-check before applying: `ls
supabase/migrations/*.sql | sort -V | tail -5` and `supabase migration list`.

---

## 2. Notes I am sending

### N1 → **the steward / Fable** · both changed test files are RED until 00559 is applied

This is expected and it is not a regression. Neither file can pass against a database that does not
carry 00559:

```
psql … -f supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql
  → exit 3, ERROR: studio_id_not_designer_studio   (the defect, still live)

psql … -f supabase/tests/edge_api/public_sd_hardening_contract_test.sql
  → exit 3, ERROR: a public 00511 identity, semantic profile, or body hash drifted
```

Both go green on the wave's `pnpm supabase:reset` at integration, which replays 00559. Until then, a
lane that runs `bash scripts/run-sql-tests.sh` will see two unexpected failures with those names.
**Do not add either file to `supabase/tests/KNOWN_FAILURES.md`** — they are not known failures, they
are ahead of the database. Proof that they pass *with* the migration is in §4 below.

`scripts/run-sql-tests.sh` also needs an **unsandboxed** shell: sandboxed, its `mktemp -d` fails and
the script reports `error: no .sql files found` (line 128 `/known_failures.normalized: Operation not
permitted`). That is the sandbox, not the suite.

### N2 → **the steward / Fable** · this lane never touched the shared local database

Every proof ran inside a transaction that rolled back. Verified afterwards: the fixture studio row is
absent (0 rows), `proposals.b0000000-…-0002` is still `sent`, the live
`set_project_studio_id()` body still lacks the new branch, and
`supabase_migrations.schema_migrations` still tops out at `00558`. Merge order is unaffected — this
lane is SQL only and can conflict with no Swift merge.

### N3 → **L1-B** (`Features/Proposals/**`) and **L1-F** · nothing owed, recorded so neither lane waits

The iOS client passes **no studio identifier**:
`apps/mobile/Patina/Patina/Services/API/ProposalsAPIClient.swift:405-418` sends exactly
`{p_proposal_id, p_signed_name}` to `sign_proposal`. The fix is entirely server-side, the RPC
signature is unchanged, and the response shape (`status`, `signed_at`, `project_id`, `accepted_at`,
`newly_signed`) is unchanged. `L07-01`'s own `codeNote` already says the client copy is correct and
`ProposalSignError.map`'s `.unexpected` is deliberate. **No note, no task, no rebuild.**

### N4 → **Fable** · one latent defect found next door, deliberately NOT fixed here

The same ambiguity blocks a two-studio designer's **own** project creation from the portal. Measured
on the local stack, as the seeded designer under `authenticated`:

```
INSERT INTO public.projects (designer_id, created_by, name, status) VALUES (…self…, 'probe', 'active');
  → P0001 studio_id_not_designer_studio
```

00559 leaves that path exactly as 00511 wrote it (the fix is gated on a proposal-backed INSERT), and
section 5 of the new test **pins** it as still failing closed. It is outside `L07-01` and outside W1's
scope; it wants its own finding if Fable wants it fixed. Related and equally out of scope: because
discovery fails closed, **every seeded project for that designer carries `studio_id = NULL`**, which
starves the anon brand resolver (00320) and the per-studio invoice counter (00318).

---

## 3. Kody-run steps this lane creates

All three are Kody's. The first is read-only; the second is the apply; the third is the re-probe.

### J1 (runbook) / K1 — Does the round-one designer belong to more than one active studio?

Unchanged from `build/waves/w0/l07-notes.md` §3, repeated here so this lane's block is complete. Run
it in the **Strata SQL editor** (Supabase dashboard → project `bkvcixdmuyejfzcijpdg` → SQL Editor) or
with `psql` against Strata. It reads three tables and writes nothing.

```sql
SELECT p.email,
       count(DISTINCT om.organization_id) AS active_design_studios,
       string_agg(DISTINCT o.name, ' | ' ORDER BY o.name) AS studios
FROM public.profiles AS p
JOIN public.organization_members AS om ON om.user_id = p.id
JOIN public.organizations AS o ON o.id = om.organization_id
WHERE om.status = 'active'
  AND om.role <> 'guest'
  AND o.type = 'design_studio'
  AND o.status = 'active'
  AND p.id IN (SELECT DISTINCT designer_id FROM public.proposals WHERE status = 'sent')
GROUP BY p.email
ORDER BY active_design_studios DESC, p.email;
```

**How to read it.** Any row with `active_design_studios >= 2` is a designer whose clients cannot sign
a proposal today. If Leah's row reads `1`, `L07-01` is latent for round one and 00559 is a
scheduled repair rather than a build-1 blocker. If it reads `2` or more, it blocks build 1 for that
studio and 00559 must go to Strata before the invites, or the defect must be named in What to Test.

A **second read-only probe** worth running in the same session, because 00559 also stops leaving
`studio_id` NULL — it says how many rows the ambiguity has already stranded:

```sql
SELECT count(*) AS projects_without_studio,
       count(*) FILTER (WHERE proposal_id IS NOT NULL) AS from_proposal_activation
FROM public.projects
WHERE studio_id IS NULL;
```

00559 does **not** backfill those rows; it only stops new ones being created. A backfill would be a
separate, deliberate migration.

### The apply — selective `psql`, after 00555 and 00557, never `supabase db push`

`supabase db push` would drag every pending file in the band. Apply this one file, in a transaction it
already opens itself, then write the ledger row.

```bash
# 1. Confirm 00555 and 00557 are already on Strata and 00559 is not.
psql "$STRATA_DB_URL" -X -At -c "SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('00555','00556','00557','00558','00559') ORDER BY version;"

# 2. Read the live body hash BEFORE, so the apply can be proved by the object and not the ledger.
psql "$STRATA_DB_URL" -X -At -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') FROM pg_proc WHERE oid='public.set_project_studio_id()'::regprocedure;"
#    expect 8113ca8a0b99edcce6220e97983ddf1f71576d099f5e3311044c571027929a02 (00511's body)

# 3. Apply the one file. It carries its own BEGIN/COMMIT and its own preflight.
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/00559_proposal_signing_multi_studio.sql

# 4. Prove it by the object, not the ledger.
psql "$STRATA_DB_URL" -X -At -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex') FROM pg_proc WHERE oid='public.set_project_studio_id()'::regprocedure;"
#    expect 8aca199be7f059b37c7b0148d39a4b38e0a725f77cb0aa4e939730712ca050f8

# 5. Ledger row, so a later `db push` does not replay it.
psql "$STRATA_DB_URL" -X -v ON_ERROR_STOP=1 -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('00559','proposal_signing_multi_studio') ON CONFLICT (version) DO NOTHING;"
```

`$STRATA_DB_URL` is the Strata connection string Kody already uses for selective applies (the same one
00555/00557 went in on). Nothing above is run by an agent.

### K2 — after the apply, the same probe again, plus one behavioural check

Re-run **J1/K1** unchanged. The count itself will not change — 00559 does not move anyone between
studios; it makes the count irrelevant to signing. The real confirmation is behavioural and belongs to
the device pass: **have a tester sign the demo proposal and watch the sheet reach the signed state.**
A real signature on production is not a probe, so this is a walk step, not a SQL step.

---

## 4. The local proof, without a reset

`pnpm supabase:reset` is the steward's at integration and this lane does not own it, so 00559 was
never committed to the shared local database. Instead each proof applied the migration inside a
transaction and rolled it back.

**Red, before the fix** — the new test against the current schema:

```
psql … -X -q -v ON_ERROR_STOP=1 -f supabase/tests/rls/00559_proposal_signing_multi_studio.test.sql
NOTICE:  00559 fixture: 3 candidate studios
ERROR:  studio_id_not_designer_studio
CONTEXT:  PL/pgSQL function set_project_studio_id() line 211 at RAISE
          SQL statement "INSERT INTO projects ( … )"
          PL/pgSQL function _activate_proposal_as_project_impl(uuid,date) line 62 at SQL statement
          PL/pgSQL function _activate_proposal_as_project_authorized(uuid,date) line 19 at assignment
          PL/pgSQL function _sign_proposal_authorized_00400(uuid,text,uuid,text) line 285 at assignment
          PL/pgSQL function sign_proposal(uuid,text) line 10 at RETURN
EXIT=3
```

**Green, with the fix applied transaction-locally and rolled back:**

```
--- applying 00559 (transaction-local) ---
--- running 00559 test ---
NOTICE:  00559 fixture: 3 candidate studios
NOTICE:  00559 section 1+2 passed: project ac0db74d-36c0-464d-b044-ebdd7b3cd2a4 stamped studio a6ea1eed-08df-4e79-9744-b9b9ad3de4da
NOTICE:  00559 section 3 passed: relationship studio 59000000-0000-4000-8000-000000000001 chosen over a6ea1eed-08df-4e79-9744-b9b9ad3de4da
NOTICE:  00559 section 4 passed: studio_id_not_designer_studio still raised
NOTICE:  00559 section 5a passed: direct INSERT still fails closed
NOTICE:  00559 section 5b passed: the branch names both gates
--- rolling back ---
EXIT=0
```

**Neighbours** — every other SQL test that names `studio_id_not_designer_studio` or
`set_project_studio_id`, each run twice (untouched database, then with 00559 applied in-transaction):

```
supabase/tests/document/proposal_phase_authority_atomicity_test.sql baseline=0 with00559=0
supabase/tests/billing/invoice_checkout_integrity_test.sql          baseline=0 with00559=0
supabase/tests/rls/00555_ios_round_one_security.test.sql            baseline=0 with00559=0
supabase/tests/security/extension_execute_authenticated_test.sql    baseline=0 with00559=0
supabase/tests/edge_api/public_sd_hardening_contract_test.sql       baseline=0 with00559=0 (after the hash update)
```

The contract test is the one that had to move: it pins `set_project_studio_id`'s body sha256, and the
body changed. Nothing else it pins moved — still `SECURITY INVOKER`, still no direct EXECUTE for any
app role, still the canonical `roles → user_roles → memberships → organization` lock order (00559 adds
no lock).

**What was NOT run:** `bash scripts/run-sql-tests.sh` over the whole tree with 00559 applied. It
cannot be — each file is a separate `psql` invocation, so a transaction-local apply cannot span them,
and committing 00559 to the shared local database is the steward's reset, not this lane's.
`pnpm db:generate` was also not run and does not need to be: 00559 adds no public function and no
column, and trigger functions are not emitted into `packages/supabase/src/database.types.ts`
(`grep -c set_project_studio_id` there is 0).

---

# From L1-F — round 4 (fix round 2, 2026-09-02)

Written after the round-2 adversarial review of L1-F (`RL1F-19`…`RL1F-35`). Full text at
`build/waves/w1/l1f-notes-out-round4.md`.

## L1F→X-2 → **the steward / integration** · nine things to carry through the merge

**Supersedes `L1F→X-1`.** Items 1–4 are that note verbatim; 5–9 are new.

1. **`AccountIsolationTests.theSignOutClearsThePreviousAccountsNavigationStack`** (L1-B's file) still
   carries `withKnownIssue(isIntermittent: true)` for Task F-L1B-2. That task **is** applied on
   `first-flight/w1-l1f`, on a deliberately different seam — `clearNavigationForEndedSession()`, keyed
   on the `.main → .auth/.launching` transition, rather than a rewrite of `beginSplashTransition`. The
   review (`RL1F-04`) ruled the deviation defensible and better. After merge 4, flip that test from
   `withKnownIssue(…) { #expect(clears) }` to a bare `#expect(clears)` and confirm it passes.

2. **`BadgeFreshnessTests.thereIsNoSecondCount`'s known issues** now number **two** and neither is
   `isIntermittent` any more (`RL1F-19`). They are entries in a dictionary at the top of the suite:

   ```swift
   private static let owed = [
       "Patina/Features/Home/Views/DailyRoomView.swift": "C2-07 · note L1F→C-1 …",
       "Patina/Features/Profile/ViewModels/StudioQueueBuilder.swift": "RL1F-25 · note L1F→B-5 …"
   ]
   ```

   **A red run here is the wave working, not a break.** L1-C merges 1st and L1-B 3rd, so if either
   lane applies its note the corresponding block fails at merge 4 with an unexpected pass. The fix is
   to delete that entry from `owed` — the block's own message says so. If a block still *records*, its
   note is still owed and the finding is still open; check the file before signing the wave off.

3. **`LaunchWatchdog.swift` is added identically on `first-flight/w1-l1b` and `first-flight/w1-l1f`**
   (see `L1F→B-4`, and `RL1F-26` which re-verified it byte-for-byte). Expect a clean identical add/add
   at merge 4; if git reports a conflict on it, L1-B edited the file after merge 3 and **L1-B's version
   is the one to keep** — L1-F's copy is a verbatim import, never an edit.

4. **`C9-05` is closed by `L07-02`'s fix**, incidentally and correctly. `findings.json` still carries
   it as W2 / L1-F / open. `ThreadDetailView.swift` applies
   `pinnedFooterClearance(houseFirst: false)` — dockHeight + 8 = 148 pt — on the flag-off root too.
   Evidence: `shots/w1-review-l1f/17-flags-off-thread-composer-clears-dock.png`. Mark it
   closed-by-`L07-02`, and do **not** additionally apply the `.threadDetail`-in-`yieldsToPinnedFooter`
   route it originally asked for — that would double the inset.

5. **`D→F-3` is a rebase-time apply, and it is the one line that turns merge 4 red** (`RL1F-20`).
   `C-13` adds a **new** `PatinaColors.pearl` call site — the thread header's bottom rule — and L1-D's
   `BorderTokenAdoptionTests.pearlHasNoCallSitesOutsideTheTokenFile` is a bar at **zero** scanning all
   of `Patina/**`. L1-D merges 2nd, L1-F 4th, so `ios-gate.sh unit` on the integration tip after merge
   4 fails with "PatinaColors.pearl is still painted at: ThreadDetailView.swift ×1".

   It genuinely cannot be applied on this branch: `grep -rn "hairline" apps/mobile/Patina/Patina/` on
   `first-flight/w1-l1f` returns **0** — `PatinaColors.Border.hairline` does not exist on this base and
   the file would not compile, so the lane's own gate could not be green.

   **At merge 4**, in `Patina/Features/Messaging/Views/ThreadDetailView.swift`, inside `header`'s
   `.overlay(alignment: .bottom)`:

   ```swift
   Rectangle().fill(PatinaColors.pearl).frame(height: 1)
   ```

   →

   ```swift
   Rectangle().fill(PatinaColors.Border.hairline).frame(height: 1)
   ```

   The other four `pearl` sites in this lane's trees (`ThreadDetailView.swift:458`,
   `ThreadListView.swift:129,175`, `NotificationFeedView.swift:338`) are already swept on
   `first-flight/w1-l1d` and resolve at the merge itself. This one is only the fifth because `C-13`
   creates it.

6. **`O10` is the other rebase-time apply** (`RL1F-20`). L1-B's `Core/Persistence/LocalStoreReset.swift`
   carries the pending-link clear as a literal because `PendingLinkQueue` is L1-F's file and does not
   exist on L1-B's branch. **At merge 4**, replace:

   ```swift
        (UserDefaults(suiteName: LastSeenStore.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: "patina.deeplink.pending.v1")
   ```

   with:

   ```swift
        (UserDefaults(suiteName: PendingLinkQueue.appGroupIdentifier) ?? .standard)
            .removeObject(forKey: PendingLinkQueue.defaultsKey)
   ```

   …and delete the comment's third and fourth sentences ("The key is written… O10)."), which describe
   the workaround rather than the code.

   **Confirmed, as O10 asked:** `PendingLinkQueue.appGroupIdentifier` is `"group.cloud.patina.app"` —
   the same value `LastSeenStore.appGroupIdentifier` holds — and `PendingLinkQueue.defaultsKey` is
   `"patina.deeplink.pending.v1"`, byte-for-byte the literal L1-B wrote. The two stores are in the same
   suite and the clear on L1-B's branch is landing in the right domain today.

7. **`A-63` is closed on `first-flight/w1-l1d`, with no L1-F code and no L1-F test** (`RL1F-31`).
   The row sits in L1-F's W1 table but L1-D built it: `PatinaDesignKit/Components/PatinaButton.swift`
   now carries `.padding(.horizontal, PatinaSpacing.lg)` (24 pt) inside the 52 pt frame, so the
   shortest label yields a capsule wider than it is tall, and `PatinaEmptyState.swift` uses
   `PatinaButton(ctaTitle, style: .secondary).fixedSize()`. Neither is on `main`. Confirm it on the
   merged tip with **L1-D's** `PrimaryButtonStyleTests.theCapsuleIsAControlNotAnOutline`, and sign it
   off once rather than twice or not at all.

8. **`RecordRefresh.swift`'s one-word change (`L1F→C-3`) is L1-C's, at merge 1.** If it is not there by
   merge 4, `WidgetSnapshotOwnershipTests.theRebuildNamesItsSession` records its known issue and
   `GAP7B-02` is still open — a signed-in tester's first widget refresh will draw "Open Patina to see
   your house." over real content. The parameter exists from merge 4 onward, so the steward can apply
   the line directly on the tip if L1-C declines it; it is
   `snapshots.save(record, owner: sessionUserId)` and nothing else.

9. **`OrderHandoffTests` flakes under load, and it is not this lane's** (`RL1F-16`, seen again this
   round). A full `unit` run started while another `xcodebuild` was finishing failed 4 cases in that
   suite; the same suite alone on the same tree passed 15/15 in 0.09 s. `Features/Orders/**` is not
   L1-F's glob and this lane has never touched it. Re-run before treating it as a merge break.
