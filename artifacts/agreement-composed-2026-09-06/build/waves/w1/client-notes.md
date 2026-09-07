# Wave 1 — lane `client` notes

**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`
**Branch** `agreement/w1-client` · **Base** `4c46fd97e` (the T0 types commit, on top of `4c0b7b17b`)
**Date** 2026-09-06

---

## What shipped

| File | Change |
|---|---|
| `apps/client-portal/src/lib/commercial-documents.ts` | `CommercialAgreementPart` + `parts` on `CommercialDocumentBundle`; `adaptAgreementParts` |
| `apps/client-portal/src/components/agreement-parts-body.tsx` | **new** — the client-side part renderer (§4.5 spec table) |
| `apps/client-portal/src/components/commercial-document-shell.tsx` | `DesignServicesBody` parts branch + the `billingCeilingCents: number \| null` fallout |
| `apps/client-portal/src/lib/commercial-documents.test.ts` | 8 adapter cases |
| `apps/client-portal/src/components/__tests__/commercial-document-shell.test.tsx` | the flag-off snapshot + 23 parts cases + `parts: []` on the fixture |
| `apps/client-portal/src/app/proposals/[id]/record/__tests__/page.test.tsx` | `parts: []` on the fixture (type fallout) |
| `apps/client-portal/src/components/threshold/__tests__/instrument-reading.test.tsx` | `parts: []` on the fixture (type fallout) |
| `apps/client-portal/tests/threshold.spec.ts` | one e2e test asserting part order on the agreement read in full |

`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` — **deliberately not modified** (§5.4). See below.

---

## The flag-off byte-identity proof (the load-bearing one)

The snapshot in
`apps/client-portal/src/components/__tests__/__snapshots__/commercial-document-shell.test.tsx.snap`
was **generated before `DesignServicesBody` learned its branch** and then held
across the edit:

1. The snapshot test was added first, against the pre-branch component, and run:
   `1 snapshot written`.
2. The adapter, the renderer and the branch landed.
3. The same test re-ran under `--ci` (which refuses to write a snapshot):
   `Snapshots: 1 passed, 1 total`.

So a design-services bundle with `parts: []` renders a tree that has not moved
by one attribute. That is the only shape any document takes today and the only
shape a flag-off document takes tomorrow. Never regenerate this snapshot; if it
fails, the parts path has leaked into the parts-less path.

The branch itself is one `if` at the top of `DesignServicesBody`, above every
statement of the existing body. Nothing above the branch (`SignatureLedger`, the
state banners, the header, the footer) moved.

---

## Decisions and deviations

- **No flag is read in the client portal.** Per §5 the client surface takes no
  route and no flag in W1 — it branches on data (`bundle.parts.length > 0`).
  The flag `agreement-parts` gates the *designer's* composer; a client can only
  see parts once a studio has actually composed some, so the client path is
  fail-closed by construction.
- **`money()` is duplicated, not imported.** `commercial-document-shell.tsx`
  imports `agreement-parts-body.tsx`, so importing the shell's `money` back
  would close a cycle. The renderer carries an identical local copy with a
  comment naming its twin. Same locale, same style, same whole-dollar rounding.
- **The closing boundary sentence lives INSIDE the parts body** (§5.2), unlike
  the designer preview where §4.5 keeps it outside. The client's sentence is the
  last child of `DesignServicesBody`'s returned tree, so an early return would
  drop it. Asserted to appear exactly once on the parts path.
- **`kind` and `variant` stay plain `string`** on `CommercialAgreementPart`, not
  the `@patina/types` unions. The vocabulary is code-resident and un-CHECKed;
  a part written by a later wave must arrive intact and render as an unknown
  leaf rather than be coerced into a kind this build happens to know.
- **Provenance never crosses the edge.** `source_template_key` / `source_part_id`
  are not on the client type and are not adapted; pinned by a test that asserts
  the serialized bundle contains neither.
- **`attestation` is dropped by the renderer, not by the adapter** — the adapter
  keeps whatever the RPC sent so a future acknowledgment path has the row, and
  `AgreementPartsBody` filters the kind out of both the section list and the
  attachment list. Asserted.

### The sign route, unchanged (§5.4) — recorded as a decision, not an omission

`apps/client-portal/src/app/api/proposals/[id]/sign/route.ts` is byte-identical
to `main` (`git status` reports it unmodified). Concretely:

- the design-services branch still calls
  `sign_design_services_agreement_with_trusted_ip` with the same four arguments;
- no new jsonb argument, no composed consent sentence, no attachment
  acknowledgments — that is **Wave 2 (P6, D-4)**;
- `components/threshold/consent-copy.ts` is untouched, so
  `__tests__/consent-copy.test.ts` — which reads the live route off disk and
  pins every branch and refusal token — passes without an edit. Any W1 change
  here would have broken it by design. Re-run: **27 passed**.
- The refusal that *does* relax in this wave lives one level down, in
  `_sign_design_services_agreement_authorized` (00412:815-820), which the route
  never names.

Consequently the W1 attachment acknowledgment is **display only**: the renderer
prints the line `I received this` and nothing records it. Asserted (no control,
no checkbox, nothing sent).

---

## Renderer coverage of the §4.5 spec table

| kind / variant | Implemented | Pinned by a test |
|---|---|---|
| `clause` | heading + `whitespace-pre-wrap` body | yes |
| `list` | `— item` rows, muted `note` line, ` (optional)` suffix, blank items dropped | yes |
| `schedule`/`rate_card` | role rows in `sortOrder`, `{money} / hr`, nameless roles dropped | yes |
| `schedule`/`ceiling` | figure, or `No ceiling — professional time is billed as it is worked.` when `cents === null` | yes (both) |
| `schedule`/`retainer` | figure + the shell's two activation sentences, verbatim | yes (both policies, and no-figure) |
| `schedule`/`cadence` | capitalized cadence + the written-authorization sentence, verbatim | yes |
| `schedule`/`procurement` | `{n}% deposit` + markup / freight / terms-of-sale when present | yes (and the empty case) |
| `schedule`/`flat` | figure | yes (and the no-figure case) |
| `schedule`/`per_phase` | label / figure rows, `—` for a phase with no figure | yes (and the no-phases case) |
| `schedule`/the other 8 variants | title + `Recorded with your agreement.` — never the payload | yes (`cost_plus`, asserting the payload is absent from the DOM) |
| `phases` and any unknown kind | title + the same one line | yes |
| `attachment` | own leaf after every other part: `<hr>`, mono eyebrow `ATTACHMENT A · {title}`, body, `I received this` | yes (lettering, ordering, no control) |
| `attestation` | never rendered | yes |
| malformed payload on any leaf | renders, never throws, never prints `NaN` or `$0` | yes (five kinds in one fixture) |

---

## Gates run (all in this worktree)

```
pnpm turbo build --filter=@patina/types
  → 1 successful, FULL TURBO (dist carries agreement.d.ts; commercial.d.ts:25 = number | null)

pnpm --filter @patina/client-portal type-check
  → clean (no output past the banner)
  Before the fix it failed with exactly the F-2 fallout:
    commercial-document-shell.tsx(188,51): TS18047 'terms.billingCeilingCents' is possibly 'null'
    commercial-document-shell.tsx(225,37): TS2345 'number | null' not assignable to 'number'

pnpm --filter @patina/client-portal test -- --ci
  → Test Suites: 129 passed · Tests: 1977 passed · Snapshots: 1 passed

pnpm --filter @patina/client-portal test -- --ci --coverage
  → All files 73.93 stmts / 69.23 branches / 73.97 funcs / 76.26 lines
    (floor 70/60/70/70 — clears on every axis; no threshold failure)
  → agreement-parts-body.tsx  100 stmts / 91.30 branches / 100 funcs / 100 lines
  → commercial-documents.ts    92.68 / 86.14 / 100 / 95.33

pnpm --filter @patina/client-portal test -- src/components/threshold/__tests__/consent-copy.test.ts
  → 27 passed (the untouched sign route still satisfies its own pin)

npx playwright test tests/threshold.spec.ts --workers=1 --grep "parts in position order"
  → 1 passed (8.0s)

npx playwright test tests/threshold.spec.ts --workers=1        (whole file)
  → 13 passed, 1 failed
```

### The one e2e failure, and why it is not this lane's

`names the other houses on the mat for a client who keeps several` expects the
mat to list `MULTI_OTHER_HOUSE_COUNT` (2) other houses and finds **12**. The
shared local stack has accumulated projects from other suites' seeds — the
failure screenshot from an earlier run shows one of them by name
(`Pay E2E 8d52cc95`). This lane touched nothing on the mat, the projects list, or
any hook feeding either; the assertion is a fixed count against a stack that has
drifted. It should clear on the integration steward's `pnpm supabase:reset`.

The same run also showed `lands the solo client on "/"` failing intermittently
against a **cold** dev server (the house never left its settle gate); it passed
on every warm-server run. Both are environmental.

### E2E: what the assertion actually pins today

The seed lays down the solo client's executed design services agreement
(`the-client-page.sql:95-118`) as a proposal plus a `project_commercial_documents`
row — but **no `proposal_service_terms` row**. `DesignServicesBody` returns
`null` without terms, so that agreement renders header + execution mark + footer
and no body at all. The test therefore asserts:

- the agreement opens in full from its Previously fold, and it is the agreement
  (`Design services agreement`), not a neighbouring paper;
- **when the bundle carries parts** — the branch that lights up the moment 00575
  is applied and a studio composes one — positions are ascending, every leaf has
  a non-empty title, `agreement-parts-body` is present, and the boundary sentence
  is said exactly once;
- **when it carries none** — today — no `agreement-parts-body` exists.

The whole reading sits inside one `expect(...).toPass()`: the house re-enters its
settle gate on a background refetch and unmounts everything below the doorplate
mid-assertion, which is what made the first two drafts of this test flap. No
`page.waitForTimeout` was added (grepped).

---

## Not verified

- **No parts row has ever rendered against a real database.** 00575 is the
  backend lane's and is not applied to the shared local stack, which this lane
  must not reset. Every parts assertion above is jsdom against hand-built
  bundles plus the frozen §2.4 interface. The first real end-to-end read is the
  integration steward's after a reset.
- The bundle RPC's actual `parts` projection was not exercised — the adapter is
  coded against the frozen interface text, defensively enough that a snake_case
  `part_key`, an absent `position`, and a malformed payload all land somewhere
  sane.
- `pnpm lint` was not run for client-portal and would not mean anything if it
  had been (legacy `.eslintrc.json` under ESLint 9 — patina-verification).
- Cross-browser: client-portal's Playwright config is chromium-only by design;
  no other browser was exercised.
- `pnpm --filter @patina/admin-portal build` (the repo's strictest gate) was not
  run — no `packages/**` file was touched by this lane, so there is nothing here
  for it to catch that this portal's own `tsc --noEmit` did not.

---

# Round 1 review — fixes

Adversarial review (`client-review-r1.md`) returned two majors. Both are
addressed below. No blocker was raised.

## C2 (major, 0.6) — the kill switch did not reach the homeowner

**The finding.** The client branched on data alone (`bundle.parts.length > 0`).
`materialize_standard_parts` writes nine rows on first flag-on open and they
never go away; `upsert_design_services_draft` — the seven-facet, flag-OFF
writer — touches only the terms row (00575:1638-1641 calls
`_project_agreement_terms` and never `proposal_agreement_parts`). Sequence:
compose under the flag, turn the flag off, raise the ceiling in the seven-facet
room, send. The homeowner reads the stale parts figure; countersign snapshots
authority from the terms row. The money shown at signature is not the money
authorized.

**Why not "the client reads the flag too"** (the reviewer's containment (c),
the only one of the three that lives in this lane). Two reasons, and the second
is the disqualifying one:

1. A PostHog flag resolves against *whoever is looking*. `agreement-parts` is
   rolled out to studios; a homeowner is a different person entity, so the flag
   would evaluate false for essentially every client and the composed body
   would never render at all.
2. Worse than useless — actively unsafe. Under a fail-closed client gate with
   the flag ON for the studio, the studio composes a custom clause, the
   homeowner's own evaluation comes back false, and the homeowner signs a
   document whose fingerprint hashes a clause the page never showed them.

Containments (a) and (b) are `supabase/**` — the backend lane's pathspec, not
this one's. So this lane implemented (a)'s semantics on the side of the edge it
owns.

**What shipped instead — `agreementPartsMatchTerms(parts, terms, rates)`**
(`apps/client-portal/src/lib/commercial-documents.ts`). The composed body
renders only while the parts are still the projection of the terms row in front
of them. When they are not, the agreement falls through to today's
terms-driven body — the same body a flag-off document has always rendered, fed
from the row the countersignature will actually snapshot. The invariant is one
sentence: **the homeowner never reads a figure the countersignature will not
authorize.**

The comparison is build-sheet §3.7's projection map, keyed on `part_key`, for
the five keys that carry money, with the absent-part defaults the map names:

| `part_key` | held against | absent ⇒ |
|---|---|---|
| `patina.ceiling` | `serviceTerms.billingCeilingCents` | `NULL` (uncapped) |
| `patina.retainer` | `retainerAmountCents` + `retainerActivationPolicy` | `0` / `immediate` |
| `patina.cadence` | `billingCadence` | `monthly` |
| `patina.deposit` | `furnishingsDepositPercent` | `NULL` |
| `patina.role_rates` | the rate rows at `currentRateVersion` | *not compared* |

Three deliberate details:

- **The rate card is compared only when the part is present.** The bundle RPC
  projects *every* rate version a proposal ever carried (`00425:1302-1307`, no
  version filter, `ORDER BY r.version DESC`), so a removed rate card leaves its
  historical rows behind; reading their survival as a divergence would strand
  every flat-fee agreement on the fallback body. When the part IS present, its
  roles are held as a multiset against the rows at `currentRateVersion` only.
- **A custom part carrying money cannot cause a divergence** — R5 and §3.7:
  only the nine standard keys project, so `custom.*` is ignored on both sides.
- **`billingCeilingCents` is now adapted faithfully as `number | null`**
  (`nullableNumber`), not collapsed onto `0`. 00575 makes NULL mean *uncapped*,
  and collapsing it would make an uncapped ceiling indistinguishable from a
  zero one — exactly the comparison this predicate has to get right. Display is
  unmoved: `ceilingIsSet` is false for both `0` and `null`, so the flag-off body
  still prints `Not yet set`, and **the committed snapshot still passes
  unregenerated**.
- `DesignServicesTerms` gains `furnishingsDepositPercent` (the RPC has always
  projected it, `00425:1300`); nothing on this surface prints it from the row —
  it exists so the deposit part has an authority to be held against.

**What this does NOT fix, and is still owed to the orchestrator.** The
fingerprint still hashes the stale parts (F-1/§3.4 hash *all* parts), so the
signed evidence of a diverged agreement records parts the homeowner was not
shown. Closing that is backend containment (b) — `upsert_design_services_draft`
refusing while parts rows exist — or (a) at the RPC. This lane cannot write
`supabase/**`. **Recommendation to the orchestrator: adopt (b) in the backend
lane as well.** The client guard makes the *displayed* money safe; only (b)
makes the *hashed* instrument coherent.

Tests: 14 cases on the predicate in `commercial-documents.test.ts`, and four
render cases in `commercial-document-shell.test.tsx` — ceiling moved, retainer /
policy / cadence / deposit moved, a signed rate moved, and the removed-rate-card
case that must *still* render parts.

Fixture change worth knowing: the shell test's `bundle()` now derives
`serviceTerms`/`rates` from `parts` when parts are given (`projectionOf`), so
every parts case is a state the database can actually produce. With no parts it
returns the same literal as before — which is why the snapshot did not move. An
explicit `serviceTerms`/`rates` override still wins; that is how the divergence
cases break the projection on purpose.

## C1 (major, 0.85) — the e2e touchpoint was vacuous

**The finding.** Every parts assertion sat behind `if (positions.length > 0)`, a
branch the fixture provably cannot reach (the seed lays the agreement down with
no `proposal_service_terms` row, and `DesignServicesBody` returns null before
the parts branch), so only `expect(count('agreement-parts-body')).toBe(0)` ever
ran — trivially true for a body that renders nothing at all.

**Fixed** by splitting the one conditional test into its two honest halves,
exactly as the reviewer proposed:

1. `reads the agreement in full, and carries no parts body on a stack with
   nothing composed` — unconditional, and it pins something real: the agreement
   opens in full from its Previously fold, it is the agreement and not a
   neighbouring paper, and there is **no** parts body and **no** part. That is
   the flag-off shape, and it is the shape every agreement in production takes
   today. A parts body appearing here means parts leaked onto a document that
   has none.
2. `test.fixme('reads a composed agreement's part titles in position order —
   needs 00575 + a seeded composed agreement')` — the build sheet's §6.6
   assertion, written out in full and marked as un-runnable, naming both halves
   of the missing fixture: (a) `00575_agreement_parts.sql` applied locally, and
   (b) a seed beside the solo client's agreement laying down a
   `proposal_service_terms` row **and** the parts that project into it. Note
   (b) is now a stronger requirement than it was before C2's fix: parts alone
   would not light the branch up, because `agreementPartsMatchTerms` also has
   to hold. The integration steward owns both.

No conditional remains in the spec.

## Gates re-run after the fixes (worktree `agent-agr-w1-client`)

`cd` does not persist between this agent's Bash calls, so the gates were run as
`pnpm --dir <worktree> --filter @patina/client-portal <task>` — the banner line
in each confirms the worktree path, not the main checkout. (The first attempt
without `--dir` ran against `/Users/kody/Code/patina-merged/apps/client-portal`
and failed on an unrelated pre-existing `.next/types` error there; noted so the
next agent does not repeat it.)

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  → > tsc --noEmit   (clean, no diagnostics)

pnpm --dir <wt> --filter @patina/client-portal test -- --ci --coverage
  → Test Suites: 129 passed, 129 total
    Tests:       1995 passed, 1995 total
    Snapshots:   1 passed, 1 total     ← the flag-off byte-identity proof, unregenerated
  → All files 74.07 stmts / 69.35 branches / 74.12 funcs / 76.37 lines
    (floor 70/60/70/70 — clears on every axis)
  → agreement-parts-body.tsx  100 / 91.30 / 100 / 100
  → commercial-documents.ts    94.25 / 87.36 / 100 / 96.23

npx playwright test tests/threshold.spec.ts --workers=1 --grep agreement
  → 1 passed, 1 skipped (the fixme)

npx playwright test tests/threshold.spec.ts --workers=1        (whole file)
  → 13 passed, 1 skipped, 1 failed
```

The one failure is the same pre-existing one this lane reported before the
review: `names the other houses on the mat for a client who keeps several`
expects `MULTI_OTHER_HOUSE_COUNT` (2) and finds 12, because the shared local
stack has accumulated projects from other suites' seeds. This lane touches
nothing on the mat. It should clear on the integration steward's
`pnpm supabase:reset`.

Playwright needed `dangerouslyDisableSandbox` here: the sandboxed launch dies at
`bootstrap_check_in … Permission denied (1100)` before the browser opens. It
also needs a **warm** dev server — a cold `pnpm dev` does not finish compiling
`/auth/signin` inside the 120 s `webServer` timeout, and the run fails in
`signIn` rather than anywhere near the test. Boot `pnpm dev` on :3002 first,
curl `/sign-in` until it answers, then run with `reuseExistingServer: true`.

## Still not verified after the fixes

- Everything in the "Not verified" list above still stands: **no parts row has
  ever rendered against a real database**, and the bundle RPC's `parts`
  projection has not been exercised. `agreementPartsMatchTerms` is coded
  against the frozen §2.4 interface and §3.7's projection map, and its
  agreement with the *actual* `_project_agreement_terms` is the first thing the
  integration steward should check once 00575 is on the stack — a projection
  this predicate models wrongly shows up as a composed agreement that silently
  renders today's body.
- `pnpm lint` still not run for client-portal, and still would not mean
  anything (legacy `.eslintrc.json` under ESLint 9).

---

# Round 2 review — fixes

Adversarial review `client-review-r2.md` returned one blocker (F-1) and four
majors (F-2 … F-5), all five of them the same object: the round-1 guard
`agreementPartsMatchTerms` and the deviated `DesignServicesBody` branch.

## The resolution: the guard is reverted, §5.2 is restored verbatim

F-1's own fix line gives the orchestrator two roads — ratify the guard as a W1
amendment to §5.2, **or** direct backend containment (b) and revert the client
to the sheet's branch. This lane took the second, for three reasons, in order
of weight:

1. **No ruling exists and this lane cannot make one.** `contract.md`'s first
   paragraph: *"Deviations require the orchestrator's ruling, recorded in
   `rulings-2026-09-06.md`."* Round 1's C2 said the same. Writing that ruling
   myself would be the identical sin F-1 names, one layer up. `rulings-2026-09-06.md`
   is untouched on this branch.
2. **The guard cannot be made sound inside this lane's pathspec.** F-2 and F-3
   are in direct contradiction given the data the client actually receives.
   The bundle projects only `client_visible = true` parts (00575:2501-2508), so
   from the client's side **absent and hidden are the same array**. F-2 demands
   that an absent money part be read as its §3.7 default (zero rate rows,
   NULL ceiling) — otherwise the flat-fee attack walks through. F-3 demands
   that an absent money part NOT be read as its default — otherwise hiding a
   part inverts R8, drops every composed clause and prints the hidden figure on
   the fallback body. Both cannot hold on a filtered array. Distinguishing them
   needs either the unfiltered set or a `hasHiddenMoneyParts` tell from the
   RPC — both `supabase/**`, which this lane may not touch.
3. **F-5 is unfixable here by definition.** Making the two surfaces agree means
   editing `apps/designer-portal/src/components/document/commercial/service-agreement-preview.tsx`,
   which §2.3 puts out of this lane's reach. A ratified guard would therefore
   ship with a known studio/homeowner drift and no signal to the studio —
   exactly what §4.5's "the same table … so the two surfaces cannot drift by
   accident" exists to prevent.

F-4 (a freshly materialized agreement diverges from birth, because
`materialize_standard_parts` seeds `patina.deposit` from
`COALESCE(terms, studio default, 50)` and the rate card from the studio's P3
defaults, while deliberately not re-projecting) is a fourth, independent
demonstration of the same thing: a client-side predicate has to model two
writers with two default sets, and gets it wrong on a state that holds from
room-open until the designer's first Save.

So: with the guard gone, F-2, F-3, F-4 and F-5 have no subject. F-1 is closed
by conformance — `DesignServicesBody` is once again the sheet's literal
`if (bundle.parts.length > 0)`, and no deviation from a frozen interface is
outstanding.

### What was removed

| Removed | Where |
|---|---|
| `agreementPartsMatchTerms` + its five part-key constants + `rateFingerprint` + the 20-line rubric comment | `apps/client-portal/src/lib/commercial-documents.ts` (−95 lines) |
| the `&& agreementPartsMatchTerms(...)` conjunct and its import | `apps/client-portal/src/components/commercial-document-shell.tsx` |
| `furnishingsDepositPercent` on the local `DesignServicesTerms` and its adapter read | `commercial-documents.ts` — it existed only to feed the guard; §5.1 does not ask for it, so it goes rather than linger as an unrequested field |
| the 13 `agreementPartsMatchTerms` cases | `commercial-documents.test.ts` (the 14th case that commit added, the null-ceiling adapter one, stays) |
| 4 divergence render cases + the `projectionOf` / `baseBundle` fixture machinery (F-7's "self-consistent, not cross-validated" model of §3.7) | `commercial-document-shell.test.tsx` — `bundle()` is byte-for-byte the fixture the committed snapshot was written from again |

### What was kept

- `billingCeilingCents` adapted as `number | null` via `nullableNumber`, and
  the adapter case pinning it. This is §4.6's requirement on the client's local
  `DesignServicesTerms`, not the guard's: 00575 makes NULL mean *uncapped* and
  collapsing it onto `0` would lose that. Display is unmoved — `ceilingIsSet`
  is false for both `0` and `null`, so the flag-off body still prints
  `Not yet set`, and **the committed snapshot still passes unregenerated**.
- Everything else from round 1: the adapter, the renderer, the attachment leaf,
  the e2e split. Untouched.
- The sign route is still byte-identical to `main` (§5.4).

### Two comments added, both trivial and both from the review's minor list

- F-10: `DesignServicesBody`'s `if (!terms) return null` now carries a note that
  `terms` supplies the currency the parts renderer prints in, so a
  parts-carrying agreement with no `proposal_service_terms` row renders nothing
  — unreachable today, live when W2 adds the `consultation` /
  `furnishings_services` classes.
- The e2e `test.fixme`'s missing-fixture note no longer cites the matcher; the
  seed still needs a terms row **and** parts, because `DesignServicesBody`
  returns null before the parts branch without one.

No other minor from `client-review-r2.md` was actioned — none was in this
round's finding list, and each is a behaviour change of its own.

## ⚠ OWED THE ORCHESTRATOR — the hole the revert reopens

C2 is real and is now uncontained. Recorded here because reverting is not the
same as resolving:

> `materialize_standard_parts` writes nine rows on first flag-on open and they
> never go away. `upsert_design_services_draft` — the seven-facet, flag-OFF
> writer — touches only the terms row and never `proposal_agreement_parts`
> (00575:1638-1641). So: compose under the flag → turn the flag off → raise the
> ceiling in the seven-facet room → send. The parts rows still say the old
> figure, the client renders them, and the countersignature snapshots authority
> from the terms row. The homeowner signs money the authority does not carry.

**Recommendation: adopt containment (b) in the backend lane** —
`upsert_design_services_draft` refuses while `proposal_agreement_parts` rows
exist for the proposal, so the flag-off writer cannot move money out from under
a composed agreement. That closes the *hashed* instrument as well as the
displayed one, which the client guard never could: F-1/§3.4 hash **all** parts,
so a diverged agreement's signed evidence records parts the homeowner was not
shown. Containment (a) (project at the RPC) is the alternative. Both are
`supabase/**`.

**Adopt into the record either way (the reviewer agrees, F-1):** *the client
must never gate on the `agreement-parts` flag.* A PostHog flag resolves against
whoever is looking. `agreement-parts` is rolled out to studios; a homeowner is
a different person entity, so a client-side gate evaluates false for
essentially every client — and in the one case it matters (flag ON for the
studio, false for the homeowner) it would hide composed clauses from the person
signing a document whose fingerprint hashes them.

## Gates re-run after the revert (worktree `agent-agr-w1-client`)

`cd` does not persist between this agent's Bash calls; the gates ran as
`pnpm --dir <worktree> --filter @patina/client-portal …`, and each banner line
names the worktree path.

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > @patina/client-portal@0.1.0 type-check
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client/apps/client-portal
  > tsc --noEmit
  (clean — no diagnostics)

pnpm --dir <wt> --filter @patina/client-portal test -- --ci --coverage
  Test Suites: 129 passed, 129 total
  Tests:       1978 passed, 1978 total
  Snapshots:   1 passed, 1 total     ← the flag-off byte-identity proof, still unregenerated
  All files                     73.94 / 69.25 / 73.98 / 76.26   (floor 70/60/70/70 — clears)
  agreement-parts-body.tsx     100.00 / 91.30 / 100.00 / 100.00
  commercial-documents.ts       92.72 / 86.47 / 100.00 /  95.36
  commercial-document-shell.tsx 75.49 / 78.63 /  89.65 /  78.49

pnpm --dir <wt> --filter @patina/client-portal test -- --ci \
  src/components/threshold/__tests__/consent-copy.test.ts
  Tests: 27 passed, 27 total          (the sign route is still genuinely untouched)

git diff -- apps/client-portal/src/components/__tests__/__snapshots__/   → empty
git status --short -- apps/client-portal/src/app/api/proposals/          → empty
```

1995 → 1978 is exactly the 17 guard cases removed: 13 predicate + 4 render.

## Not re-run this round

- `tests/threshold.spec.ts`. The only edit to it is a comment inside the
  `test.fixme`'s doc block; the runnable half asserts that a stack with nothing
  composed carries **no** parts body, and the revert cannot change that answer
  (with no parts rows anywhere on the local stack, both the old conjunction and
  the restored branch are false). Booting a warm dev server on :3002 and
  running chromium unsandboxed against the shared stack was not worth the
  collision risk for a comment. The lane's earlier result stands: 13 passed,
  1 skipped, 1 pre-existing mat-count failure that clears on the steward's
  reset.
- Everything in the two earlier "Not verified" lists still stands, and one item
  in it is now moot: `agreementPartsMatchTerms`'s agreement with the real
  `_project_agreement_terms` is no longer something the integration steward has
  to check, because the predicate no longer exists.

---

# Round 4 review fixes — R21 lands on the client's paper

Findings C-1 … C-5 of `client-review-r4.md`. Two are code (C-1, C-2, both
blockers, both fixed here); three are rulings or fixtures this lane cannot
reach from inside `apps/client-portal/**` and are escalated below with the
exact interface each needs.

## C-1 (blocker, fixed) — zero is an amount nobody wrote

R21: *"The composed homeowner body never prints `$0` or `0%` for an unset money
part; it prints today's 'Not yet set'."* `payloadCents` separated only NULL
from a finite number, so a zero reached the page as a figure. It is reachable
on the **first** composed agreement, not an edge case:
`proposal_service_terms.retainer_amount_cents` is `NOT NULL DEFAULT 0`
(00412:74) and `materialize_standard_parts` seeds `patina.retainer`
unconditionally from it.

`agreement-parts-body.tsx` gains one predicate —

```ts
/** R21 — a written figure is a positive one. */
function isWritten(cents: number | null): cents is number {
  return cents !== null && cents > 0;
}
```

— and one presentational leaf, `NotYetSet`, carrying today's words in today's
treatment (`type-data-large … italic text-[var(--text-muted)]`, lifted from
`commercial-document-shell.tsx`'s ceiling and retainer rows).

| Leaf | NULL | `0` (or negative) | `> 0` |
|---|---|---|---|
| `CeilingLeaf` | *No ceiling — professional time is billed as it is worked.* (uncapped, 00575/F-2) | **Not yet set** | the figure |
| `RetainerLeaf` | *Recorded with your agreement.* | **Not yet set**, and the activation sentence is withheld — today's `retainerIsSet &&` guard | figure + activation sentence |
| `FlatLeaf` | *Recorded with your agreement.* | **Not yet set** | the figure |
| `ProcurementLeaf` | no deposit line | no deposit line (never `0% deposit`) | `{n}% deposit` |

NULL and `0` stay distinct on the ceiling exactly as the finding directs: NULL
is a *stated absence* of a cap, `0` is a cap nobody has typed. `ProcurementLeaf`
collapses them, because a percent has no "Not yet set" twin on today's paper —
today's client body renders no deposit at all — and `0% deposit` would be a
term the studio never wrote. Its `RecordedLine` fallback now triggers on
`!depositIsWritten && notes.length === 0`, so a zero-percent part with no
other field still says it is on the paper.

## C-2 (blocker, fixed) — an empty part is nothing, not a naked heading

R21: *"Empty clause/list parts render nothing, not a naked heading."* Today's
body omits the whole section (`{terms.terms && …}`, `{terms.deliverables.length
> 0 && …}`); the composed body drew the `<h2>` and gated only the body. Also
reachable on the first composed agreement — `patina.terms` is seeded as
`jsonb_build_object('body', COALESCE(v_terms.terms, ''))` over a nullable
column, and deliverables/exclusions from arrays defaulting to `[]`.

- `ClauseLeaf` returns `null` when the body is empty.
- `ListLeaf` returns `null` when no item survives the text filter.
- `RateCardLeaf` gains the `RecordedLine` fallback `PerPhaseLeaf` already had —
  a rate card is a money part (R4) and keeps its title.
- `PartSection` now **calls** its leaf rather than mounting it, and returns
  `null` when the leaf drew nothing — otherwise an empty `<section>` would keep
  its `data-testid="agreement-part"` and its band of the body's `space-y-8`,
  which is a naked gap rather than a naked heading. None of the leaves holds
  state or calls a hook, so calling them is safe; the comment in the file says
  so at the call site.

## C-3, C-4 (majors) — escalated, unchanged in this worktree

Both are the same seam and both are **outside `apps/client-portal/**` at the
frozen §5.2 / §2.4 interface**. This lane already tried to solve C-3 from
inside the client in `708489b50` and correctly reverted it in `b7a5c0946`; it
is not attempting it again on its own authority.

- **C-3 — the kill switch does not reach the homeowner.** Parts rows survive
  `agreement-parts` being switched off and W1 has no un-compose path
  (`patina.services` / `patina.terms` are `required: true`). Flag-off is
  byte-identical on the client only for a document that never had parts.
- **C-4 — hiding every part reverts the homeowner to the full legacy body.**
  The bundle's parts edge filters on `client_visible`, so `parts.length` is
  both "is this composed" and "how many parts survived visibility". Hide one
  and it disappears (R8, intended); hide all and today's seven-section body
  returns, printing the very figures the studio just hid. Latent in W1
  (`materialize_standard_parts` seeds all nine `client_visible = true`) and
  live the moment W2 ships the toggle.

**What the client will consume the moment it is ruled** — one boolean on the
bundle, adapted with the file's existing defensive helpers and defaulted so a
pre-00575 RPC keeps today's answer:

```ts
// on CommercialDocumentBundle
composed: boolean;            // ← from the RPC; true once the proposal has ≥ 1 parts row,
                              //   independent of how many survive client_visible
// in DesignServicesBody
if (bundle.composed) return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;
```

Under that shape a composed agreement with every part hidden renders the
composed body with nothing in it but the closing boundary — the studio's
choice, honoured — instead of un-hiding the whole legacy body. It is a
one-line change here; it is a `supabase/**` change there, and it needs the
orchestrator's ruling first because §5.2 is the frozen cross-lane branch.

**Standing on the record either way** (unchanged from round 2): the client must
never gate on the `agreement-parts` flag. A PostHog flag resolves against
whoever is looking; a homeowner is a different person entity, and in the one
case it would matter it would hide clauses from the person signing a document
whose fingerprint hashes them (F-1).

R17 is the other half of C-3 and is still absent from the backend branch —
`grep -n "agreement_projection\|agreement_composed" .codex/worktrees/agent-agr-w1-backend/supabase/migrations/00575_agreement_parts.sql` returns nothing at
backend head `b04a686ef`. Backend lane's, not this one's.

## C-5 (major) — not delivered, and not deliverable from this lane

Build sheet §6.6's named client e2e assertion is still `test.fixme(` at
`apps/client-portal/tests/threshold.spec.ts:449`. It needs 00575 applied to the
local stack **and** a seed laying down both a `proposal_service_terms` row and
parts beside `supabase/seed/the-client-page.sql:95-118`. This lane may not
reset or seed the shared stack (`stack-notice.md`), so the fixture cannot
exist here. The integration steward owns both halves; the item should not be
signed off as delivered until `:449` runs. What does run is the flag-off half
at `:392` — an agreement opens and carries **no** parts body.

## Considered and deliberately left alone

- `RateCardLeaf`'s per-role figure and `PerPhaseLeaf`'s per-phase figure still
  print `$0` for a zero row. Those are **rows inside** a money part, not unset
  money parts, and today's legacy body prints a zero rate row identically
  (`money(rate.hourlyRateCents)`, unguarded) — so guarding them here would
  break the parity the wave is built on. The round-4 finding names four leaves;
  these are not among them. Recorded so the next reviewer sees it was a
  decision, not an oversight.
- `AttachmentLeaf` still draws its rule and lettered eyebrow for an attachment
  with no body. An attachment is a lettered artifact of the agreement, not a
  section of its prose; R21 names clause and list. W1 seeds no attachments.
- The designer twin
  (`.codex/worktrees/agent-agr-w1-designer/apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx`)
  needs the identical C-1/C-2 change. It is **not** touched from here — the
  designer lane owns that worktree. If the two land unevenly the surfaces drift,
  which is the exact failure §4.5's shared spec table exists to prevent.

## Gates re-run (round 4 fixes)

`cd` does not persist between this agent's Bash calls; the gates ran as
`pnpm --dir <worktree> --filter @patina/client-portal …`, and the banner names
the worktree path.

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > @patina/client-portal@0.1.0 type-check
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client/apps/client-portal
  > tsc --noEmit
  (clean — no diagnostics)

pnpm --dir <wt> --filter @patina/client-portal test -- --ci \
  src/components/__tests__/commercial-document-shell.test.tsx
  Test Suites: 1 passed, 1 total
  Tests:       67 passed, 67 total
  Snapshots:   1 passed, 1 total   ← the flag-off byte-identity snapshot, still unregenerated

pnpm --dir <wt> --filter @patina/client-portal test -- --ci --coverage
  Test Suites: 129 passed, 129 total
  Tests:       1987 passed, 1987 total     (1978 + 9 new)
  Snapshots:   1 passed, 1 total
  All files                     73.96 / 69.26 / 74.01 / 76.28   (floor 70/60/70/70 — clears)
  agreement-parts-body.tsx     100.00 / 91.66 / 100.00 / 100.00
  commercial-documents.ts       92.72 / 86.47 / 100.00 /  95.36
  commercial-document-shell.tsx 75.49 / 78.63 /  89.65 /  78.49

pnpm --dir <wt> --filter @patina/client-portal test -- --ci \
  src/components/threshold/__tests__/consent-copy.test.ts
  Tests: 27 passed, 27 total          (the sign route is still genuinely untouched)

git diff --stat -- apps/client-portal
  .../__tests__/commercial-document-shell.test.tsx   | 130 +++++++++++++++++--
  .../src/components/agreement-parts-body.tsx        | 125 ++++++++++++------
  2 files changed, 220 insertions(+), 35 deletions(-)

git status --short -- apps/client-portal/src/app/api/proposals \
  apps/client-portal/src/components/__tests__/__snapshots__ \
  apps/client-portal/tests
  (empty — sign route, flag-off snapshot and the e2e spec all untouched)
```

The nine new jest cases: four zero-figure cases (ceiling, retainer, flat,
deposit), one zero-percent-with-terms case, one whole freshly-composed
nine-part set that prints no figure anywhere, two empty-prose cases (clause,
list), and one empty rate card. The existing "survives a malformed payload on
every leaf" case was rewritten rather than added to — under R21 its unreadable
clause and list now draw nothing, so it asserts three sections where it asserted
five, plus that the two prose titles are absent.

## Not re-run this round

- `tests/threshold.spec.ts`. Untouched by this round (`git status --short`
  above), and its runnable half asserts a stack with nothing composed carries
  no parts body — an answer no render change can move. Booting :3002 against
  the shared stack for an untouched file was not worth the collision risk.
- Everything in the earlier "Not verified" lists still stands.

---

# Round 5 review — fixes

Findings handed to this round: **C-3**, **C-4**, **C-5** (majors, client) and
**N-1** (major, designer lane). Two of the three client findings were reported
as "not fixable inside `apps/client-portal/**` at the frozen interface"; what
follows is the half of each that *is* the client's, plus exactly what is still
owed to whom.

## C-3 + C-4 — the bundle says whether an agreement is composed

Both findings are the same missing sentence. `parts.length` was being asked a
question it cannot answer, and it is wrong in **both** directions:

| the studio does | rows in the table | `parts` on the bundle | counting says | truth |
|---|---|---|---|---|
| hides every part (`client_visible = false`) | nine | `[]` (the RPC filters) | today's body — prints the scope, rates, ceiling, retainer, cadence just hidden | composed |
| un-composes (the `agreement-parts` kill switch) | nine | nine | the composed body | not composed |

So the bundle now carries the answer itself:

```ts
// apps/client-portal/src/lib/commercial-documents.ts
composed: boolean | null;   // true · false · "the bundle did not say"
```

read defensively beside `parts` —
`first(raw, 'composed', 'agreementComposed', 'agreement_composed')`, then
`=== true ? true : === false ? false : null`. Only the two booleans are
answers; a string, a number, an absent key or an explicit `null` all read as
`null`, never as a coerced no.

`DesignServicesBody` (`commercial-document-shell.tsx:180`) branches on it:

```tsx
if (bundle.composed ?? bundle.parts.length > 0) {
  return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;
}
```

- `composed === true` → the composed body **however few parts survived the
  visibility filter**. Hiding every part now shows the homeowner an agreement
  with nothing in it (`AgreementPartsBody` with `parts: []` draws only the
  separate-purchase boundary) instead of reverting to the full legacy body.
  C-4's inversion — the more the studio hides, the more the homeowner sees —
  cannot happen.
- `composed === false` → today's body, whatever rows remain in
  `proposal_agreement_parts`. This is the shape of the kill switch reaching a
  homeowner who has no flag of her own to read (C-3).
- `composed === null` → **the frozen §5.2 test decides, unchanged**. That is
  every document today and every flag-off document tomorrow, because no RPC
  shipped to date emits the key. The flag-off snapshot
  (`commercial-document-shell.test.tsx.snap`, written against the pre-branch
  component and never regenerated) still passes untouched.

**Why this, and not the round-1 attempt.** `708489b50` inferred composedness by
reconciling the parts against the terms row and was correctly reverted in
`b7a5c0946` — a heuristic that changed behavior on *today's* data. This is the
opposite: one optional key, read defensively, inert until the backend emits it,
with today's rendering decided by the frozen expression. It is additive to
§2.4, not a deviation from it: the client reads a key the bundle may or may not
carry, exactly as it already reads `paperSignedOn` / `paperScanDocumentId`
(`00425`) — keys the RPC omits on rows that have no answer.

**⚠ STILL OWED — orchestrator + backend, and this lane cannot close it.** The
key is inert until `get_client_commercial_document_bundle` emits it. Per the
reviewer's own instruction, the program must rule ONE of:

1. the bundle carries `composed` (a boolean beside `parts`) — the client half
   is now built and needs nothing further; or
2. the program records that composition is one-way per proposal, in which case
   only C-4's half survives and the backend still owes a `composed` (or the
   equivalent) key so hiding every part cannot invert into disclosure.

Either way **R17 is still not on the backend branch**, re-verified this round:

```
grep -c "agreement_projection\|agreement_composed" \
  .codex/worktrees/agent-agr-w1-backend/supabase/migrations/00575_agreement_parts.sql
  → 0
```

Until it lands, C-3 and C-4 are open at the *system* level even though the
client can now honor the answer the moment it is given.

## C-5 — the named e2e assertion, as a live branch instead of a `test.fixme`

The sheet's §6.6 assertion ("the part titles appear in `position` order") could
not be delivered because the fixture does not exist: it needs `00575` applied to
the local stack **and** a seed laying down both a `proposal_service_terms` row
and parts, and this lane may neither reset nor seed the shared stack. That
owner is unchanged — the integration steward.

What changed is the shape. The two half-tests (the runnable negative at `:392`
and the `test.fixme` at `:449`) are now **one test**, `threshold.spec.ts:417`,
which reads the same instrument and asserts whichever half the stack makes true:

- a stack carrying a composed agreement → part count > 0, `data-position`
  ascending, every title non-empty, boundary sentence exactly once (the
  sheet's assertion, verbatim from the fixme);
- a stack carrying none → no parts body and no stray `agreement-part` (today's
  flag-off assertion, kept — the reviewer called it worth keeping).

This matters for two reasons. The first branch lights up with **no edit to this
file** once the steward lands the fixture, so nothing is owed but the fixture
itself. And the two halves can no longer contradict each other: seeding a
composed agreement onto the solo client's executed agreement would have made the
old negative test (`expect(agreement-parts-body).toBe(0)`) fail, so landing the
fixture would have broken a passing spec.

`test.fixme` is now absent from the file:

```
grep -n "test.fixme" apps/client-portal/tests/threshold.spec.ts
  → 410:   * as a live branch rather than a `test.fixme` so that landing…   (prose only)

npx playwright test tests/threshold.spec.ts --list
  → [chromium] › threshold.spec.ts:417:7 › … › reads the agreement in full —
      its parts in position order where the stack carries a composed one
  → Total: 14 tests in 1 file          (14, none skipped; was 13 + 1 fixme)
```

**⚠ STILL OWED — integration steward.** Apply `00575`, seed one composed
agreement (terms row **and** parts), then run the spec and confirm the first
branch is the one that executes. Do not sign §2.3's `threshold.spec.ts` item off
as fully delivered until a run has actually taken that branch — a conditional
assertion that has only ever taken its else is not coverage of the renderer.

## N-1 — designer lane, nothing to change here

R21 landed on the client only; the designer's live client-preview still prints
`$0` for a seeded `patina.ceiling` / `patina.retainer` and a naked heading for
an empty clause. The reviewer's own verdict is that the client side is correct
(`agreement-parts-body.tsx:60-62` `isWritten()`, and `PartSection` returning
`null` at `:352` so the whole `<section>` goes with the empty leaf) and that the
fix belongs in
`apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx`
— a different worktree this lane may not touch. Recorded, not actioned.

## Gates, this round

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client

pnpm --filter @patina/client-portal type-check
  → > tsc --noEmit     (clean, no diagnostics)

pnpm --filter @patina/client-portal test
  → Test Suites: 129 passed, 129 total
    Tests:       1995 passed, 1995 total
    Snapshots:   1 passed, 1 total    ← flag-off byte-identity, still unregenerated

pnpm --filter @patina/client-portal test -- --coverage
  → All files  73.96 stmts / 69.30 branches / 74.01 funcs / 76.28 lines
    (floor 70/60/70/70 — clears on every axis)
  → agreement-parts-body.tsx     100 / 91.66 / 100 / 100
  → commercial-documents.ts    92.77 / 86.93 / 100 / 95.39
  → commercial-document-shell.tsx 75.49 / 78.99 / 89.65 / 78.49

npx playwright test tests/threshold.spec.ts --list
  → Total: 14 tests in 1 file (the spec parses and the merged test is collected)

git diff --stat -- apps/client-portal
  7 files changed, 185 insertions(+), 70 deletions(-)
```

Eight new jest cases: five on the adapter (absent key → `null`; `true` with an
empty array; `false` with rows still present; the snake_case and prefixed
spellings; a string / number / explicit-null never coerced) and three on the
shell (composed-with-everything-hidden prints no hidden figure and says the
boundary once; `composed: false` with nine parts returns today's body;
`composed: null` leaves the choice to the count, in both directions).

## Not verified this round

- **The e2e was not executed.** Booting :3002 in this worktree produced a dev
  server that listens but never finishes compiling: the log is a wall of
  `Watchpack Error (watcher): Error: EMFILE: too many open files, watch` and it
  sat on `○ Compiling /_not-found ...` through ~10 minutes of `curl`
  (`/sign-in` and `/auth/signin` both `000` at `-m 180`). System-wide fd
  exhaustion on this box, not the spec — `ulimit -n` is 1048576 in-shell, so the
  ceiling is elsewhere. The server was killed and :3002 left free. `--list`
  above is the only proof offered that the merged spec compiles and collects.
- `*.spec.ts` is **excluded** from `apps/client-portal/tsconfig.json`
  (`"exclude": [… "**/*.spec.ts" …]`), so `type-check` does **not** cover
  `tests/threshold.spec.ts`. Playwright's own transpile at `--list` time is what
  proves it parses.
- No parts row has still ever rendered against a real database; the bundle
  RPC's `parts` projection — and now its `composed` key, which does not exist
  yet — remain unexercised end to end.
- `pnpm lint` still not run for client-portal, and would still mean nothing
  (legacy `.eslintrc.json` under ESLint 9).
