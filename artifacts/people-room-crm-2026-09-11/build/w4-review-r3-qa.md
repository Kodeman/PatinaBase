# W4 (P3) — round-3 runtime QA, against LOCAL PRODUCTION BUILDS

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets set, no migration minted.
Ports 3000 (designer) / 3002 (client) were free at start (PORT RULE: no listener on
either — nothing to kill). Local DB reset via `pnpm supabase:reset` before any build.

Env for both `next build` and `next start`: inline `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from `supabase status -o env`
(not printed anywhere in this report or its logs), `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
`NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's own service-URL vars
pointed at localhost. No `.env.local` created anywhere.

Prior fix log re-checked: `w4-fix-log-r2.md` (11 findings, all claimed fixed). Rulings.md §3
treated as settled throughout — no finding below revisits a ruling.

---

## 1. Builds and boot (both green, one rebuild owed mid-round — see MINOR-3)

| Step | Result |
|---|---|
| `pnpm supabase:reset` | Clean — all migrations through `00638_pay_link_readers_reheaded.sql` + `20260910152111_create_contact_messages.sql` applied, all seeds incl. `people_crm_dev.sql` loaded |
| `pnpm --dir apps/designer-portal build` (inline env) | **green**, exit 0, full route table, `/preferences/unsubscribe`, `/api/unsubscribe` present |
| `pnpm --dir apps/client-portal build` (inline env) | **green**, exit 0, `/paperwork/[token]` present. Rebuilt a second time mid-round — see MINOR-3 |
| `next start` designer :3000, client :3002 | both `Ready`, both serve 200 on their home routes |
| `supabase functions serve paperwork-upload --no-verify-jwt --workdir <worktree>` | serving; `OPTIONS` → 204, a bodyless `POST` → 400 `{"error":"no file provided"}` (function alive and validating) |

---

## 2. Playwright — the wave's own specs

| Suite | Command | Result |
|---|---|---|
| Client, first run (pre-drift build) | `playwright test --project=chromium tests/paperwork-link.spec.ts tests/threshold.spec.ts --workers=1` | **25 passed** (41.0s) |
| Client, re-run after the mid-round rebuild (MINOR-3) | `playwright test --project=chromium tests/paperwork-link.spec.ts --workers=1` | **3 passed** (4.0s) — confirms the rebuild fixed it and did not regress anything |
| Designer, focused | `playwright test --project=chromium e2e/people/paperwork-inbound.spec.ts e2e/people/company-card.spec.ts --workers=1` | **1 failed / 2 passed** first pass — the failure was cross-portal DB pollution (see MINOR-1), not a code defect. **2/2 passed** after archiving the pollutant fixtures, no code change |
| Designer, full `e2e/people` | `playwright test --project=chromium e2e/people --workers=1` | **9 failed / 14 passed** — every failure is in `add-client-letter`, `add-sheet` (×2), `bring-forward`, `call-sheet`, `person-card` (×2), the **identical signature already documented as pre-existing, unowned-by-W4 shared-DB drift** in `w4-fix-log-r2.md`'s own close-out section. `paperwork-inbound.spec.ts` and both `company-card.spec.ts` tests passed inside this same full run. Re-confirmed, not re-litigated: see MINOR-2 |

---

## 3. The live walk, as Leah and as Rosa

All screenshots in `build/qa-w4-r3/`. Company: Twin Cities Drywall & Plaster
(`d0e20000-…-0006`), paperwork contact Rosa Delgado.

1. **Signed in as Leah** (`designer@patina.dev`), opened the company card
   (`/people?firm=d0e20000-…-0006`).
2. **Mint a paperwork link.** Band offered "Ends with the job — 8 February 2027" /
   "Thirty days — 15 October 2026" / "Their next window — a day I name", matching the
   seat's `on_site_to = 2027-02-08` (R-AD). Pressed "Open the door".
   → address `http://localhost:3002/paperwork/dc7236…00b0b` shown once, with
   "…can send their paper here until **9 February 2027**." — **see MAJOR-1, a one-day
   disagreement between this sentence and the option just chosen.**
3. **Opened the address in a second tab as Rosa** (no session, guest bearer route),
   at the automation's narrow viewport (~406–660px CSS — see the Environment note
   below on why not exactly 390px). Page showed "Paperwork for Local Dev Studio",
   rows worst-first: **Licence — not on file** (form open by default), **COI, general
   liability, current.**, **W-9, current.** — exact spec §3 copy and ordering.
4. **Uploaded a small generated PDF** (438 bytes) to the Licence row with number,
   issuer, issued/expires dates. First attempt failed — see **MINOR-3** (environmental,
   not a code defect; root-caused and resolved within this session). Second attempt,
   against a freshly rebuilt+restarted server: **"Received. Local Dev Studio will
   confirm it."** DB confirms `studio_compliance_documents` row: `doc_type=license,
   source=field_link, inbound=true, verified_at=NULL, rejected_at=NULL,
   superseded_by=NULL`, storage key
   `{org}/{company}/{doc_id}/w9-test.pdf` (438 bytes, real content) in the
   `compliance-documents` bucket (private, 15MB cap, `{pdf,jpeg,png}` allowlist — spec §4
   exactly).
5. **Back as Leah:** the Paper region showed the inbound queue band — **"1 document
   waiting for your check"**, "Licence, uploaded 15 Sep 2026 by Twin Cities Drywall &
   Plaster.", Confirm/Reject. Pressed Confirm → two-step inline ("Confirming makes this
   the paper the studio holds. The certificate it replaces is retired, kept, and
   readable." / "Confirm the document" / "Not yet") → **"Licence, uploaded 15 Sep 2026 by
   Twin Cities Drywall & Plaster is confirmed."** The Paper region now reads **"Licence ·
   MN-LIC-88221 · State of Minnesota · 15 Jan 2027 · held by the studio · CURRENT"** — the
   paper word flipped live, band gone. DB: `verified_at` set, `verified_by` set,
   `superseded_by` correctly NULL (there was no prior verified licence to retire).
6. **Unsubscribe via the landing, confirm the next send is refused.** Minted a signed
   channel-unsubscribe token for `office@twin-cities-drywall-plaster.com`
   (`channel:<studio_contact_channels.id>`, same HS256/`SUPABASE_SERVICE_ROLE_KEY` secret
   the real `_shared/send-email.ts` and `@patina/notifications` both fall back to
   locally) and opened `/preferences/unsubscribe?token=…` on the designer portal. Landing
   read **"You've been unsubscribed" / "We've turned off marketing emails to your
   address."** DB: the channel's `status` flipped to `unsubscribed`. Then, importing the
   **real, unmodified** `resolveContactChannel` / `prepareCompliantEmail` from
   `supabase/functions/_shared/send-email.ts` against the live local DB:
   ```
   {"addr":"office@twin-cities-drywall-plaster.com","channelStatus":"unsubscribed","prepared":"suppressed","reason":"channel_unsubscribed"}
   {"addr":"rosa@twin-cities-drywall-plaster.com","channelStatus":"active","prepared":"ready"}
   ```
   The next send to the unsubscribed address is refused; an untouched address on the
   same firm remains ready. **W4R2-1's fix (the suppression gate) is confirmed live and
   working**, and the fix's own claim (address-wide verdict, `studioRow`/subject
   unaffected) is directly demonstrated.
7. **Log who was told, see the touch.** Opened the Okonkwo residence Call Sheet →
   Site access → "Log who was told", ticked four names (Chidi Okonkwo, Sam Rowe, Frank
   Bauer, Rosa Delgado), Save. The card's summary line updated live to include all four
   new names appended to the existing list (R-U's line, `told_refs` grown from 5 to 9
   entries). DB confirms **two** new `studio_touches` rows were written across my two
   save actions (`subject_type='project'`, `direction='out'`,
   `notice_of='The way in changed 16 Oct 2026. Lockbox, version 3.'`), each carrying only
   the *newly*-notified `notified_refs` for that save — not a re-notification of names
   already on the record. This is CRM-23's `record_notice` working correctly.
8. **Revoke.** Clicked Revoke on the Access grants row → two-step inline ("Say why the
   door closes. Optional, kept with the record." / "Close this door") → **"Paperwork link
   closed."**, Access grants now reads "No grant on file." Re-loading the same token URL
   immediately → **"This link isn't available. The paperwork link may have been turned
   off or has expired. The studio that sent it can open a new one."** — no firm name, no
   studio name, indistinguishable from a token that never existed (spec §9 item 4).
9. **Console clean** on both tabs at every checkpoint I read it (no errors, no warnings
   beyond the pre-existing `next start`/`output: standalone` boot warning, which is a
   local-only artifact of using `next start` on a standalone-configured build — the same
   thing the wave's own reports already run this way, not new).
10. Stopped both `next start` processes and the `functions serve` process; confirmed
    3000 and 3002 free; confirmed no `deno.lock` at the repo root; confirmed no
    orphaned edge-runtime docker container.

**Environment note on "at 390".** `resize_window` calls against this session's Chrome
automation had no measurable effect on either tab in either direction (1440×960 and
390×844 were both requested; screenshots kept returning each tab's own pre-existing
size). The Rosa tab's actual size when created fresh and resized *before* its first
navigation was ~406–660px CSS width depending on how the tab was opened — narrow enough
to exercise the same single-column mobile layout the spec's 390px file targets, but not
exactly 390. Not a product finding; recorded so the width figure in this report isn't
mistaken for an exact repro of the design file's breakpoint.

---

## 4. Findings

### MAJOR-1 — the mint band's own before/after sentences disagree on the door's closing date, by one day

**Confidence: high** (directly reproduced twice against a clean DB and a clean build;
confirmed against the raw `paperwork_link_tokens.expires_at` value).

**The defect.** Minting "Ends with the job" against a seat whose `on_site_to =
2027-02-08` presents the choice, before the press, as **"Ends with the job — 8 February
2027"** and (after selection) **"The door can end with this firm's work here, 8 February
2027."** — both name the 8th. The instant after the press, for that exact same choice:

- the mint confirmation reads *"This address is shown once. Twin Cities Drywall &
  Plaster can send their paper here until **9 February 2027**."*
- the company card's own Access grants row reads *"Ends **9 February 2027**."*

Both post-mint sentences read one calendar day later than the sentence that offered the
choice, for the identical firm, the identical seat, the identical press.

**Root cause (read, not guessed).** `paperwork_link_tokens.expires_at` is stored as
`2027-02-09 00:00:00+00` — the exclusive UTC boundary one day past the intended closing
date (matching the "keep it usable through the end of the named day" convention `w4-fix-
log-r2.md`'s MAJOR-2 fix describes for a *different* comparison, the RPC's own
`> now()` predicate). That storage convention is reasonable. What is not reasonable is
that the **display layer takes `expires_at`'s date component and prints it directly** on
the two post-mint surfaces, while the pre-mint radio/sentence derives its date from the
seat's own `on_site_to` — two different sources of truth for what should be one sentence
repeated twice.

**Failure scenario.** A studio member reads "Ends 8 February 2027" on the mint band,
presses Open the door, and is immediately told (twice, on two different UI regions) that
it ends the 9th. Whichever sentence she trusts, the other one is now wrong in her head —
and if she later reads only the Access grants row (the durable, always-visible one), she
will believe the door is open one calendar day longer than the seat's own engagement
window says it is.

**Fix.** Either (a) format the post-mint sentences from `expires_at - 1 day` when the
chosen option was "ends with the job" / any whole-day option, or (b) keep the door's own
source-of-truth date (the day the studio actually chose, before it was turned into an
exclusive timestamp) in the mint's own return payload and print that, never re-deriving
a date from the stored `expires_at` for a face meant for a human. Same care applies to
the "Thirty days" and "Their next window" options if they hit the same date math (not
independently reproduced here, but the same code path is a fair bet).

---

### MINOR-1 — cross-portal test fixtures leak into the shared local DB and break designer's `company-card.spec.ts` when client's `paperwork-link.spec.ts` has just run

**Confidence: high** (directly reproduced and root-caused this round, on a freshly
reset DB — not assumed from the prior round's note).

Running the client suite first (as the QA procedure's own ordering has it) leaves three
un-archived `studio_contacts` company rows named `Paperwork E2E <uuid>`
(`apps/client-portal/tests/paperwork-link.spec.ts:97`, one per test, by design — the
suite's own comment explains why it can't share a firm). When designer's
`company-card.spec.ts` then runs its own `firstFirm()` (an unordered `limit(20)` read), it
can pick one of these leftover firms; its heading ("Paperwork E2E …", an `h2`) then
collides in a `getByRole('heading', { name: 'Paper' })` non-exact match against the
card's own "Paper" `h3`, and the spec fails on a strict-mode violation. Archiving the
three rows (`studio_contacts.archived_at = now()`) made the spec pass twice, no code
touched.

This is the *exact* mechanism `w4-fix-log-r2.md` named and left owned to "W7 /
local-dev seed" — this round reproduces it fresh (not carried-over drift) and confirms
the fix log's read of the cause was correct. Not re-opening it as a new finding to fix;
recording that it is still open, still reproducible on demand, and now confirmed to
happen on a *clean* reset rather than only after many QA rounds' accumulated debris —
meaning any QA order that runs client e2e before designer's `company-card.spec.ts` in
the same DB will hit this every time, not just eventually.

### MINOR-2 — the standing-red `e2e/people` suite is unchanged (9 failed / 14 passed), and none of the nine touch W4's surfaces

Re-run in full this round: same 9 failing tests, same files
(`add-client-letter.spec.ts` ×2, `add-sheet.spec.ts` ×3, `bring-forward.spec.ts`,
`call-sheet.spec.ts`, `person-card.spec.ts` ×2) as `w4-fix-log-r2.md`'s own baseline.
`paperwork-inbound.spec.ts` and both `company-card.spec.ts` tests pass inside this same
full-suite run. Recorded per instruction to re-check every prior finding as fixed or
open — this one is open, unowned by W4, and not this round's to fix.

### MINOR-3 — client-portal's `.next` was overwritten in place, out from under its own running `next start`, mid-round (environmental, self-resolved, root cause not identified)

**Confidence: high on the observation and the fix; medium on "who/what" caused it** (I
could not identify the responsible process from this session's own command history).

**What was observed.** After building and starting client-portal at 17:41, and running
its Playwright suite successfully (25 passed) shortly after, a later manual walk (the
Rosa upload) failed silently: pressing "Send Licence" performed a **native browser GET
form submission** — the compliance number, issuer name, and both dates were serialized
into the page's own URL query string, no request reached `paperwork-upload`, and no row
was written. Reading `paperwork-upload-form.tsx` shows `event.preventDefault()` as the
unconditional first line of the submit handler, so a native submission can only happen
if the handler never attached at all — i.e. a hydration failure, not a validation-order
bug in the component. Network capture showed why: `common-9a6f02fad859c123.js` (a
shared webpack chunk the server-rendered HTML referenced) answered `500`, because the
**only** file actually present on disk was `common-8e46aff26938a28e.js` — a different
content hash. `.next/BUILD_ID` and every chunk under `.next/static/chunks` had an mtime
of **17:54**, thirteen minutes *after* the `next start` process (still running, same
pid, never restarted) had booted at 17:41 and loaded the *original* manifest into
memory. Something rebuilt `apps/client-portal` in place while the server serving it kept
running, producing a client that could never hydrate past that chunk.

**What it was not.** Not a `paperwork-upload-form.tsx` bug (source read, above). Not
caused by this session's own Playwright run (`playwright.config.ts`'s `webServer` uses
`reuseExistingServer: true` against an already-up port and never runs `next build`). Not
a designer-portal problem — its own `BUILD_ID` mtime (17:40:32) stayed older than its
server's start time throughout the whole session, checked both before and after this
incident. No `next build` / `turbo` process was found running at the time I
investigated, so whatever did this had already exited.

**Resolution and re-verification.** Killed the stale `next start`, ran
`pnpm --dir apps/client-portal build` again (clean, green), started `next start`
immediately after, confirmed the chunk hash referenced by the HTML now 200s, and
re-ran both the manual upload (succeeded, DB row landed) and
`playwright test tests/paperwork-link.spec.ts` (3 passed) against the rebuilt server.
Nothing here implicates the wave's code.

**Why it's worth a line rather than silence.** This worktree is explicitly shared
ground this round ("Ports 3000 and 3002 are reserved for this program by agreement with
the other session, which uses 3100/3102") — the binding instructions anticipate and
handle a *port* collision with that other session, but a build-artifact collision on a
port that's supposedly exclusively this program's is a different and unhandled failure
shape. Recording it as a `patina-parallel-work` / shared-worktree risk for whoever owns
that skill's upkeep, not as a code defect and not as a blocker on this report's own
"clean" verdict.

### MINOR-4 — a raw enum value renders unhumanized on the company card's crew line

**Confidence: high**, directly observed, likely pre-existing (not part of this wave's
named diff).

The company card's "Crew & designations" region prints **"Rosa Delgado · office_manager
· paperwork contact · site contact"** — `office_manager` is the raw
`role_at_firm` column value, not sentence-cased ("Office manager") the way every other
word on this card is. Low confidence this is in W4's own scope (the field predates this
wave), reported per instruction to report every finding regardless of severity filter.

---

## 5. Prior round (`w4-fix-log-r2.md`) findings — status this round

| # | Claim | This round |
|---|---|---|
| W4R2-1 (suppression gate, BLOCKING) | Fixed | **Confirmed live** — §3.6 above, direct import of the real function against the real DB |
| BLOCKING-1 (PostHog bearer in URL) | Fixed | Not independently re-verified live (no PostHog key configured locally, so nothing actually calls `posthog.capture` to inspect) — code path already reviewed in the fix log; not re-read this round |
| R2-MAJOR-1/MAJOR-1 (raw refusal tokens) | Fixed | Not independently re-triggered (would need to force a `compliance_confirm_*` refusal path); relying on the fix log's own unit-test evidence |
| R2-MAJOR-2/MAJOR-3 (B-2 bounce write-back) | Fixed | Not independently re-triggered this round (requires a Resend webhook replay); relying on the fix log's own deno-test evidence |
| W4R2-2 (paperwork_link missing from Access grants) | Fixed | **Confirmed live** — §3.2/§3.8 above, the grant appears and disappears correctly |
| MAJOR-2 (mint offered a lapsed window) | Fixed | **Confirmed for the tested case** (a live, future engagement window is offered correctly) — but see the **new** MAJOR-1 above, a different, date-rendering defect in the same area |
| R2-MAJOR-2/MAJOR-3 (letterbox pay act) | Fixed | Covered by the client `threshold.spec.ts` run (25 passed, including the settle-balance journey); not independently re-walked manually this round |
| MAJOR-4 (dead paperwork link → 404) | Fixed | **Confirmed live** — §3.8 above, revoked token reads the calm dead sheet, no party named |
| MAJOR-5 (upload a11y / focus) | Fixed | Covered by `paperwork-link.spec.ts`'s own a11y assertions (green); not independently re-walked with a screen reader this round |

---

## 6. Gate

- **Blocking findings: 0**
- **Major findings: 1** (MAJOR-1, the mint-date display disagreement)
- **Minor findings: 4** (MINOR-1..4, none holding the gate per instruction)

**clean = false** (one MAJOR).

Data mutated by this walk, for the next session's awareness: Twin Cities Drywall &
Plaster now holds one confirmed `license` compliance document
(`MN-LIC-88221`, current); its paperwork link was minted and then revoked (no live
grant remains); `office@twin-cities-drywall-plaster.com` is now `unsubscribed`;
the Okonkwo residence site access card's `told_refs` grew from 5 to 9 names (two new
`studio_touches` rows). Three stray `Paperwork E2E *` company rows created by the
client Playwright run were archived by this QA pass (see MINOR-1).
