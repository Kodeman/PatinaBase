# Wave 1 · client lane — adversarial review, round 4 (fresh dispatch)

Reviewer: separate context, did not write the code. Dispatched as "round 1" and
asked to write `client-review-r1.md`; that file already holds an earlier
reviewer's round 1, and rounds 2 and 3 sit beside it. Overwriting it would have
destroyed the record, so this pass is filed as **`client-review-r4.md`** and
`client-review-r1.md` is untouched. Filed in both the worktree (committed on the
lane branch) and the program directory in the main checkout.

Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`
(`git rev-parse --show-toplevel` → same path, pasted below)
Branch: `agreement/w1-client` · base `main` `4c0b7b17b` · 13 commits · 16 files
Code frozen since `b7a5c0946`; every commit after it is documentation.

**The decisive fact of this pass:** the integration rulings **R17–R21** were
issued *after* the last code commit on this branch, and **R21 binds this lane's
own renderer**. Two of its three clauses are unimplemented. That is what moves
this from the prior reviewer's `fix` to **block**.

---

## Verdict

**block** — 2 blockers (both R21), 3 majors.

Every pathspec item in build sheet §2.3 exists, both named lane gates are green,
the sign route is genuinely untouched, the T0 commit is a true cherry-pick, and
the flag-off path is byte-identical by construction. The blockers are ruling
violations, not craft complaints, and both land on the homeowner's signed
instrument.

## Gates, run by this reviewer

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client

$ cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client
$ pnpm turbo build --filter=@patina/types
  Tasks: 1 successful, 1 total · FULL TURBO
  (cache replay names the BACKEND worktree's path — verified separately that
   this worktree has packages/types/dist/agreement.d.ts + .js on disk)

$ pnpm --filter @patina/client-portal type-check
  > tsc --noEmit
  (clean — no diagnostics)

$ pnpm --filter @patina/client-portal test -- --ci --coverage
  Test Suites: 129 passed, 129 total
  Tests:       1978 passed, 1978 total
  Snapshots:   1 passed, 1 total
  All files                      73.94 | 69.25 | 73.98 | 76.26   (floor 70/60/70/70 — clears)
  agreement-parts-body.tsx      100.00 | 91.30 | 100.00 | 100.00
  commercial-documents.ts        92.72 | 86.47 | 100.00 |  95.36
  commercial-document-shell.tsx  75.49 | 78.63 |  89.65 |  78.49

$ pnpm --filter @patina/client-portal test -- --ci src/components/threshold/__tests__/consent-copy.test.ts
  Tests: 27 passed, 27 total

$ git diff main...HEAD --stat -- apps/client-portal/src/app/api/ \
      apps/client-portal/src/components/threshold/consent-copy.ts
  (0 lines — §5.4 honoured)
```

E2E not re-run by this reviewer: `tests/threshold.spec.ts` needs a warm `:3002`
dev server against the shared local stack, which the integration steward owns and
which this lane is forbidden to reset. The lane's own record is 1 passed / 1
skipped on `--grep agreement`; the one whole-file failure
(`names the other houses on the mat`) is seed accumulation on the shared stack
and is already on the rulings' main-backlog list.

---

## Blockers

### C-1 · blocker (0.95) — R21 clause 1 is unimplemented: the composed body prints `$0` and `0%`

`apps/client-portal/src/components/agreement-parts-body.tsx:151` (`CeilingLeaf`),
`:168` (`RetainerLeaf`), `:208` (`ProcurementLeaf`), `:231` (`FlatLeaf`).

R21, verbatim: *"The composed homeowner body never prints `$0` or `0%` for an
unset money part; it prints today's 'Not yet set'."*

`payloadCents` (`:50-52`) separates only `null` from a finite number, so `0` is a
figure:

| leaf | payload | composed body prints | today's body prints |
|---|---|---|---|
| `RetainerLeaf` | `{cents: 0}` | `$0` **and** "Due under the terms of the fully executed agreement." | `Not yet set`, activation sentence suppressed (`commercial-document-shell.tsx:265-273` on `main`) |
| `CeilingLeaf` | `{cents: 0}` | `$0` | `Not yet set` in muted italic (`main:246-248`) |
| `ProcurementLeaf` | `{depositPercent: 0}` | `0% deposit` | nothing — today's design-services body states no deposit at all |
| `FlatLeaf` | `{cents: 0}` | `$0` | n/a (new leaf) |

Today's body carries the protection *and its reason*, verbatim at `main:196-199`:
"A brand-new agreement defaults both of these to 0 and nothing blocks a send, so
an untouched figure would reach the client as a real authorized amount. An amount
nobody wrote is named as unwritten."

Reachable on the first composed agreement of any studio that takes no retainer:
`proposal_service_terms.retainer_amount_cents integer NOT NULL DEFAULT 0`
(`00412:74`); `materialize_standard_parts` seeds `patina.retainer` unconditionally
from that column (backend worktree `00575_agreement_parts.sql:2497-2501`); nothing
refuses a zero retainer anywhere. Ceiling `0` is reachable on any agreement with
no rate card, where `_agreement_floor_unmet` does not require one.

This inverts P0's own line — build sheet §1: *"'Not yet set' never renders on a
sendable document"* — on the one surface it exists to protect, and it is a
**regression against today**, not a gap in a new feature.

The branch's own jest suite pins the correct behaviour on the legacy path
(`commercial-document-shell.test.tsx:191-206`, "names an unset ceiling and
retainer instead of printing `$0` at the client") and pins the wrong behaviour on
the composed path by omission — there is no zero-cents case in the
`an agreement whose bundle carries parts` describe block.

**Fix, in-lane:** apply today's `> 0` test per leaf, and keep `0` and `null`
distinct on the ceiling (`0` → "Not yet set"; `null` → the uncapped sentence).
The designer twin
(`.codex/worktrees/agent-agr-w1-designer/apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx:139-171, :212-220`)
has the identical shape and must change with it, or §4.5's "the two surfaces
cannot drift by accident" fails on the first agreement. Add the zero cases to the
composed describe block.

### C-2 · blocker (0.95) — R21 clause 2 is unimplemented: an empty clause or list renders a naked heading

`agreement-parts-body.tsx:76-81` (`ClauseLeaf`), `:94-109` (`ListLeaf`).

R21, verbatim: *"Empty clause/list parts render nothing, not a naked heading
(R3-6)."*

Both leaves render `<PartHeading>` unconditionally and gate only the content.
Today's body omits the whole section: `{terms.scope && …}` (`main:193`),
`{terms.deliverables.length > 0 && …}` (`main:200`), `{terms.terms && …}`
(`main:261`), `{terms.exclusions.length > 0 && …}` (`main:274`).

Reachable on the first composed agreement: `materialize_standard_parts` seeds
`patina.terms` as `jsonb_build_object('body', COALESCE(v_terms.terms, ''))`
(`00575:2507-2508`) and `proposal_service_terms.terms` is nullable (`00412:79`);
`patina.deliverables` / `patina.exclusions` are seeded from arrays that default
`'[]'`. A studio that has not written its terms hands the homeowner a **Terms**
heading with nothing under it.

Same defect in `RateCardLeaf` (`:127`) and `PerPhaseLeaf` — an empty `roles`
array draws the title and no table. `PerPhaseLeaf:261` at least falls back to
`RecordedLine`; `RateCardLeaf` draws nothing at all.

Both surfaces must move together; the designer twin has the same shape.

---

## Majors

### C-3 · major (0.85) — the `agreement-parts` kill switch does not reach the homeowner

Program rule and the brief: *"FLAG-OFF MUST BE BYTE-IDENTICAL to today on both
portals."* On the client that holds only for a document that never had parts.

The client carries no flag (correct — §5, and a PostHog flag resolves against the
homeowner, not the studio). It branches on data:
`commercial-document-shell.tsx:194` `if (bundle.parts.length > 0)`. Parts rows
survive the flag being switched off, so:

1. studio opens the Contract Room with `agreement-parts` on → nine parts materialize;
2. Kody turns the flag off (the fail-closed lever — memory: `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false`);
3. the designer is back in the seven-facet room, and the homeowner is **still**
   reading the composed body — including every defect above.

There is no way to un-compose a proposal in W1 (no delete-all-parts path, and the
rail cannot remove `patina.services` / `patina.terms`, which are `required`).

This is not fixable inside `apps/client-portal/**` at the frozen interface — the
lane tried in round 1 (`708489b50`) and correctly reverted it in round 2
(`b7a5c0946`) as a unilateral deviation from §2.4/§5.2. It needs an orchestrator
ruling: either the bundle carries a composed/flag signal, or the program accepts
that composition is one-way per proposal and says so.

Related and still open: the lane's escalated divergence (client-notes.md,
"⚠ OWED THE ORCHESTRATOR"; prior reviewer's R3-2). **R17 was ruled to close it —
and R17 is not implemented on the backend branch.** Verified just now:
`grep -n "agreement_projection\|agreement_composed"
.codex/worktrees/agent-agr-w1-backend/supabase/migrations/00575_agreement_parts.sql`
→ 0 hits, and the backend branch's last code commit is `27a5d91fd`, which
predates the ruling. Until R17 lands, a flag-off write in the seven-facet room
moves the money while the client keeps rendering the parts, and
`_commercial_document_fingerprint` (`00575:374-378`) hashes the parts the
homeowner read while `project_billing_authorities` snapshots the terms row the
seven-facet room wrote.

### C-4 · major (0.85) — hiding every part reverts the homeowner to the full legacy body, printing what was hidden

New this pass; survives the round-2 revert (the prior reviewer's F-3 was about the
deleted guard, not this).

The bundle filters the client's edge on `client_visible` — verified in the
backend branch, `00575:2645-2652`:

```sql
'parts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id', ap.id, 'position', ap.position, 'kind', ap.kind, 'variant', ap.variant,
  'partKey', ap.part_key, 'title', ap.title,
  'payload', ap.payload, 'required', ap.required
) ORDER BY ap.position, ap.id)
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id AND ap.client_visible), '[]'::jsonb),
```

So visibility is discontinuous at the client:

- hide **one** part → that part disappears (R8, intended);
- hide **every** part → `parts = []` → `DesignServicesBody` falls through to
  today's seven-section body, which reads `proposal_service_terms` /
  `bundle.rates` and prints the scope, deliverables, exclusions, terms, rate
  table, ceiling, retainer and cadence the studio just hid.

Hiding is inverted into full disclosure, and the more the studio hides the more
the homeowner sees. Latent in W1 (`part-kinds.ts` hardcodes `clientVisible: true`,
`materialize_standard_parts` seeds all nine true) and live the moment W2 ships the
toggle — but `upsert_agreement_parts` accepts `clientVisible: false` today.

Same class as, but distinct from, the prior reviewer's R3-3 (the R4 floor's
blindness to `client_visible`, which R21 partly addresses for the floor and does
not address here). Cannot be fixed at the frozen `parts.length > 0` branch;
needs the bundle to say "this document is composed" independently of how many
parts survived the visibility filter.

### C-5 · major (0.8) — build sheet §6.6's named client e2e assertion is not delivered

§6.6: *"**Client** — `apps/client-portal/tests/threshold.spec.ts` gains one
assertion on an agreement whose bundle carries parts: the part titles appear in
`position` order."*

`tests/threshold.spec.ts:435` is a `test.fixme`. What runs is the negative half
(`:392`) — the agreement opens and carries **no** parts body. That is a real and
worth-keeping flag-off assertion, but it is not the assertion the sheet names,
and the renderer has no end-to-end coverage against a real RPC.

The lane's reason is sound and documented in the fixme's own doc block: the
fixture needs 00575 applied to the local stack **plus** a seed laying down both a
`proposal_service_terms` row and parts on `the-client-page.sql:95-118` — and this
lane may not reset or seed the shared stack. Owner is the integration steward,
but the item is undelivered as of this branch and must not be signed off as done.

---

## Minors

### C-6 · minor (0.8) — the written-authorization sentence becomes removable

`CadenceLeaf:190-192` carries "Additional work requires written authorization
before it can be invoiced." On `main` that sentence is unconditional
(`main:249-250`). Under parts it lives inside the cadence leaf, and R4 makes the
cadence part removable — so a studio that drops Billing cadence drops the one
sentence on the page that tells the homeowner extra work has to be agreed before
it can be billed. Faithful to §4.5's table; not covered by any ruling. Either
hoist it beside the separate-purchase boundary (which the renderer already keeps
unconditional at `:367-370`) or rule that it is removable.

### C-7 · minor (0.85) — four homeowner-copy losses, none ruled

Re-raised because no ruling has landed on them (the prior reviewer's R3-4; R21
does not cover them):

1. **Lost framing.** `main:210-212` — "Actual professional time is billed at the
   signed rates below, up to the authorized design amount." `RateCardLeaf`
   (`:113-139`) carries no framing sentence, so the rate card and the ceiling
   become two unconnected sections with nothing tying them.
2. **"Not included" → "Exclusions"** (`main:275` vs the seeded title,
   `00575:2487`).
3. **"Rates & design authorization" → "Role rates"** (`main:209` vs `00575:2489`).
4. **"Design authorization ceiling" → "Ceiling"** (`main:245` vs `00575:2491`),
   moving from a labelled row inside the rate table to a bare standalone figure —
   losing the word that says what the number does.

The renderer is faithful to §4.5 in all four; the losses are in the spec and the
seeded titles. Orchestrator's to rule, backend's to change.

### C-8 · minor (0.7) — a house-default furnishings deposit prints on the design-services agreement

`materialize_standard_parts` seeds `patina.deposit` as
`COALESCE(v_terms.furnishings_deposit_percent, v_defaults.deposit_percent, 50)`
(`00575:2493-2495`) and `ProcurementLeaf:208-210` prints `{depositPercent}%
deposit`. Today's design-services body says the opposite — "Furnishings … require
a separate named furnishings authorization" — and states no deposit. A composed
agreement now commits the homeowner to **50% deposit** on a figure nobody in the
studio typed. R5 is satisfied (it is a `schedule` part); the product call is not.

### C-9 · minor (0.6) — "Markup basis" is a studio-margin label on the homeowner's page

`ProcurementLeaf:200-202` types the labels "Markup basis", "Freight and handling",
"Terms of sale". Unreachable in W1 (`materialize_standard_parts` seeds
`depositPercent` alone), but `upsert_agreement_parts` accepts the fields today,
and R13's spirit — identities yes, the studio's economics never — is worth a
ruling before a markup basis reaches a homeowner.

---

## Nits

- **C-10 (0.9)** — `payloadCents:50-52` maps *any* non-finite value to `null`, and
  `CeilingLeaf` maps `null` to the affirmative "No ceiling — professional time is
  billed as it is worked." A payload the renderer could not parse therefore makes
  a legal statement. Pinned as intended at `commercial-document-shell.test.tsx:866`
  with `payload: {cents: 'none'}`. Bounded: `_project_agreement_terms` casts
  `(ap.payload->>'cents')::integer` (`00575:2265, :2270`), so `22P02` fires before
  such a row commits. One line to distinguish absent from unparseable.
- **C-11 (0.8)** — `money()` (`:25-31`) reimplements `commercial-document-shell.tsx:44-50`
  verbatim. The stated reason (the shell imports this module) is correct;
  `lib/utils/format.ts:138` takes dollars and returns `string | undefined`, so it
  is not a drop-in. Make the shared home at integration or leave it.
- **C-12 (0.85)** — `PartSection:297` / `AttachmentLeaf:328` emit
  `data-part-key="patina.role_rates"` into the homeowner's DOM. Attributes, not
  copy, so no R7 refusal fires; the e2e uses only `data-position` / `data-kind`.
  Drop if the orchestrator would rather not ship studio-namespace keys.
- **C-13 (0.9)** — `attachmentLetter:56` reads "ATTACHMENT 27" after Z. Unreachable
  in W1. The designer twin has no guard at all and reads "Attachment [".
- **C-14 (0.9)** — `:332` `className="type-meta mt-6 font-mono text-[var(--text-muted)]"`;
  `.type-meta` already sets the mono family and the muted colour
  (`packages/patina-design-system/src/styles/typography.css`, `globals.css:664`).
  Two redundant classes, unfixed across three rounds.
- **C-15 (0.7)** — `ProcurementLeaf:209` prints the percent verbatim, so a payload
  carrying `33.333` reads "33.333% deposit". No clamp, no rounding, no 0–100 test.
- **C-16 (1.0)** — two files outside §2.3's pathspec table:
  `src/app/proposals/[id]/record/__tests__/page.test.tsx:50` and
  `src/components/threshold/__tests__/instrument-reading.test.tsx:42`, each adding
  `parts: []`. In-lane and forced by the new required bundle field. Flag at
  integration so no other lane lands the same edits.
- **C-17 (0.6)** — the flag-off snapshot's provenance cannot be proved from the
  artefact (the `.snap` is new in `main...HEAD`). Substituted a stronger check —
  see "Checks that found nothing" — and it holds.
- **C-18 (0.5)** — `required` crosses the client edge (§2.4 mandates it) and no
  client code reads it. Dead field on the homeowner's wire.
- **C-19 (0.5)** — duplicate `id`s in `parts` would collide as React keys
  (`:359`, `:362`); the adapter does not dedupe. Unreachable through the RPC (`id`
  is the PK) — defence-in-depth only.

---

## Checks that found nothing

- **Flag-off byte-identity (criterion K).** `git diff main...HEAD --
  commercial-document-shell.tsx` is exactly two hunks: (1) the early-returning
  parts branch above the existing body, (2) `const ceilingCents =
  terms.billingCeilingCents` plus `ceilingCents !== null &&
  Number.isFinite(ceilingCents) && ceilingCents > 0` for
  `Number.isFinite(terms.billingCeilingCents) && terms.billingCeilingCents > 0`.
  Hunk 2 is value-identical for every input — `Number.isFinite(null)` is already
  `false` — and `money(ceilingCents, …)` is reached only when `ceilingIsSet`. The
  new import has no side effects. Nothing else in `DesignServicesBody` moved. The
  committed snapshot (207 lines, carrying "Rates & design authorization" at :78
  and "Design authorization ceiling" at :109) passes unregenerated.
- **The adapter's nullable-ceiling change is not a flag-off behaviour change.**
  `number(...)` → `nullableNumber(...)` turns a missing/malformed ceiling from `0`
  into `null`; both render "Not yet set" on the legacy path. `grep -rn
  billingCeilingCents src/ tests/` finds no other production reader.
- **Local DTOs.** `DesignServicesTerms` and `CommercialRate` are `Pick`s off
  `@patina/types` (`commercial-documents.ts:48-51`, `:75-93`), so §4.6's
  widening (`billingCeilingCents: number | null`, `effectiveAt: string | null`)
  arrives without a second declaration. §4.6's client half is satisfied.
- **Bundle interface parity (§2.4).** The RPC emits exactly `id · position ·
  kind · variant · partKey · title · payload · required`, filtered on
  `client_visible`, ordered `position, id`, `[]` when none. `adaptAgreementParts`
  (`:381-406`) reads exactly those, accepts `part_key` as a belt, drops
  provenance, defaults a malformed variant/payload/required, and is pinned by a
  test asserting `source_template_key` never appears in the serialized bundle.
- **T0 handshake.** `git patch-id --stable` on all three lanes' T0 commits
  (`4c46fd97e`, `bab1b9b92`, `13bc4445c`) → `05f4abb30853758709d64c010073be7457babee3`
  for each. `packages/**` in this diff is the sanctioned cherry-pick, not a lane
  deviation. `4c46fd97e` is also contained in `agreement/w1-integration`.
- **Sign route (§5.4).** 0 lines under `src/app/api/`; `consent-copy.ts`
  untouched; `consent-copy.test.ts` 27/27, and it reads the live route off disk.
  Recorded as the deliberate non-change the sheet asks the lane to own.
- **The record-of-decision page.** `/proposals/[id]/record` renders a signature
  keepsake (`RecordSheet`), not an agreement body — no parts drift there.
- **`service_addendum`.** Routes through `DesignServicesBody` (`main:159-161`);
  `create_service_addendum` is not redefined in W1, so an addendum carries no
  parts and renders on the legacy path, as §1 says it should. (It will read in
  today's headings beside a parent that reads in composed ones — a consequence of
  C-7, not a new defect.)
- **Unknown kinds and variants (criterion T).** `kind='wormhole'`,
  `variant='quantum'`, and a malformed payload on every leaf all land on the
  titled `RecordedLine` without throwing and without `$0`/`NaN`; `attestation`
  draws nothing; pinned at `commercial-document-shell.test.tsx:796, :805, :838,
  :860`. `phases` is not addable in W1 (designer `part-kinds.ts:134-137` offers
  clause / list / schedule only) and both renderers treat it identically, so the
  two surfaces do not drift on it.
- **Attachment placement (§5.3).** After every non-attachment part, in position
  order among themselves, own rule, own mono eyebrow, `I received this` as
  display-only. `attestation` rows are excluded from both lists, so the lettering
  index is not skewed.
- **The boundary sentence.** Said exactly once on either path — inside
  `AgreementPartsBody` on the composed path (`:367-370`, verbatim against
  `main:268-271`), by the legacy body otherwise. §5.2 is the operative reading;
  §4.5's "outside" would mean "never" given the early return.
- **R5.** No `clause` or `list` leaf prints a figure; only typed `schedule`
  variants do, each printing only its own variant's field.
- **Vocabulary and refusals (R7).** Grep of added lines: no "clause library", no
  "contract builder", no "variant" in copy, no "gate"/"task"/"dashboard"/
  "overdue", no badge, count chip, red/green status, checkmark-as-status, emoji
  or confetti. Register is the paper one — `type-section-head` / `type-body` /
  `type-body-small` / `type-data-large` / `type-label` / `type-meta`, wrapper
  `mt-8 space-y-8` identical to today's. Nothing restyles the desk or the Billing
  card.
- **Wave leakage (criterion U).** No `save_agreement_part`,
  `save_agreement_as_template`, `materialize_agreement_template`,
  `studio_agreement_parts`, `agreement_templates`, `compose_agreement_consent` or
  `agreement_execution_snapshots` anywhere in the client diff.
- **Git hygiene.** 16 files, all under `apps/client-portal/**`,
  `packages/types/**` (T0) and `artifacts/**`. No `.claude/`, `.agents/`, hooks,
  settings, `.env*`, `supabase/**` or `apps/designer-portal/**`. Working tree
  clean. Conventional Commits, no trailers, no `merge(...)` subjects. No upstream
  configured — nothing pushed.

---

## What the orchestrator owes, in order

1. **C-1 and C-2 are R21 and they are this lane's to fix.** Both renderers, one
   change, with the zero-cents and empty-body cases added to both jest suites.
2. **C-3.** Rule how the flag reaches the homeowner, or record that composition is
   one-way per proposal. Then land **R17** on the backend branch — it is ruled and
   absent.
3. **C-4.** Decide whether the bundle gains a composed signal, or accept that
   hiding every part shows everything.
4. **C-5.** Steward: the e2e fixture (00575 + a seeded composed agreement), then
   un-fixme `threshold.spec.ts:435`.
5. **C-6, C-7, C-8, C-9.** Homeowner copy on a signed instrument. No ruling covers
   any of them.
