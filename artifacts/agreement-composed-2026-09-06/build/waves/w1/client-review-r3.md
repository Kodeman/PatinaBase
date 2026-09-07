# Wave 1 · client lane — adversarial review, round 3

Reviewer: separate context, did not write the code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client` (`git rev-parse --show-toplevel` confirmed)
Branch: `agreement/w1-client` · base `main` `4c0b7b17b`
Commits under review: `4c46fd97e` … `abf1d8fe4` (12)

---

## Verdict

**fix** — no blocker, two majors. Every item in §2.3's client pathspec table is delivered, both lane gates are green, and round 2's blocker is closed by conformance. The two majors are: one homeowner-facing money defect inside this lane's own renderer (R3-1), and one cross-lane hazard the revert deliberately reopened and that no lane has since closed (R3-2).

## Gates, run by the reviewer

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client
pnpm turbo build --filter=@patina/types
  1 successful, 1 total (cache hit; dist/agreement.d.ts present in this worktree)

pnpm --filter @patina/client-portal type-check
  > tsc --noEmit
  (clean — no diagnostics)

pnpm --filter @patina/client-portal test -- --ci --coverage
  Test Suites: 129 passed, 129 total
  Tests:       1978 passed, 1978 total
  Snapshots:   1 passed, 1 total
  All files                     73.94 | 69.25 | 73.98 | 76.26   (floor 70/60/70/70 — clears)
  agreement-parts-body.tsx     100.00 | 91.30 | 100.00 | 100.00
  commercial-documents.ts       92.72 | 86.47 | 100.00 |  95.36
  commercial-document-shell.tsx 75.49 | 78.63 |  89.65 |  78.49

pnpm --filter @patina/client-portal test -- --ci src/components/threshold/__tests__/consent-copy.test.ts
  Tests: 27 passed, 27 total    (the sign route is genuinely untouched)

git diff main...HEAD -- apps/client-portal/src/app/api/proposals/   → 0 lines (§5.4 honoured)
```

E2E (`test:e2e -- tests/threshold.spec.ts --workers=1`) not re-run by the reviewer: it needs a warm :3002 dev server against the shared local stack, which the integration steward owns. The only branch edit to that file since the lane last ran it is a comment inside a `test.fixme` doc block.

## Round-2 findings — disposition

| # | Round-2 finding | Now |
|---|---|---|
| F-1 | blocker — self-authorized `agreementPartsMatchTerms` in place of the frozen §5.2 branch | **FIXED.** `b7a5c0946` reverts it. `commercial-document-shell.tsx:194` is the sheet's literal `if (bundle.parts.length > 0)`. `grep -rn agreementPartsMatchTerms apps/ packages/` → 0 hits outside the notes. `rulings-2026-09-06.md` untouched — no ruling was invented. |
| F-2 | major — rate-card exemption in the guard | **MOOT.** No guard. |
| F-3 | major — `client_visible=false` read as the absent-part default | **MOOT in this lane.** Reappears in a different form as R3-3 (backend). |
| F-4 | major — materialize diverges from birth | **MOOT.** No predicate to diverge from. |
| F-5 | major — designer preview and client body on different render conditions | **FIXED.** `service-agreement-preview.tsx:57` `(parts?.length ?? 0) > 0` and the client's `bundle.parts.length > 0` are now the same condition. |
| F-6 | minor — the invariant claim covered five money keys | **MOOT.** No invariant claimed. |
| F-7 | minor — `projectionOf()` self-consistent test model | **FIXED.** Removed with the guard; `bundle()` is again the fixture the snapshot was written from. |
| F-8 | minor — duplicated `money()`, "two neutral homes exist" | **UNFIXED, and the round-2 record is corrected** — see R3-8. Downgraded to nit. |
| F-9 | minor — unreadable ceiling payload → the affirmative uncapped sentence | **UNFIXED.** Downgraded to nit on reachability evidence — see R3-7. |
| F-10 | minor — `if (!terms) return null;` doubly load-bearing | **PARTIALLY FIXED.** The coupling is now commented (`:186-193`); the structure is unchanged, which §5.2 requires. |
| F-11 | minor — `packages/types/src/agreement-copy.ts` exists on the designer branch | **UNFIXED (integration item).** Verified byte-identical to the client's six hard-coded strings today. See R3-16. |
| F-12 | minor — §6.6 assertion is a `test.fixme` | **UNCHANGED (owner: steward).** See R3-13. |
| F-13 | nit — `title: ''` drops a part | **CLOSED BY BACKEND.** See R3-14. |
| F-14 | nit — redundant classes on the attachment eyebrow | **UNFIXED.** R3-9. |
| F-15 | nit — `data-part-key` in the homeowner's DOM | **UNFIXED.** R3-10. |
| F-16 | nit — two files outside §2.3's table | **UNFIXED (expected).** R3-12. |
| F-17 | nit — `attachmentLetter` falls off the alphabet | **UNFIXED.** R3-11. |
| F-18 | nit — two sentences the homeowner loses | **UNFIXED, and larger than reported.** R3-4. |

The lane's stated reason for the revert is sound and I endorse it on the record: F-2 and F-3 cannot both hold on an array the RPC has already filtered on `client_visible`, and F-5 is unfixable inside `apps/client-portal/**`. Reverting to the frozen interface was the right call, and it correctly escalated the hole instead of papering over it.

## New findings, round 3

### R3-1 · major (0.85) — the composed body prints `$0` where today's body prints "Not yet set"

`apps/client-portal/src/components/agreement-parts-body.tsx:168` (`RetainerLeaf`), `:151` (`CeilingLeaf`), `:208` (`ProcurementLeaf`).

Today's body has one explicit protection, and its own comment says why (`commercial-document-shell.tsx:196-199`, verbatim at head):

> A brand-new agreement defaults both of these to 0 and nothing blocks a send, so an untouched figure would reach the client as a real authorized amount. An amount nobody wrote is named as unwritten.

`ceilingIsSet` / `retainerIsSet` are `Number.isFinite(x) && x > 0`, so `0` renders `Not yet set` in muted italic and the retainer's activation sentence is suppressed.

The composed body drops that test. `payloadCents` (`:50-52`) separates only `null` from a number, so `0` is a figure:

- `RetainerLeaf`: `cents === 0` → `<p class="type-data-large">$0</p>` **plus** "Due under the terms of the fully executed agreement."
- `CeilingLeaf`: `cents === 0` → `$0` (not the uncapped sentence, which is `null` only).
- `ProcurementLeaf`: `depositPercent === 0` → "0% deposit".

Reachability, retainer, first composed agreement of any studio that does not take one:
`proposal_service_terms.retainer_amount_cents integer NOT NULL DEFAULT 0` (`00412:74`); the drafting room's blank defaults are `billingCeilingCents: 0, retainerAmountCents: 0` (`service-agreement-drafting-room.tsx:55-56`); `materialize_standard_parts` seeds `patina.retainer` unconditionally with `jsonb_build_object('cents', v_terms.retainer_amount_cents, …)` (`00575:2497-2501`). Nothing anywhere refuses a zero retainer. So: studio takes no retainer → opens the Contract Room under the flag → the homeowner's agreement reads **Retainer $0 · Due under the terms of the fully executed agreement.**

Ceiling, reachable on a flat-fee agreement: `_agreement_floor_unmet` (`00575:260-289`) blocks `ceiling = 0` only when a rate card bills time. With no rate card the floor is met, the document sends, and the homeowner reads **Ceiling $0**.

This is P0's own floor line — "'Not yet set' never renders on a sendable document" (build sheet §1) — inverted on the surface it exists to protect, and it is a regression against today rather than a gap in a new feature.

Fix, in-lane: give the three leaves the same `> 0` test today's body applies, and decide per leaf what a zero states — for the ceiling, `0` and `null` are different sentences (`0` is "not yet set", `null` is "no ceiling"); for the retainer, `0` should render exactly what today renders. The designer twin (`.codex/worktrees/agent-agr-w1-designer/.../commercial/agreement-parts-body.tsx:144 :160 :214`) has the identical shape and needs the same change, or §4.5's "the two surfaces cannot drift by accident" fails on the first agreement.

### R3-2 · major (0.9) — C2 is uncontained: neither containment landed anywhere

Not this lane's file; recorded because the revert was explicitly conditional on someone taking it, and nobody has.

The lane's own escalation (client-notes.md, "⚠ OWED THE ORCHESTRATOR"): compose under the flag → flag off → raise the ceiling in the seven-facet room → send. The parts rows still carry the old figure, the client renders them, and the countersignature snapshots authority from the terms row.

Verified against the backend branch as it stands:

- `upsert_design_services_draft` (`00575:1955-2016`) contains no reference to `proposal_agreement_parts` — `grep -n "proposal_agreement_parts" ` over its body returns nothing. It calls `_project_agreement_terms(p_proposal_id, p_terms, p_rates, false)` and returns. Containment (b) not adopted.
- Nothing re-projects the parts from the terms row after a flag-off write. Containment (a) not adopted.

The hash makes it worse, not better: `_commercial_document_fingerprint` (`00575:374-378`) folds **all** parts in, so the signed evidence records the figures the homeowner was shown while `project_billing_authorities` carries the ones the seven-facet room wrote.

Orchestrator's call, backend's file. The client cannot close it — that was round 2's finding and it still holds.

### R3-3 · minor (0.75) — the R4 floor ignores `client_visible`, so a hidden ceiling satisfies it

`_agreement_floor_unmet` (`00575:260-289`) and `_agreement_requires_rate_card` (`00575:226-242`) both query `proposal_agreement_parts` with no `client_visible` predicate. The client bundle filters on it (`00575:2645-2652`).

So: rate card visible + ceiling `client_visible = false` → floor met, send allowed, and the homeowner's copy shows hourly rates with **no cap stated anywhere**. R4 is "a ceiling part is required whenever a rate card is present"; on the homeowner's page it is not.

Latent in W1 — `part-kinds.ts` hardcodes `clientVisible: true` and `materialize_standard_parts` seeds all nine `true` — but `upsert_agreement_parts` accepts `clientVisible: false` today, and W2 ships the toggle. Backend owner; the fix is one predicate, or a refusal when a money part required by the floor is hidden.

### R3-4 · minor (0.9) — four homeowner-copy changes, all spec-driven, none ruled

F-18 restated and widened, after diffing the composed body against `main`'s `DesignServicesBody` line by line:

1. **Lost sentence.** `main:210-212` frames the rate table: "Actual professional time is billed at the signed rates below, up to the authorized design amount." `RateCardLeaf` (`:113-139`) carries no framing sentence. On a composed agreement the rate card and the ceiling are two unconnected sections and nothing ties them.
2. **"Not included" → "Exclusions"** (`main:275` vs the part title `materialize_standard_parts` seeds, `00575:2487`). Contract-ese replacing homeowner English on the homeowner's page.
3. **"Rates & design authorization" → "Role rates"** (`main:209` vs `00575:2489`).
4. **"Design authorization ceiling" → "Ceiling"** (`main:245` vs `00575:2491`) — and it moves from a labelled row inside the rate table to a standalone bare figure, losing the word "authorization" that says what the number does.

The renderer is faithful to §4.5's table in all four; the losses are in the spec and in the seeded titles, so they are the orchestrator's to rule and the backend's to change. Recorded here because the client page is where a homeowner meets them.

### R3-5 · minor (0.7) — a furnishings deposit percent, seeded from a house default, now prints on the design-services agreement

`materialize_standard_parts` seeds `patina.deposit` as `COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent, 50)` (`00575:2493-2495`), and `furnishings_deposit_percent` is nullable with no default. `ProcurementLeaf:208-210` prints `{depositPercent}% deposit`.

Today's design-services body says nothing about a furnishings deposit; it says the opposite — "Furnishings … require a separate named furnishings authorization". A composed agreement now states **50% deposit** as a term of the agreement the homeowner signs, on a figure no one in the studio typed. R5 is satisfied (it is a `schedule` part), but a commitment materialized from a house constant onto a signed instrument is a product call, not a rendering one.

### R3-6 · minor (0.85) — an empty clause or list renders a naked heading

`ClauseLeaf:79` renders the heading unconditionally and the body only `{body ? … : null}`; `ListLeaf:97` the same. Today's body omits the whole section: `{terms.scope && (<section>…)}` (`main:193`), `{terms.deliverables.length > 0 && …}` (`main:200`), `{terms.exclusions.length > 0 && …}` (`main:274`), `{terms.terms && …}` (`main:261`).

Reachable on the first composed agreement: `materialize_standard_parts` seeds `patina.terms` as `jsonb_build_object('body', COALESCE(v_terms.terms, ''))` (`00575:2507-2508`) — `terms text` is nullable on `proposal_service_terms` (`00412:79`) — and seeds `patina.deliverables` / `patina.exclusions` from arrays that default `'[]'`. A studio that has not written its terms gets a **"Terms"** heading with nothing under it, and one that lists no deliverables gets a bare **"Deliverables"**.

In-lane and small: render nothing (not even the heading) when a `clause` has no body and a `list` has no items, or seed those parts only when they carry content (backend). Either way both surfaces must agree.

### R3-7 · nit (0.9) — F-9 residue, now with its reachability established

`payloadCents` returns `null` for any non-finite value, and `CeilingLeaf` maps `null` to the affirmative legal sentence "No ceiling — professional time is billed as it is worked." A payload the renderer could not parse therefore produces a statement about what the agreement says. `commercial-document-shell.test.tsx:866` pins exactly this with `payload: { cents: 'none' }`.

Reachability is now bounded: `_project_agreement_terms` casts `(ap.payload->>'cents')::integer` for both the ceiling and the retainer (`00575:2265 :2270`), so `upsert_agreement_parts` raises `22P02` on a non-numeric `cents` before the row is committed. A malformed figure cannot reach the client through today's writer. Distinguishing an absent `cents` key from an unparseable value would still be one line, and it is the difference between "recorded" and a sentence about billing.

### R3-8 · nit (0.8) — `money()` is still duplicated, and round 2's stated remedy does not exist

`agreement-parts-body.tsx:25-31` reimplements `commercial-document-shell.tsx:44-50` verbatim. Correcting the round-2 record, which named two "neutral homes" that are not:

- `apps/client-portal/src/lib/utils/format.ts:138` `formatCurrency(value?: number, currency)` takes **dollars**, not cents, and returns `string | undefined`. Not a drop-in; swapping it in would divide by 100 twice or print `undefined`.
- `packages/types/src/agreement-copy.ts` exists only on the **designer** branch and is `packages/**` — outside this lane's pathspec.

The stated reason (the shell imports this module, so importing `money` back would cycle) is correct. Leave it, or make the shared home at integration.

### R3-9 · nit (0.9) — two redundant classes on the attachment eyebrow

`agreement-parts-body.tsx:332` — `className="type-meta mt-6 font-mono text-[var(--text-muted)]"`. `packages/patina-design-system/src/styles/typography.css` `.type-meta` already sets `font-family: var(--font-meta)` (mapped to `var(--font-mono)` at `globals.css:664`) and `color: var(--text-muted)`. Unfixed from round 1 (C8) and round 2 (F-14).

### R3-10 · nit (0.85) — studio-namespace part keys ship to the homeowner's DOM

`PartSection:297` and `AttachmentLeaf:328` emit `data-part-key="patina.role_rates"`. DOM attributes, not UI text, so no R7 refusal fires, and the e2e depends only on `data-position` and `data-kind`. Drop it if the orchestrator would rather not ship part keys to the client.

### R3-11 · nit (0.9) — attachment lettering falls off the alphabet

`attachmentLetter:56` — `index < 26 ? String.fromCharCode(65 + index) : String(index + 1)`, so a 27th attachment reads "ATTACHMENT 27" after "ATTACHMENT Z". Unreachable in W1 (no writer produces attachments). The designer twin is worse: `String.fromCharCode(65 + index)` with no guard reads "Attachment [".

### R3-12 · nit (1.0) — two files outside §2.3's pathspec table

`parts: []` added at `src/app/proposals/[id]/record/__tests__/page.test.tsx:50` and `src/components/threshold/__tests__/instrument-reading.test.tsx:42`. In-lane (`apps/client-portal/**`) and forced by the new required bundle field; not listed in the sheet. Flag at integration so no other lane lands the same edits.

### R3-13 · nit (1.0) — §6.6's client e2e assertion is still owed

`tests/threshold.spec.ts:435` is a documented `test.fixme` naming both halves of the missing fixture (00575 applied locally, plus a seed laying down a `proposal_service_terms` row **and** parts). The runnable half above it asserts the agreement opens and carries no parts body, which is the flag-off shape and worth keeping. Integration steward owns the fixture and the un-fixme.

### R3-14 · nit (0.7) — F-13 is closed by the backend, not by this lane

`00575:98` — `title text NOT NULL CHECK (char_length(btrim(title)) > 0)`. An empty or whitespace title cannot exist, so `adaptAgreementParts`'s silent drop of a titleless row (`:388`) is unreachable defence rather than a hole. No action; recorded so the round-1/2 finding is not re-raised.

### R3-15 · nit (0.6) — the flag-off snapshot was committed on the branch, not demonstrably generated on `main`

Review criterion K asks for proof the snapshot predates the edit; the `.snap` file is new in `main...HEAD`, so the artefact alone proves nothing. I substituted a stronger check — a full read of `git diff main...HEAD -- commercial-document-shell.tsx`, which is two hunks:

1. the parts branch, above the existing body, returning early;
2. `const ceilingCents = terms.billingCeilingCents;` plus `ceilingCents !== null && Number.isFinite(ceilingCents) && ceilingCents > 0` in place of `Number.isFinite(terms.billingCeilingCents) && terms.billingCeilingCents > 0`, and `money(ceilingCents, …)` in place of `money(terms.billingCeilingCents, …)`.

Hunk 2 is value-identical for every input including `null` (`Number.isFinite(null)` is already `false`). Nothing else in `DesignServicesBody` moved. Flag-off byte-identity holds by construction. Note the snapshot pins the **component**; the adapter's new `null` path is pinned separately at `commercial-documents.test.ts:759`.

### R3-16 · nit (0.6) — the sheet contradicts itself on where the boundary notice lives; the client chose right

§5.2 tells this lane that `AgreementPartsBody` "also carries the closing … notice … so that sentence appears exactly once on either path". §4.5 says the notice "stays **outside** the parts body, unconditional". Because the branch returns early from `DesignServicesBody`, "outside" would mean "never", so §5.2 is the operative reading and the implementation (`:367-370`, verbatim against `main:268-271`) is correct. No double-print risk on the designer side — `grep "separate named furnishings authorization" apps/designer-portal/src/components/document/commercial/*.tsx` returns nothing; that sentence is client-only, and §4.5's "and its designer twin" refers to something that does not exist.

Related integration item (F-11): `packages/types/src/agreement-copy.ts` on the designer branch carries all six of this renderer's sentences and its header says both renderers must import them. Verified byte-identical today — `ceilingUncapped`, `retainerOnPayment`, `retainerOnExecution`, `cadenceNote`, `recorded`, `attachmentAcknowledgment` against `:69 :153 :173 :174 :191 :337`. No drift yet; import at integration.

## Checks run that found nothing

- **Sign route (§5.4).** `git diff main...HEAD -- apps/client-portal/src/app/api/proposals/` → 0 lines. `consent-copy.test.ts` 27/27 green, which reads the live route off disk.
- **Bundle interface parity.** `00575:2645-2652` emits enumerated keys `id · position · kind · variant · partKey · title · payload · required`, filtered on `ap.client_visible`, ordered `position, id`. `adaptAgreementParts` (`:381-406`) reads exactly those, accepts `part_key` as a belt, drops provenance, and is pinned by a test asserting `source_template_key` never appears in the serialized bundle. §2.4 satisfied.
- **T0 handshake.** `4c46fd97e` is a true cherry-pick — `git patch-id --stable` returns `05f4abb3…` for all three lanes' T0 commits. `packages/**` is not a lane deviation.
- **No flag on the client.** Correct, and for the reason §5 gives ("W1 adds no route and no flag") reinforced by the lane's own argument that a PostHog flag resolves against the homeowner, not the studio.
- **Vocabulary (R7) and the refusal list.** Grep of the added lines for "clause library", "contract builder", "variant" in copy, "dashboard", "overdue", "gate", "task", badge/checkmark/emoji/confetti markup → 0 hits. The only labels the renderer types are "Markup basis", "Freight and handling", "Terms of sale" (`:200-202`), all unreachable in W1 — `materialize_standard_parts` seeds `patina.deposit` with `depositPercent` alone.
- **Register.** The parts body's wrapper is `mt-8 space-y-8`, identical to today's; every leaf uses `type-section-head` / `type-body` / `type-body-small` / `type-data-large` / `type-label`. Paper register preserved; nothing restyles the desk or the Billing card.
- **Unknown kinds and variants (criterion T).** `kind = 'wormhole'` and `variant = 'quantum'` both land on the titled `RecordedLine`; `attestation` renders nothing; a malformed payload on all five leaves renders without throwing and without `$0` or `NaN` — pinned at `commercial-document-shell.test.tsx:805 :838 :860`.
- **Ledger and footer.** Outside the branch and shared by both paths (`:879`).
- **Git hygiene.** 15 files across the branch, all inside `apps/client-portal/**`, `packages/types/**` (T0) and `artifacts/**`. No `.claude/`, no `.env*`, no `supabase/**`, no `apps/designer-portal/**`. Working tree clean. Conventional Commits, no trailers, no `merge(...)` subjects. Nothing pushed.
- **Wave leakage (criterion U).** No `save_agreement_part`, `save_agreement_as_template`, `materialize_agreement_template`, `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent` or `agreement_execution_snapshots` anywhere in the client diff.

## What the orchestrator owes, in order

1. Rule on **R3-1** and let the client (and designer) lane put the `> 0` test back. This is the only finding that is both reachable on day one and this lane's to fix.
2. Rule on **R3-2** — containment (b) in `upsert_design_services_draft`, or (a). The revert is only correct if this lands.
3. Rule on **R3-4** and **R3-5**: the four copy changes and the seeded 50% deposit are decisions about what a homeowner reads on a signed instrument, and no ruling covers them.
4. Steward at integration: **R3-13** (the e2e fixture), **R3-16 / F-11** (import `AGREEMENT_PART_COPY`), **R3-12** (the two off-table files), **R3-3** (the floor's blindness to `client_visible`).
