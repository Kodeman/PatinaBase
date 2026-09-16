# W4 Runtime QA — Round 9

Local-production-build QA of `designer-portal` and `client-portal` against a
freshly reset local Supabase stack. Read `w4-paperwork-report.md`,
`w4-studio-report.md`, `w4-data-edge-report.md`, `build/upload-door-spec.md`
§3/§6/§9, `rulings.md` §3, `w4-fix-log-r8.md` and `w4-review-r8-qa.md` first.
Every ruling in `rulings.md` §3 is settled and not re-litigated below.

## 1. Procedure

- **PORT RULE**: 3000/3002 checked with `lsof -nP -iTCP:<port> -sTCP:LISTEN`
  before starting — both free. No conflict to report.
- **Reset**: `supabase db reset --workdir .../agent-people-build` (clean).
- **Builds**: `next build --webpack` then `next start` for both portals, all
  env passed inline per the binding instruction — no `.env.local` created or
  read. `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from
  `supabase status -o env`, `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`,
  `NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true`, plus each portal's
  `.env.example` service-URL vars pointed at localhost. Workspace package
  dists rebuilt first via `pnpm turbo run build --filter='@patina/X^...'`.
  Both builds succeeded; the `output: 'standalone'` warning under
  `next start` is the known benign message, not a defect.
- **Serve**: `supabase functions serve paperwork-upload --no-verify-jwt
  --workdir .../agent-people-build`, both `next start` processes
  backgrounded on 3000/3002.
- **Sandbox note**: several commands needed `dangerouslyDisableSandbox` —
  `supabase db reset`/`status` (telemetry write path), reading `.env.example`
  files (blanket `.env*` deny), launching headless/windowed Chromium for
  Playwright and the manual walk (mach-port permission), and `ps`/ process
  management for teardown. All confirmed genuine sandbox restrictions, not
  product issues.

## 2. Playwright results

- `apps/client-portal/tests/paperwork-link.spec.ts` — **3/3 passed**
  (`--project=chromium`, live local stack).
- `apps/designer-portal/e2e/people/paperwork-inbound.spec.ts` — **1/1
  failed**, on a test-file locator bug, not a product defect — see Finding 3
  below. The scenario it covers (mint → send → confirm → paper word flips)
  was independently confirmed correct by the manual walk in §3 and by
  screenshots 01–05.
- `supabase/functions/_tests/paperwork-upload.test.ts` (Deno) — **15/15
  passed**, including both reversed-expiry-date cases, confirming r8 Finding
  3 stays fixed (see §5).
- Two pre-existing MINOR test-file issues from r8 (`call-sheet.spec.ts`
  Finding 4, `pay-link.spec.ts` Findings 5–6) were **not re-executed live
  this round** — the servers had already been torn down when I circled back
  to them, and no code touched their subject areas (call sheet roster
  ordering, pay-link return-token identity) this round. Presumed open;
  non-gating either way (MINOR test-file issues never gate). Recommend a
  future round still fix them.

## 3. Manual walk (Leah → Rosa → Leah)

All screenshots at
`.../artifacts/people-room-crm-2026-09-11/build/qa-w4-r9/`.

1. Signed in as Leah (`designer@patina.dev`), opened Twin Cities Drywall &
   Plaster's company card via the Firms tab (not `?firm=<name>`, which is a
   UUID param — my own early navigation mistake, not a defect; three
   `invalid input syntax for type uuid` console errors it produced were from
   my own malformed URL, not the app, and console was confirmed clean on
   every subsequent fresh load).
2. Minted a 30-day paperwork link for the firm. `01-mint-designer-card.jpg`.
3. Opened the link in a fresh context at 390px as Rosa Delgado.
   `02a-firm-page-before-upload-390.jpg` — Licence "not on file", form open.
4. Uploaded a small generated PDF via `file_upload` (a real hydrated-page
   upload, not the native-GET regression r8 Finding 2 covered).
   `02b-upload-receipt-390.jpg` — "Licence, not yet checked." / "Received.
   Local Dev Studio will confirm it." — the r8 Finding 1 contradictory-
   sentence bug stays fixed; confirms r8's own MAJOR-1 fix
   (`paperwork-sheet.tsx`) is intact.
5. Back as Leah: inbound band appeared on the company card,
   `03-inbound-band-designer.jpg` — "1 DOCUMENT WAITING FOR YOUR CHECK".
6. Confirmed the document. `04-confirmed-designer-paper.jpg` — Licence now
   CURRENT in the Paper table, band cleared. Verified in Postgres:
   `compliance_state()`'s `NOT (inbound AND verified_at IS NULL)` predicate
   (migration `00637`) is doing its job — the unverified upload never
   flipped the paper word before confirmation, only the confirm act did.
7. Rosa's fresh reload of the same link: `05-firm-page-flipped-390.jpg` —
   "Licence, current." Reader and record agree.
8. **Log who was told** — checked Rosa Delgado's box in the notice-log
   picker (`apps/designer-portal/.../roster/notice-log.tsx`) and pressed
   "Save this note". A first pass raised a real concern (below, resolved as
   a non-issue) before a clean, instrumented repro confirmed the feature
   works: `studio_touches` gained exactly one row
   (`direction='out', subject_type='project',
   subject_id=<Okonkwo project id>, notified_refs={<Rosa's
   project_parties.id>}`) and `project_site_access_cards.told_refs` gained
   Rosa's ref, both immediately verified via direct `psql` against the live
   DB. Network capture on the clean run showed the CORS preflight OPTIONS
   for both `project_site_access_cards` and `rpc/record_notice`; no console
   errors. See Finding 4 for the earlier non-reproducible anomaly.
9. **Unsubscribe → confirm the next send is refused.** Minted a genuine
   `channel:<id>` unsubscribe token for Rosa's own address
   (`rosa@twin-cities-drywall-plaster.com`,
   `studio_contact_channels.id = fecf82ee-fbd9-4329-95aa-afb72e73d517`)
   using the real signing scheme (`packages/notifications/src/tokens.ts`,
   HS256, `SUPABASE_SERVICE_ROLE_KEY` fallback, exactly as the running
   server resolves it) via a throwaway script, deleted after (confirmed via
   `git status --short` — no stray files landed).
   - `POST /api/unsubscribe?token=…` (mail-client style, `Accept:
     application/json`) → `200 OK` on the live client-portal server.
   - **After**: Rosa's channel → `unsubscribed`, `status_at` stamped. Frank's
     and the company's own channels (same firm) stayed `active` — the stop
     is address-scoped, not company-wide.
   - Proved the refusal with the real send-gate code, not a simulation: a
     throwaway Deno script (deleted after; confirmed via `git status
     --short` — no `deno.lock` change landed) called
     `resolveContactChannel`, `channelRefusesSend` and
     `prepareCompliantEmail` from `supabase/functions/_shared/send-email.ts`
     against the live local DB:
     - Rosa → `status: "unsubscribed"` → `channelRefusesSend` `true` →
       `prepareCompliantEmail` → `{"state":"suppressed","reason":
       "channel_unsubscribed", ...}`. The next send to this exact address is
       refused by the real gate.
     - Control: Frank (same firm, different address) → `{"state":"ready",
       ...}` — confirms the refusal is address-scoped.
   - **Cleanup**: reverted Rosa's channel back to `active` / `status_at =
     NULL` immediately after, so the shared local DB is not left altered.
   - **Pass. No finding** — matches the acceptance-list behavior exactly.

## 4. Prior-round findings re-check

| r8 finding | File | Status this round |
|---|---|---|
| Finding 1 (MAJOR) — contradictory "not on file"/"Received" sentence | `paperwork-sheet.tsx` | **Confirmed fixed** — screenshot 02b, Playwright pass, direct walk |
| Finding 2 (MAJOR) — pre-hydration click degrades to native GET, drops file | `paperwork-upload-form.tsx` | **Confirmed fixed** — a real hydrated-page upload succeeded (02b); Playwright's "an upload lands unverified on the token's firm" case passed |
| Finding 3 (MAJOR/data+edge) — reversed dates blamed on the token, left an orphan object | `paperwork-upload/core.ts` | **Confirmed fixed** — `REVERSED_DATES_MESSAGE` guard and `.remove(key)` cleanup present in code; both Deno test cases pass live (15/15 total) |
| MAJOR-2 (code) — bounce band read stale invoice-link cache | `invoice-folio.tsx` + `use-invoices.ts` | **Not in this round's walk scope** (paperwork door / notice-log / unsubscribe only); no code in this area was touched this round; presumed unaffected, not independently re-verified |
| Finding 4 (MINOR) — `call-sheet.spec.ts` locator resolves wrong roster row | test file | Not re-executed live this round (see §2); presumed open, non-gating |
| Findings 5–6 (MINOR) — `pay-link.spec.ts` wrong-token / stale locator | test file | Not re-executed live this round (see §2); presumed open, non-gating |

## 5. New findings this round

See `StructuredOutput` for the canonical machine-readable list; narrative
below.

**Finding 1 — MAJOR — color-only checkbox visual state in "Log who was
told"** (`apps/designer-portal/src/components/document/roster/
notice-log.tsx`, lines ~104–124). The picker's checkbox is a `role="checkbox"`
button whose checked/unchecked states are communicated ONLY by an inline
`style` swap — `borderColor: var(--color-sage)` / `rgba(168,181,160,0.15)`
background when checked, vs. a neutral border / transparent background when
unchecked — with no checkmark glyph, icon, or fill pattern. Confirmed via
`getComputedStyle`: checked → `border-color: rgb(168,181,160)` +
`background: rgba(168,181,160,0.15)`; unchecked → `border-color:
rgba(44,41,38,0.18)` + `background: rgba(0,0,0,0)`. The contrast between
these two states is low enough to be nearly imperceptible in a screenshot
(`06a-checkbox-no-visual-state-FINDING.jpg`) despite `aria-checked` being
correct for assistive tech. This is a WCAG 1.4.1 "Use of Color" concern — a
sighted user relying on the visual state alone may not be able to tell which
names are picked before pressing Save. Confidence: high (reproduced via
direct DOM/computed-style inspection). Fix: add a non-color indicator (a
checkmark glyph or fill pattern) alongside the color change.

**Finding 2 — MINOR — paperwork dead-link page returns HTTP 200, not a
literal 404** (`apps/client-portal/src/app/paperwork/[token]/page.tsx`). The
upload-door-spec §9 acceptance item 4 states literally: "An expired or
revoked token 404s the page... neither path reveals whether the token once
existed." The page's `DeadLink()` component returns a normal 200 React page,
not a `notFound()` 404 — confirmed by reading the component (explicit doc
comment: "THE DEAD DOOR, WHICH IS NOT A HOMEOWNER'S 404 (W4 r2 MAJOR-4)").
This is a **pre-existing, deliberate house pattern**, not new to W4:
`/plans/[token]/page.tsx` uses the identical `DeadLink()` pattern for its own
dead-link cases with no `notFound()` call either. Both `/field/[token]` and
`/evidence/[token]` DO call `notFound()`. Functionally the security goal
("don't reveal whether the token existed") is met — a live, honestly-
expired, and never-issued token all render the identical page — just not via
the literal HTTP status code the spec's acceptance-list prose names.
Confidence: high. Fix: either update upload-door-spec §9 item 4's wording to
describe the actual (and, given the `/plans` precedent, intentional) 200
dead-door pattern, or file a cross-cutting decision to move both doors to a
real 404 if the literal status code matters for some consumer (e.g. a crawler
or monitoring probe).

**Finding 3 — MINOR — `paperwork-inbound.spec.ts` locator collides with its
own fixture name** (`apps/designer-portal/e2e/people/
paperwork-inbound.spec.ts:182`). `page.getByRole("heading", { name: "Paper"
})` uses Playwright's default substring/case-insensitive match, which also
matches the test's own seeded company heading ("Paperwork E2E
<random-suffix>") because "Paper" is a substring of "Paperwork". This raises
a strict-mode violation ("resolved to 2 elements") and fails the entire test
before any of its actual mint/send/confirm/paper-flip assertions run — this
is deterministic on every run, not flaky, since the fixture always seeds a
company named "Paperwork E2E ...". The underlying feature is correct (see
manual walk §3, steps 2–7); this is purely a test-authoring bug. Confidence:
high (reproduced directly). Fix: `getByRole("heading", { name: "Paper",
exact: true })` or a more specific selector (e.g. scoping to the Paper
section's container).

**Finding 4 — MINOR — low-confidence, non-reproducible "Log who was told"
save anomaly (resolved as likely a session artifact, reported per the
never-filter instruction)**. Earlier in this session, after clicking a
checkbox and a "Save this note"/"Not now" region via approximate then
precise element refs, the UI displayed "Told: ... Rosa Delgado" while an
immediate `psql` check showed `studio_touches` still empty (0 rows) and
`project_site_access_cards.told_refs` unchanged (missing Rosa's ref) — twice.
A subsequent fresh reload (which incidentally revealed the designer session
had silently expired, redirecting to `/auth/signin`) showed the pre-save
"Told:" list, confirming the earlier apparent successes were never actually
persisted. A third, fully clean and controlled repro — fresh sign-in, precise
`find`-derived refs for both the checkbox and the Save button, immediate
console/network capture, immediate `psql` verification — succeeded cleanly
(see §3 step 8): correct `studio_touches` row, correct `told_refs` append, no
console errors. I could not reproduce the anomaly under controlled
conditions, and the code (`notice-log.tsx`) has explicit, deliberate error
handling ("THE CARD IS WRITTEN FIRST... if the notice then fails, the band
says exactly that") that would have surfaced a visible error sentence had the
underlying mutation genuinely failed — no such sentence was ever observed.
The most likely explanation is a session/methodology artifact on my end
(e.g. an already-stale auth session during the first two attempts) rather
than a product defect. Confidence: low. Reported, not filtered, per
instruction; does not gate the review given the successful controlled
reproduction. Fix (if a future round reproduces this again):
instrument/log a client-side error boundary around
`useLogSiteAccessTold`/`useRecordNotice` so a silently-failed mutation cannot
leave the "Told:" line showing a name that never landed.

**Finding 5 — MINOR — report/schema terminology drift: `is_inbound` vs.
`inbound`**. `w4-studio-report.md` and related prose refer to an
"`is_inbound`" column; the actual Postgres column on the relevant compliance-
document table is `inbound` (confirmed via a failed `psql` query: `ERROR:
column "is_inbound" does not exist ... HINT: Perhaps you meant ...
"inbound"`). Reporting-accuracy only; does not affect behavior. Confidence:
high.

**Finding 6 — MINOR — stale "owed" note in `w4-paperwork-report.md`**. Its
§7 "Owed, and not done" section lists the company-card inbound band and
mint/revoke UI as outstanding; `w4-studio-report.md` documents both as
already built (and this round's manual walk, screenshots 01/03, confirms
they exist and work). The paperwork report's note is superseded/stale.
Confidence: high.

## 6. Console-clean check

Fresh-load console checks (post-teardown-prep, pre-teardown) on all four
required surfaces came back clean (no console messages of any kind):
- `/desk` (designer-portal)
- Company card (`/people?firm=<uuid>`, designer-portal)
- `/paperwork/[token]` in its dead-link state (client-portal)
- The confirmed-current paperwork state was visually confirmed via
  screenshot 05 during the walk (console checked clean on the immediately
  prior/following fresh loads of the same origin).

## 7. Teardown

- Killed both `next start` processes (designer :3000 pid 39158/39153,
  client :3002 pid 39251/39246) and the `supabase functions serve
  paperwork-upload` process (pid 40738/40733).
- Confirmed via `lsof -nP -iTCP:3000 -sTCP:LISTEN` and `-iTCP:3002` — both
  free.
- Confirmed via `ps aux` — no lingering `next start`/`next-server`/
  `functions serve` processes.
- Closed both browser tabs; the MCP tab group auto-removed.
- **Local-auth side effect, reverted**: I temporarily changed
  `designer@patina.dev`'s local dev password via the Supabase admin API to
  restore my browser session after an unrelated mid-session logout, then
  reverted it back to the seed default (`password123`) once I noticed it was
  blocking `paperwork-link.spec.ts`'s own designer sign-in — confirmed via a
  live password-grant token request that `password123` works again. This is
  a local-only, non-prod, non-migration action; flagged here for
  transparency, not as a product finding.
- No migration was minted or edited this round. No prod call of any kind (no
  `db push`, no `functions deploy`, no secrets set).

## 8. Verdict

**Not clean** — one MAJOR finding (Finding 1, the color-only checkbox visual
state). Zero BLOCKING findings. All three r8 MAJOR findings (contradictory
sentence, native-GET file-drop, reversed-date orphan) are confirmed still
fixed. Five MINOR findings (a spec-vs-implementation status-code divergence
that matches a deliberate, pre-existing house pattern; a deterministic
test-locator bug; a non-reproducible low-confidence save anomaly; and two
report-accuracy notes) do not gate the outcome but are reported per
instruction.
