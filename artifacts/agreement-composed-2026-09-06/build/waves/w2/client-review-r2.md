# Wave 2 · client lane — adversarial review, round 2

Reviewer: a separate context; did not write this code.
Branch `agreement/w2-client` @ `ad2e15699`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(`git rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`).
17 commits off the W2 base `a6584dbc5`; 17 files, +2752 / −32.

**Verdict: BLOCK** — one blocker (C1 is not closed and the fixture id it names
is already taken), two carried majors, two new majors from the round-1 fixes
themselves.

---

## Gates, run here

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                             (clean, no output)

$ pnpm --filter @patina/client-portal test
Test Suites: 129 passed, 129 total
Tests:       2050 passed, 2050 total
Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/client-portal test:coverage
All files   74.2 | 69.54 | 74.3 | 76.51      (floor 70/60/70/70 — met)
  consent-copy.ts        95   | 80.64 | 100 | 98.46
  door-gate.tsx          95.38| 86.8  |  88 | 98.29
  agreement-parts-body   100  | 90.14 | 100 | 100
  record-sheet.tsx       81.81| 68.18 | 66.66| 81.81
  commercial-documents   93.1 | 87.56 | 100 | 95.59

$ npx playwright test --list tests/threshold.spec.ts
Total: 16 tests in 1 file   (the new one at :623)
```

e2e was **not executed** — it needs a reset stack carrying the W2 migrations
and a fixture that does not exist (R2-1). Working tree clean; no file outside
`apps/client-portal/**` except the two program docs and the T0 types commit
`213686f39`, which is byte-identical to the backend and designer lanes' copy
(`md5` of `packages/types/src/agreement.ts` matches on all three).

---

## Round-1 findings — what actually happened

| # | Round 1 | Now |
|---|---|---|
| C1 | blocker — e2e touchpoint missing | **Test written, still cannot pass.** See R2-1. |
| C2 | major — keepsake `agreedSentence` dead | **Unchanged in code.** Escalated (notes §F1/E1), not ruled, backend has not added the key. See R2-2. |
| C3 | major — summary contradicts the consent line | Fixed by a new `composeSummaryLine`. **Unruled deviation from a frozen instruction.** See R2-5. |
| C4 | major — `p_consent` on every signature | **Fixed.** `p_consent` is sent only when composed / acknowledgments / a sentence exists; four route cases pin both directions. |
| C5 | major — unverified trust boundary on `dangerouslySetInnerHTML` | Fixed *further than asked*, and the fix introduced R2-3 and R2-4. |
| C6 | minor — two readers of "required attachments" | Unchanged. |
| C7 | minor — `not_signable` copy misinforms | Unchanged (needs a ruling). |
| C8 | minor — consent tick survives the sentence changing | Unchanged. |
| C9 | minor — ack gate asymmetric door vs route | Unchanged. |
| C10 | minor — type-check excludes specs | Unchanged (pre-existing config). |
| C11 | minor — `percent_of_spend` missing from drift case 8 | **Unchanged.** |
| C12–C15 | nits | Unchanged. |

---

## R2-1 · BLOCKER — the e2e fixture does not exist, and the id it pins belongs to another paper

`apps/client-portal/tests/threshold.spec.ts:582`

```ts
const PER_PHASE_AGREEMENT_ID = 'b0000000-0000-0000-0000-00000000cb02';
```

`supabase/seed/the-client-page.sql:358`

```sql
v_fa_proposal UUID := 'b0000000-0000-0000-0000-00000000cb02';
```

That uuid is already the seed's **furnishings authorization** proposal on the
same household. Two consequences:

1. The test is unconditional (correctly, per R26) and there is no
   `Cedar Lane — Phase Work` doorway on any stack, so it fails at its first
   `expect(...).toBeVisible({ timeout: 90_000 })` and `test:e2e` is red.
2. The fixture request in the lane notes (§F2, "THE FIXTURE THIS TEST NEEDS")
   names that same uuid for a **new `design_services` proposal**. Implemented
   literally by the backend lane or the integration steward, it is a duplicate
   primary key and `pnpm supabase:reset` fails outright.

The seed does carry one composed agreement (`v_ds_proposal` `…cb01`,
`the-client-page.sql:478-546`) but it is laid down **executed** with no
signature rows, so there is still no `sent` door to drive.

Fix: pick a free id (e.g. `…cb04` / `…cb05`, unused today), correct the
constant *and* the notes' fixture block, and get the backend lane or the
steward to commit the seed rows before integration runs the e2e.

## R2-2 · MAJOR (carried) — §5.4's "what she agreed to" still ships dead

`apps/client-portal/src/app/proposals/[id]/record/page.tsx:157`
feeds `agreedSentence={signature.consentSentence}`. The adapter reads it from a
flat `consentSentence` or a nested `metadata.consentSentence` on the signature
row (`lib/commercial-documents.ts:710-717`). Neither exists: the backend lane's
`get_client_commercial_document_bundle`
(`00577_agreement_fee_schedules.sql:2242-2268`) enumerates the signature keys
and projects `signedOnPaper`, `paperSignedOn`, `paperScanDocumentId` and no
consent key, keeping 00425's "raw metadata never crosses this edge" rule.

The lane escalated this (notes E1) with the right minimal ask —
`'consentSentence', s.metadata->>'consentSentence'`, a scalar, not the object.
It has not been ruled and backend has not built it, so the block is `null` for
every signature forever.

Aggravating: the jest case `record/__tests__/page.test.tsx:344` fabricates the
key on the already-adapted bundle, so the suite is green over a dead feature.

## R2-3 · MAJOR (new) — the round-2 sanitizer silently rewrites the frozen executed agreement

`apps/client-portal/src/components/record/record-sheet.tsx:47-53`

```ts
const EVENT_ATTRIBUTES = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi;
```

It is run over the **whole snapshot string**, text nodes included, before it is
set. Run against the actual regexes:

```
<p>Phase one=Concept, phase two=Documentation.</p>
  → <p>Phase phase two=Documentation.</p>          (" one=Concept," deleted)

<p>Delivery online=yes</p>
  → <p>Delivery></p>                               (the closing tag eaten too)
```

Any text of the shape ` on<letters>=` in a designer-typed part title or body
survives the SQL escape chain (`&`, `<`, `>`, `"` — `=` is not escaped) and is
then deleted here, and the unquoted branch `[^\s"'>]+` can run past a closing
tag and break the markup. R12 says the homeowner keeps the agreement **as it
was executed**; this rewrites it at render, on the record of a signed
instrument, with nothing to tell her it happened (the printed mark is the
document fingerprint, not a hash of the HTML, so it cannot catch the
difference).

No test covers a benign body — `page.test.tsx:418` only feeds hostile payloads.

The round-1 fix asked for was *a jest case pinning inertness* plus holding the
backend to the escape chain. A client-side rewrite of the frozen document was
not asked for and is out of the lane's scope. Either drop it back to that, or
do it on the parsed DOM (remove nodes/attributes) rather than on the string.

## R2-4 · MINOR (new) — the inertness the file claims is not the inertness it delivers

Same helper. Proved by running the four regexes:

```
<a href="&#106;avascript:alert(1)">x</a>   → unchanged (browser decodes the entity)
<a href="java\tscript:alert(1)">x</a>      → unchanged
<a href="data:text/html,…">x</a>           → href kept
<button formaction="javascript:alert(1)">  → unchanged
```

The comment says "no `javascript:` URL … made inert here as well" and the notes
say the client "no longer *depends*" on the SQL escaping. It does. Keep the
claim proportionate to the rule set, and keep E3's ask on
`_render_agreement_snapshot_html` (escape `'` too; SQL case 7 asserts
inertness, not only presence) as the load-bearing layer.

## R2-5 · MAJOR (new/carried) — the C3 fix is an unruled deviation from a frozen instruction

Build sheet §5.3: *"`consentLineFor(kind)` at `:579` becomes
`composeConsentLine(kind, bundle.parts)`. **Nothing else in the gate
changes.**"* The lane also replaced the `summaryLineFor` call at
`door-gate.tsx:520` and the keepsake's `question` at `record/page.tsx:148`
with a new `composeSummaryLine` (`consent-copy.ts:251-290`).

The underlying defect the reviewer named was real and the reduction is the
safer copy, but note what it now does: it reduces on **any** composed
agreement, `parts.length > 0` and nothing more — including the nine standard
parts, for which the frozen sentence was true and complete. On the commonest
composed agreement the signing surface therefore says **less** than Wave 1
shipped ("the services, signed role rates, design authorization ceiling,
retainer" all drop out of the summary; the consent line below still names the
money).

`summaryLineFor` itself is untouched and still pinned, and the lane recorded
the reading (notes E2). It still needs the orchestrator's ruling before merge —
either accept the reduction, or take option one (compose the summary from the
same parts).

## R2-6 · MINOR (new) — the client lane has no `agreement-library` gate at all

`grep -rn "agreement-library" apps/client-portal/src` → nothing. Every W2
client change — the composed consent sentence, the reduced summary, the
acknowledgment gate, attachments moved outside the body, the keepsake's
snapshot section — goes live for any W1-composed agreement the moment the
portal deploys, with `agreement-library` off. The sheet gives the client lane
no flag and R135 says the client page carries none, so the lane is compliant;
but the program rule *"with either flag off both portals render exactly as
Wave 1 shipped"* is then not true of this portal. Worth a one-line ruling.

Concretely: an existing W1 agreement carrying an `acknowledgeRequired`
attachment becomes unsignable at the door until the tick exists, with the flag
off.

## R2-7 · MINOR (carried, C8) — the tick survives the sentence changing under it

`door-gate.tsx:645-657`. `composeConsentLine` is evaluated every render;
during `bundle.isLoading` `parts` is `[]` and the label is the legacy line. The
consent checkbox renders unconditionally and `agreed` is never cleared when the
bundle resolves and the label swaps. `ready` requires `drawn`, so she cannot
sign mid-load — but she can tick sentence A and sign under sentence B. The same
now applies to the summary above it. Hold the consent block until `drawn`, or
clear `agreed` when the composed line changes.

## R2-8 · MINOR (carried, C6) — two readers of "required attachments"

Door: the adapted DTO (`adaptAgreementParts` drops rows missing id/kind/title)
filtered on `payload.acknowledgeRequired === true`
(`door-gate.tsx:216-219`). Route: the raw bundle jsonb, `kind === 'attachment'`
plus a key, accepting an `acknowledge_required` spelling the door never checks
(`sign/route.ts:46-60`). A divergence is a permanent `409 not_signable` with no
tick on the page to satisfy it. Unreachable today (00575's non-empty-title
CHECK), still two readers of one rule.

## R2-9 · MINOR (carried, C9) — the ack gate is asymmetric

`door-gate.tsx:236-243` gates `ready` on `allAcknowledged` for **every** kind;
the route validates only inside the services branch (its own test
`'never gates a furnishings authorization…'` pins the asymmetry). The door is
the stricter half, so nothing is exploitable.

## R2-10 · MINOR (carried, C7) — the reused refusal misinforms

An unticked required attachment answers `409 not_signable`, whose door sentence
is *"This paper is not open for signing any more. Your designer can send a
fresh one."* The paper is open. Sheet-directed (no new token), still wrong for
the state it now covers.

## R2-11 · MINOR (carried, C11) — drift case 8 still omits `percent_of_spend`

`__tests__/consent-copy.test.ts:232-245` feeds seven of R9's eight record-only
variants. `percent_of_spend` is never exercised. One line.

## R2-12 · MINOR (new) — a `@patina/types` type name is redefined in the portal

`lib/commercial-documents.ts:82-88` exports `AgreementExecutionSnapshot`
(`{html, documentHash, createdAt|null}`). `packages/types/src/agreement.ts`
already exports `AgreementExecutionSnapshot`
(`{proposalId, html, partSet, documentHash, createdAt}`) and
`packages/types/src/index.ts:37` re-exports it. Same name, different shape, one
monorepo. CLAUDE.md: import from `@patina/types`, never redefine. Rename the
portal's to `ClientExecutionSnapshot` (or take the bundle projection off the
shared type).

## R2-13 · NIT (new) — a dead condition in the widening test

`sign/route.ts:294`: `commercialDocument?.composed === true`.
`commercialDocument` is `commercialBundle?.document` (`:93`) and `composed` is
a **top-level** bundle key (`00577:2211`). The clause can never be true.

## R2-14 · NIT (new) — two sentences for one act

The paper says `AGREEMENT_PART_COPY.attachmentAcknowledgment` = `"I received
this"` (no full stop, `agreement-parts-body.tsx:412`); the door says
`"I received the lead-paint notice."`. W1 authored the first, W2 made the act
real — worth one copy pass so the leaf and the tick read as the same sentence.

## R2-15 · NIT (carried, C12/C13/C15) — unchanged

- M5 lives in `components/agreement-parts-body.tsx`, not the
  `commercial-document-shell.tsx` the sheet's file list names. Right home; note
  it at integration so a file-by-file check does not read it as missing.
- `I received {title}.` still reads badly against W1's own fixture titles
  ("Wisconsin notice", "Photography release").
- `threshold.spec.ts:578` still asserts `record-sheet` **or** `nothing to
  keep`. It folds into R2-1: once a signed composed fixture exists, assert the
  sheet.

---

## What I checked and found clean

- SQL/TS consent parity: `compose_agreement_consent`
  (`00577:436-546`) and `composeConsentLine` (`consent-copy.ts:216-249`) agree
  on the canonical order, on every fragment condition (rate_card ≥1 role,
  ceiling > 0, flat unconditional, per_phase ≥1 phase, retainer cents > 0 with
  the `credited` default, procurement depositPercent > 0), on the oxford
  grammar and on returning the legacy literal for zero fragments. The only
  divergence is a duplicate money variant (SQL would say the fragment twice,
  TS once) — forbidden by R18.
- Every existing `consent-copy.ts` export is byte-identical; the file is
  add-only, and the route-on-disk drift guard and `REFUSAL_TOKENS` still pass.
- The twelve drift cases plus the addendum case are present; case 10 (reversed
  order) and case 9 (`clientVisible:false`) assert with `toBe`.
- The deploy-order fix (C4) degrades correctly in both directions, with four
  route cases pinning it.
- Attachment leaves sit outside `agreement-parts-body` and below its closing
  boundary, asserted by DOM position; no rail when there are none.
- No `page.waitForTimeout`, no `networkidle` in the new e2e; the DB assertion
  is `expect.poll`; the service key is read from the environment, never written
  into the file. Every testid the spec drives exists in `door-gate.tsx`.
- No refusal vocabulary in any string a homeowner or designer reads (`gate`,
  `task` appear only in code comments); no badge, count chip, red/green status,
  checkmark-as-status, emoji or confetti; the desk and the Billing card are
  untouched; R5 holds — no figure is interpolated into any composed sentence.
- Commits are pathspec-explicit, Conventional, trailer-free, unpushed; the two
  program docs are force-added.
