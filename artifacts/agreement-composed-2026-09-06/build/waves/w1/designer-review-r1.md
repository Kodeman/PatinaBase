# Wave 1 · designer lane — adversarial review, round 1

Reviewer context: separate from the implementer. Branch `agreement/w1-designer`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`
(`git rev-parse --show-toplevel` confirmed). Base `4c0b7b17b`, 11 commits,
`31 files changed, 6262 insertions(+), 192 deletions(-)`.

**Verdict: BLOCK.** One blocker, six majors. The composer itself is well built
and the flag-off byte-identity proof is the strongest I have seen on this
program — but the parts renderer and the composed readiness were wired into the
composer only. Three other designer surfaces still render and send the same
agreement through the legacy body, which defeats P0's own headline fix on a
sent document and can refuse a send the agreement is entitled to.

---

## Gates I ran myself

Bare `cd` into the worktree first, per the repo rule.

| Command | Result |
|---|---|
| `pnpm turbo build --filter=@patina/types` | 1 successful, FULL TURBO (cache hit; `packages/types/dist/agreement.d.ts` present) |
| `pnpm --filter @patina/designer-portal type-check` | **PASS** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal lint` | **FAIL, exit 1** — `205 problems (2 errors, 203 warnings)`. Both errors are pre-existing on `main` in files this lane never touched (`piece-room-save-gate.test.tsx:159` `import/first`; `hooks/__tests__/use-commercial-documents.test.ts:930` `rules-of-hooks`) — verified by `git show main:<file>`. Not this lane's doing; the named gate is nonetheless red. |
| `pnpm --filter @patina/designer-portal test -- <the five touched paths>` | **PASS** — 17 suites, 223 tests, **1 snapshot passed** |
| `pnpm --filter @patina/designer-portal test` (full) | **PASS** — `Test Suites: 521 passed, 521 total · Tests: 6275 passed, 6275 total · Snapshots: 2 passed` |
| `npx playwright test --list --project=chromium` (base config) | Loads `e2e/agreement/agreement-parts.spec.ts` (see D8). Fails on a missing `SUPABASE_SERVICE_ROLE_KEY` — environmental, the same failure hits pre-existing specs. |

### Flag-off byte-identity (criterion J) — verified independently, PASSES

- `git diff main ba80eee66 -- .../service-agreement-drafting-room.tsx` → **0 lines**. The
  snapshot commit changed only the test file and the `.snap`; the room was still
  main's at that point. The claim "generated on main before any W1 edit" is true.
- `git diff ba80eee66 HEAD -- .../__snapshots__/` → **empty**. The committed
  snapshot has not moved since it was generated.
- The suite passes at HEAD with the flag mocked off (`1 snapshot passed`).

That is the real proof, and it is clean. The two caveats are D7 (the Account →
Studio card is not flag-gated) and D17 (the composer is statically imported, so
its chunk is in the flag-off bundle even though the markup is identical).

---

## Findings

### D1 — BLOCKER · confidence 0.90 · Composed agreements render the legacy body everywhere but the composer

`ServiceAgreementPreview` gained `parts?` (`service-agreement-preview.tsx:54`),
but the only caller that passes it is `AgreementComposer`
(`agreement-composer.tsx:392,404`). Three other designer surfaces hold
`bundle.parts` and pass nothing:

- `commercial/commercial-document-body.tsx:36` (`ServiceAgreementDocumentBody`,
  reached from `proposal-preview.tsx:60` and `proposal-blocks-readonly.tsx:106`)
- `commercial/service-agreement-instruments.tsx:335` (the doc page's
  "Client copy preview" and its send sheet)

Consequences on a composed agreement:

1. **P0's headline fix does not hold.** A flat-fee composition removes the
   Ceiling part; the projection writes `billing_ceiling_cents = NULL`; `mapTerms`
   coerces it to `0` (D4); `ceilingIsSet` is false; the legacy body prints
   **"Not yet set"** — on a document that has been **sent**. The wave's stated P0
   is "'Not yet set' never renders on a sendable document".
2. Parts the designer removed still appear. The legacy body renders the Retainer /
   Billing cadence / Furnishings deposit grid unconditionally, so a removed
   Retainer part prints "Retainer · Not yet set" beside the composed agreement
   the client actually signed.
3. Custom parts (`custom.*`) are invisible on those surfaces — they project
   nothing, by design (R5), and nothing renders them.

Fix: pass `parts={bundle.parts}` from `commercial-document-body.tsx` and from
`service-agreement-instruments.tsx` (both already hold the bundle), and add a
case pinning that a sent composed agreement never prints `Not yet set` from
those surfaces.

### D2 — MAJOR · confidence 0.85 · The doc page's send sheet can refuse a legitimate flat-fee send (criterion M false-red)

`service-agreement-instruments.tsx:344` renders `ServiceAgreementSendSheet`
**without** `readinessOverride`, so it falls back to
`assessServiceAgreementReadiness`, which demands a role rate and a ceiling
unconditionally. "Review & send" is offered there for any draft
(`service-agreement-instruments.tsx:214-220`). A flat-fee composition — the exact
case criterion M requires to succeed — is refused from that surface while
succeeding from the composer. The lane identified this false-red and fixed it in
one of the two places it exists (notes, deviation 4).

### D3 — MAJOR · confidence 0.95 · Readiness reaches `ready: true` on an agreement that names no fee (criterion L)

R-5 tests `AUTHORITY_VARIANTS.includes(part.variant) && scheduleValueIsSet(part)`
(`readiness.ts:178-188`). `AUTHORITY_VARIANTS` contains `cadence` and `retainer`,
and `scheduleValueIsSet` answers `true` for any cadence string and for a retainer
of `0` with an activation policy (`part-kinds.ts:294-306`). A materialized
standard set therefore always satisfies the class floor.

Proven, not reasoned — a throwaway probe run under the app's own jest and then
deleted:

```
PROBE ready = true blockers = []
  parts: services(body) · role_rates{roles:[]} · ceiling{cents:null}
         · retainer{cents:0,activationPolicy:'immediate'} · cadence{monthly}
         · terms(body);  recipientEmail set
```

Criterion L names "zero money parts" as a combination that must be blocked. A
billing cadence carries no money; it should not satisfy "one typed money part for
a class that bills". The lane flagged this rather than deviating (notes,
deviation 7) — correct process, but the behaviour still ships wrong. The
narrowing that matches the blocker sentence the code itself prints ("Add a rate
card, a flat fee, or a per-phase fee") is `rate_card | flat | per_phase | ceiling`.
Needs an orchestrator ruling, then a one-line change plus a test.

### D4 — MAJOR · confidence 0.95 · `mapTerms` coerces a NULL ceiling to `0`, so F-2 never reaches the designer bundle

`hooks/use-commercial-documents.ts:220` — `billingCeilingCents: finiteCents(row.billing_ceiling_cents)`.
`finiteCents(null)` is `Math.round(Number(null))` = **0** (`:151-154`).
`nullableFiniteCents`, which does the right thing, is declared eight lines below
and is used for the authority row and the deposit percent but not here. The DTO
widened to `number | null` (§4.6, F-2) and the mapper can never produce `null`.
This is the mechanism behind D1's "Not yet set" on a sent flat-fee agreement, and
it also means flag-off readiness would call an uncapped agreement "no ceiling
set" rather than uncapped.

### D5 — MAJOR · confidence 0.85 · The designer's "client copy" and the client's actual copy have drifted on four of §4.5's ten rows

§4.5 says the designer renderer implements "the same table the client lane
implements (§5.2), so the two surfaces cannot drift by accident". Comparing
`apps/designer-portal/.../commercial/agreement-parts-body.tsx` with
`.codex/worktrees/agent-agr-w1-client/apps/client-portal/src/components/agreement-parts-body.tsx`:

| Row | Designer | Client | Sheet |
|---|---|---|---|
| `retainer` activation | `" · work begins when paid"` / `" · agreement activates immediately"` (`:155-157`) | `"Design work begins after the fully executed agreement and retainer payment."` / `"Due under the terms of the fully executed agreement."` | "the existing activation sentences (`:238-241` of the client shell, **verbatim**)" — the client lane is right, the designer lane is not |
| `cadence` label | `CADENCE_LABELS[cadence]` → "Every two weeks" (`:167`) | `cadence.replace('_',' ')` capitalized → "Biweekly" | "capitalized cadence" |
| `procurement` | `"{p}% deposit on each furnishings authorization"` (`:186`) | `"{p}% deposit"` | "`{depositPercent}% deposit` line" |
| empty part | renders **nothing at all** (`renderPartBody` → `null`, so no heading) | renders the heading, plus `RecordedLine` for the money leaves | — |

The composer labels its right rail "The client's copy · live". It is not; a
designer reading the preview will not see what the homeowner reads. Pick one
wording per row (the client shell's, per the sheet) and pin it on both sides.

### D6 — MAJOR · confidence 0.70 · A swallowed parts read can destroy a saved composition

`fetchAgreementParts` returns `[]` on **any** error (`use-commercial-documents.ts:347`),
documented as fail-soft for the pre-migration window. It also swallows an RLS
denial or a transient failure on a document that genuinely has parts. The
composer then shows an empty rail, `materialize_standard_parts` returns the
existing set (idempotent, so far so good) — but if the designer instead adds one
part and Saves, `useSaveAgreementParts` sends the whole local array to
`upsert_agreement_parts`, which **replaces wholesale**, and the stored composition
is gone. Narrow the soft-fail to a missing-relation code (`42P01` / PostgREST
`PGRST205`) and let everything else throw, or refuse Save when the last read
errored.

### D7 — MAJOR · confidence 0.75 · The P3 "Agreement defaults" card is not behind the flag

`grep -rn "agreement-parts" apps/designer-portal/src` finds exactly one gate:
`service-agreement-drafting-room.tsx:84`. The Account → Studio card
(`account-studio-page.tsx:1055+`) renders unconditionally, reads
`studio_agreement_defaults` and writes it. Program rules: "Waves ship … each
behind a fail-closed PostHog flag: `agreement-parts` (W1)"; "features are dark
until then"; "Flag-off must be byte-identical for the designer and client
surfaces in W1". The card ships lit to every studio owner the moment W1 deploys,
before Kody creates the flag. Build sheet §4.7 does not name a flag, so this may
be an intended carve-out — orchestrator call. If the card stays unflagged, say so
explicitly in the deploy set, because it changes a deployed surface with the flag
off.

### D8 — MAJOR · confidence 0.85 · The new e2e spec is collected by the base Playwright config, where the flag is off

The sheet says modify `playwright.config.ts`. The lane instead added
`playwright.agreement.config.ts` — a defensible dodge of the secret-scan trap,
matching `playwright.ship-bar.config.ts`. But the base config is
`testDir: './e2e'` with no `testIgnore`/`testMatch`
(`playwright.config.ts:29`), so `e2e/agreement/agreement-parts.spec.ts` is
collected by the ordinary `pnpm --filter @patina/designer-portal test:e2e` run —
with `NEXT_PUBLIC_FLAG_OVERRIDES` lacking `agreement-parts`, where the seven-facet
room renders and every assertion fails. Confirmed: `npx playwright test --list`
under the base config loads the file. `playwright.mood-board-visual.config.ts`
avoids exactly this by scoping on a filename (`**/*.visual.pw.ts`); do the same
(rename to e.g. `agreement-parts.agreement.pw.ts` + `testMatch` in the derived
config), or `testIgnore: '**/agreement/**'` — which cannot be done without
editing the base config, so the rename is the way.

### D9 — MINOR · confidence 0.80 · R-7 is relaxed past what §4.4 states

Sheet R-7: "a `rate_card` part present ⇒ ≥1 role with a non-blank name and
`hourlyRateCents > 0`". Implementation gates on `roles.length > 0`
(`readiness.ts:127`), so a **present but empty** rate card asks nothing. Probe
output: `PROBE empty-rate-card blockers = []`. §4.4 calls R-7 "replaces `:204`,
now conditional" — conditional on the part being present, not on it already
having a row.

### D10 — MINOR · confidence 0.80 · `flat` / `per_phase` are chipped "creates authority" while W1 records only

`parts-rail.tsx:221` chips any part whose variant is in `AUTHORITY_VARIANTS`,
which includes `flat` and `per_phase`. §4.2's add-menu column asks for those two
to carry a **record-only** chip in W1. `FlatEditor` even prints the opposite of
the rail: "Recorded on the agreement now; it starts creating billing authority in
a later release" (`part-editor.tsx:474-477`). `PerPhaseEditor` carries no note at
all. Two of the studio's three signals about the same part disagree.

### D11 — MINOR · confidence 0.90 · The non-manager Agreement-defaults view prints raw enum values

`account-studio-page.tsx:1349` `{agreementDefaults?.cadence ?? '—'}` and `:1355`
`{agreementDefaults?.retainer_credit_rule ?? '—'}` render `monthly` /
`non_refundable` to a plain member, where the manager view of the same fields
reads "Every two weeks" / "Non-refundable". Raw snake_case column values in the
studio's face, and inconsistent between roles. (R7's letter bans a column *name*;
this is a column *value*, so it is a copy defect rather than a refusal — but it
reads like a database leak either way.)

### D12 — MINOR · confidence 0.80 · `updated_by` is never written

00575 gives `studio_agreement_defaults.updated_by uuid NULL` with no default
(backend lane, `00575_agreement_parts.sql:1685`). The card's upsert
(`use-studio-agreement-defaults.ts:138-148`) never sets it, so the column is dead
on arrival and "who last changed the studio's defaults" is unanswerable.

### D13 — MINOR · confidence 0.70 · Saving a removal discards the save confirmation and the selection

The room keys the composer on `bundle.data.parts.length`
(`service-agreement-drafting-room.tsx:107`). Any Save that adds or removes a part
changes that length on the refetch, remounting the composer — which throws away
`saveNote` ("All agreement changes saved.") and resets `selectedId` to the first
part. The e2e happens not to catch it because its Save keeps the count at 9.
Keying on the document/proposal id instead would be enough.

### D14 — MINOR · confidence 0.90 · Three behaviour changes shipped without tests

`money-region.tsx:198-206` ("no ceiling" replaces `$0 remaining`),
`project-authority-band.tsx:40-93` (null ceiling → empty bar, "No ceiling"), and
`service-agreement-send-sheet.tsx:53-60` (`readinessOverride`) all changed
rendered behaviour; none of their suites was touched. The brief asks for "tests
for every behaviour you change", and criterion N is specifically about these
readers.

### D15 — NIT · confidence 0.90 · Attachment letters differ between the two renderers

Designer: `String.fromCharCode(65 + index)` (`agreement-parts-body.tsx:311`) —
index 26 yields `[`. Client: a dedicated `attachmentLetter()` that falls back to
numbers past Z. W1 authors no attachments, so it is cosmetic today.

### D16 — MINOR · confidence 0.95 · The lane notes misdescribe the types commit

`designer-notes.md` says the T0 commit "was already cherry-picked onto the branch
when the lane opened" and that "Nothing under `packages/**` … was touched by this
lane". Neither is true: the branch carries its own `bab1b9b92`, while the backend
lane carries a distinct `13bc4445c`, and `git diff main...HEAD` includes three
`packages/types` files — the pathspec §2.2 declares off-limits. **The risk is
nil**: `diff -u` shows `agreement.ts` and `commercial.ts` byte-identical across
the two worktrees, and turbo returned a cross-worktree cache hit for
`@patina/types:build`, which only happens on identical inputs. Merge will
auto-resolve. Fix the notes, not the code.

### D17 — MINOR · confidence 0.80 · The composer ships in the flag-off bundle

`service-agreement-drafting-room.tsx:24` statically imports `AgreementComposer`,
which pulls `parts-rail`, `part-editor`, `add-part-menu`, `readiness` and dnd-kit
into the chunk a flag-off designer downloads. Criterion J asks to "confirm the
composer's chunk is not in the flag-off served bundle". The *markup* is provably
identical (the snapshot), so this is weight and dead-code exposure, not
behaviour. `next/dynamic` on the one import would close it.

### D18 — NIT · confidence 0.95 · The lint gate is red, from `main`

`pnpm --filter @patina/designer-portal lint` exits 1 with 2 errors, both
pre-existing in untouched files. Recorded so the integration steward does not
read a red gate as this lane's. Scoped `eslint` over the lane's own files is
clean apart from one pre-existing unused-disable whose line number shifted.

### D19 — NIT · confidence 0.80 · Duplicate React keys are reachable in the readiness panel

`ReadinessPanel` keys both lists by their message string
(`agreement-composer.tsx:437,445`). Two `procurement` parts, both unset, push the
identical note twice (`readiness.ts:165-168`).

### D20 — NIT · confidence 0.70 · Two disagreeing "empty terms" shapes

`emptyProjection()` (`agreement-composer.tsx:466`) sets
`furnishingsDepositPercent: null`; the seven-facet room's `emptyTerms()` uses
`50`. Inert under parts (the figure never reaches the page), but the two shapes
now differ for no stated reason.

---

## What passes, checked and worth recording

- **Criterion J (flag-off byte-identity, designer)** — passes, with the provenance
  evidence above. This is the strongest part of the lane.
- **Criterion S (DTO collapse behaviour)** — passes. `COMMERCIAL_DOCUMENT_KINDS`
  widened with `trade_scope`; the only two consumers of the coerced kind compare
  against `design_services` / `service_addendum`, and every routing branch calls
  `commercialDocumentExperience` on the raw string (grepped:
  `grep -rn "kind === 'legacy'"` → no hits anywhere). Both pinning cases exist.
- **Criterion T (unknown-kind resilience)** — passes. `UnsupportedPartCard`, the
  renderer's muted line, and `scheduleValueIsSet`'s `default: true` all survive
  `kind: 'wormhole'`; no raw JSON; three tests cover it.
- **Criterion U (wave leakage)** — passes. No `save_agreement_part`,
  `save_agreement_as_template`, `materialize_agreement_template`,
  `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent` or
  `agreement_execution_snapshots` in the diff; the add menu offers blank kinds
  only; no `Save as template…`.
- **Criterion V (vocabulary/refusals)** — passes for studio-facing copy. No
  "clause library", no "contract builder"; "facet" appears only in comments and
  test names. No emoji, no badge, no count chip, no red/green, no checkmark. The
  required marker is a middot in `--color-clay-ink` (fixed in `c7cc6e209` after
  the repo's own contrast contract test caught `--color-clay`). Two exceptions
  are logged above as D11 (raw enum values) and, arguably, `UnsupportedPartCard`'s
  mono `{kind} · {variant}` chip — which §4.2 explicitly asks for, so it is not a
  finding.
- **Cross-lane RPC interface** — matches. `toPartPayload`'s element keys
  (`kind`, `variant`, `partKey`, `title`, `payload`, `required`, `clientVisible`)
  are exactly what the backend's `upsert_agreement_parts` reads
  (`00575_agreement_parts.sql`, `e.part->>'partKey'` etc.), and order is carried by
  `WITH ORDINALITY`, which is what the composer relies on.
- **R6 (freeze at send)** — the composer sets `readOnly` off `document.state !== 'draft'`
  and the rail then offers no menu, no add, no drag; Save is disabled. Covered by
  a test.
- **Billing untouched** — `account-studio-page.tsx` diff is 448 insertions, 0
  deletions; the card sits immediately after the Billing block.
- **Commit hygiene** — 11 Conventional-Commit subjects, no `merge(...)`, no
  trailers, explicit pathspecs, no stray files, working tree clean.

## Not verified by this review

- The e2e spec was never executed by anyone (it needs 00575 on the shared local
  stack, which this wave forbids the lanes from touching). D8 is reasoned from
  `--list` collection plus the configs, not from a failing run.
- No live-data walk (`DATA_MODE=live`), no browser pass.
- `pnpm --filter @patina/admin-portal build` — the repo's strictest gate for the
  `@patina/types` change — was not run here either; it belongs to integration.
- The backend lane's SQL was read only where it bounds the designer contract
  (`p_parts` element keys, `studio_agreement_defaults` shape). Its own review
  covers the rest.
