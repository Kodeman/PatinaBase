# W4 (P3) — round-5 runtime QA, local production builds

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local only: no `db push`, no `functions deploy`, no secrets set. `rulings.md` §3 treated as
settled throughout (not re-litigated below).

**Verdict: NOT clean — one blocking (mine, newly surfaced this round, reproduced independently),
two major (one mine, newly found; one cross-referenced from the parallel round-5 data-edge
review, not independently reproduced), plus minor notes. Zero blocking and zero major among the
round-4 fix-log's five items — all five hold on live re-walk or gate re-run.**

Read before the walk: `build/w4-data-edge-report.md`, `build/w4-paperwork-report.md`,
`build/w4-studio-report.md` (the three surfaces this round covers), `build/upload-door-spec.md`
§3/§6/§9, and `build/w4-fix-log-r4.md` (prior findings, re-checked in §1). Also read, as a
cross-reference only (not re-verified line-by-line by me): `build/w4-review-r5-data-edge.md`,
staged in this worktree by a parallel session before I started — see §4.

---

## 0. Environment and procedure

- Port rule: `lsof -nP -iTCP:3000/-iTCP:3002 -sTCP:LISTEN` — both free before starting. No
  port-rule intervention needed, at the start or at any point during the round.
- `pnpm supabase:reset` (worktree cwd) — clean replay through `00638` +
  `20260910152111_create_contact_messages.sql`, all seed files. Ran **three** times this round
  (once before the builds/walk, once mid-round after the client and designer Playwright specs
  left residue, once more before the final SQL-suite pass) — each one exit 0, no residue carried
  forward past a reset.
- Builds, inline env only (confirmed no `.env.local` anywhere in the worktree; every value passed
  as an exported shell var per the brief's binding list, keys read fresh from
  `supabase status --workdir <worktree> -o env`):
  - `next build --webpack` in `apps/designer-portal` — **exit 0**, `ƒ /preferences/unsubscribe`
    present in the route table.
  - `next build --webpack` in `apps/client-portal` — **exit 0**, `ƒ /paperwork/[token]` present.
  - Note: `next start` itself does **not** accept `--webpack` (build-only flag); the first launch
    attempt errored `unknown option '--webpack'` and was corrected to a plain `next start -p
    <port>`. Not a product defect — a QA-procedure correction, recorded per the minor category.
- `next start -p 3000` (designer) and `next start -p 3002` (client) in the background — both
  logged the expected `⚠ "next start" does not work with "output: standalone"` informational
  notice (same as round 4) and served real traffic throughout: `designer / → 200`,
  `client / → 307`.
- `supabase functions serve paperwork-upload --no-verify-jwt --workdir <worktree>` in the
  background — served every function under `supabase/functions/` (the CLI does not filter to the
  one name passed, same as round 4); `paperwork-upload` OPTIONS → 204 confirmed before and after
  each reset.
- Stopped at the end: both `next start` processes killed by pid, `functions serve` and its two
  child processes (CLI wrapper + `docker logs -f` follower) killed by pid, edge-runtime container
  gone. `lsof -nP -iTCP:3000/-iTCP:3002 -sTCP:LISTEN` empty afterward, and no stray `next
  start`/`functions serve` process remained — **ports confirmed free**. No `deno.lock` left at
  the repo root.
- Server console logs, full transcripts, both portals: **clean** except the one known local-only
  line already named in round 4 — `{"level":"error","portal":"client","event":
  "pay_link_ratelimit_missing","binding":"PAY_LINK_RATELIMIT"}` (missing Cloudflare binding under
  local `next start`; the page still rendered and resolved correctly, confirmed again this round
  at §3 step 12). No `AuthApiError` this round (no live session survived a reset mid-walk). Browser
  console (both portal tabs, DevTools protocol) — clean, no errors, checked after every real
  action.

---

## 1. Round-4 fix-log items, re-checked fresh this round

`w4-fix-log-r4.md` closed five findings with unit/type-check gates only — it ran **no server and
no Playwright** ("No server was started on 3000 or 3002; no Playwright run this round"). This
round is the first live re-walk of all five.

| id | claim | re-check this round | verdict |
|---|---|---|---|
| W4R4-1 | Folio: `Regenerate` stands on `canShareLink` alone; `Copy` waits on the mint; recovery band repointed | `npx jest src/components/document/accounts/__tests__/invoice-folio.test.tsx` → **30 passed** (gate re-run; not independently re-walked live this round — out of the mandated walk's path, see §5 for why the pay surface I did walk is unaffected by this) | **holds** |
| W4R4-2 | Unsubscribe landing speaks from `scope`, not the letter's narrow `type` | Walked **live** on the ADMIN-PORTAL surface the fix actually touched — not run this round (admin-portal was not built/started, out of this round's server set) — confirmed instead via `npx jest src/app/preferences` in `apps/admin-portal` → **5 passed**, all scope-aware assertions green. **But the CLIENT-PORTAL's own sibling `/preferences/unsubscribe` + `/api/unsubscribe` pair — walked live this round because it is the surface the brief's mandated walk actually uses — was never touched by this fix and still carries the pre-fix defect.** New finding, §2 F2 | **holds on admin-portal (the surface it fixed) — reopens as a live, walked, MAJOR defect on client-portal, a surface the fix never reached** |
| W4R4-3 | `sms-inbound` START and YES branches file a touch | `deno test --no-check --allow-all` on `sms-inbound/`, `_tests/sms-inbound.test.ts`, `_tests/paperwork-upload.test.ts`, `_tests/email-channel-status.test.ts` → **89 passed, 0 failed** (gate re-run; no live SMS rail locally, same constraint round 4 named) | **holds** — see also §4's cross-referenced MAJOR-2, a different defect in the same file the fix did not touch |
| W4R4-4 | Access-grants row reads `granted_at`/`last_used_at` through `touchInstantDay`, not the UTC day | **Walked live, real clock.** Minted a fresh paperwork link for Twin Cities Drywall & Plaster at **19:52 CDT, 15 September 2026** (`date`; `select now(), now() at time zone 'America/Chicago'` → `2026-09-16 00:52:24+00` / `2026-09-15 19:52:24`) — the exact evening-hours window the original bug and its fix both concern. The Access-grants line read **"minted 15 Sep 2026 · used 15 Sep 2026"** — the studio's own calendar day, not the UTC day (which would have read 16 Sep). Screenshot `qa-w4-r5/04-inbound-band-and-grant-date-fix-confirmed.jpg` | **holds, independently reproduced live** |
| W4R4-5 | Two `other_named` upload forms get their own field ids via `fieldPrefix` | `npx jest src/components/paperwork` (client-portal) → **3 suites / 46 passed** (gate re-run; not independently re-walked live — this round's fixture firm owed only COI/W-9/Licence, none `other_named`) | **holds** |

---

## 2. Findings

### F1 — BLOCKING (per this brief's own rubric) — 00636's expiry backfill turns a client's already-closed `/pay` link into an indistinguishable dead sheet instead of the withdrawn/settling receipt it should show (confidence: high — independently reproduced twice, clean before/after)

First surfaced by the parallel round-5 data-edge review (`w4-review-r5-data-edge.md` MAJOR-1),
which classifies it MAJOR under its own general severity convention ("no live **pay** link is
broken… which is why this is major and not blocking"). I reproduced it independently below and
am reclassifying it under **this** QA round's brief, whose blocking list names this exact
scenario by name: *"a /pay link broken by the backfill."* A closed link rendering the wrong
sheet — the generic dead-link page instead of the ruled withdrawn/settling receipt — is a `/pay`
link the backfill broke, whatever the money-motion risk; the two reviews are not in factual
disagreement, only in which taxonomy each was handed.

**The defect.** `00636_invoice_link_hardening.sql`'s backfill:

```sql
UPDATE public.invoice_links
   SET expires_at = CASE
         WHEN status = 'active' THEN now() + interval '30 days'
         ELSE COALESCE(revoked_at, created_at)
       END
 WHERE expires_at IS NULL;
```

sends every non-active (i.e. `closed`) pre-existing row's `expires_at` into the past —
`revoked_at`, which 00574's void path stamps at the moment it closes the link. But
`resolve_invoice_link` tests expiry **before** it ever asks whether the link is `closed`:

```sql
IF NOT FOUND OR v_link.status = 'revoked'
   OR (v_link.expires_at IS NOT NULL AND v_link.expires_at <= now()) THEN
  RETURN NULL;          -- dead sheet, never reaches the closed/withdrawn branch below
END IF;
...
v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';
```

So a closed link that used to resolve to `{kind: 'withdrawn', sheet: 'withdrawn', ...}` now
resolves to nothing at all, and `apps/client-portal/src/app/pay/[token]/page.tsx` renders its
generic `DeadLink` ("this link isn't available") instead.

**Reproduced independently, twice, on the local stack (transaction rolled back both times, no
persisted change):**

1. Minted a live link on a real seeded `sent` invoice (`ensure_invoice_link` on
   `INV-2026-0301`), closed it the way the void path does
   (`status='closed', revoked_at=now()-2d`), then applied the backfill's own `ELSE` term
   (`expires_at := revoked_at`) — the exact shape every pre-existing closed row in prod would
   carry after 00636 runs:
   ```
   status | expires_at                     | revoked_at
   closed | 2026-09-14 01:05:14.993894+00  | 2026-09-14 01:05:14.993894+00
   ```
   `resolve_invoice_link(raw_token)` → **empty result (NULL)** — a dead sheet.
2. Same link, same close, but `expires_at` left `NULL` (the pre-00636 shape) —
   `resolve_invoice_link(raw_token)` →
   ```json
   {"kind": "withdrawn", "sheet": "withdrawn", "studio": {...}, "invoice": {"number": "INV-2026-0301"}, ...}
   ```
   the correct, ruled (K5/M10) receipt.

Same link, same close event, only the backfilled `expires_at` differs — a clean before/after
proving the backfill, not the closing logic, is what breaks the sheet.

**Scope.** Every `invoice_links` row that was `closed` (or, by the same `ELSE` branch, any other
non-`active` status) before 00636 ran is affected on deploy. Going forward, an `active` link that
is later closed still resolves correctly (a freshly-closed row's `expires_at` predates this
migration's `WHERE expires_at IS NULL` guard, so the bug is a one-time backfill artifact, not an
ongoing one — but it is baked into every existing closed link's row the moment 00636 lands on
Strata, and nothing here undoes it after the fact).

**No live payable link is broken** — a closed link was never payable in the first place
(`resolve_invoice_link_for_checkout` independently requires `status='active'`) — which is exactly
why the sibling review called it major, not blocking, under its own convention. Under this
round's brief, "a /pay link broken by the backfill" is named without a payability qualifier, so I
report it at that severity and let the qualifier stand as context rather than as a downgrade I
apply myself.

**Fix (as the sibling review names it, either one, not both):** move the expiry test below
`v_dead` in `resolve_invoice_link` so an expiry only silences an `active` link, or exclude
`status='closed'` (and any other non-`active` status) from the backfill's `ELSE` branch and leave
those rows `expires_at IS NULL`. Add a W4-suite block asserting a closed link with a
backfill-shaped past `expires_at` still answers `kind = 'withdrawn'`.

---

### F2 — MAJOR (new this round, mine, independently reproduced live) — the client-portal's own unsubscribe landing still prints the pre-fix narrow-type copy, disagreeing with the address-wide stop the record just applied (confidence: high — reproduced live with a real token against the real database)

`apps/client-portal/src/app/preferences/unsubscribe/page.tsx`,
`apps/client-portal/src/app/api/unsubscribe/route.ts`.

**Background.** `w4-fix-log-r4.md` (W4R4-2) fixed exactly this defect class — a channel-scoped
(account-less) unsubscribe silences the WHOLE address across every studio and category, but the
landing page used to print copy naming only the one letter-type that happened to carry the click
("We've unsubscribed you from po sent emails"). The fix added a `scope: 'account' | 'address'`
field to `applyUnsubscribeToken`'s result and taught the **admin-portal**'s
`/preferences/unsubscribe` page and `/api/unsubscribe` route to read it. Verified holding on
admin-portal this round (§1, W4R4-2 row): `npx jest src/app/preferences` in `apps/admin-portal` →
5/5 green, all scope-aware.

**The gap.** The client-portal carries its **own**, separate `/preferences/unsubscribe` page and
`/api/unsubscribe` route — not a re-export of admin-portal's fixed versions. Grepping both files
for `scope` returns nothing:

```
$ grep -n "scope" apps/client-portal/src/app/preferences/unsubscribe/page.tsx apps/client-portal/src/app/api/unsubscribe/route.ts
(no output)
```

`apps/client-portal/src/app/api/unsubscribe/route.ts` calls the same, already-fixed
`applyUnsubscribeToken` (which does return `scope` on every path), but its redirect only forwards
`status` and `type` to the outcome page — `scope` is read from the result and then dropped. The
page itself still branches exactly the pre-fix way:

```ts
outcome.type === "all_marketing"
  ? "We've turned off all marketing emails. You'll still receive essential account notifications."
  : `We've unsubscribed you from ${humanizeType(outcome.type)} emails.`
```

Neither file has a test (`find apps/client-portal/src/app/preferences
apps/client-portal/src/app/api/unsubscribe -name "*.test.*"` → no results) — which is exactly why
round 4's fix, whose new test coverage all landed on admin-portal, never caught that this sibling
surface still carries the bug.

**Reproduced live, this session, real token, real database.** Minted a channel-scoped token the
same way `generateChannelUnsubscribeUrl` does (HS256, local `SUPABASE_SERVICE_ROLE_KEY` as
secret, `sub: "channel:448de921-bef4-4a4a-875e-b8722969fb3d"` — the real seeded
`priya@hartwellstudio.com` channel with no Patina account — `type: "po_sent"`, issuer
`patina:notifications`). Visited `http://localhost:3002/preferences/unsubscribe?token=...` on the
live client-portal build:

1. GET did not mutate (confirm screen, "Turn these emails off?") — correct, matches the route's
   documented one-click-scanner defense.
2. Pressed "Unsubscribe me" → POST → landing read: **"We've unsubscribed you from po sent
   emails."** Screenshot: `qa-w4-r5/06-FINDING-client-portal-unsubscribe-narrow-copy.jpg`.
3. Checked the actual database effect directly: `priya@hartwellstudio.com`'s channel row flipped
   to `status = 'unsubscribed'`, and it is the **only** row that moved —
   `dale@hartwellstudio.com`, `adaeze@okonkwo-household.com`, `chidi@okonkwo-household.com` all
   stayed `active`. So the WRITE is correct and address-wide, matching R-something's own rule and
   showing no cross-subject forgery; only the CONFIRMATION COPY disagrees with what the record
   now says — the exact "a reader disagreeing with the record" criterion this brief's MAJOR
   category names.
4. Confirmed the next send is refused against the real database (not a mock), same query
   `resolveContactChannel` issues:
   `studio_contact_channels?value=eq.priya@hartwellstudio.com&channel_kind=in.(email,ap_email)`
   with the `studio_contacts!inner(organization_id)` embed → `status: "unsubscribed"` →
   `channelRefusesSend('unsubscribed')` is `true`. The suppression itself is sound; only the
   copy is wrong.

**Reachability, stated plainly so severity can be judged fairly.** Today's five account-less
senders (`invoice-send`, `po-send`, `quote-request-send`, `trade-rfq-send`,
`trade-agreement-send`) all leave `unsubscribeBaseUrl` unset and resolve to
`send-email.ts`'s `DEFAULT_BASE_URL = https://admin.patina.cloud` — so no real production email
currently links a channel-scoped token to the client portal. The only current legitimate caller
of the client-portal's own landing (`notification-digest`, via `CLIENT_PORTAL_URL`) always sends
a plain `userId` subject, whose narrow-type copy is factually correct for that caller (an account
preference toggle really is narrow). But the endpoint itself performs **no** subject-type check
against which portal it is running in: it accepts the identical channel-scoped token format and
shared signing secret admin-portal's page uses, is reachable by anyone who copies an
admin.patina.cloud unsubscribe link into the client-portal's own domain (same token, same
secret), and would reproduce this defect verbatim the moment any future sender's
`unsubscribeBaseUrl` were ever repointed at the client portal by accident — the same class of
"one accidental repoint away from live" gap `w4-paperwork-report.md` §7 already names for the
upload form's CSP origin. I report it MAJOR rather than blocking because no channel actually gets
emailed against this copy today; it is a live, walked, reproducible defect on a real route with
zero test coverage, not a hypothetical.

**Fix.** Either forward `scope` through the client-portal's `/api/unsubscribe` redirect and teach
its `page.tsx` the same `appliedCopy()`-shaped branch admin-portal's page now has (duplicating the
fix onto the sibling surface), or — better, since both portals now need identical logic — lift
the scope-aware outcome rendering into `@patina/notifications` as a shared component/helper both
portals import, so a third such landing never repeats this gap a third time. Add tests to both
client-portal files; today they have none.

---

## 3. The walk (Leah → mint → Rosa → upload → confirm → paper word; unsubscribe; "who was told"; pay link)

All on the real local-production builds above, real local DB, no mocks, no `.env.local`.

1. Signed in as Leah (`designer@patina.dev` / `password123`) on the running designer-portal
   build. Dismissed the onboarding tour.
2. **People Room** (`/people`) — `40 people · 21 firms`, matching the fresh-reset baseline
   exactly (same as round 4). Opened **Twin Cities Drywall & Plaster**'s company card
   (`/people?role=firms&firm=d0e20000-...-000006`). Rosa Delgado: `office_manager · paperwork
   contact · site contact`. Paper baseline: COI current (31 May 2027), W-9 current (on file 14
   Apr 2025), no inbound band. Screenshot: `qa-w4-r5/01-company-card-paper-baseline.jpg`.
3. **Mint a paperwork link.** Band opened exactly to spec: *"The door can end with this firm's
   work here, 9 February 2027."*, three radios (Ends with the job / Thirty days / Their next
   window), "Ends with the job" pre-selected. Screenshot:
   `qa-w4-r5/02-mint-band-opened.jpg`. Pressed **Open the door** at real wall-clock **19:52 CDT,
   15 September 2026**. Got a real 64-hex token and *"This address is shown once. Twin Cities
   Drywall & Plaster can send their paper here until 9 February 2027."* The Access-grants line
   read **"minted 15 Sep 2026"** — the studio-local day for a 19:52 CDT event, confirming
   W4R4-4's fix (§1) live, at the exact evening-hours window that originally exposed the bug.
4. **Fresh browser context (new tab, no session — the field-link family carries none), at a
   390px viewport, as Rosa.** Opened the raw `/paperwork/<token>` URL on the client-portal build.
   Page showed, worst-paper-first: `Licence is not on file.` (upload form open by default), `COI,
   general liability, current.`, `W-9, current.` No sentence tells the firm what happens if it
   does not upload, matching spec §3's stated posture (verified by reading the rendered copy
   directly).
5. **Uploaded a small generated PDF** (`test-license.pdf`, 482 bytes) — Number `LIC-QAR5-0001`,
   Issuer `MN Dept of Labor`, Expires `12/31/2027` — through the real `paperwork-upload` edge
   function (served locally, anon key, real multipart POST, no mock). Result: *"Received. Local
   Dev Studio will confirm it."* — exact spec wording. Console clean. Screenshot:
   `qa-w4-r5/03-rosa-upload-received.jpg`. Verified the write directly against
   `studio_compliance_documents`: `doc_type=license`, `source='field_link'`, `inbound=true`,
   `verified_by`/`verified_at`/`rejected_at`/`superseded_by` all NULL, `file_path` =
   `{org-uuid}/{company-uuid}/{upload-uuid}/test-license.pdf` — every segment before the filename
   a real uuid (spec §4), exactly the unverified, non-overwriting landing spec §5 requires.
6. **Back on Leah's card** (reload), the inbound queue band appeared: *"1 DOCUMENT WAITING FOR
   YOUR CHECK"*, row *"Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster."* with
   Confirm/Reject, sitting above the Paper table as spec'd — and, in the same screenshot, the
   Access-grants line above it correctly reading "minted 15 Sep 2026 · used 15 Sep 2026" for the
   same evening (§1, W4R4-4 confirmed live). Screenshot:
   `qa-w4-r5/04-inbound-band-and-grant-date-fix-confirmed.jpg`.
7. **Confirmed** — two-step inline confirm (*"Confirming makes this the paper the studio holds.
   The certificate it replaces is retired, kept, and readable."*), pressed **Confirm the
   document**. Toast: *"Licence, uploaded 15 Sep 2026 by Twin Cities Drywall & Plaster is
   confirmed."* The Paper table now reads **Licence · LIC-QAR5-0001 · MN Dept of Labor · 31 Dec
   2027 · CURRENT**. Inbound band cleared. Screenshot:
   `qa-w4-r5/05-paper-word-flipped-current.jpg`.
8. **Rosa's own page, reloaded** — now reads `Licence, current.` alongside the other two; both
   sides of the door agree.
9. **"Log who was told."** Ran the designer-portal's own e2e for this
   (`e2e/people/call-sheet.spec.ts -g "logging who was told"`, chromium, workers=1) — **1
   passed** — then verified `studio_touches` directly: exactly one new row, `subject_type =
   'project'`, `direction = 'out'`, `notice_of = 'The way in changed 16 Oct 2026. Lockbox,
   version 3.'`, `notified_refs` array length 1 — matches round 4's own recorded evidence
   verbatim, no regression.
10. **Unsubscribe, via the landing, real page, real DB** — this is where F2 (§2) was found; see
    that section for the full reproduction. The write is correct and address-wide; the
    confirmation copy on the client-portal's own landing is not.
11. **Confirmed the next send would be refused**, against the real database (not a mock) — see
    F2 §2 step 4. `channelRefusesSend('unsubscribed')` is `true`; I did not attempt an actual
    outbound send (no Resend key configured locally, same constraint round 4 named).
12. **Pay link, not broken by the backfill — for a live, active invoice.** Minted a fresh
    invoice-link token for a real seeded `sent` invoice (`ensure_invoice_link` on
    `INV-2026-0142`, $4,250.00), against the 00636/00638-hardened schema. Opened
    `http://localhost:3002/pay/<raw token>` on the live build — resolved correctly: full invoice,
    three payment-method rows with live surcharge math ($4,255.00 bank transfer / $4,377.50 card
    / $4,250.00 mail a check). Console clean. Screenshot:
    `qa-w4-r5/07-pay-link-not-broken-live-invoice.jpg`. **This confirms the brief's own "a /pay
    link broken by the backfill" clause does NOT fire for a live, active, currently-sendable
    link** — the failure mode F1 (§2) describes is specific to links that were already `closed`
    before 00636 ran, a population this walk's single active invoice cannot exercise. I went on
    to reproduce that population directly against the database (F1, §2) rather than leave it
    unchecked because the walk's own invoice was unaffected.

---

## 4. Cross-reference: the parallel round-5 data-edge review (staged in this worktree before I started; read in full, not independently re-verified line-by-line)

`build/w4-review-r5-data-edge.md` — 0 blocking · 2 major · 12 minor under its own convention,
disjoint scope from mine (migrations/edge, not the runtime portal walk). Noted here per the
brief's "never filter" instruction; none of it is double-counted as my own verdict above except
where explicitly folded in (F1, which I independently reproduced and reclassify under this
brief's rubric).

- **Their MAJOR-1** — the `/pay`-link backfill defect. Folded into my F1 above (independently
  reproduced, reclassified BLOCKING under this brief's own list).
- **Their MAJOR-2** — the consent-keyword inbound touches (`sms-inbound/pipeline.ts` STOP/
  START/YES/HELP) all key off `conv.party_id` (the phone's one shared, cross-studio conversation
  row) rather than the seat set the branch itself already computes
  (`studiosHoldingPhone(...).targets`, `yesTargets`, `startTargets`), so on a phone number two
  studios hold, the studio whose consent record actually moved gets no touch and its readers
  (person card, seat line, roster row, `touchSentence`) disagree with what the Directory row
  (which reads the record directly) now shows. **I did not independently reproduce this** — no
  live SMS/Twilio rail is available locally, and the analysis rests on a code read I did not
  re-derive myself. Reporting it per the brief's "report every finding, never filter" instruction,
  at the severity and confidence the source review gave it (MAJOR, medium confidence — the source
  review itself flags this may be an intentional, unstated rail-shape ruling rather than a defect).
- Their twelve minors (report/spec staleness: stale gate figures, a miscounted redeploy-set
  entry, three false "still owed" bullets, etc.) are exactly the brief's MINOR category (accuracy
  of the wave's own report files) and never gate. Not re-litigated here; see that file directly.

---

## 5. Settled, not findings

Every ruling in `rulings.md` §3 (R-A through R-BS) — none reopened.

Also settled, checked and NOT a finding this round:

- **F2 of `w4-review-r4-qa.md`** (the spec/paperwork-report's stale "404" language vs. the
  shipped `200`/`DeadLink` behavior) — unchanged, still a real but MINOR (report-accuracy)
  mismatch; not re-verified live this round since nothing in the relevant files changed between
  rounds 4 and 5, and it never gates.
- The three surfaces' own W4R4 gate figures cited in `w4-fix-log-r4.md` all still measure the
  same or better at HEAD (re-run subset: invoice-folio 30/30, admin preferences 5/5, sms-inbound+
  paperwork-upload+email-channel-status 89/89 via Deno, client paperwork 46/46) — no regression
  introduced between round 4's fix commit and this round's walk.
- SQL suites `w1a_identity_channels_consent_test.sql`, `w1b_compliance_authority_directory_test.sql`,
  `w3_merge_sweep_household_test.sql`, `w4_channels_touches_paperwork_test.sql` — all four green
  on a **fresh** reset taken immediately before running them (avoiding round 4's own documented
  E2E-residue trap with the w1b suite's exact-count assertion; confirmed the 21-firm-card count
  held with no special handling needed this time because the reset immediately preceded the SQL
  run).
- Playwright, both portals' new specs, pasted below.

---

## 6. Playwright — both portals' new specs

**Client-portal** (`apps/client-portal/tests/paperwork-link.spec.ts`, chromium):

```
Running 3 tests using 3 workers
  ✓ an upload lands unverified on the token's firm
  ✓ shows the firm what the studio holds, what it blocks, and what is owed
  ✓ an expired link is a dead link, and says no more than a stranger's
  3 passed (2.9s)
```

**Designer-portal** (`apps/designer-portal/e2e/people/paperwork-inbound.spec.ts`, chromium,
workers=1):

```
Running 1 test using 1 worker
  ✓ the paperwork door › mint, send, confirm — and the firm's paper word flips
  1 passed (6.2s)
```

**Designer-portal** (`apps/designer-portal/e2e/people/call-sheet.spec.ts -g "logging who was
told"`, chromium, workers=1) — the notice path exercised in the walk's step 9:

```
Running 1 test using 1 worker
  ✓ task 3 — logging who was told writes the notice
  1 passed (5.8s)
```

I did not re-run the full `e2e/people` folder (the round-4 QA report's own eight/nine
pre-existing, unrelated failures in that folder were not this round's brief) — the three specs
above are the ones the brief's own mandated walk and this wave's new/changed surfaces actually
exercise.

---

## 7. Gates re-run this round (subset, targeted at the fix-log's five items and the two new
findings' surrounding code)

| Gate | Command | Result |
|---|---|---|
| Reset ×3 | `pnpm supabase:reset` | exit 0 each time, head `00638` + `20260910152111` |
| Designer build | `next build --webpack` (inline env) | exit 0, `/preferences/unsubscribe` present |
| Client build | `next build --webpack` (inline env) | exit 0, `/paperwork/[token]` present |
| Client Playwright | `paperwork-link.spec.ts` | 3/3 |
| Designer Playwright | `paperwork-inbound.spec.ts`, `call-sheet.spec.ts -g "logging who was told"` | 1/1, 1/1 |
| Designer jest | `invoice-folio.test.tsx` | 30/30 |
| Admin jest | `src/app/preferences` | 5/5 |
| Client jest | `src/components/paperwork` | 46/46 |
| Deno | `sms-inbound/`, `_tests/{sms-inbound,paperwork-upload,email-channel-status}.test.ts`, `--no-check` | 89/89 |
| SQL ×4 | `w1a`/`w1b`/`w3`/`w4` people suites, fresh reset immediately before | all four green, "All … assertions passed" / "SQL suite: all blocks passed" |
| F1 reproduction | two hand-rolled transactions against `resolve_invoice_link`, both rolled back | dead vs. withdrawn, confirmed both ways |
| F2 reproduction | one real channel-scoped JWT minted and applied against the live client-portal build and the real database | confirmed both the correct write and the incorrect copy |

No prod anything: no `db push`, no `functions deploy`, no secrets set or read beyond the local
dev keys `supabase status -o env` prints (never printed to the transcript above).
