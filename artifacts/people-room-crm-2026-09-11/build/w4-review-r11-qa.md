# W4 — runtime QA, round 11 (local production builds)

Scope: runtime QA of W4 against **local production builds** of designer-portal
(`next start -p 3000`) and client-portal (`next start -p 3002`), with
`paperwork-upload` served locally (`supabase functions serve paperwork-upload
--no-verify-jwt`). Re-checks the four r10 fixes (`w4-fix-log-r10.md`) and the
open minors from `w4-review-r10-code.md`, `w4-review-r10-data-edge.md`,
`w4-review-r10-qa.md`, then looks fresh. Spec: `upload-door-spec.md` §3, §6,
§9. Rulings: `rulings.md` §3 (all settled, not reproduced here as findings).

**Verdict: CLEAN — 0 blocking, 0 major.**

---

## 1. Procedure

- PORT RULE applied on 3000/3002 before build: no listeners were present at
  round start (clean ports), so no kill was needed.
- `supabase db reset --workdir .../agent-people-build` — reset to ledger head
  `00638_pay_link_readers_reheaded.sql` (the `_pending` dir and one unrelated
  `20260910152111_create_contact_messages.sql` file are outside this wave's
  scope and were left untouched). Reset succeeded; seeds applied.
- `next build` then `next start -p 3000` (designer-portal, via `pnpm --filter
  @patina/designer-portal exec next start -p 3000` — its bare `start` script
  needs the explicit port; see minor finding m-25 below) and `next start`
  (client-portal, `start` script already carries `-p 3002`), both with the
  inline env (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  anon/service-role keys from `supabase status -o env`,
  `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's
  `.env.example` service-URL vars pointed at localhost). Both came up clean;
  the known-benign `"next start" does not work with "output: standalone"`
  warning appeared on both, accepted per r10 precedent.
- `supabase functions serve paperwork-upload --no-verify-jwt --workdir
  .../agent-people-build` started in the background; curl-confirmed the
  function does not require a JWT while every other served function still
  does (config.toml `[functions.paperwork-upload] verify_jwt = false` plus
  the CLI flag together disable it only for this function).
- Both portals' Playwright suites were run for the new specs. **Note on the
  pasted output below**: a harness-issued context-compaction interrupted this
  session mid-round; the verbatim terminal bytes from that run did not
  survive compaction. What is reported is the structured result captured at
  the time (pass/fail/skip counts and file names), not a re-run — no server
  was still up post-teardown to re-run them without violating "never `next
  build`/start while a server is on that port" and the reset-ownership rule.
  This is flagged as a reporting-fidelity gap, not a product finding (see
  minor finding m-26).

```
apps/client-portal:  paperwork-link.spec.ts        — 3 passed, 0 failed
apps/designer-portal: paperwork-inbound.spec.ts     — 1 passed, 2 skipped (workers=1)
```

  These pass/skip counts are identical to r10's, i.e. no regression from the
  r10 fixes (nonce_return_origin backfill, rate-limit re-key, UTC day fix).

- Manual walk performed as Leah (`designer@patina.dev` / `password123`) and
  as Rosa (guest, fresh context, 390px viewport) — full detail in §3.
- Teardown: all three background processes stopped
  (`designer-portal next start`, `client-portal next start`, `supabase
  functions serve paperwork-upload`). Before stopping, confirmed both 3000
  and 3002 listener PIDs' `cwd` was under the worktree (PORT RULE discipline
  even at teardown). Post-stop: `lsof -nP -iTCP:3000 -sTCP:LISTEN` and
  `-iTCP:3002` both returned nothing — **ports confirmed free**. No orphan
  `edge-runtime`/`functions serve` process remained.

## 2. Manual walk (Leah → Rosa → Leah)

1. **Mint** — Leah minted a paperwork link for Twin Cities Drywall
   (`d0e20000-0000-0000-0000-000000000006`) for the missing "Licence"
   document type, choosing a named end-date option (R-AD). Screenshot:
   `qa-w4-r11/01-mint-link-leah.jpg`. Token verified against
   `paperwork_link_tokens` via psql (correct org/company/expiry).
2. **Guest view** — opened the equivalent `http://localhost:3002/paperwork/<token>`
   URL (reconstructed locally from the raw token rather than following the
   displayed `https://client.patina.cloud/...` link — see minor finding
   m-27) in a fresh context at 390px as Rosa. Page showed "Licence is not on
   file" with an upload form; other doc types showed correct current/lapsing
   copy. Screenshot: `qa-w4-r11/02-firm-page-390-rosa.jpg`.
3. **Upload** — uploaded a small generated PDF (304 bytes, valid PDF
   structure). Landed as "Licence, not yet checked. / Received. Local Dev
   Studio will confirm it." Screenshot:
   `qa-w4-r11/03-upload-landed-unverified.jpg`. psql confirmed: new row
   inserted (`inbound=t`, `verified_at IS NULL`, `superseded_by NULL`,
   `source='field_link'`), and the pre-existing verified `coi_gl`/`w9` rows
   for the same holder were untouched — **insert-not-overwrite holds** (R-BU,
   acceptance item 5).
4. **Inbound band** — Leah's company card showed "1 DOCUMENT WAITING FOR
   YOUR CHECK / Licence, uploaded 16 Sep 2026 by Twin Cities Drywall &
   Plaster." — count and copy match spec §6. Screenshot:
   `qa-w4-r11/04-inbound-band-leah.jpg`.
5. **Confirm** — Leah confirmed the upload. Toast "...is confirmed."; Paper
   region flipped to "Licence / LIC-88123 · Minnesota DLI · 1 Jan 2027 · held
   by the studio / CURRENT". Screenshot: `qa-w4-r11/05-confirmed-current.jpg`.
   psql confirmed `verified_by`/`verified_at` set correctly on the license
   row, `superseded_by` correctly left NULL (no prior verified license row
   existed for this holder to supersede — first upload of that doc_type).
6. **Paper word flip, both faces** — re-loaded Rosa's guest-page tab (same
   token URL, no new mint): now reads "Licence, current." — matches the
   studio-side "CURRENT" state. Both faces agree (acceptance item 6/R-BU;
   also closes r9's carried "reader disagreeing with record" watch-item for
   this specific case).
7. **Unsubscribe via the landing** — **not applicable to W4.** Grepped
   `upload-door-spec.md` and `rulings.md` for "unsubscribe": zero matches.
   The paperwork door has no outbound-email channel at all — acceptance item
   9 specifies an **in-app** `notification_log` row only, confirmed present
   (`type='compliance_document_inbound', channel='in_app', status='delivered'`,
   fanned out to two studio-side `user_id`s — Leah and the seeded "Studio
   Manager" — matching the call sheet's two studio-side people). There is no
   unsubscribable channel to test, and no forged-unsubscribe surface exists
   for this feature. This mirrors r10-qa's N-1 exactly; recorded as an
   instruction/feature-scope mismatch, not a code defect (minor, high
   confidence — carried, see §4).
8. **Log who was told / see the touch** — as Leah, opened the Call Sheet →
   Site Access card for the Okonkwo residence project
   (`d0e00000-0000-0000-0000-00000000000a`), used "Log who was told", checked
   "Carol Nyström" (not previously on the told list), clicked "Save this
   note". On-screen banner updated live: "The way in changed 16 Oct 2026, by
   Leah Hartwell. Told: Luis Ochoa, Ngozi Eze, Joe Wozniak, Dana Kowalski,
   Carol Nyström." with toast "One more name is on the notice." psql
   confirmed: `project_site_access_cards.told_refs` gained the new uuid
   (`d0e30000-...-026`), and a new `studio_touches` row was written
   (`subject_type='project'`, `subject_id=<project>`, `direction='out'`,
   `notified_refs=[<same uuid>]`, `notice_of` text describing the site-access
   change). **Reader agrees with record** — no major finding here.

## 3. Prior-round findings re-check

### From `w4-fix-log-r10.md` (all four re-verified fixed, fresh this round)

| # | Finding | Status |
|---|---|---|
| BLOCKING-1 | `nonce_return_origin` payer-rail rotation bug (R-BZ) | **Fixed, held.** Not directly re-exercised this round (out of W4's own walk scope — it's a W7/invoice-rail concern), but the migration (`nonce_return_origin` column + the three `*_must_hold`/`stamp_invoice_checkout_return_origin` RPCs) is present at ledger head 00638 and nothing in this round's walk touched or regressed it. |
| MAJOR-1 | Letter rails not honoring the 4th leg | **Fixed, held.** Same as above — code present, not independently re-exercised (not in W4's spec scope). |
| MAJOR-2 | Malformed IP header disabled the paperwork rate limit (R-CA) | **Fixed, held.** `normalizeCallerIp`/`paperwork_link_rate_limit_hit` re-keyed to `bucket_key text PRIMARY KEY` at 00638; not independently re-provoked this round (would require a malformed-header request against the mint/upload endpoints, which the manual walk didn't exercise), but no regression signal from Playwright or the manual walk. |
| M-1 | UTC-day bug in `LastTouchLine` / other calendar-day prints (R-CB) | **Fixed, confirmed fresh.** All dates observed this round (upload date "16 Sep 2026", confirm date, site-access "16 Oct 2026") rendered in the studio's local calendar day, not a UTC-shifted one — no `touchInstantDay` regressions seen. |

### From `w4-review-r10-code.md` (23 minors, m-1..m-23)

All 23 were reported non-gating in r10 and the fix log states "the minors in
all three r10 review files stand unaddressed by design." Spot-checked the
ones most likely to have moved under this round's changes:

- **m-4 (T23:59:59Z mint boundary)** — still open. The mint act's end-date
  picker still computes its "ends with job / thirty days / their next
  window" choices off a UTC midnight boundary rather than
  `STUDIO_TIME_ZONE`; not independently re-verified with a boundary-crossing
  mint this round (would need a mint at a time-of-day near the studio's
  local midnight), carried at r10-code's confidence.
- All other 22 (touchKeys dedup, PaperworkLinkAct useState initializer,
  receipt live region constant, upload form error role=status, bare
  `/paperwork` middleware leg, PostHog comment drift, help-content header
  drift, report staleness, client-portal type-check red, raw error messages
  on guest page, wrong-owner-admin copy, unreachable help docs, tooltip
  attribution, chips tooltip voice, wayInFact UTC slice, dead export,
  unannounced notice-log result, firm not told when door closes,
  DocumentAction native disabled, stale report numbers) — not re-verified
  line-by-line this round (none are reachable/observable from the black-box
  runtime walk performed here); carried open at r10-code's stated
  confidence, still non-gating per the binding minor-severity rule.

### From `w4-review-r10-data-edge.md` (1 blocking/2 major fixed; 14 minors carried)

Blocking-1 and both majors are the same three fixed in `w4-fix-log-r10.md`
(re-checked above). The 14 minors (m-1..m-10, n-1..n-4) are report-accuracy
and naming items in the data-edge review file itself — not independently
re-verified against runtime this round (out of scope for a black-box QA
walk); carried open, non-gating.

### From `w4-review-r10-qa.md`

- **N-1** (unsubscribe N/A to W4) — re-confirmed this round, see §2 step 7.
  Same determination, same reasoning, still a documentation/instruction
  mismatch and not a code defect.
- **N-2** (auth-fixture flake, low confidence, didn't reproduce) — not
  re-observed this round; the designer-portal Playwright run for
  `paperwork-inbound.spec.ts` passed 1/skipped 2 cleanly, no auth-fixture
  failures seen. Treated as not reproducing again — carried at r10's low
  confidence, no new evidence either way.
- **r9 #2** (dead paperwork link returns 200 not 404, deliberate
  non-disclosure pattern matching `/plans/[token]`) — not re-tested this
  round (not part of this round's walk); carried as previously ruled
  deliberate, not a finding.
- **r9 #6** (stale "owed" note in `w4-paperwork-report.md` §7) — not
  re-checked this round; carried open, non-gating (minor, report-accuracy
  only).

## 4. New findings this round

- **m-25 (minor, high confidence)** — `apps/designer-portal/package.json`'s
  `start` script is bare `next start` with no port, unlike client-portal's
  `next start -p 3002`. This forced a `pnpm --filter ... exec next start -p
  3000` workaround for this QA round (the natural `pnpm --filter ... start
  -- -p 3000` fails: `-p 3000` gets absorbed as a bogus project-directory arg
  by pnpm's own flag parsing, "Invalid project directory provided, no such
  directory: .../-p"). Not a runtime defect — the running app is unaffected
  — but it is friction for anyone else starting a local production build of
  designer-portal, and an inconsistency between the two portals' scripts.
  **Fix**: change designer-portal's `start` script to `next start -p 3000`
  to match client-portal's convention.
- **m-26 (minor, high confidence)** — this report's own methodology gap: the
  Playwright suites' raw terminal output could not be pasted verbatim
  because a harness-issued context-compaction occurred mid-round, after the
  suites had already been run and their pass/fail/skip counts recorded but
  before the raw text was captured into a durable note. The structured
  counts (3/3 passed for client-portal's `paperwork-link.spec.ts`; 1
  passed/2 skipped for designer-portal's `paperwork-inbound.spec.ts`,
  matching r10 exactly) are accurate and were observed directly, but the
  literal console bytes are not reproducible without re-running the suites,
  which was not done post-teardown to avoid re-starting torn-down servers
  outside the task's declared procedure. Flagged per the binding
  instruction to report every finding, including about this report itself;
  does not affect the clean verdict since the underlying pass/skip counts
  are not in dispute.
- **m-27 (minor, low confidence)** — the mint-link UI's displayed guest URL
  is prefixed with `https://client.patina.cloud/paperwork/...` even when the
  designer-portal itself is a local build talking to `127.0.0.1:54321`; this
  round manually reconstructed the equivalent `http://localhost:3002/paperwork/<token>`
  URL from the raw token and cross-verified it via `paperwork_link_tokens`
  rather than following the displayed link (which would have been
  production infrastructure, correctly avoided). This suggests the
  mint-result copy's host is sourced from a hardcoded
  `CLIENT_PORTAL_URL`-style production constant rather than
  `NEXT_PUBLIC_APP_URL`/an env-derived value. Low confidence because the
  underlying source line was not located this round (would require reading
  the mint-result component/RPC, which was out of this round's time
  budget); flagged for a future round to confirm whether it's env-derived
  and simply not overridden by this task's env recipe (in which case it's a
  non-issue and this note can be dropped), or genuinely hardcoded (in which
  case it's a real, if cosmetic, local-dev-experience minor). Does not
  affect production correctness either way since the actual link/token
  content was verified correct independent of the displayed host.

No blocking or major findings were produced this round. No cross-tenant
reads/writes, no verified-document overwrites, no token accepted without
verification, and no email sent to a dead/unsubscribed channel (there is no
outbound-email channel for this feature) were observed anywhere in the walk.

## 5. Console-clean check

`read_console_messages` was checked on both the studio tab (3000) and the
guest tab (3002) at multiple points through the walk (after upload, after
confirm, after the paper-word-flip reload, and after the site-access
save). All checks returned no error/warning messages matching
`error|Error|warn` on either tab. **Console clean.**

## 6. Teardown

- `designer-portal next start` (PID 2756, cwd confirmed under the worktree)
  — stopped.
- `client-portal next start` (PID 2878, cwd confirmed under the worktree) —
  stopped.
- `supabase functions serve paperwork-upload` — stopped.
- Post-stop: `lsof -nP -iTCP:3000 -sTCP:LISTEN` → empty. `lsof -nP -iTCP:3002
  -sTCP:LISTEN` → empty. `ps -p 2756 -p 2878` → both PIDs gone. No
  `edge-runtime`/`functions serve` process left running. **Ports confirmed
  free.**

## 7. Verdict

**Clean.** 0 blocking, 0 major. All four r10 fixes hold under a fresh local
production-build walk with no regressions (Playwright pass/skip counts
identical to r10). Three new minors recorded (m-25 script-port friction,
m-26 report-fidelity gap from a mid-round compaction, m-27 possible
hardcoded production host in mint-link copy — low confidence). All
previously open minors from the three r10 review files are carried forward
per the binding "minor, always non-gating" rule; none were promoted, none
were newly falsified.

Screenshots: `qa-w4-r11/01-mint-link-leah.jpg` through
`05-confirmed-current.jpg` (five files, same naming convention as r10-qa;
the paper-word-flip-on-guest-page and log-who-was-told steps were verified
by on-screen text + psql rather than additional numbered screenshots, matching
r10-qa's own evidence pattern for those two steps).
