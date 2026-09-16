# W4 — fix log, round 11

Three findings taken, all three from the r11 adversarial reviews: **MAJOR-1** and
**MAJOR-2** from `w4-review-r11-data-edge.md`, **M-1** from `w4-review-r11-code.md`.
Nothing else was touched: the 16 data/edge minors and the 25 code/QA minors named in
those two files are left standing, as the briefs' minor rule allows.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod anything: no
`db push`, no `functions deploy`, no secrets. No migration was minted — R-BZ holds W4 at
00638 and says the remaining fixes edit 00635–00638 in place, which is what MAJOR-2 does
(00637 is unapplied on Strata).

---

## MAJOR-1 — this wave's Playwright spec poisoned the seeded studio

**File:** `apps/client-portal/tests/paperwork-link.spec.ts`

### What was wrong

`mintDoor()` inserted a firm card into the **seeded** studio
`b0000000-0000-0000-0000-000000000001` with a service-role client, `seedLapsedCertificate()`
wrote a `studio_compliance_documents` row, and `mint_paperwork_link` wrote a
`paperwork_link_tokens` row. The file had no `afterAll`, no `afterEach` and no delete of
anything. Three tests each call `mintDoor()`, so every run left three `Paperwork E2E …`
firm cards standing in the studio every W1/W3 count assertion is written against, and
`supabase/tests/people/w1b_compliance_authority_directory_test.sql:824` — `3m expected 21
firm cards` — stayed failed until somebody reset the database. The file's own header said
so out loud: "rows are left in place … `supabase db reset` is the broom."

### What changed

- The header note is replaced: cleanup is this file's job, and the reason is named (the
  studio cannot be a throwaway because `mint_paperwork_link` gates on
  `is_active_studio_member`, so only the card can be).
- `mintDoor()` pushes every door it mints onto a module-level `mintedDoors` list.
- A new `removeDoor(door)` undoes one door in order: read the document rows' `file_path`s
  and `remove()` those objects from the `compliance-documents` bucket; delete the
  `notification_log` `compliance_document_inbound` rows R-AC writes to the studio's owners
  and admins (matched on `metadata->>company_id`); delete `studio_compliance_documents` by
  `holder_id`; delete `paperwork_link_tokens` by `company_id`; delete the `studio_contacts`
  card. Each table leg is written out rather than leaned on `ON DELETE CASCADE` from
  `studio_contacts`, so a later cascade change cannot quietly turn the cleanup into a no-op.
- `test.afterAll` removes every door this worker minted, then sweeps leftovers from a worker
  killed mid-test — `Paperwork E2E %` cards in the seeded studio **older than an hour**, the
  age filter being what makes the sweep safe under `fullyParallel` (a sibling worker's
  in-flight card can never be swept out from under it).
- The `afterAll` then asserts the studio holds none of **this worker's own** ids. Scoped to
  its own ids on purpose: a count over the whole studio would itself be a race between
  workers, which is the shape of defect this `afterAll` exists to remove.

### Evidence (local, server-free)

The three `mintDoor()` inserts and the `removeDoor()` call sequence were replayed verbatim
against the reset local stack with a service-role client (a scratch script, since a
Playwright `afterAll` cannot be invoked outside the runner; the script was deleted after
the run — no server was started, per the brief):

```
firm cards: before=21 after 3 mintDoor()=24          ← the leak, reproduced
w1b_compliance_authority_directory_test.sql -> exit=3
ERROR:  3m expected 21 firm cards, got 24            ← the reviewer's failure, reproduced

firm cards: before=24 after 3 mintDoor()=27
firm cards: after removeDoor() x3=24                 ← removeDoor returns the studio exactly
leftovers: tokens=0 documents=0
PROOF OK: the seeded studio is exactly as it was found

stale cards found: 3                                 ← the afterAll sweep, on the three
firm cards after sweep: 21                              cards phase 1 abandoned
w1b_compliance_authority_directory_test.sql -> exit=0
```

Type-checked separately, because `apps/client-portal/tsconfig.json` excludes `**/*.spec.ts`:
`tsc --noEmit --strict … tests/paperwork-link.spec.ts` → **exit 0**.

**Not executed:** the Playwright run itself. The brief's gate list ends "no servers", and
this spec needs a client-portal server on :3002 plus `supabase functions serve`. What is
proven is the delete sequence against the real schema and the gate moving 24 → 21; the
`afterAll` wiring around it is stock Playwright.

---

## MAJOR-2 — the rate bucket was an existence oracle for the paperwork token

**File:** `supabase/migrations/00637_paperwork_upload_door.sql` (edited in place, unapplied
on Strata; R-BZ: W4 mints no migration beyond 00638).
**Test:** `supabase/tests/people/w4_channels_touches_paperwork_test.sql` (new block 15).
**Comments only:** `supabase/functions/paperwork-upload/core.ts`,
`apps/client-portal/src/app/paperwork/[token]/page.tsx`.

### What was wrong

`public.paperwork_link_rate_limit_hit`'s ladder was ip → link → `anon`, and the `link:`
lookup carried **no status or expiry predicate**. A revoked or expired token still resolved
to its own private bucket while everything unresolved shared one global `anon` key. So an
address-less caller — which `callerIp` permits, and which `cf-connecting-ip` and
`x-forwarded-for` being caller-written make free — spent `anon` with twenty junk knocks and
then read the difference: an unminted 64-hex value answered 429, an existing-but-dead one
answered "within limit". That is the question `upload-door-spec.md` acceptance 4 forbids
("neither path reveals whether the token once existed") and that 00637's own comment claimed
was shut ("an unknown token is not an oracle"). Second effect at the same site: one
address-less caller could spend the shared bucket for every other address-less caller.

### What changed

Two changes, both needed, exactly the reviewer's fix shape:

1. The `link:` branch now carries the resolvers' own liveness predicate —
   `status = 'active' AND expires_at > now()`, the same pair `resolve_paperwork_link` and
   `paperwork_link_storage_context` use — so a dead token resolves to no link at all,
   exactly as an unminted one does.
2. A well-formed token that resolves to no live link is keyed by its **own sha256**
   (`'tok:' || encode(digest(token,'sha256'),'hex')`) rather than by the shared string. The
   hash is what is already stored at rest, so this puts no new secret in the table. `anon`
   is left only for a caller presenting no token at all — a caller who can open nothing, and
   so can deny nothing to one who can.

R-CA is untouched: nobody is unbucketed, and a live token with no address still buckets by
the link's row id. The banner's deviation note, the table `COMMENT`, the function `COMMENT`
and the two call-site comments in `core.ts` / `page.tsx` are corrected to the ladder that
now exists. No GRANT or REVOKE changed: `python3 scripts/generate-legacy-grants.py` rewrote
`seed/00-legacy-grants.sql` to **no git diff**.

### Evidence

New SQL block 15 in `w4_channels_touches_paperwork_test.sql`, twelve assertions, which
replays probe P9. It mints a live token, makes a genuinely revoked one (a re-mint on the
same firm, R-AF), and makes an expired one on the window-less firm (R-AD):

```
NOTICE:  15. W4 r11 MAJOR-2 — the paperwork bucket tells no one whether a token was ever
minted: a dead token reaches no link bucket, a dead and an unminted token share one key
shape and one answer, junk knocks cannot spend a shared bucket, and the per-token limit
still bites at 20: passed
NOTICE:  W4 SQL suite: all blocks passed
w4_channels_touches_paperwork_test.sql -> exit=0
```

The block asserts, in order: a live token still buckets `link:<id>` (a); a revoked token
reaches **no** `link:<id>` bucket (b) and lands in `tok:<sha256>` (c); an expired token the
same (d, e); an unminted token the same (f); twenty-one junk knocks from twenty-one distinct
never-minted tokens are all allowed and `anon` is never written (g, h) — under the old ladder
the twenty-first was refused; after that noise the unminted and the dead token return the
**same** boolean (i) — under the old ladder this pair read `false` / `true`; the hash bucket
is still a real limiter, twenty pass and the twenty-first is refused (j, k); and a caller
with no token at all still lands in `anon` (l).

Block 14 (R-CA, r10 MAJOR-2) still passes unchanged: a malformed address with a **live**
token still buckets by the link.

---

## M-1 — the seat window's consequence sentence claimed it re-dates doors it does not

**File:** `apps/designer-portal/src/components/document/roster/seat-window-band.tsx`

### What was wrong

`WINDOW_CONSEQUENCE_SENTENCE` read "The window bands this seat on the Call Sheet and dates
the doors it holds." Present tense, unconditional, and untrue of doors already open:
`create_field_link` (00627:555-625) derives `expires_at` **at mint** — `max(on_site_to,
warranty_until) + interval '1 day'`, else the date the caller named, else 90 days — and no
trigger, rule or later UPDATE re-dates `project_field_links`. A studio that shortens a
window because a trade left the job read that as "their way in now ends then" and left a
live field link standing.

### What changed

Copy only. The fix the review names is the copy correction; re-dating issued links is a
behaviour change and belongs to a ruling, not to a review. The sentence now reads:

> The window bands this seat on the Call Sheet and dates the doors minted from here on. A
> door already open keeps the dates it was given — close it under Access grants if the
> window moved under it. The change is recorded with whoever you say was told.

"Access grants" is the surface's own heading (`reach-access.tsx:1240`), so the instruction
names a place the reader can actually go. A comment above the constant records the mint-time
derivation and why the sentence, not the behaviour, moved.

### Evidence

`grep -rn "dates the doors"` over portal and package source: the constant was the only
source site (the other hits are the review file itself). Gates below.

---

## Gates

Run from the worktree with `pnpm --dir` / `--filter`; never a chained `cd`; no server
started on 3000 or 3002.

```
pnpm supabase:reset .................................. Finished supabase db reset
                                                       (outside the Bash sandbox — the CLI's
                                                       ~/.supabase/telemetry.json write is
                                                       EPERM inside it, as r10/r11 recorded)

psql -v ON_ERROR_STOP=1
  w4_channels_touches_paperwork_test.sql ............. exit=0   (now 15 blocks)
  w4_invoice_link_freeze_order_test.sql .............. exit=0
  w1b_compliance_authority_directory_test.sql ........ exit=0
  w1a_identity_channels_consent_test.sql ............. exit=0
  w3_merge_sweep_household_test.sql .................. exit=0

deno test --no-check --allow-all --config supabase/functions/deno.json
  _tests/paperwork-upload.test.ts .................... ok | 19 passed | 0 failed
  (no deno.lock left at the worktree root)

designer-portal type-check ........................... EXIT=0
designer-portal jest --testPathPattern roster ........ 17 suites, 427 tests, all passed
client-portal  type-check ............................ EXIT=1  — the SINGLE pre-existing
   .next/types/app/page.ts(37,29) TS2344                error r11 m-12 already records;
                                                        unchanged by this round, and no
                                                        error from any file touched here
client-portal jest --coverage ........................ EXIT=0
   157 suites, 2572 tests, All files 77.33 / 73.13 / 77.05 / 79.71  (floor 70/60/70/70)
client-portal jest --testPathPattern paperwork ....... 4 suites, 66 tests, all passed
tsc --noEmit --strict tests/paperwork-link.spec.ts ... EXIT=0  (the spec is excluded from
                                                        the portal tsconfig, so it is
                                                        type-checked on its own)

python3 scripts/generate-legacy-grants.py ............ baseline + 2837 replayed statements,
                                                       NO git diff on seed/00-legacy-grants.sql
```

No `db:generate` drift is expected or was taken: 00637's edit is a function body and its
comments; no table, column, argument or return type moved.

## Left standing on purpose

Every minor in `w4-review-r11-data-edge.md` §5 (m-1…m-13, n-1…n-4) and in
`w4-review-r11-code.md` §1/§5 (m-1…m-25). Not in this round's scope.
