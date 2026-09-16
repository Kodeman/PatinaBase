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
