# W4 — fix log, round 12

Four findings taken: **MAJOR-1**, **MAJOR-2** and **MAJOR-3** from
`w4-review-r12-data-edge.md`, and **M-1** from `w4-review-r12-code.md`. Nothing else was
touched: the eleven data/edge minors and the twenty-nine code/QA minors named in those two
files (and `w4-review-r12-qa.md`) are left standing, as the briefs' minor rule allows.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. No prod anything: no `db push`,
no `functions deploy`, no secrets. No migration was minted — R-BZ holds W4 at 00638 and says
the remaining fixes edit 00635–00638 in place, which is what MAJOR-1 does (00637 is unapplied
on Strata). No server was started on 3000 or 3002.

---

## MAJOR-1 — `paperwork_link_rate_limits` had no sweep, and r11 handed its key space to the caller

**File:** `supabase/migrations/00637_paperwork_upload_door.sql` (new §3b), plus one new block
in `supabase/tests/people/w4_channels_touches_paperwork_test.sql`.

### What was wrong

00637 took 00427's table shape verbatim and left 00427's broom behind
(`00427:89` schedules `qr-auth-rate-limit-cleanup` at `'17 * * * *'` deleting rows older than
a day; `grep -n "cron\|cleanup\|sweep\|DELETE FROM public.paperwork_link_rate_limits" 00637`
returned nothing, and `cron.job` on the reset DB held the QR broom and no paperwork
equivalent). r11's oracle fix is what turned that from tidy-up into a defect: before it, an
unresolvable token spent one shared `anon` row; after it, every distinct 64-hex string a
stranger types gets its own permanent `tok:<sha256>` row, and because the limit is per bucket
none of those knocks is refused — block 15 asserts twenty-one junk knocks from twenty-one
never-minted tokens are all allowed. `ip:` is the same shape (`callerIp` reads the
caller-written `cf-connecting-ip` / `x-forwarded-for`). The door is anonymous by design
(`verify_jwt = false`, anon key, an unauthenticated `/paperwork/[token]`), so the writer is
the internet: an unbounded, unswept, write-amplifying table.

### What changed

- **00637 §3b, "The broom"**, next to the table it sweeps: `CREATE EXTENSION IF NOT EXISTS
  pg_cron WITH SCHEMA extensions`, an EXISTS-guarded `cron.unschedule`, then

  ```sql
  SELECT cron.schedule(
    'paperwork-link-rate-limit-cleanup',
    '23 * * * *',
    $$DELETE FROM public.paperwork_link_rate_limits
       WHERE updated_at < now() - interval '1 day';$$
  );
  ```

  One day is 00427's own horizon and far longer than the rolling minute the limiter reads, so
  no live bucket is swept out from under a caller; 23 past keeps it clear of the QR broom and
  the invoice-attempt sweep, both at 17 past. The idiom is 00630:546-556's — the unschedule is
  guarded, the schedule itself is NOT inside an exception handler, so a stack that cannot
  schedule the broom fails the migration rather than applying the door without it.
- The `pg_cron` registry comment is carried forward from 00636 with this job added (and the QR
  broom named), inside the same `EXCEPTION WHEN insufficient_privilege / undefined_object`
  wrapper the house uses: documentation must not fail a migration.
- The file banner gains the "AND THE BUCKETS ARE SWEPT (W4 r12 MAJOR-1)" paragraph above the
  lineage list.
- **Block 16** of `w4_channels_touches_paperwork_test.sql` asserts the job exists, runs at
  `23 * * * *`, names its own table, and — by `EXECUTE`-ing the scheduled command text read
  back out of `cron.job`, not a copy of it — removes a two-day-old bucket while a live one
  stands.

No GRANT or REVOKE moved, so `seed/00-legacy-grants.sql` is unchanged (regenerated: no diff).

---

## MAJOR-2 — the unsubscribe rail stopped one ledger and left the other sending

**File:** `packages/notifications/src/unsubscribe.ts`, plus
`packages/notifications/src/__tests__/unsubscribe.test.ts`.

### What was wrong

`campaign-dispatch` is a branch of the email rail that never asks the channel gate: it posts
straight to `https://api.resend.com/emails/batch` (`index.ts:468`), never imports
`_shared/send-email.ts`, so `channelRefusesSend` never runs, and its whole audience model is
`profiles` filtered on `.eq('email_suppressed', false)` (lines 76, 266, 290, 301) with
`studio_contact_channels` read nowhere. For bounces and complaints the two ledgers stay in
step (`resend-webhook` writes `profiles.email_suppressed` at 442/577/605 **and**
`applyChannelStatus` writes the channel row from the same event). The unsubscribe rail parted:
`applyChannelUnsubscribe` updated only `studio_contact_channels`. An address that is both a
typed channel and a Patina account could click the D-4 List-Unsubscribe link in an
account-less letter, be recorded `unsubscribed` address-wide, and still be mailed by the next
campaign — contradicting the rule written four lines above the call ("one mailbox is one
person saying stop").

### What changed

- After the channel write, `applyChannelUnsubscribe` sets
  `email_suppressed = true, email_suppressed_at = now()` on any `profiles` row whose `email`
  equals the channel's value — mirroring exactly what `resend-webhook` already does for a hard
  bounce. The gap closes inside the rail W4 owns; `campaign-dispatch` is untouched.
- The match is `eq`, not `ilike`: 00593 normalises an email channel's `value` to
  `lower(btrim(...))` on write, and `ilike` would read `_` and `%` in an ordinary address as
  wildcards and suppress mailboxes nobody clicked from. A mixed-case profile email is therefore
  missed rather than a stranger's suppressed. Said in the file.
- A failure on the profile write returns `status: 'error'` rather than being swallowed: the
  channel write is idempotent, the one-click endpoint answers 500, and a retry finishes the
  stop. Reporting "applied" while one rail can still send would be the same silence in a new
  place.
- Tests: the fake client grows a `profiles` branch that records the write **by column**, the
  "touches notification_preferences for nobody" test now expects the third table by name, and
  two new cases cover the suppression (value, columns, timestamp) and the error path (the
  channel row still ends `unsubscribed`). 15 → 17 tests in that file.

---

## MAJOR-3 — the spec's own front door was unbuilt and recorded nowhere

**Files:** `artifacts/people-room-crm-2026-09-11/build/w4-paperwork-report.md` §7,
`…/w4-data-edge-report.md` §9, `…/build-sheet.md` (Owed / Blocked).

### What was wrong

`upload-door-spec.md` §1 puts the door's primary entrance on the firm's field link
(`apps/client-portal/src/app/field/[token]`) and §9 acceptance 1 reads "A firm's paperwork
contact, and only the paperwork contact, sees the Paperwork section on their field link." It
does not exist: `grep -rn "paperwork\|Paperwork" apps/client-portal/src/app/field/` returns
zero hits across all eleven files of that route, `resolve_field_link` is re-headed by none of
00635–00638, and `is_paperwork_contact` appears only in 00592 and 00629, neither surfacing it
to the field link. The door is still reachable — a studio member mints on the company card
(`paperwork-link-act.tsx`) and sends it by hand — so what is missing is the studio-member-free
arrival path. What made it major is that nothing recorded it: it was in no wave plan, no
report's "Owed, and not done", and no ruling, across eleven review rounds.

### What changed

The review's second option, taken deliberately: **recorded, not built.** Building a new gated
section on `/field/[token]` is portal scope W4 does not own, and the finding's own fix text
allows either. Three places now carry it, each naming W6 as the owner and stating that
acceptance 1 is deferred:

- `w4-paperwork-report.md` §7 — a bullet at the head of the owed list, with the grep evidence.
- `w4-data-edge-report.md` §9 — the same, beside the `/paperwork/[token]` page entry.
- `build-sheet.md` "Owed / Blocked" — the durable wave record the W6 brief is drawn from,
  naming what to build (a Paperwork section gated on the seat's `is_paperwork_contact`,
  deep-linking to a token the RPC mints or resolves) or, failing that, to bring the deferral to
  Kody as a ruling.

The staged W6 brief itself lives outside this worktree under
`~/.claude/projects/.../workflows/scripts/` and is not writable from here, which is why the
build sheet carries it.

---

## M-1 — the firm's paperwork rows opened their form by deleting the act that opened it

**File:** `apps/client-portal/src/components/paperwork/paperwork-sheet.tsx`, plus
`…/paperwork/__tests__/paperwork-sheet.test.tsx`.

### What was wrong

Each row's "Add {paper}" was the collapsed half of a ternary (`:141-164`): pressing it
unmounted the focused `<Button>`, so focus fell to `document.body` and a keyboard or
screen-reader user was returned to the top of the page. It carried no `aria-expanded` and no
`aria-controls`, and nothing was announced — the sheet's one polite region (`:80-82`) is
written only by `markReceived`, the CLOSE transition. The rows that present the act are
exactly the rows that matter: `buildPaperworkRows` opens by default only refused rows and
expected types with nothing on file (`paperwork-model.ts:350,371`), so a lapsed COI always
presents the button and always lost focus. This is the class ruled MAJOR twice in this wave
and fixed on both designer-side surfaces (`roster/seat-window-band.tsx:151-162`,
`threshold/letterbox.tsx:334-345`).

### What changed

The shape those two files state as the room's rule (SPEC §7 #5 / `roster-row.tsx:14`):

- The `<Button>` is **always mounted**, before the panel, carrying `aria-expanded={isOpen}` and
  `aria-controls={formId}`. It is a real disclosure now: pressing it again closes what it
  opened.
- The panel is an always-present `<div id={formId} hidden={!isOpen}>` — so the IDREF never
  dangles — with the form mounted inside only while open, exactly as `seat-window-band.tsx`
  does it (a closed row still mounts no form, and a re-open starts clean).
- On open, focus moves into the form's first control (a `useEffect` keyed on the row, so the
  move waits for the panel to mount) and one sentence goes into the existing live region:
  `paperworkOpenedSentence(title)` → "The {title} form is open." A close needs no focus move —
  the trigger is still under the firm's finger — and clears the region so a re-open is
  announced again.
- `opened` becomes tri-state (`Record<string, boolean>`): absent means "whatever the row asks
  for", `false` means the firm closed a row that had opened itself. `isOpen` is
  `opened[row.key] ?? (row.openByDefault && !isReceived)`; `markReceived` still deletes the key,
  so a sent row falls back to closed.
- Two tests added: `aria-expanded` flips false → true → false, the panel exists and is `hidden`
  before the press, focus lands **inside** the opened panel (never `document.body`), the live
  region carries the sentence, and a row that opens itself starts `aria-expanded="true"` and
  can be closed without disturbing its siblings.

---

## Gates

Run from the worktree with `pnpm --dir` / `--filter`; never a chained `cd`; no server started
on 3000 or 3002.

```
pnpm --dir <worktree> supabase:reset .............. EXIT=0, "Finished supabase db reset"
                                                    (outside the Bash sandbox — the CLI's
                                                     ~/.supabase/telemetry.json write is EPERM
                                                     inside it, as r10–r12 recorded)

cron.job after the reset ......................... paperwork-link-rate-limit-cleanup 23 * * * *
                                                    qr-auth-rate-limit-cleanup        17 * * * *

psql -v ON_ERROR_STOP=1  (postgresql://postgres:postgres@127.0.0.1:54322/postgres)
  people/w4_channels_touches_paperwork_test.sql .. exit=0  (now 16 blocks; block 16 NOTICE
                                                    printed, "all blocks passed")
  people/w4_invoice_link_freeze_order_test.sql ... exit=0
  people/w1a_identity_channels_consent_test.sql .. exit=0
  people/w1b_compliance_authority_directory_test.sql exit=0
  people/w3_merge_sweep_household_test.sql ....... exit=0
  billing/invoice_links_test.sql ................. exit=0
  billing/invoice_checkout_integrity_test.sql .... exit=0
  storage/project_documents_caller_binding_test.sql exit=0

deno test --allow-all --config supabase/functions/deno.json
  _tests/paperwork-upload.test.ts
  _tests/email-channel-status.test.ts ............ ok | 38 passed | 0 failed
  deno.lock ...................................... absent at the worktree root

python3 scripts/generate-legacy-grants.py ........ EXIT=0, NO git diff on
                                                   seed/00-legacy-grants.sql

@patina/notifications vitest ..................... 7 files, 106 tests, all passed
                                                   (unsubscribe.test.ts 15 → 17)
@patina/notifications type-check ................. EXIT=0
designer-portal type-check ....................... EXIT=0
@patina/supabase type-check ...................... EXIT=0
client-portal  type-check ........................ EXIT=2 — the SINGLE pre-existing
                                                   .next/types/app/page.ts(37,29) TS2344
                                                   that r12 m-12 records; unchanged by this
                                                   round, and no error from any file touched
                                                   here
admin-portal build (shared @patina/notifications
  edit) .......................................... EXIT=0, full route table incl.
                                                   ƒ /preferences/unsubscribe
                                                   (must run outside the Bash sandbox: inside
                                                   it the build stops silently at "Creating an
                                                   optimized production build" and writes no
                                                   BUILD_ID while still exiting 0)
client-portal jest --coverage .................... EXIT=0, 157 suites, 2574 tests, all passed
                                                   All files 77.36 / 73.15 / 77.08 / 79.73
                                                   (floor 70/60/70/70)
                                                   paperwork-sheet.tsx 96.29 / 100 / 100 / 95.83
client-portal jest src/components/paperwork ...... 3 suites, 59 tests, all passed
client-portal jest src/app/paperwork ............. 1 suite, 9 tests, all passed
```

No `db:generate` drift is expected or was taken: 00637's edit adds a cron schedule and
comments; no table, column, argument or return type moved.

## Left standing on purpose

Every minor in `w4-review-r12-data-edge.md` §4 (m-1…m-11, n-1), in `w4-review-r12-code.md`
§1/§5 (m-1…m-29) and in `w4-review-r12-qa.md`. Not in this round's scope.
