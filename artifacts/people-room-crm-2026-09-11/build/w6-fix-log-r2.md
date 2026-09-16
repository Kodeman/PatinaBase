# W6 fix log — round 2 (F4-new)

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`, HEAD before this fix `c83e119c4`
(`git merge-base --is-ancestor f1f556260 HEAD` → true). Local DB only; **no prod,
no servers started** (port 3000 checked with `lsof -nP -iTCP:3000 -sTCP:LISTEN` —
nothing listening; none started, per the brief's "no servers").

Scope: exactly one finding, `F4-new` (major). Nothing else touched.

---

## F4-new — `addSub()` hard-coded a phone the seed already owns (major) — FIXED

**File:** `apps/designer-portal/e2e/people/person-card.spec.ts`

**Confirmed the claim before fixing.**

- The seed's permanent Frank Bauer card (`d0e10000-0000-0000-0000-000000000015`)
  carries `(612) 555-0115` on `studio_contacts.phone` (`supabase/seed/people_crm_dev.sql:248`),
  again as an `office` channel (`:385`, labelled `'office — do not use'`), and again
  on the seeded engagement row (`:716`).
- The spec filled that exact number for **every** synthetic sub
  (`person-card.spec.ts:44`, pre-fix).
- The collision path is the product's own, from this program's `b4c1ff290`
  ("phone-collision disclosure"): `add-person-sheet.tsx:399-412` matches the typed,
  normalized number against every person card in the studio
  (`(c) => c.entity_kind === "person" && c.phone_e164 === typedPhoneE164`), and
  the sheet states the consequence on its face at `:1481` —
  *"This number is already on file for {name}. The rule and the channel you write
  here land on {name}'s card, and this seat is theirs — not a new person's."*
  So the submission attached to the existing card and no card under the typed
  unique name was ever written; `cardByName(name)` returned null and the
  `expect.poll(...).not.toBeNull()` at `:50` (pre-fix numbering) could only time out
  at 15 s.

**Change.** `addSub()` now derives a per-call number instead of a literal:

```ts
function mobileFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 6000;
  return `(612) 555-${4000 + hash}`;
}
...
await page.getByLabel("Mobile").fill(mobileFor(name));
```

The digits are hashed off the **full** name, which already carries
`uniqueName()`'s per-run suffix (`people-fixture.ts:12-14`), so the number is
unique per run *and* differs between the two `addSub()` calls inside `task 4`
(`Rosa Delgado …` vs `Frank Bauer …`) even when both `uniqueName()` calls land in
the same millisecond and share a suffix — the finding's second collision case.

**Why the 4000–9999 band:** every phone anywhere in `supabase/seed/` is
`(612) 555-NNNN` with `NNNN` ≤ `0308` (51 distinct numbers:
`0101`–`0128`, `0190`, `0201`–`0221`, `0308`; no other area code appears), so the
band cannot intersect seed data by construction, not merely by luck.

**Collision proof (deterministic, no server needed):** replayed `mobileFor` over
200 000 synthetic run-suffixes for the three names the file actually uses:

```
$ node -e '…mobileFor…'   # 200k suffixes × {Rosa Delgado, Frank Bauer, Erin Sato}
same-test collisions: 0 seed collisions: 0
sample: (612) 555-6651 (612) 555-8021 (612) 555-9783
```

**Cleanup is unaffected:** `removePerson()` already deletes
`studio_contact_channels` by `owner_id` (`people-fixture.ts`), so the new channels
are torn down in the same `finally` block as before, leaving nothing behind for a
later run to collide with.

---

## Gates run

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit --strict --target ES2022 --module esnext --moduleResolution bundler --lib dom,dom.iterable,esnext --skipLibCheck --esModuleInterop --resolveJsonModule e2e/people/person-card.spec.ts` (from `apps/designer-portal`) | **exit 0**, no diagnostics. (The app's own `type-check` cannot cover this file — `tsconfig.json` `exclude` lists `**/*.spec.ts`.) |
| Lint | `npx eslint e2e/people/person-card.spec.ts` | `File ignored because of a matching ignore pattern` — the designer-portal ESLint config does not lint `e2e/`. No errors. |
| Spec loads + both tests resolve | `npx playwright test e2e/people/person-card.spec.ts --project=chromium --list` (local Supabase env inline, no `.env.local`) | `Total: 2 tests in 1 file` — `task 4 …` and `R-V …`. |

**Not run, stated plainly:** the behavioral gate — executing these two tests
end-to-end — needs a designer-portal server on :3000, which this round's brief
forbids ("no servers"). Nothing on :3000 was found or started. The evidence above
is static + deterministic: the collision mechanism is read out of the product
source that causes it, and the replacement numbers are proven disjoint from both
the seed set and each other across 200 k simulated runs. A behavioral re-run of
`person-card.spec.ts` belongs to the next QA pass.

---

# W6 follow-up triage

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`
Branch: `build/people-room-crm-2026-09-11`, HEAD before this pass `46e699570`.
Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`); no
prod. Reused the designer-portal `.next` build present from the prior W6 QA
pass (`git -C WT status` showed no source change since; `next build --webpack`
was re-run twice ONLY for temporary, reverted debug instrumentation described
below, never for a kept change). Ran `next start`/`next start -p 3002`, never
`pnpm dev`. Port 3000 was free before starting and is free now; port 3002 (the
client-portal, used for item B) was free before and is free now.

Scope: the two items left open by the W6 integration report
(`integration-report.md:149-150`) — `pay-link.spec.ts:571` (F5) and
`hours.spec.ts:60/72` (mis-triaged as F2 evidence in round 1, then correctly
un-linked from it). Nothing else touched.

## Item A — `e2e/document/hours.spec.ts:60/72` — PRE-EXISTING, unrelated to this branch, no fix made

**Confirmed not-ours first.** Both the spec and the only product code on its
path are byte-identical between this branch's base and HEAD, and between the
base and `origin/main`:

```
git diff --stat c879118ec HEAD -- apps/designer-portal/e2e/document/hours.spec.ts
  → (empty)
git diff --stat c879118ec HEAD -- apps/designer-portal/src/components/document/desk-doorway.tsx
  → (empty)
git diff --stat c879118ec origin/main -- apps/designer-portal/e2e/document/hours.spec.ts apps/designer-portal/src/components/document/desk-doorway.tsx
  → (empty)
```

`c879118ec` (hour-tracking's own ship commit, 2026-09-15) **is** `origin/main`'s
HEAD used for this comparison and is an ancestor of `origin/main`. Neither the
spec nor `desk-doorway.tsx` — the component that owns `/desk?sheet=hours` —
has moved a single line on this branch. The failure is not a test-placement
issue about R-CC at all: the assertion at line 72
(`expect.poll(() => new URL(page.url()).search).toBe('')`) has nothing to do
with the person card or `openHoursForMember` — round 1's own investigation
(`w6-fix-log-r1.md:94-100`) already established this and left it correctly
un-folded into F2.

**Root-caused, not just re-confirmed not-ours.** Instrumented
`desk-doorway.tsx` temporarily (a `window.__doorwayDebug` callback at each
branch of the effect, read back via Playwright's `exposeFunction` — no
`console.*`, since `next.config`'s `compiler.removeConsole` strips those in
production builds and swallowed a first attempt silently) and a temporary
`e2e/document/_debug-hours.spec.ts` that traced `page.url()`, console/page
errors, and `requestfailed` events for 12–20s after `/desk?sheet=hours`. Both
edits were reverted byte-for-byte after use (`git diff --stat` on
`desk-doorway.tsx` and the debug spec is empty; the debug spec file does not
exist in the tree). Findings:

- The doorway effect runs exactly once, correctly: `effect-start` →
  `about-to-replace  hours null` → `replace-called`. `book`/`sheet` parsing,
  `openLedger('hours')` (which does open the "Hours" dialog — confirmed
  visible in the original failure's `error-context.md`), and the call to
  `router.replace('/desk')` all fire as designed. **The product logic is
  correct.**
- Despite the call firing, `page.url()` never changes from
  `?sheet=hours` for the full window. `page.on('requestfailed')` shows
  **multiple** `GET http://localhost:3000/desk?_rsc=<id> net::ERR_ABORTED`
  requests (three distinct `_rsc` cache-busting ids observed in one run, each
  cancelled), alongside `GET http://127.0.0.1:54321/auth/v1/user
  net::ERR_ABORTED`, a Supabase-JS `TypeError: Failed to fetch` from
  `_getUser`/`_useSession`, and even unrelated third-party
  `https://kv3qrinl.apicdn.sanity.io/...` help-content queries aborting the
  same way.
- Next's App Router only commits a `router.replace()` URL change after its RSC
  flight fetch resolves; when that fetch is aborted the transition never lands
  and the address bar (and `window.location.search`) is left exactly where it
  started — which is the entire visible symptom. The abort pattern spans
  unrelated same-origin, Supabase, and third-party HTTPS requests in the same
  run, which is a local browser/network-layer symptom in this specific
  headless Chromium execution, not an application defect reachable from any
  code this branch touched.

**Verdict: pre-existing, environment-flaky, not a people-room-crm regression
and not an R-CC test-placement problem.** No product-code change (the code is
proven correct by the instrumentation) and no spec change (updating the
assertion would not address a navigation-layer network abort — the spec is
already testing the right thing, correctly). Not fixed; not committed. Owed:
a re-run of this spec against a normal (non-sandboxed) local dev/CI browser
environment to see whether the `ERR_ABORTED` pattern reproduces there — if it
does, hour-tracking (the owning program) has a real, separate bug in the
doorway's RSC round-trip; if it does not, this was specific to this sandbox.

## Item B — `apps/client-portal/tests/pay-link.spec.ts:571` — stale fixture, fixed

**Path correction:** the brief named
`apps/designer-portal/e2e/pay-link.spec.ts`; the file is
`apps/client-portal/tests/pay-link.spec.ts` (client-portal's own Playwright
suite, `testDir: './tests'`, chromium-only, port 3002 — confirmed via
`git ls-files | grep pay-link`, the only match). Ran it there.

**Failure, first read:**
```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('link', { name: /open the invoice/i })
Timeout: 5000ms — element(s) not found
  at pay-link.spec.ts:603
```

**Root cause — a stale fixture, and the staleness predates this branch by a
week.** The CTA the test looks for (a `<a>` with accessible name "open the
invoice" linking to `/pay/<token>`) has not existed under that name since
`b287bac26` ("the owed figure is the announced figure … Pay under a
consequence sentence (PP-2)", **2026-09-08**), which renamed the link's visible
text to `Pay $X` while it was still an `<a href>`. That commit is an ancestor
of this branch's own base (`c879118ec`, 2026-09-15):

```
git log -1 --format='%ci %s' 37fc784e2   # 2026-09-06 — introduced "Open the invoice" (link)
git log -1 --format='%ci %s' b287bac26   # 2026-09-08 — renamed it to "Pay $X" (still a link)
git show c879118ec:apps/client-portal/src/components/threshold/letterbox.tsx | grep -n "Open the invoice"
  → no match (exit 1)
```

So `getByRole('link', { name: /open the invoice/i })` would already have found
nothing against a plain `origin/main` / this branch's own base — this was never
a red this branch introduced.

**This branch DID touch the same component after that, for a real, separate,
already-reviewed reason — worth recording so the two aren't conflated.**
`letterbox.tsx` changed on this branch (`git diff --stat c879118ec HEAD --
apps/client-portal/src/components/threshold/letterbox.tsx` → 75
insertions/16 deletions, commits `b13991948` "W4 round-2 review" and
`ac26cba69` "W4 round-3 review"). Those commits removed the `href` from the
terminal `ScoredAction` entirely (it had been `href={invoiceLinkPath(invoiceLink.token)}`,
reading `useInvoiceLink`) and replaced it with an in-place `onClick` that opens
the settle-in-place till on the projects page itself, never navigating to
`/pay/<token>`. The in-file comment (W4 r2 MAJOR-3) explains why: 00636 froze
`invoice_links.token` at NULL, so `useInvoiceLink` answered nothing and the
`Pay $X` act — and its consequence sentence — had silently disappeared from
every invoice's house page; a page-load mint was rejected as the fix because
`ensure_invoice_link` revokes the standing link on the way, which would kill
the client's own emailed `/pay/<token>` address. This is a **reviewed,
intentional, already-shipped-on-this-branch design change**, not a bug, and
per the brief I did not touch it. It does mean the CTA is now a `<button>`,
not a link, on the projects page — the emailed `/pay/<token>` sheet itself is
unchanged and still exercised directly by the "the sheet reflows at 390px"
test lower in the same file.

**Fix — test only**, `apps/client-portal/tests/pay-link.spec.ts:598-611`:
retargeted the assertion from the removed link to the `Pay $X` button that
replaced it (role `button`, name `'Pay $9,125.00'` — matching the literal the
component's own unit test already asserts,
`letterbox.test.tsx:610/627/728`), and its `aria-expanded="false"` state
before any click. The core invariant under test (F6 — opening the projects
page must never fire a request to `/pay/`) is untouched; the amount stays a
non-vacuous, fixture-tied literal instead of the removed href.

**Gate — re-ran to green:**
```
$ pnpm exec playwright test --project=chromium -g "the letterbox names the invoice without ever requesting it" tests/pay-link.spec.ts
  ✓ 1 [chromium] › tests/pay-link.spec.ts:571:7 › … the letterbox names the invoice without ever requesting it (1.8s)
  1 passed (3.0s)
```

**Full-file re-run (not required by the brief, run as due diligence):**
`pnpm exec playwright test --project=chromium tests/pay-link.spec.ts` (both
7-worker and `--workers=1`) — 6/7 pass including the fixed test. The 7th,
`pay-link.spec.ts:470` ("the return hop 303s to the sheet, and an unknown
nonce to the dead one"), fails in isolation too:
`expect(hop.headers()["location"]).toContain(...)` receives
`http://localhost:3002/pay/used` instead of the fresh token. This is the case
the integration report describes as already fixed via
`stamp_invoice_checkout_return_origin` — it is failing here, on a freshly
reset local stack. **Out of scope for this pass** (the brief names only :571
and the hours doorway) and **not touched** — flagged for whoever owns F5/the
:470 case next, with the exact command and error above as a starting point.

## Gates run

| Gate | Command | Result |
|---|---|---|
| Item B spec, isolated | `env -u CI pnpm exec playwright test --project=chromium -g "the letterbox names the invoice without ever requesting it" tests/pay-link.spec.ts` (client-portal, local stack inline, port 3002) | **1 passed** |
| Item B full file | same, no `-g` filter, both 7-worker and `--workers=1` | **6/7 passed** — the 1 failure (`:470`) is pre-existing/out-of-scope, see above |
| Item A spec | `pnpm exec playwright test --config playwright.hours.config.ts e2e/document/hours.spec.ts` (designer-portal, `next start` on :3000, local stack inline) | **1 failed / 7 not run** (serial `test.describe`) — root-caused above, not fixed, not ours |
| Port hygiene | `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `-iTCP:3002` before and after | both empty after this pass |

**Not run:** the designer-portal build was rebuilt twice (`next build
--webpack`) solely to pick up temporary debug instrumentation for item A's
root-cause pass; both rebuilds were discarded along with the instrumentation
before this log was written; nothing from either rebuild is committed. No
migrations were touched by this pass.

---

# Six OURS reds — root causes

Scope: the six Playwright failures classified OURS in
`build/integration-report.md` §10. Every fix below is TEST-SIDE. No product
source was changed: each ruled face these six reach for is present and
correct, and the evidence for that is a green run of the same assertion
against a clean stack.

Environment for every run below: local prod builds (`next start`) on :3000 and
:3002 against the local Supabase stack, after `pnpm supabase:reset`. The edge
runtime was served from THIS checkout's `supabase/functions` with
`EMAIL_DEV_MODE=dry_run` (`infra/runbooks/email-local-dev.md:10`), passed
through `supabase functions serve --env-file` from a path outside the repo — no
`.env` file was created anywhere in the tree.

## 1 · `add-client-letter.spec.ts:47` — `getByLabel('A line for Dave')` timeout

**Two layers, neither of them product.**

*(a) The reported timeout was an env gap.* The whole letter block — the
checkbox, `LetterLineField`, and the `ADD AND SEND THE LETTER` button label —
lives behind `useFeatureFlag("client-invite-letter")`
(`add-person-sheet.tsx:342-344`, consumed at `:1235-1274` and `:1767`).
`use-feature-flag.ts` reads the static `process.env.NEXT_PUBLIC_FLAG_OVERRIDES`,
which Next inlines AT BUILD TIME. `playwright.config.ts` declares that override
in its own `webServer.env` (`:103-123`), and that block is not applied when a
server is already running — so the re-run's hand-built bundle never carried the
flag, the letter line never rendered, and the label could not resolve. Build
with the flag and the field is there. Not a product or spec defect.

*(b) With the flag on, a real spec defect surfaced underneath.* The confirmation
sentence is printed TWICE by design — the Directory's paper notice
(`directory-view.tsx:386`, `[data-directory-notice]`) and the Room's sr-only
`role="status"` announcer beside it (`people-room.tsx:700-707`,
`[data-people-announcer]`) — and the refusal THREE times (the sheet's own
`<p role="alert">` at `add-person-sheet.tsx:1733-1740`, the toaster, and the
toaster's announcer). Matched by text, `success.or(failure)` resolved to three
elements and died on strict mode instead of reporting the send. Each assertion
now names one element.

**Fixed:** spec. Both assertions target a single element.

*Note on the send itself.* Once the strict-mode death was removed, the spec did
its job and reported the truth: `Letter send failed: "send_failed"` —
`client-invite/index.ts:406`, the letter's Resend leg. The local edge runtime
carries neither `RESEND_API_KEY` nor `EMAIL_DEV_MODE`, so `getResendKey()`
(`_shared/send-email.ts:243-244`) throws. That is a local-stack gap, not a
defect: with `EMAIL_DEV_MODE=dry_run` the test passes, and every assertion stays
meaningful because the `client_invitations` snapshot row is written BEFORE the
send (`:394`) and Mailpit is asserted empty either way.

## 2 · `add-client-letter.spec.ts:115` — 'Send them the letter' uncheck timeout

Same env gap as item 1(a) — the checkbox is inside the same flagged block — and
the same duplicated-sentence problem on the assertion that follows: the
confirmation matched both the paper notice and the sr-only announcer.

**Fixed:** spec. The assertion names `[data-directory-notice]`.

## 3 · `add-sheet.spec.ts:103` — `getByLabel('Authority')` timeout

**Test-authoring, exactly as W6 QA F7 judged it.** R-J / SPEC §5.5 #16: the
authority field OPENS FROM THE ACT beside "Nothing defaulted from the
agreement.", so it never sits there looking pre-filled. `add-person-sheet.tsx`
keeps it inside `<div id={authorityFieldId} hidden={!authorityOpen}>` (`:1556`).
The input is in the DOM the whole time, so the locator resolved and then waited
out the timeout on visibility. The spec skipped the act.

**Fixed:** spec. It now asserts the sentence, clicks "Record the authority"
(`:1538-1555`), then fills the field.

## 4 · `add-sheet.spec.ts:145` — `getByRole('alert')` strict-mode collision

Next's own `__next-route-announcer__` is a `<div role="alert">` at the end of
`<body>`, so an unscoped `getByRole('alert')` resolves to two elements.

**Fixed:** spec. Scoped to the sheet — `RoomSheet`'s `role="dialog"` panel —
whose `<p role="alert">` is the refusal being asserted.

## 5 · `person-card.spec.ts:74` — Frank's row lacks the mailto to Rosa

**THE RULED FACE IS PRESENT. Neither the row nor the spec's expectation is
wrong.** R-L / SPEC §5.1 #10 is implemented: `contact-rule-line.tsx` renders
`<a data-contact-rule-route-email href="mailto:…">` whenever
`contactRouteTarget()` (`lib/document/contact-rule.ts`) resolves an email, plus
the `TelLink` for the office phone. The assertion at `:74` goes green against a
clean stack — verified serially and again in the 7-worker run below.

What made it red is upstream of the assertion, in the spec's own `addSub`
helper, and it is a **product finding worth recording even though it is not
fixed here**:

> Choosing the project fires `useProjectRecordedStudio`
> (`use-coordination.ts:2332`, the `project_recorded_studio` RPC). CR5-1 mints
> the person card only into the studio the job records —
> `add-person-sheet.tsx:818`, `if (!chain.cardId && wantsCard &&
> recordedStudioId)`. **That guard cannot tell "this job records no studio" from
> "we have not heard back yet"**: `useQuery` gives `undefined` while loading and
> `null` when resolved-none, and both are falsy. A submit that outruns the RPC
> therefore writes the seat with NO CARD, NO CHANNELS and NO RULE, while the
> sheet reports success and prints the CR5-1 `noBookClause` sentence (`:827`)
> that was written for a settled fact.
>
> Measured, mid-run, against the DB: the seat lands as
> `Rosa Delgado 7vjud | Okonkwo residence | studio_contact_id = NULL`, on a
> project whose `project_recorded_studio()` **is** `b0000000-…-0001`. So the
> project was right and the answer simply had not arrived. Precedent for the
> missing discipline is in the same file: the letter block renders blank while
> `letterLoading` is true (`:342-344`) rather than letting a still-loading read
> decide the face.

Also corrected while here: `addSub` picked its project with
`selectOption({ index: 1 })`, and `useProjects` orders that list
`updated_at DESC` (`use-projects.ts:130`) — so index 1 is "whichever project
moved last", which changes under `fullyParallel` whenever another spec in the
room writes. Only three of the eight seeded projects record a studio at all.

**Fixed:** spec. The project is named, not indexed, and `addSub` waits for the
in-flight resolver before filling the rest of the sheet.

## 6 · `design-build-door.spec.ts:490` — `getByTestId('letterbox')` not visible

**Two independent test defects; the product is correct under the rulings.**

*(a) The file was order-dependent but not serial.* `beforeAll` (`:332`) mints a
throwaway household per worker via `mintTurnkeyAgreement()` (`:355`), and the
config sets `fullyParallel: true`. With more than one worker the two tests split
across workers, each ran `beforeAll`, and the second test signed in as a
household that had never signed anything — no signature, no deposit draw, no
project-less invoice, and so no letterbox at all, because `letterbox-door.tsx:532`
renders `Letterbox` only when `standing.length > 0`. Reproduced exactly:
`Running 2 tests using 2 workers` → `getByTestId('letterbox')` element(s) not
found; at `--workers=1` the same test cleared `:508` and failed one line later.

*(b) The next line asserted a link name that no longer exists.* Under W4 r2
MAJOR-3 the letterbox's terminal act is an in-place disclosure `<button>` named
for the balance, with `aria-expanded`/`aria-controls` and no `href` at all
(`letterbox.tsx`). `'Open the invoice'` was retired by `b287bac26` (2026-09-08,
an ancestor of this branch's base) and appears nowhere in
`apps/client-portal/src` — the same F5 class already ruled on `pay-link.spec.ts`.

**Fixed:** spec, both halves — `test.describe.serial`, and the assertion
retargeted to the letterbox's own `Pay $8,413.40` button, the literal shape
`letterbox.test.tsx` already uses.

## Out of scope — reported, not fixed

`add-sheet.spec.ts:37` (task 1) fails on a clean reset and is NOT one of the
six. Its `cardByName` is null for a different reason: the number it types,
`(612) 555-0111`, is already on the SEEDED `studio_contacts` row
`Dana Kowalski | dana@northgate-electric.com`, so 00626's
`apply_party_rolodex_link_trg` auto-links the new seat to that seeded card
rather than minting one — confirmed mid-run as
`SEAT|Dana Kowalski 7mo1y|(612) 555-0111|d0e10000-…-011`, and confirmed to leak
by `select sc.full_name, r.reason …` returning
`Dana Kowalski | Text only. The email on file bounces. | {}` on the seeded card.
Same F4-new class that `person-card.spec.ts`'s `mobileFor()` helper already
solves for its own names.

## Gates

| Gate | Command | Result |
|---|---|---|
| Designer types | `pnpm --dir WT --filter @patina/designer-portal type-check` | **clean** |
| Client types | `pnpm --dir WT --filter @patina/client-portal type-check` | **1 pre-existing error**, `.next/types/app/page.ts(37,29)` — generated, gitignored build output over `src/app/page.tsx`'s optional `props?`, authored 2026-09-07 in `7ff6c085d`; unrelated to this pass |
| Edited specs | `tsc --noEmit` over `e2e/people/**` and `tests/design-build-door.spec.ts` | **clean** — both portals' `tsconfig.json` `exclude` `**/*.spec.ts`, so the portal type-check does not cover these files at all |
| Targeted e2e, designer | 3 spec files, `--project=chromium`, prod build on :3000, after `supabase:reset` | **6 passed / 1 failed** — the failure is `add-sheet.spec.ts:37`, out of scope above |
| Targeted e2e, client | `tests/design-build-door.spec.ts`, prod build on :3002 | **2 passed** |
| Port hygiene | `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `-iTCP:3002` after the pass | both empty |

## R-CD — Add sheet studio-loading race

**Root cause.** `useProjectRecordedStudio` answers `undefined` until it
resolves, and `recordedStudioId` is read by three writes: the firm-card mint
(`add-person-sheet.tsx:764`), the person-card mint (`:826`) and the
`noBookClause` sentence (`:835`, `=== null`). The first two are guarded by a
falsey check and the third by an equality check, so an UNRESOLVED read fell
through every one of them: the seat was written, no card was minted, and the
sentence that says the number rides on the seat was not printed. The seat came
out cardless in silence on a job that in fact keeps a book. `a32d557bf` held the
act while `isLoading` was true, which closes only the first-fetch window.

**The fix.** The hold turns on the state the writes actually read —
`recordedStudioId === undefined` — not on `isLoading`. Two further ways to
reach `undefined` with `isLoading === false` were live: `react-query.ts:180-191`
sets `retry: false` for a non-network error, so an RPC failure parks at
`status: 'error'` / `fetchStatus: 'idle'`; and the default
`networkMode: 'online'` parks an offline fetch at `fetchStatus: 'paused'`. Both
released the act. The hold is now structural as well as presentational:
`submitParty` returns on an unresolved studio, so the three Enter-key submits
(`:1205-1206`, `:1234-1235`, `:1354-1355`) that call `submit()` straight past
the act cannot write either. It is scoped to seat kinds — a client or a maker
writes no seat and no card, and was being held for a book neither of them
reads. The held sentence differs by state: still fetching, “Checking which
studio keeps this job’s book.”; on error or paused, “Couldn’t read which studio
keeps this job’s book. Press again to try once more.”, with the held act’s
`onHeldActivate` refetching the query (the `archive-card-door.tsx:99-102`
idiom). The sibling case on the standing side is held the same way: `isOrgAdmin`
reads `useOrganizations()`, which nothing held on, so an authority grant asked
for while that list was out met the owner/admin refusal at `:900-903` AFTER the
seat, the card, the channels and the rule had been written; the act is now held
while the membership list is loading, with its own one-line sentence and no
change to the write order. Two smaller ones in the same commit: the JSDoc
`/** "a sub", "an installer" … */` was put back on `withArticle`, which the
R-CD const block had been inserted in front of; and `people-fixture.ts`’s
`mobileFor` docstring named 555-0308 as the seed’s highest number when the seed
also carries 555-0777 (the alarm company on a site record) — both still clear of
the 4000–9999 band the helper hashes into.

**The amendment.** Recorded under R-CD in `rulings.md` §3 (appended, not
renumbered): for a seat kind the submit is held whenever the recorded studio is
unresolved, whatever the reason; only a resolved value releases it — a uuid
mints the card, a resolved `null` takes the no-card path and prints
`noBookClause`.

**Gates.**

| Gate | Command | Result |
|---|---|---|
| People unit suites | `pnpm --dir WT/apps/designer-portal exec jest src/components/document/people` | **31 suites / 477 tests passed** |
| Designer types | `pnpm --dir WT --filter @patina/designer-portal type-check` | **clean** |

Four cases were added to the spec’s “the recorded studio, while it is still
resolving” describe: the act held on an error state with the press calling
`refetch` and nothing written; the act held on a paused/offline fetch with
nothing written; a client kind NOT held while the query is out; and the act held
while the membership behind an authority grant is still out, with neither the
seat nor the grant written. No server, database or Playwright command was run
for this pass — the full e2e suites were running on this worktree under another
agent.

**Second amendment (this commit, closing the re-review’s F-A / F-C / F-G).** The standing side now holds on `orgs === undefined` rather than `orgsLoading`, so an errored or offline-paused membership read no longer lets `isOrgAdmin` answer “no standing” for a real owner: while unresolved the money and draw scopes stay offered, the owner/admin notice stays silent, the act carries a fetching or a could-not-read sentence, and `onHeldActivate` refetches the membership list (F-A). The R-CD row’s Enter-key claim was wrong — no `onKeyDown` handler in this sheet reaches `submitParty` and there is no `<form>` — so the row and the guard’s docstring now call the structural guard defence in depth for a future caller, not a closed bypass (F-C). That guard also sets the sheet’s error state with the same held sentence instead of returning silently (F-G).

**Third amendment (this commit, closing the c89f8177f re-review’s F1 / F2 / F3 / F9).** The standing hold now keys on `authorityOpen && !!recordedStudioId && orgs === undefined` AND a typed phrase or figure: with no recorded studio `isOrgAdmin` is `false` whatever the list says (CR11-11), so holding there held the act on a question the sheet does not ask and suppressed the notice that is true on such a job (F1), and with the band open but empty the grant is never written, so the hold had nothing to protect and no collapse control to escape by (F2). The options, the owner/admin notice and the scope snap-back keep the wider `authorityStandingUnread` predicate — what is offered does not depend on what has been typed. `submitParty` now refuses on the standing side too, with the same sentence, mirroring the recorded-studio guard (F3). The guard’s docstring cites `use-organizations.ts:150-184` and no longer claims the hold cannot latch for a signed-in owner: only a SUCCESSFUL read cannot: an errored one latches until a press or a reconnect (`refetchOnReconnect: true`, `lib/react-query.ts:195`) (F9). Gates: `jest src/components/document/people src/components/document/roster` — 43 suites, 707 tests, all passing; `pnpm --filter @patina/designer-portal type-check` clean. No server, database or Playwright command was run for this pass.

**Fourth amendment (this commit, closing the c97040459 re-review’s F-1 / F-2 / F-6).** The third amendment’s `!!recordedStudioId` conflated a RESOLVED null with an UNRESOLVED `undefined`: while the job’s own book was still out, errored or paused, `authorityStandingUnread` answered `false`, so the owner/admin notice asserted “the studio owner’s or an admin’s to grant” and the money and draw scopes rendered disabled against an `isOrgAdmin` that had read neither the book nor the list — the F-A defect by the other road. The predicate is now `recordedStudioId !== null` (F-2). And on a job whose book resolved to NULL the authority band is not rendered at all — neither act, none of the three fields — because all four `project_party_authority_studio_*` policies (00624:989,1003,1019,1045) gate on `is_active_studio_member(project_party_recorded_studio(engagement_id))`, false for a NULL studio (00417:47), so every scope is refused there; a press with a phrase or a figure typed used to run seat → channels → rule → affiliation and only then meet that refusal, surfacing as the generic “Could not add them just now. Try again.” with `chainRef` resuming into the same doomed grant on retry. CR11-11’s “the band closes” is now true. `submitParty` carries the same rule structurally as a third guard beside the recorded-studio and standing guards, before any write, printing “This job isn’t attached to a studio yet, so there is nowhere to record the authority.” — the sheet’s own `noBookClause` opening over the Reach & access construction (`reach-access.tsx:396`); **Kody’s wording ruling is owed on that sentence** (F-1). The writer’s predicate also takes `authorityOpen` alongside the typed phrase or figure, matching the hold’s three conjuncts so the two cannot diverge if a collapse control is ever added (F-6); the household-member case that typed into the still-hidden Authority field now opens the band first, as a studio does. The F1 case asserting the owner/admin notice and the disabled money scope on a no-studio job was replaced — with no band there is no notice to suppress and no scope on offer — by five cases: the band absent on a resolved-NULL book; a phrase carried onto a no-studio job refused with nothing written; no standing asserted while the book is unresolved (loading) and while it errored; and the act held on an unread standing where only the figure was typed. Gates: `pnpm --dir WT/apps/designer-portal exec jest src/components/document/people src/components/document/roster` — 43 suites, 711 tests, all passing; `pnpm --dir WT --filter @patina/designer-portal type-check` clean. No server, database or Playwright command was run for this pass.
