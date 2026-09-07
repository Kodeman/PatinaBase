# Wave 2 — client lane adversarial review, round 3

Reviewer: separate context, did not write this code.
Branch `agreement/w2-client` @ `2ffc6dacc`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(`git rev-parse --show-toplevel` confirmed).
Base `a6584dbc5` per `env.md`. Diff vs `main`: 18 files, +3319/−32.

## Gates run

```
pnpm --dir <wt> --filter @patina/client-portal type-check
  > tsc --noEmit          → clean, no output

pnpm --dir <wt> --filter @patina/client-portal test
  Test Suites: 129 passed, 129 total
  Tests:       2054 passed, 2054 total
  Snapshots:   1 passed
  Time:        11.9 s

pnpm --dir <wt> --filter @patina/client-portal test:coverage
  All files  74.25 % stmts | 69.61 % branch | 74.31 % funcs | 76.54 % lines
  floor      70 / 60 / 70 / 70 — met, jest exits 0
```

E2E was **not** run: the fixture the new spec needs does not exist on any
stack (C3-2), and the shared local Supabase stack is the integration
steward's to reset.

## Round-2 findings — disposition

| id | state |
|---|---|
| R2-1 fixture / uuid collision | **half fixed** — the id moved to a free `…cb04` and the note is honest; the fixture itself is still unowned → **C3-2** |
| R2-2 dead `agreedSentence` | **fixed by removal** — the block, the DTO field and its tests are gone. The *build-sheet item* is now simply undelivered → **C3-1** |
| R2-3 string sanitizer rewriting the frozen document | **fixed** — `inertSnapshotHtml` deleted; the snapshot is set exactly as the DB froze it, with a jest pin on `innerHTML === frozen`. Verified safe: `_agreement_html_escape` escapes `& < > "` and the renderer emits only `<h2> <p> <ul> <li> <dl> <dt> <dd> <table> <tr> <td> <br> <article class="leaf">` — no attribute a designer's text can reach, so no `'`-escape gap and no URL sink |
| R2-4 "made inert" overclaim | **fixed** — the claim is gone with the code |
| R2-5 summary reduced where it was true | **fixed as the review's option one** — `composeSummaryLine` now composes from the same parts. Residual deviations → **C3-3**, **C3-4** |
| R2-6 no `agreement-library` gate | **not fixed**, evidence refined → **C3-5** |
| R2-7 consent tick survives the sentence changing | **not fixed** → **C3-6** |
| R2-8 two readers of "required attachments" | **not fixed** → **C3-7** |
| R2-9 door gates every kind, route only services | **not fixed** → **C3-8** |
| R2-10 `not_signable` misinforms | **not fixed** → **C3-9** |
| R2-11 drift case 8 omits `percent_of_spend` | **not fixed**, and the prior evidence was wrong: sheet §5.2 case 8 lists seven variants and does not name it → downgraded to **C3-12** |
| R2-12 `AgreementExecutionSnapshot` redefined | **not fixed** → **C3-10** |
| R2-13 dead `commercialDocument?.composed` | **not fixed** → **C3-13** |
| R2-14 leaf vs door acknowledgment wording | **not fixed** → **C3-14** |
| R2-15 file home / title grammar / weak e2e assert | **not fixed** → **C3-15** |

No regressions found in the round-2 fixes.

## Findings

### C3-1 · major (0.9) — build sheet §5.4's "what she agreed to" is undelivered

`apps/client-portal/src/app/proposals/[id]/record/page.tsx:161-170`.
The sheet: *"The consent sentence shown on the record comes from the signature
metadata, not from `compose_agreement_consent`."* Round 2 shipped it dead;
round 3 removed it. Backend's bundle
(`00577_agreement_fee_schedules.sql:2467+`) still enumerates the signature
keys — `signedOnPaper`, `paperSignedOn`, `paperScanDocumentId` — and projects
no consent key, while its own comment at `:2450` claims *"the sentence she
ACTUALLY ticked is frozen in the signature row's metadata, and that is what
the record prints"*. Nothing prints it. Removal was the right call inside the
lane's pathspec (00425: raw metadata never crosses that edge), but the item is
missing. **Orchestrator ruling required before merge:** add
`'consentSentence', s.metadata->>'consentSentence'` to the signature
projection and restore both halves, or strike the bullet from §5.4.

### C3-2 · major (0.95) — the e2e touchpoint still cannot pass

`apps/client-portal/tests/threshold.spec.ts:117` now pins
`b0000000-0000-0000-0000-00000000cb04`, which is genuinely free
(`grep -n "cb0[0-9]" supabase/seed/the-client-page.sql` → only `cb01`, `cb02`,
`cb03`). The uuid collision is fixed. The fixture is not: the seed lays every
commercial paper down EXECUTED and writes no `commercial_document_signatures`
row, and the backend lane's branch (`agreement/w2-backend`,
`git diff main...HEAD --stat`) touches no file under `supabase/seed/` except
the regenerated `00-legacy-grants.sql`. R26 says the assertion runs
unconditionally, and it does — so the spec is red at its first
`expect(doorway).toBeVisible({timeout: 90_000})`. **The seeded `sent`
per-phase agreement with one `acknowledgeRequired` attachment has no committed
owner in Wave 2.** Assign it to backend or the integration steward before the
wave's e2e is claimed.

### C3-3 · minor (0.85) — `consent-copy.ts` gains two exports where the sheet said one

Sheet §5.1: *"`consent-copy.ts` gains **one** export."* §5.3:
*"`consentLineFor(kind)` at `:579` becomes `composeConsentLine(kind,
bundle.parts)`. **Nothing else in the gate changes.**"*
The lane also added `composeSummaryLine` (`consent-copy.ts:275-334`) and
replaced `summaryLineFor` at `door-gate.tsx:520` and
`record/page.tsx:149`. This is exactly the fix line round 2 offered
("option one"), so it is a deliberate, reviewed deviation — but a reviewer's
fix line is not a ruling. One line in `rulings-2026-09-06.md` closes it.

### C3-4 · minor (0.8) — the commonest composed agreement's summary is no longer Wave 1's

With the nine standard parts (which include `procurement`, deposit %),
`composeSummaryLine` emits

> By signing, you accept the services, signed role rates, design
> authorization ceiling, retainer, **furnishings deposit**, and terms in “…”.

Wave 1 shipped that same paper without "furnishings deposit"
(`summaryLineFor`, untouched and still pinned). Two consequences worth a
sentence from the orchestrator: (a) a W1-composed agreement already in
production changes its signing-surface copy on this deploy; (b) the summary
now tells the homeowner she accepts a furnishings deposit on a paper whose own
closing boundary says *"This agreement authorizes design services only.
Furnishings … require a separate named furnishings authorization."*
(`agreement-parts-body.tsx:441-444`). The consent line names the deposit too,
but that is sheet-directed (§5.1's fragment table); the summary is not.
The lane's own test pins byte-identity only for `rate_card + ceiling +
retainer` (`consent-copy.test.ts:311`), which is the set that does *not*
include the deposit.

### C3-5 · minor (0.8) — the client surface carries no `agreement-library` gate

`grep -rn "agreement-library" apps/client-portal/src` → nothing. The sheet
gives the client lane no flag and W1's client body is data-gated on parts
presence rather than flag-gated, so the lane is compliant — but the program
rule *"with either flag off both portals render exactly as Wave 1 shipped"* is
then untrue of this portal: any W1-composed agreement gets the composed
consent line and the composed summary the moment this Worker deploys, with
both flags off. Refining round 2's evidence: the **acknowledgment gate** is
not reachable that way — W1's `add-part-menu.tsx` offers no `attachment` kind
(`part-kinds.ts:42` carries only the label), so no W1 agreement can carry an
`acknowledgeRequired` attachment. The exposure is the two sentences, not the
gate. Accept it with a ruling, or gate the W2 additions on a W2-only bundle key.

### C3-6 · minor (0.75) — the consent tick survives the sentence changing under it

`door-gate.tsx:205-219, 637-657`. `composeConsentLine` / `composeSummaryLine`
are evaluated every render from `bundle.data?.parts ?? []`; during
`bundle.isLoading` that is `[]` and both labels are the legacy strings. The
consent checkbox renders unconditionally and `agreed` is never cleared when
the bundle resolves and the label swaps. `ready` requires `drawn`, so she
cannot *sign* mid-load — but she can tick sentence A and sign under sentence
B. Hold the consent block until `drawn`, or clear `agreed` when the composed
line changes.

### C3-7 · minor (0.8) — door and route read "required attachments" through two different predicates

Door: the adapted DTO (`adaptAgreementParts`, `commercial-documents.ts:440-452`
— drops rows missing `id`/`kind`/`title`) filtered on
`payload.acknowledgeRequired === true` (`door-gate.tsx:216-219`).
Route: `requiredAttachmentKeys` (`sign/route.ts:46-60`) reads the raw bundle
jsonb, needs only `kind === 'attachment'` plus a key, and additionally accepts
an `acknowledge_required` spelling the door never checks. Any divergence is a
permanent 409 `not_signable` with no tick on the page that can satisfy it.
Unreachable today (00575's non-empty-title CHECK; the RPC emits camelCase
only). Drop the second spelling, or have the route read the door's predicate.

### C3-8 · minor (0.8) — the acknowledgment rule is asymmetric between door and route

`door-gate.tsx:236-243` gates `ready` on `allAcknowledged` for **every** kind.
The route validates acknowledgments at `sign/route.ts:271`, after the
`furnishings_authorization` (`:149`) and `trade_scope` (`:203`) branches have
already returned; its own test *"never gates a furnishings authorization on an
agreement's attachments"* pins the asymmetry. The door is the stricter half so
nothing is exploitable. Scope the door's gate to
`design_services`/`service_addendum`, or move the route's check ahead of the
kind dispatch.

### C3-9 · minor (0.8) — the reused refusal misinforms for the state it now covers

An unticked required attachment answers 409 `not_signable`
(`sign/route.ts:269`), whose door sentence is *"This paper is not open for
signing any more. Your designer can send a fresh one."*
(`consent-copy.ts:83`). The paper is open; she has a box to tick. The sheet
explicitly forbids a new token (`REFUSAL_TOKENS` is pinned by the drift guard
against the route source on disk), so the lane is compliant. Either accept the
copy with a ruling, or widen the vocabulary once — map plus drift guard — so
the state gets its own sentence.

### C3-10 · minor (0.85) — a `@patina/types` name redefined in the portal with a different shape

`apps/client-portal/src/lib/commercial-documents.ts:81-88` exports
`AgreementExecutionSnapshot {html, documentHash, createdAt: string|null}`.
`packages/types/src/agreement.ts:241` already exports
`AgreementExecutionSnapshot {proposalId, html, partSet, documentHash,
createdAt}` and `index.ts:37` re-exports it wholesale. Same name, different
shape, one monorepo; CLAUDE.md: *import from `@patina/types`, never redefine.*
Rename the portal's to `ClientExecutionSnapshot`, or take the bundle
projection off the shared type.

### C3-11 · minor (0.6) — R30's two items carried to the Wave 2 client lane are absent

`rulings-2026-09-06.md` (amended 2026-09-07 10:39, after this build sheet was
written) says under R30: *"**Carried to Wave 2 (client lane):** … the door for
every house carries a 'papers without a house' leaf listing pending origin
agreements addressed to the household … The `plateAsked` hold-gate fix gets
its own test in Wave 2."* Neither exists:
`grep -rn "plateAsked\|papers without a house" apps/client-portal/src` →
nothing. They are not in the build sheet's client section and the brief's
binding-rulings list (R1 R2 R3 R7 R8 R9 R12) does not name R30, so this is
plausibly a sheet/ruling ordering problem rather than a lane omission — but
somebody has to own them before Wave 2 closes.

### C3-12 · nit (0.8) — drift case 8 is one variant short, and asserts composer against composer

`consent-copy.test.ts:232-246` feeds `percent_of_cost, cost_plus, day_rate,
package, pricing_basis, draws, allowances`. R9's record-only set also names
`percent_of_spend`, which is never fed, so the default branch is unproven for
that string. (Correcting round 2: sheet §5.2 case 8 lists only the seven, so
the lane is sheet-compliant.) Separately, the assertion compares
`composeConsentLine(withRecordOnly)` to `composeConsentLine([flat])` rather
than to case 5's literal — two composer calls drifting together would pass.

### C3-13 · nit (0.9) — dead condition in the deploy-order widening

`sign/route.ts:294`: `commercialDocument?.composed === true`.
`commercialDocument` is `commercialBundle?.document` (`:93`) and `composed` is
a **top-level** bundle key (`00577:2443`). The clause can never be true; the
neighbouring `commercialBundle?.composed === true` is the one that fires.

### C3-14 · nit (0.9) — the paper and the door say the acknowledgment in two sentences

The leaf prints `AGREEMENT_PART_COPY.attachmentAcknowledgment` = "I received
this" (no full stop, `packages/types/src/agreement-copy.ts:40`,
`agreement-parts-body.tsx:412`); the door prints
`` `I received ${part.title}.` `` (`door-gate.tsx:628`). W1 authored the first
as display-only; W2 made the act real, so the two now read as different
sentences for the same act. One copy pass.

### C3-15 · nit (0.75) — M5's file home, and the title grammar

M5 landed in `components/agreement-parts-body.tsx:432-458`, not the
`commercial-document-shell.tsx` the sheet's client file list names. Right home
(the shell delegates to it), but a file-by-file check at integration will not
find it — note it. And `I received ${part.title}.` reads badly against W1's own
fixture titles ("Wisconsin notice", "Photography release"); the lane's tests
choose titles that begin with "the". Settle the attachment-title convention.

### C3-16 · nit (0.85) — two stale descriptions

`record/page.tsx:145-148` still says *"The same reduction the door makes … What
she agreed to is the line below, off her own signature"* — there is no
reduction any more (C3-3) and the line below was deleted (C3-1).
`sign/__tests__/route.test.ts:796` is titled *"keeps the four-argument call for
a composed agreement with no parts left visible"* but sets
`composed: false` — a composed bundle would widen.

### C3-17 · nit (0.6) — two TS/SQL consent divergences, both unreachable today

(a) `consentFragment` matches `creditRule` exactly; the SQL
(`00577:1073`) `btrim`s first, so `" non_refundable "` composes differently in
the two languages. (b) TS dedupes by variant (`money.find`), SQL iterates every
matching row, so two `flat` parts would emit the fragment once in TS and twice
in SQL. Both are closed upstream — `upsert_agreement_parts` refuses a duplicate
money variant (`00575:2865-2887`, R18) and the credit rule is an enumerated
CHECK — but the drift test cannot see either.

### C3-18 · nit (0.7) — the snapshot inertness case tests jsdom, not this code

`record/__tests__/page.test.tsx` "runs nothing when it sets the snapshot"
asserts that a `<script>` inserted through `innerHTML` does not execute. That
is a DOM specification guarantee, true of any component. The load-bearing pin
is the sibling case (`innerHTML === frozen`) plus
`agreement_fee_schedules_test.sql` §7 holding the renderer to its escaping —
which the file's own header now correctly says.

## What was checked and found clean

- Canonical variant order agrees byte-for-byte between
  `consent-copy.ts:150-157` and `00577:711-713`; the fragment table, the
  oxford grammar, the zero-fragment legacy return and the
  services-kinds-only guard all match the SQL line for line.
- Zero money parts returns today's literal verbatim — pinned in both
  languages; the pre-existing pinned blocks in `consent-copy.test.ts` are
  untouched and green (129/129 suites).
- All twelve §5.2 drift cases are present.
- The full sentence table (nine standard parts, consultation, flat, per-phase +
  non-refundable retainer, furnishings-only, record-only alongside flat,
  all-hidden) is asserted with `toBe` against literals.
- Attachment leaves sit **outside** `agreement-parts-body`, below the closing
  boundary, with the `ATTACHMENT {A,B,C}` mono eyebrow and no control on the
  paper; a parts set with no attachments draws no rail.
- The sign route reads the consent sentence from the **bundle**, never the
  browser; unknown acknowledgment keys are dropped silently; a shortfall is
  409 `not_signable` with no new token.
- The RPC interface matches backend: `p_consent` is the fifth argument,
  old arities dropped (`00577:868-869`), metadata merged at INSERT
  (`00577:1585-1590`).
- The keepsake reads `bundle.executionSnapshot`, prints `checksumMark`, and
  renders nothing at all when the snapshot is null.
- No refusal vocabulary in any string a homeowner reads: no "variant", no
  column name, no "gate"/"task"/"dashboard"/"overdue", no badge, count chip,
  red/green, checkmark-as-status, emoji or confetti. Neither the desk nor the
  Billing card is touched.
- R5 holds: no figure is interpolated into either composed sentence.
- Commits are Conventional, pathspec-explicit, no `merge(...)` subject, no
  trailers, nothing outside `apps/client-portal/**` and the lane's program
  docs. Nothing pushed. No production mutation, no shared-stack write.

## Verdict

**fix** — no blocker; two majors (C3-1, C3-2), both needing a decision or an
owner outside this lane rather than more client code.
