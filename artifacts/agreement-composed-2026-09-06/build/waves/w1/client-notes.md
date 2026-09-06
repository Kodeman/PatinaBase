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
