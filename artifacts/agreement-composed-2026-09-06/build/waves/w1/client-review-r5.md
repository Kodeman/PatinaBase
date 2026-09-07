# Wave 1 · client lane — adversarial review, round 5

Reviewer: separate context, did not write the code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`
(`git -C … rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`)
Branch `agreement/w1-client` · base `main` · 21 commits `4c46fd97e … fd78e571b`.

Dispatched as "round 3" and asked to write `client-review-r3.md`. That file
already holds an earlier reviewer's round 3, and `client-review-r4.md` holds the
pass whose findings were handed to me as "prior round". Overwriting either would
destroy the record, so this pass is filed as **`client-review-r5.md`**, following
the precedent r4 set for exactly this collision.

---

## Gates, run by me

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client

pnpm turbo build --filter=@patina/types
  → 1 successful, 1 total (cache hit 4962ba85c1949a47)
  → packages/types/dist/commercial.d.ts:39 furnishingsDepositPercent: number | null
    packages/types/dist/commercial.d.ts:86 ceilingCents: number | null      (dist is current)

pnpm --filter @patina/client-portal type-check
  → tsc --noEmit — no diagnostics

pnpm --filter @patina/client-portal test
  → Test Suites: 129 passed, 129 total
    Tests:       1995 passed, 1995 total
    Snapshots:   1 passed, 1 total

pnpm --filter @patina/client-portal test:coverage
  → All files                       73.96 / 69.30 / 74.01 / 76.28   (floor 70/60/70/70)
    agreement-parts-body.tsx       100    / 91.66 / 100   / 100
    commercial-documents.ts         92.77 / 86.93 / 100   / 95.39
    commercial-document-shell.tsx   75.49 / 78.99 /  89.65/  78.49

npx playwright test tests/threshold.spec.ts --list
  → Total: 14 tests in 1 file (:417 collected)
```

E2E not executed: no stack carries 00575 and this lane may not reset or seed the
shared one.

## Build-sheet §2.3 items

| Item | State |
|---|---|
| `lib/commercial-documents.ts` — bundle learns `parts` | delivered |
| `commercial-document-shell.tsx` — `DesignServicesBody` branch | delivered, **widened** beyond the frozen §5.2 test (see F-3) |
| `components/agreement-parts-body.tsx` | delivered; every kind and every W1 variant, attachment as its own leaf, attestation drawn as nothing |
| `lib/commercial-documents.test.ts` — parts cases | delivered; all four §6.4 cases plus provenance and malformed-row cases |
| `components/__tests__/commercial-document-shell.test.tsx` | delivered; flag-off snapshot + 40 composed cases |
| `tests/threshold.spec.ts` — one assertion (§6.6) | **delivered as a conditional that cannot fail on any stack that exists** (F-4) |
| sign route NOT modified | confirmed — `git diff main...HEAD --stat -- apps/client-portal/src/app/api` is empty |
| lane log | `client-notes.md` present, force-added, honest about what was not verified |

**Flag-off byte-identity — proved, not just asserted.** The snapshot passing is
weak evidence on its own (provenance unverifiable from here). The strong proof
is the diff: inside the parts-less path the only change is hoisting
`terms.billingCeilingCents` into a local and adding a `!== null` conjunct to
`ceilingIsSet`. For every numeric value the predicate is identical, and
`nullableNumber` returns `null` exactly where `number()` returned `0` — both
render `Not yet set`. The rendered tree cannot move.

---

## Findings

### F-1 · major (0.90) — the kill switch still does not reach the homeowner; the mechanism built for it has no producer

`commercial-document-shell.tsx:196` now reads
`if (bundle.composed ?? bundle.parts.length > 0)`, and `commercial-documents.ts`
adapts `composed` from `composed` / `agreementComposed` / `agreement_composed`.
Nothing emits any of the three:

```
grep -rn "agreementComposed|'composed'|\"composed\"" \
  .codex/worktrees/agent-agr-w1-backend/supabase/migrations/00575_agreement_parts.sql packages/
  → no output
```

The bundle projection (00575:2982-2991) enumerates
`id, position, kind, variant, partKey, title, payload, required` and stops. So
`bundle.composed` is `null` on every document in the merged stack and the branch
falls through to `parts.length > 0` — precisely the state round 4 reported. R17
landed on the backend as write-side walls (`454e32cdf`), not as a read-side
signal. **The client half is correct and inert; the one-line fix is a
`'composed', EXISTS(SELECT 1 FROM proposal_agreement_parts …)` key in the bundle
RPC.** Until then: turn `agreement-parts` off after a studio composes and the
homeowner keeps reading the composed body.

### F-2 · major (0.90) — hiding every part still inverts into disclosure

Same root as F-1. The bundle filters the client edge on `client_visible`
(00575:2989-2990). With `composed` unemitted, a composed agreement whose parts
are all hidden arrives as `parts: []`, the branch falls through, and today's
seven-section body prints the scope, deliverables, exclusions, rate table,
ceiling, retainer and cadence the studio just hid. `upsert_agreement_parts`
accepts the field today (`00575:2522`
`COALESCE((e.part->>'clientVisible')::boolean, true)`); the W1 designer UI ships
no toggle (`grep clientVisible` in `…/drafting/agreement/` finds only a
`true` default and a readiness filter), so this is latent until W2 — but it is
latent behind a fix that is already written and merely unwired.

### F-3 · minor (0.85) — `composed` widens a frozen interface with no ruling, and reads two spellings no contract names

§2.4 froze the bundle addition as *"a new top-level `parts` key"*. The lane added
a second key, three accepted spellings of it, and a new required field on
`CommercialDocumentBundle`. The reasoning is sound and the tests are good, but no
ruling covers it and the backend contract was not amended, so the producer side
was never obliged to build it — which is exactly how F-1 happened. Integration
should either rule the key in (and land it in the bundle RPC) or rule it out
(and record that composition is one-way).

### F-4 · major (0.95) — §6.6's named client assertion is now green and vacuous

`threshold.spec.ts:417-467`. The `test.fixme` round 4 reported is gone; what
replaced it is:

```ts
if (await shell.getByTestId('agreement-parts-body').count()) {
  … the assertion §6.6 names …
} else {
  expect(await parts.count()).toBe(0);
}
```

On every stack that exists — no 00575, and a seed that lays the executed
agreement down with **no** `proposal_service_terms` row
(`supabase/seed/the-client-page.sql:95-118`, so `DesignServicesBody` returns
`null` before the branch) — the `else` arm runs and asserts nothing about parts.
This is a regression in *signal*, not in code: a `fixme` is visible in the run
summary; a self-satisfying conditional reports pass. §2.3's e2e item must not be
signed off until the integration steward applies 00575 and seeds one composed
agreement **with a terms row**, then confirms the first arm actually executes.

### F-5 · major (0.90) — the two surfaces still drift at R21, on the first composed agreement

Confirmed against both worktrees this round.

- Backend seeds `patina.ceiling` as `jsonb_build_object('cents', v_terms.billing_ceiling_cents)` (00575:2828-2829) and `patina.retainer` as `COALESCE(v_terms.retainer_amount_cents, 0)` (00575:2834-2839). An untouched draft carries `0`.
- Designer: `readCents` (`part-kinds.ts:257-261`) returns `0` for `0`, and `agreement-parts-body.tsx:143-159` / `:161-175` take the non-null arm → `money(0)` = **`$0`**, and the retainer additionally prints its activation sentence under a retainer that does not exist.
- Client: `isWritten` (`agreement-parts-body.tsx:60-62`) excludes `0` → **`Not yet set`**, activation sentence withheld.

The designer lane fixed the *other* half of R21 (`renderPartBody` returning
`null` drops the section, `:301-307`) but not the zero-is-unwritten half. The
client is right; the designer's live client-preview lies about what the homeowner
will read. Fix belongs in `apps/designer-portal/**`.

### F-6 · major (0.85) — a 50% furnishings deposit nobody typed prints as a term the homeowner signs

`materialize_standard_parts` seeds `patina.deposit` as
`COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent, 50)`
(00575:2830-2833), `client_visible = true`. `ProcurementLeaf:262-264` prints
`50% deposit`. R21's `isWritten` guard does not help — 50 is positive. Today's
design-services body states no deposit at all and says the opposite three
paragraphs later, in a sentence this very renderer carries verbatim: *"Furnishings
… require a separate named furnishings authorization."* Raised from round 4's
`minor` because the figure is a money term on an executed agreement, reachable on
the first composed document, and sourced from a hard-coded house constant.
Orchestrator ruling: seed the part only when a percent was actually set, or keep
the leaf off the client's copy.

### F-7 · minor (0.85) — four homeowner-copy losses and a reordering on the composed path, none ruled

Diffed against `git show main:…/commercial-document-shell.tsx:200-262`:

1. `main:210-212` frames the rate table — *"Actual professional time is billed at the signed rates below, up to the authorized design amount."* `RateCardLeaf` carries no framing sentence, so the rate card and the ceiling become two unconnected sections.
2. `Not included` (main:260) → `Exclusions` (seeded title, 00575).
3. `Rates & design authorization` (main:209) → `Role rates`.
4. `Design authorization ceiling` (main:222) → `Ceiling`, and it moves from a labelled row *inside* the rate table to a bare standalone figure, losing the words that say what the number does.
5. Order moves: today Exclusions is last-but-one and Terms precedes it; composed, Exclusions is third and Terms is last.

The renderer is faithful to §4.5 in all five — the losses are in the spec and the
seeded titles.

### F-8 · minor (0.80) — the written-authorization sentence became removable with the cadence part

`CadenceLeaf:245-247` carries *"Additional work requires written authorization
before it can be invoiced."* On `main:248` it is unconditional. R4 makes the
cadence part removable, so a studio that drops Billing cadence drops the one
sentence telling the homeowner extra work must be agreed before it can be billed.
Contrast the separate-purchase boundary, which this renderer correctly keeps
unconditional at `:400-403`.

### F-9 · minor (0.90) — F-2's NULL collapse is still in this lane's own adapter

§4.6: *"ceilingCents ?? null rendered as 'No ceiling', never as $0."*
`commercial-documents.ts:717` and `:722` still read
`number(first(authorityRaw,'ceilingCents','ceiling_cents'))` (fallback `0`) into
`ProjectAuthoritySummary extends Omit<ProjectBillingAuthoritySummary,'rates'>`
(`:238`), a type that now says `number | null`. The lane fixed exactly this class
one field over (`nullableNumber` for `billingCeilingCents`, `:302-308`) and
stopped. Latent — `grep -rn "ceilingCents|remainingCents" apps/client-portal/src`
finds no component reader — so an uncapped authority is not yet printed as `$0`;
the first reader will print it.

### F-10 · minor (0.95) — merging this branch conflicts on `packages/types/src/commercial.ts` against *both* peers

```
git merge-tree --write-tree agreement/w1-backend agreement/w1-client
  → CONFLICT (content): Merge conflict in packages/types/src/commercial.ts
git merge-tree --write-tree agreement/w1-designer agreement/w1-client
  → CONFLICT (content): Merge conflict in packages/types/src/commercial.ts
```

The whole delta is one field:

```
-  authorizedCents: number | null;   (backend, b1397519d)
+  authorizedCents: number;          (client, T0 as forked)
```

`packages/types/src/agreement.ts` and `index.ts` are byte-identical across
branches (`git diff agreement/w1-backend agreement/w1-client -- …` empty). Take
the backend's side; the client's only reader is
`commercial-documents.ts:718`, which produces a `number`, so nothing downstream
moves and `type-check` stays clean.

### F-11 · minor (0.70) — a composed agreement with every part hidden renders a signable page with one sentence on it

The F-2 fix, when it is wired, draws `<AgreementPartsBody parts={[]} />`: a
header, the separate-purchase boundary, a signature ledger and a footer. No
scope, no terms, no parties' obligations — and the sign control lives outside
`DesignServicesBody`, so the homeowner can sign it. Pinned as intended at
`commercial-document-shell.test.tsx:1037`. R4's floor says services and terms are
required parts; hiding them from the client should be a refusal at the studio
edge, not a blank page at the homeowner's.

### F-12 · minor (0.70) — `RateCardLeaf` prints `$0 / hr` for a role whose rate is missing

`agreement-parts-body.tsx:140`: `hourlyRateCents: payloadCents(role.hourlyRateCents) ?? 0`.
A role row with a null, absent or unparseable rate and a non-empty `roleName`
survives the filter and prints `$0 / hr` — R21's letter ("never prints `$0` for
an unset money part") on the one leaf that was not given the `isWritten`
treatment. Not reachable through `materialize_standard_parts` (rates come from
`proposal_service_rates.hourly_rate_cents`, `NOT NULL`), reachable through
`upsert_agreement_parts`, and the suite's malformed-rate case
(`:679`, `{ hourlyRateCents: 'lots' }`) has no `roleName`, so it is filtered out
before it can prove anything about this line. Matches the designer twin's
behaviour, so it is consistent drift rather than divergent drift.

### F-13 · nit (0.90) — the deposit percent is printed verbatim, unrounded and unclamped

`:262-264` prints `{depositPercent}%` from `payloadCents`, which accepts any
finite number. `33.333` reads `33.333% deposit`; `500` reads `500% deposit`. No
0–100 case in the suite.

### F-14 · nit (0.80) — an unparseable ceiling payload produces the affirmative "No ceiling" sentence

`payloadCents:50-52` maps any non-number to `null`, and `CeilingLeaf` maps `null`
to the uncapped legal sentence. Pinned as intended with `{cents:'none'}`. Bounded
in practice — `_project_agreement_terms` casts `(ap.payload->>'cents')::integer`,
so `22P02` fires before such a row commits through today's writer. Distinguish an
absent `cents` key (uncapped) from an unparseable one (`RecordedLine`).

### F-15 · nit (0.60) — "Markup basis" is a studio-margin label typed onto the homeowner's page

`ProcurementLeaf:251-255` types `Markup basis`, `Freight and handling`, `Terms of
sale`. Unreachable in W1 (`materialize_standard_parts` seeds `depositPercent`
alone) but `upsert_agreement_parts` accepts the fields. R13's spirit —
identities to the client, the studio's economics never — deserves a ruling before
a markup basis reaches a homeowner.

### F-16 · nit (0.70) — Retainer and Billing cadence change typographic register

Today they sit in a two-column grid under `type-meta` eyebrows
(`main:229-247`). Composed, both are promoted to `type-section-head` `<h2>` like
every other part. §4.5 says the heading is the part `title`, so the renderer is
faithful; the change to the homeowner's paper is real and unnamed. Record with
F-7.

### F-17 · nit (0.80) — the attachment eyebrow's DOM text differs from its designer twin

Client `:384-386` emits the literal `ATTACHMENT {letter} · {title}`; designer
(`…/commercial/agreement-parts-body.tsx:268`) emits `Attachment {letter} · {title}`
and uppercases in CSS. Both look the same; a screen reader and a copy-paste do
not. `ATTACHMENT` is also a sixth noun beside R7's five — the spec's choice
(§4.5, §5.3), not the lane's, but worth confirming.

### F-18 · nit (0.85) — studio-namespace part keys ship into the homeowner's DOM

`PartSection:357` and `AttachmentLeaf:381` emit
`data-part-key="patina.role_rates"`. Attributes, not copy, so no R7 refusal
fires; the e2e reads only `data-position`. The designer twin emits the same
attribute. Nothing reads it on the client — drop it if the orchestrator would
rather not ship the keys.

### F-19 · nit (0.80) — attachment lettering past Z

`attachmentLetter:66-68` returns `String(index + 1)` past 26, so a 27th
attachment reads `ATTACHMENT 27`. Unreachable in W1. The designer twin has **no**
guard — `String.fromCharCode(65 + index)` reads `Attachment [`.

### F-20 · nit (0.90) — two redundant classes on the attachment eyebrow, unfixed across five rounds

`:383` `className="type-meta mt-6 font-mono text-[var(--text-muted)]"`.
`.type-meta` already sets `font-family: var(--font-meta)` and
`color: var(--text-muted)` (`packages/patina-design-system/src/styles/typography.css:105-113`,
imported by `apps/client-portal/src/app/globals.css:1`).

### F-21 · nit (0.85, accepted) — `money()` is reimplemented verbatim from the shell

`:25-31` duplicates `commercial-document-shell.tsx:44-50` exactly. The stated
reason holds — the shell imports this module, so importing back would cycle, and
`lib/utils/format.ts` `formatCurrency` takes dollars and returns
`string | undefined`.

### F-22 · nit (0.95) — the `test` gate does not enforce the coverage floor it is credited with

`apps/client-portal/package.json:13` is `"test": "jest"` — no `--coverage`, so
`jest.config.js`'s `coverageThreshold` (70/60/70/70) is inert under the §7 gate
command, contrary to §6.4 and §7. I ran the real check: `test:coverage` clears on
every axis. Pre-existing; integration should run `test:coverage` when the floor
is the claim.

### F-23 · nit (1.00) — two files edited outside §2.3's pathspec table

`src/app/proposals/[id]/record/__tests__/page.test.tsx` and
`src/components/threshold/__tests__/instrument-reading.test.tsx` each gained
`parts: []` and `composed: null`. Both in-lane (`apps/client-portal/**`) and
forced by the two new required bundle fields, but neither is listed.

### F-24 · nit (0.50) — `required` crosses the client edge and nothing reads it

`adaptAgreementParts` adapts it and `CommercialAgreementPart` carries it; no
reader in `apps/client-portal/src`. §2.4 mandates the field, so this is
contract-driven dead weight. Note for W2.

### F-25 · nit (0.50) — duplicate part ids would collide as React keys

`:392` / `:395` key on `part.id`; `adaptAgreementParts` drops rows missing an id
but never dedupes. Unreachable through the RPC (`id` is the PK).

---

## Round-4 findings now closed

- **N-2 (shared copy module bypassed)** — RESOLVED. `packages/types/src/agreement-copy.ts` no longer exists on `agreement/w1-designer` (only a stale `dist/` artifact); the designer lane moved it to `apps/designer-portal/src/components/document/commercial/agreement-copy.ts` and its header explicitly rules the duplication: *"It is a copy, not a shared module … the client lane's renderer pins the same sentences on its side, so a change to either shows up as a failing test."* I diffed the six sentences — verbatim identical. No action.
- **N-1's second clause (naked heading over an empty part)** — RESOLVED on the designer side (`agreement-parts-body.tsx:301-307`). The first clause (`$0`) is F-5 above.

## Verdict

**fix** — no blocker. The lane's own code is the strongest part of this wave:
every §2.3 item is present, R21 is implemented correctly and pinned by 40 cases,
the flag-off path is provably byte-identical, and the gates are green. What is
outstanding is not in `apps/client-portal/**`: the `composed` signal has no
producer (F-1, F-2), the e2e fixture does not exist (F-4), the designer twin
prints `$0` where this one prints `Not yet set` (F-5), and a 50% deposit nobody
typed reaches the homeowner from a SQL `COALESCE` (F-6).
