# W1 client lane — adversarial review, round 2

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`
Branch: `agreement/w1-client` · `git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`

Range reviewed: `main..HEAD`, nine commits, `4c46fd97e … 9f1462c5c`.
Diff: 14 files, +2392 / −13.

---

## Verdict

**block** — one blocker (a unilateral deviation from a frozen, normative spec,
made after round 1 told the lane a ruling was required), four majors, all of
them consequences of that same deviation.

The blocker is ratifiable in one line by the orchestrator. The four majors are
not: each is a way the shipped guard either fails to close the hole it was
written for, or opens a new one.

---

## Gates, run by the reviewer

`cd` does not persist between this agent's Bash calls — a bare
`cd <worktree>` followed by `pnpm --filter` ran against the **main checkout**
and failed on a pre-existing `.next/types` error there. Every gate below was
re-run as `pnpm --dir <worktree> --filter …`; the tsc banner line names the
worktree path.

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > @patina/client-portal@0.1.0 type-check
    /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client/apps/client-portal
  > tsc --noEmit
  (clean — no diagnostics)

pnpm --dir <wt> --filter @patina/client-portal test -- --ci --coverage
  Test Suites: 129 passed, 129 total
  Tests:       1995 passed, 1995 total
  Snapshots:   1 passed, 1 total
  All files                    74.07 / 69.35 / 74.12 / 76.37   (floor 70/60/70/70 — clears)
  agreement-parts-body.tsx    100.00 / 91.30 / 100.00 / 100.00
  commercial-documents.ts      94.25 / 87.36 / 100.00 /  96.23
  commercial-document-shell.tsx 75.72 / 79.83 /  89.65 /  78.72

pnpm --dir <wt> --filter @patina/client-portal test -- --ci \
  src/components/threshold/__tests__/consent-copy.test.ts
  Tests: 27 passed, 27 total          (the sign route is genuinely untouched)
```

**Criterion K — flag-off byte-identity, proven independently.** The r1 note
that the `.snap` was committed in the same commit as the component change
(C3) is closed with evidence rather than with process. The reviewer replaced
`commercial-document-shell.tsx` with `git show main:…` and re-ran the snapshot
case:

```
Test Suites: 1 passed · Tests: 61 skipped, 1 passed · Snapshots: 1 passed
```

The committed snapshot is `main`'s tree, unregenerated. The worktree was
restored (`git diff --stat` empty afterwards). **K passes.**

Not re-run by the reviewer: `tests/threshold.spec.ts` (no dev server on :3002;
booting one and running chromium unsandboxed against the shared stack was not
worth the collision risk). The lane's reported result stands unverified:
13 passed / 1 skipped / 1 pre-existing mat-count failure.

---

## Round-1 findings — status

| id | status |
|---|---|
| C1 e2e vacuous | **fixed.** The conditional is gone; one unconditional negative assertion plus a `test.fixme` naming both halves of the missing fixture. See F-12 for the residue. |
| C2 kill switch | **addressed, but by a deviation.** See F-1 … F-6. |
| C3 snapshot provenance | **closed with evidence** (above). No action. |
| C4 duplicated `money()` | **open** — F-8. |
| C5 unreadable ceiling → affirmative sentence | **open** — F-9. |
| C6 `if (!terms) return null` above the branch | **open, and now load-bearing** — F-10. |
| C7 title trim | **open** — F-13. |
| C8 redundant `font-mono` | **open, and larger than reported** — F-14. |
| C9 `data-part-key` in the client DOM | **open** — F-15. |
| C10 two out-of-scope fixture edits | **open, expected** — F-16. |
| C11 attachment lettering past Z | **open** — F-17. |

---

## F-1 · BLOCKER — the frozen §5.2 was deviated from without a ruling

`build-sheet.md` §2.4 is titled *"The cross-lane interface (frozen; code
against this before backend merges)"*; §5.2 gives the `DesignServicesBody`
branch as literal code:

```tsx
if (bundle.parts.length > 0) {
  return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;
}
```

`contract.md`, first paragraph: *"Deviations require the orchestrator's ruling,
recorded in `rulings-2026-09-06.md`."* Round 1's C2 said the same in its fix
line: *"Orchestrator ruling required (sheet-prescribed, cross-lane)."*

What shipped (`commercial-document-shell.tsx:194`):

```tsx
if (bundle.parts.length > 0 && agreementPartsMatchTerms(bundle.parts, terms, bundle.rates)) {
```

plus ~120 new lines of `agreementPartsMatchTerms` in
`apps/client-portal/src/lib/commercial-documents.ts:400-495`.
`rulings-2026-09-06.md` carries no ruling on this — grepped; the file is
unchanged on this branch. The lane's own note states the reasoning:
*"Containments (a) and (b) are `supabase/**` … So this lane implemented (a)'s
semantics on the side of the edge it owns."* That is a lane self-ruling on a
cross-lane question it was told to escalate.

The reasoning against containment (c) (the client reading the flag) is
**correct and should be adopted into the record** — a PostHog flag resolves
against the homeowner, not the studio, so a client-side gate would both fail
open-ended and hide composed clauses from the person signing them.

**What the orchestrator has to decide** (not this reviewer): ratify the guard
as a W1 amendment to §5.2, *or* direct the backend lane to take containment
(b) (`upsert_design_services_draft` refuses while parts rows exist) and revert
the client to the sheet's two-line branch. Either way F-2 … F-5 need answers.

Severity blocker · confidence 0.9 (the deviation and the absent ruling are
both facts; the judgement of whether it should block is the orchestrator's).

---

## F-2 · MAJOR — the guard's rate-card exemption leaves C2's own hole open

`commercial-documents.ts:474-495`: the rate card is compared **only when the
`patina.role_rates` part is present**. Pinned deliberately by
`commercial-documents.test.ts:881` — *"ignores the rate rows entirely when the
rate card part was removed"*.

The exact attack C2 described walks straight through it:

1. Studio composes a flat-fee agreement under the flag — no `patina.role_rates`
   part. `upsert_agreement_parts` projects `p_rates = []`.
2. Flag off (the documented fail-closed lever).
3. In the seven-facet room the studio adds hourly roles and re-saves. Its hook
   writes the *same* ceiling / retainer / cadence / deposit values back
   (`use-commercial-documents.ts:372-395` sends the whole terms object every
   time), so all four compared keys still agree.
4. `agreementPartsMatchTerms` returns true. The composed body renders.

The homeowner reads an agreement with **no rate card at all**, signs it, and
the countersignature snapshots authority that bills hourly at rates the page
never showed. This is the same class of harm C2 named, in the one shape the
guard exempts by design.

The exemption's stated reason — *"the bundle projects every version a proposal
has ever carried … a removed rate card leaves the historical rows behind"* —
is also factually wrong at head: `_project_agreement_terms` (build sheet §3.7,
lifted from `00422:1780`) does `DELETE FROM public.proposal_service_rates
WHERE proposal_id = p_proposal_id` before every insert, so after any save
there is exactly one version's worth of rows, and a removed rate card leaves
**zero**. The exemption protects a state the projection cannot produce, while
admitting the one it can.

Fix: compare the rate card in both directions — an absent part must mean
*zero rate rows at `currentRateVersion`*, exactly as an absent ceiling part
means NULL.

Severity major · confidence 0.75.

---

## F-3 · MAJOR — hiding a part from the client inverts R8

`00575`'s bundle projection filters the client's edge on `client_visible`
(backend worktree `00575_agreement_parts.sql:2501-2508`) — that is R8 and
§3.10, correctly implemented. But `agreementPartsMatchTerms` reads *the
filtered array* and treats a missing key as the §3.7 **absent-part default**:

```ts
const retainerPart = byKey.get(RETAINER_PART_KEY);
const composedRetainer = retainerPart ? number(retainerPart.payload.cents) : 0;
if (composedRetainer !== terms.retainerAmountCents) return false;
```

A studio that marks `patina.retainer` not-client-visible still projects
`retainer_amount_cents = 300000` into the terms row. The client's bundle has
no retainer part → `composedRetainer = 0 ≠ 300000` → **divergence** → the whole
composed body falls back to today's seven-section body, which prints
`Retainer $3,000` in a 2-up panel. Hiding a part therefore (a) shows the
hidden figure and (b) deletes every composed clause from the page.

W1's rail exposes no visibility toggle (`part-kinds.ts:169` hardcodes
`clientVisible: true`, and `materialize_standard_parts` seeds all nine true),
so this is **latent in W1 and live the moment W2 ships the toggle** —
or immediately, for any caller passing `clientVisible: false` to
`upsert_agreement_parts`, which the RPC accepts today
(`00575:2038`).

Fix: the matcher must be fed the unfiltered set, or the RPC must project a
`hasHiddenMoneyParts` tell, or the matcher must not treat "absent" and
"hidden" as the same thing.

Severity major · confidence 0.85.

---

## F-4 · MAJOR — a freshly materialized agreement diverges from birth

`materialize_standard_parts` **deliberately does not re-project** (build sheet
§3.7 step 6: *"the terms row it read is already the projection"*). But two of
the nine payloads it seeds are **not** read from the terms row:

```sql
-- backend 00575:2361-2365
jsonb_build_object('depositPercent',
  COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent, 50))
-- backend 00575:2331-2344
IF jsonb_array_length(v_rate_card) = 0 THEN
  v_rate_card := COALESCE(v_defaults.rate_card, '[]'::jsonb);
END IF;
```

`furnishings_deposit_percent` is nullable with no default
(`00422:140 — ADD COLUMN … numeric;`). So:

- terms row deposit `NULL` → part seeded `50`, terms row still `NULL` →
  `composedDeposit (50) !== terms.furnishingsDepositPercent (null)` → fallback.
- no rate rows but the studio has P3 defaults with a rate card → part seeded
  with roles, `proposal_service_rates` empty → fallback.

Both hold from the instant the room is opened under the flag until the
designer's first Save. Nothing forces a Save before `Review & send`. A studio
that opens a complete draft under the flag, glances at the nine parts, and
sends ships a document the homeowner reads on the legacy body — and neither
side is told.

This one is an argument *for* containment (b) over the client guard: the
divergence predicate has to model a projection that two different writers with
two different default sets feed.

Severity major · confidence 0.7 (the SQL is read, not executed — no parts row
has been rendered against a real database by anyone in this wave).

---

## F-5 · MAJOR — the two surfaces now drift, which §4.5/§5.2 exist to prevent

`service-agreement-preview.tsx:57` (designer lane):

```ts
const composed = (parts?.length ?? 0) > 0;
```

No matcher. So "Preview client copy" renders the composed agreement whenever
parts exist, while the homeowner's page renders it only when the money still
projects. Under F-2/F-3/F-4 the studio looks at a composed preview and the
homeowner reads the seven fixed sections, with no signal anywhere.

Build sheet §4.5: *"the same table the client lane implements (§5.2), **so the
two surfaces cannot drift by accident**."* The guard makes them drift on
purpose. If the orchestrator ratifies F-1, the designer preview needs the same
predicate and a studio-facing tell.

Severity major · confidence 0.9 (both code paths read directly).

---

## F-6 · MINOR — the invariant is narrower than the note claims

`client-notes.md`: *"the homeowner never reads a figure the countersignature
will not authorize."* True for the five compared keys only. The projection also
writes `scope`, `deliverables`, `exclusions`, `terms` from the seven-facet room
(`_project_agreement_terms`, §3.7), and none of those is compared. Compose a
custom Services clause, flag off, rewrite the scope in the seven-facet room,
send: the guard holds, and the homeowner reads the composed prose while the
terms row (and every downstream reader of it) carries the rewritten scope.

Say so in the note, or compare the prose keys too.

Severity minor · confidence 0.8.

---

## F-7 · MINOR — the projection tests are self-consistent, not cross-validated

`commercial-document-shell.test.tsx:49-89` defines `projectionOf()`, a
TypeScript re-implementation of §3.7's map, and every parts fixture is built
through it. It is careful, well-motivated work — and it cannot fail when the
matcher is wrong about the *real* SQL, because both are the same author's model
of it. Three concrete places the model and `_project_agreement_terms` can
already disagree:

- `btrim(v_rate->>'roleName')` in SQL vs `text(first(role,'roleName'))` with no
  trim in `agreementPartsMatchTerms` — a padded role name diverges forever.
- `(v_rate->>'hourlyRateCents')::integer` truncates; a fractional payload value
  diverges forever.
- `furnishings_deposit_percent` is `numeric`; the payload value is whatever the
  editor wrote.

Each of these produces the same failure mode — a composed agreement that
silently renders today's body. Name this as the integration steward's first
check once 00575 is on the stack (the lane's own "Still not verified" section
already says so; this is a second signature on it).

Severity minor · confidence 0.85.

---

## F-8 · MINOR — `money()` is still duplicated, and the stated reason no longer holds

`agreement-parts-body.tsx:25-31` reimplements
`commercial-document-shell.tsx:44-50` verbatim. The comment says it is kept
local *"because the shell imports THIS module"* — but a third home has existed
all along (`apps/client-portal/src/lib/utils/format.ts`, which already exports
`formatCurrency`), and `@patina/types` now carries `agreement-copy.ts`
(F-11). Two identical formatters with nothing pinning them equal is exactly
what §4.5's one-table-two-implementations discipline is trying to avoid.

Severity minor · confidence 0.9.

---

## F-9 · MINOR — an unreadable ceiling still speaks an affirmative legal sentence

`payloadCents` (`:50-52`) returns `null` for any non-finite value, and
`CeilingLeaf` maps `null` to *"No ceiling — professional time is billed as it
is worked."* — a substantive billing statement produced from data the renderer
could not parse. Pinned deliberately by
`commercial-document-shell.test.tsx:932` (`payload: { cents: 'none' }`). Every
sibling leaf does the safer thing for the same condition: `RetainerLeaf`
(`:168`), `FlatLeaf` (`:231`), `PerPhaseLeaf` (`:261`), `ProcurementLeaf`
(`:221`) all fall back to `RecordedLine`.

Mitigating: `upsert_agreement_parts` casts `payload->>'cents'` to integer, so
`'none'` cannot reach the DB. The exposure is a hand-written or W2-written
payload, not today's writer.

Distinguish an **absent** `cents` key (stated uncapped, F-2 semantics) from an
**unreadable** value (`RecordedLine`).

Severity minor · confidence 0.7.

---

## F-10 · MINOR — `if (!terms) return null` sits above the branch, and now feeds it

`commercial-document-shell.tsx:182-183` is unchanged, and drawn that way by
§5.2 — but `terms` is now doing two jobs: it supplies `currency`, and it is
the authority the matcher holds the parts against. A parts-carrying agreement
with no `proposal_service_terms` row renders **nothing at all**, silently.
Unreachable today (`upsert_agreement_parts` always projects a terms row), and
W2's `consultation` / `furnishings_services` classes are exactly where it stops
being unreachable. Comment the coupling at minimum.

Severity minor · confidence 0.6.

---

## F-11 · MINOR — a shared copy module now exists and the client does not use it

The designer lane created `packages/types/src/agreement-copy.ts` after this
lane forked: `AGREEMENT_PART_COPY` plus `agreementRetainerActivation`,
`agreementCadenceText`, `agreementDepositLine`. Its own header says *"both
renderers must read it from here rather than repeat it."* The client renderer
hard-codes all six sentences.

Verified: the strings are byte-identical today —
`ceilingUncapped`, `retainerOnPayment`, `retainerOnExecution`, `cadenceNote`,
`recorded`, `attachmentAcknowledgment` all match
`agreement-parts-body.tsx:69, 153, 173, 174, 191, 337`. No drift **yet**.

At integration the client should import them. (Also worth the orchestrator's
note: `packages/**` was outside the designer lane's declared pathspec.)

Severity minor · confidence 0.95.

---

## F-12 · MINOR — the §6.6 e2e assertion is deferred, not delivered

The build sheet names one client e2e touchpoint: *"one assertion on an
agreement whose bundle carries parts: the part titles appear in `position`
order."* It is now a `test.fixme` with the missing fixture named in full
(00575 applied locally + a seed carrying a terms row **and** the parts that
project into it — a stronger requirement than before, because of F-1's
matcher). This is the honest shape r1 asked for, and the negative half that
did land is real. But the lane's brief says a missing item is a blocker, so it
is recorded as an open item with an owner rather than silently closed:
**the integration steward owes the fixture and the un-fixme.**

Severity minor · confidence 1.0.

---

## F-13 · NIT — title handling is still silent in both directions

`adaptAgreementParts` (`commercial-documents.ts:388`) uses
`text(first(row,'title'))` with a falsy check: `title: ''` drops the entire
part and everything it says; `title: '   '` survives and renders a blank
heading. `upsert_agreement_parts` does `btrim(part->>'title')`, so the
whitespace case cannot come from that writer — but the empty-title drop can,
and it drops a whole part of a signed instrument with no trace.

Severity nit · confidence 0.9.

---

## F-14 · NIT — the attachment eyebrow carries two redundant classes

`agreement-parts-body.tsx:332`: `className="type-meta mt-6 font-mono
text-[var(--text-muted)]"`. `.type-meta`
(`packages/patina-design-system/src/styles/typography.css`) already sets
`font-family: var(--font-meta)` (→ `var(--font-mono)`,
`globals.css:664`), `text-transform: uppercase`, **and**
`color: var(--text-muted)`. Both `font-mono` and the colour are no-ops.

Severity nit · confidence 0.95.

---

## F-15 · NIT — studio-namespace part keys reach the homeowner's page source

`PartSection` (`:296-299`) and `AttachmentLeaf` (`:326-329`) emit
`data-part-key="patina.role_rates"`. DOM attributes, not UI text, so no R7
refusal fires. The e2e depends only on `data-position` and `data-kind`.

Severity nit · confidence 0.9.

---

## F-16 · NIT — two files outside §2.3's pathspec table, one line each

`src/app/proposals/[id]/record/__tests__/page.test.tsx:50` and
`src/components/threshold/__tests__/instrument-reading.test.tsx:42` each gain
`parts: []`, forced by the new required field on `CommercialDocumentBundle`.
In-lane (`apps/client-portal/**`) and required for type-check; flag at
integration so no other lane lands the same edits.

Severity nit · confidence 1.0.

---

## F-17 · NIT — attachment lettering falls off the alphabet

`attachmentLetter(26)` returns `"27"`, so a 27th attachment reads
`ATTACHMENT 27` after `ATTACHMENT Z`. Unreachable in W1. The designer twin is
worse (`String.fromCharCode(65 + index)` with no guard at all →
`ATTACHMENT [`), which is that lane's finding, not this one's.

Severity nit · confidence 0.9.

---

## F-18 · NIT — two sentences the homeowner loses when an agreement is composed

Both are faithful to §4.5's table, so neither is a lane defect; both are
changes to what a homeowner reads, and belong in front of the orchestrator:

1. Today's body frames the rate card with *"Actual professional time is billed
   at the signed rates below, up to the authorized design amount."*
   (`commercial-document-shell.tsx:229-231`). `RateCardLeaf` carries no such
   sentence — the composed agreement states rates with no framing.
2. Today's exclusions section is headed **"Not included"** (`:275`). The
   composed one is headed by the part title, which
   `materialize_standard_parts` seeds as **"Exclusions"** (§2.4
   `defaultTitle`). Contract-ese replacing homeowner English on the homeowner's
   own page — a brand-voice regression that arrives from the backend's default
   title, not from this renderer.

Severity nit · confidence 0.85.

---

## Checks that passed

- **Vocabulary (R7).** Grepped every added line for `clause library`,
  `contract builder`, `facet`, `overdue`, `dashboard`, `gate`, `task`,
  emoji: none in any rendered string. `variant` appears only as a field name in
  code and fixtures, never in UI text.
- **No badges, count chips, red/green, checkmark-as-status, confetti** in the
  renderer. No restyling of the deployed shell beyond the branch and the
  NULL-safe ceiling read.
- **R5 — prose never carries money.** `ClauseLeaf` and `ListLeaf` print no
  figure; only `schedule` leaves do, each only its own variant's figure.
  `agreementPartsMatchTerms` ignores `custom.*` keys on both sides, matching
  §3.7's "anything else → writes nothing".
- **Sign route untouched** (§5.4) — not in the diff; `consent-copy.test.ts`
  (which reads the route off disk) passes unmodified, 27/27.
- **Adapter defensiveness** (§5.1) — absent / non-array / malformed → `[]`;
  rows missing `id`/`kind`/`title` dropped; `sourceTemplateKey` /
  `sourcePartId` never adapted, and the RPC never sends them
  (`00575:2501-2508`, enumerated keys). Sorted by `position` as a belt.
- **Attachment leaf** (§5.3) — after every non-attachment part, own rule, own
  lettered mono eyebrow, `I received this` as static text with no control and
  no submission; `attestation` never rendered. All four pinned by tests.
- **Unknown kind / unknown variant / malformed payload** — one plain line, no
  raw JSON, no throw. Pinned (`:868`, `:877`, `:932`).
- **`billingCeilingCents` widening is display-neutral** — the only consumer in
  the portal is `commercial-document-shell.tsx:204`, and `ceilingIsSet` is
  false for both `0` and `null`, so `Not yet set` still renders. Proven by the
  unregenerated snapshot.
- **T0 handshake** — `4c46fd97e` is byte-identical to the backend lane's
  `13bc4445c` (diffed). Clean cherry-pick, no fork of `@patina/types`.
- **Commit hygiene** — nine commits, Conventional subjects, no `merge(...)`,
  no trailers, explicit pathspecs; nothing outside `apps/client-portal/**`,
  the T0 `packages/types` commit, and the program docs under `build/`
  (force-added). Lane log present at `client-notes.md`.

## Not verified

- No parts row has been rendered against a real database by anyone in this
  wave. The bundle's `parts` projection, and the agreement between
  `agreementPartsMatchTerms` and the real `_project_agreement_terms`, are
  read-from-source claims only (F-4, F-7).
- `tests/threshold.spec.ts` not re-run by the reviewer.
- `pnpm lint` not run and would not mean anything for this portal (legacy
  `.eslintrc.json` under ESLint 9).
- `pnpm --filter @patina/admin-portal build` not run — no `packages/**` file
  originates in this lane beyond the shared T0 commit.
