# R30 hotfix — adversarial review, round 2

Reviewer context, separate from the implementer's. Branch `agreement/r30-origin-door`
at `96d3f0fe0`, 12 commits off `origin/main`. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-r30` (toplevel confirmed).
Nothing was deployed; no production mutation of any kind was run. Local stack read at
head 00575 and never reset.

**Verdict: fix** — no blocker, one major. The origin agreement is reachable, signable
end to end, and correctly withheld from strangers; the two round‑1 majors are genuinely
fixed. What holds the ship is one new finding on the record the fix keeps, plus four
round‑1 findings (R30‑3 through R30‑6) that were neither fixed nor named.

---

## 1. The ruling's own bar, re-proved in a real browser

Driven against the local stack from this worktree (dev server on :3002, service-role key
read out of `supabase status -o json`; the worktree carries no `.env.local`, so nothing
could reach Strata).

| claim | evidence |
|---|---|
| the door stands the origin agreement at `#door` | warm-server probe as `r30-origin-e6ef66c9@patina.dev`: `doors: 1`, `#door` heading = the agreement's title, `"One agreement is waiting for you."`, `nav: 0` |
| the retired `/proposals/<id>` lands there | same probe went to `/proposals/eef355e0-…`; landed on `/?proposal=eef355e0-…#door` with that door anchored |
| signing works end to end | real Chromium, keyboard hold on the focused act: `POST /api/proposals/97febddd-…/sign → 200 {"ok":true,"commercialState":"client_signed","newlyClientSigned":true}` |
| the signature reaches the ledger | `SELECT … FROM commercial_document_signatures` → `party_role=client`, `signed_name='Ada Vale'`, 64-char `evidence_fingerprint`, `signed_ip` set |
| the paper stays project-less | `proposals.project_id` still NULL after signing |
| a stranger cannot read it | as `client@patina.dev` (`request.jwt.claims` sub, role `authenticated`): `get_client_commercial_document_bundle('97febddd-…')` → `ERROR: commercial document … not found or access denied`; `list_client_proposals()` returns 0 of the two R30 papers |
| the project-bound paper filter did not widen | `threshold.tsx` is not in the diff at all; `commercial.projectId !== projectId` unchanged; `threshold.spec.ts` 13/14 (the one red is pre-existing drift, §3) |
| homeowner copy | new strings are `"One agreement is waiting for you."` / `"Two agreements are waiting for you."` — no gate/task/dashboard/overdue/AI, no badge, no chip, no colour-coded status |

## 2. Round-1 findings

- **R30-1 (major) — FIXED.** `partitionProposals(...).accepted` is now read through the
  same project-less `design_services` filter and hung on the house's own `Previously`.
  Browser-proved: after signing, a fresh visit shows
  `Design services agreement · … | SIGNED` and **no** empty state, where round 1 met
  "No active projects yet". See R30-9 below for what the kept line still gets wrong.
- **R30-2 (major) — FIXED.** A module-scope `OriginDoor` resolves
  `useStudioIdentity({ studioId: null, designerId: door.designerId })` per door and hands
  that name to its own `DoorGate`. `proposals` has **no** `studio_id` column (checked in
  `information_schema`), so `studioId: null` is the only honest argument — the resolver's
  designer → primary studio → org → business_name → full_name chain does the rest.
  Pinned by a two-studio jest case that signs the Ash agreement and reads
  `The Ash Studio has your signature.`
- **R30-3 (minor) — NOT FIXED, not named.** `letterbox-door.tsx:322` still holds the blank
  page on `proposalsQuery.isPending` unconditionally, coupling the studio-invoice money
  surface to an unrelated read (`retry: 2` in `providers.tsx`). Carried forward.
- **R30-4 (minor) — open by design, documented** in notes §7 and re-confirmed here:
  `resolveHouseForInstrument` returns null for a project-less paper at every household
  size, so an origin agreement sent to a household that already has a house is still
  unreachable. Outside the ruling's literal scope; needs an owner, not a fix in this lane.
- **R30-5 (nit) — NOT FIXED.** `plateAsked` (the disabled-query hold fix) still ships
  untested and unnamed; no fixture in `threshold.test.tsx` carries an invoice with
  neither `studio_id` nor `designer_id`.
- **R30-6 (nit) — WORSE.** The e2e now mints **two** households per run instead of one and
  still never cleans up. Seven `r30-origin-*@patina.dev` households on the shared stack as
  of this review (`SELECT`), two of them from this review's own run.
- **R30-7 (nit) — partly addressed.** The spec still never drives the hold gesture; it
  signs through the RPC in `beforeAll` and then reads the result in the browser. The
  reviewer drove the real gesture instead (§1) and it works.
- **R30-8 (nit) — RATIFIED.** The deviation is now declared in `active-project.ts` itself
  (comment) plus three pinning tests and notes §3. Accepted.

## 3. Gates, run by the reviewer

```
pnpm --dir <wt>/apps/client-portal type-check       → clean (tsc --noEmit, no output)
pnpm --dir <wt>/apps/client-portal test:coverage    → 129 suites / 2010 tests passed;
                                                      floors 70/60/70/70 met (jest enforces)
npx playwright test --workers=1 --project=chromium tests/origin-door.spec.ts → 3 passed
npx playwright test --workers=1 --project=chromium tests/threshold.spec.ts   → 13 passed, 1 failed
```

The one red is `threshold.spec.ts:250` — pre-existing seed drift, not this change.
`SELECT` on the stack: `client@patina.dev` owns five projects (the seed's three at
`11:56:31Z` plus two `Client User — design services agreement` houses at `12:18:25Z` and
`12:27:14Z`, both created hours before this lane's first run at `15:07Z` by another lane's
countersign) against the spec's `MULTI_OTHER_HOUSE_COUNT = 2`. It sits on the multi-house
`<Threshold>` path, which this branch does not touch. `threshold.spec.ts:158` (the TZ one)
passed. `plans-link.spec.ts` / `share-link.spec.ts` were not run.

## 4. New finding this round

**R30-9 (major, 0.9) — the record the fix keeps is permanently undated.**
`Previously` prints `entry.date` and the entry's date is `parseSourceDate(commercial.executedAt)`.
`list_client_proposals` sources that from `proposals.signed_at`, and
`_countersign_design_services_agreement_impl:370-371` is the only writer of that column —
it sets it at **countersign**. So for the entire window R30-1 exists to cover (her
signature → the studio's, days), `signed_at` is NULL and the line renders `—`.
Observed in the browser after a real signature:

```
—  |  Design services agreement · Design services agreement — t…  |  SIGNED
```

on the same page whose door receipt, inches above, reads
`… · signed 7 September · Leah Hartwell has your signature.` The house does not show this
shape in practice because a house only exists after countersign, when the date is written;
this door's *only* state is the one with no date. The jest case that covers it
(`keeps the signed agreement on the next visit…`) asserts `6 September` off a fixture
carrying `signed_at: '2026-09-06'` — a value the RPC never writes at `client_signed`, so
the assertion is green on a shape production cannot produce.

Fix: date the kept line off something that exists at `client_signed` — the client
signature's own timestamp, or `proposal.updated_at` — and correct the fixture so the test
fails against today's payload.

## 5. Smaller notes

- **R30-10 (nit).** Immediately after signing, the same agreement is on the page twice —
  the sealed door with its receipt, and the new `Previously` line. `threshold.tsx` keeps
  its sealed doors alongside `instrumentReceipts` the same way, so this is the house's
  idiom, not a divergence.
- **R30-11 (nit).** With only a sealed door standing, the page prints
  `"Nothing is waiting for you."` above a door that visibly carries her signature. True,
  but it reads oddly directly over the receipt.
- **R30-12 (nit).** `useMemo` on `origins`/`kept` depends on `pendingProposals`/
  `acceptedProposals`, which `partitionProposals` rebuilds every render, so neither memo
  ever hits. Harmless at these list sizes.
- **Hygiene.** Twelve Conventional commits, no trailers, explicit pathspecs; eleven files
  touched, all inside `apps/client-portal` plus the two gitignored program docs. No
  migration minted, no `@patina/types` change, no `.env`/`.claude`/hooks touched.

## 6. What the reviewer left on the local stack

One extra signature on `97febddd-…` (an e2e-minted throwaway household) and the two
households this review's own `origin-door.spec.ts` run created. The rows cannot be swept —
`guard_commercial_authored_child` refuses — and each household owns zero projects.
