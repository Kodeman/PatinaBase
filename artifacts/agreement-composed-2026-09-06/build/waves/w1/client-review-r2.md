# W1 · client lane — adversarial review (this round)

Reviewer context: fresh, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client`
(`git rev-parse --show-toplevel` confirmed), branch `agreement/w1-client`,
17 commits ahead of `main`, 17 files / +3721 −10.

Verdict: **fix** — no blocker survives in this lane's own files (the two R21
blockers from the prior round are fixed and pinned by tests), but four majors
stand, one of them newly found and reachable on the very first composed
agreement.

## Gates run here

```
cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client
pnpm --filter @patina/client-portal type-check
  > tsc --noEmit            (clean, no output)

pnpm --filter @patina/client-portal test
  Test Suites: 129 passed, 129 total
  Tests:       1987 passed, 1987 total
  Snapshots:   1 passed, 1 total

pnpm --filter @patina/client-portal test:coverage
  All files                       73.96 | 69.26 | 74.01 | 76.28   (floor 70/60/70/70)
  agreement-parts-body.tsx       100    | 91.66 |  100  | 100
  commercial-document-shell.tsx   75.49 | 78.63 | 89.65 |  78.49
  commercial-documents.ts         92.72 | 86.47 |  100  |  95.36
```

Note on the gate itself: `"test": "jest"` in `apps/client-portal/package.json`
carries **no** `--coverage`, so `pnpm --filter @patina/client-portal test`
does not enforce `coverageThreshold`. Only `test:coverage` does. The floor is
genuinely met (numbers above), but the build sheet's gate line overstates what
the named command proves.

Flag-off byte-identity (criterion K) — verified empirically, not on the
artefact's word: `main`'s `commercial-document-shell.tsx` was copied over the
branch's file and the branch's committed 207-line snapshot re-run against it.

```
Tests: 66 skipped, 1 passed, 67 total
Snapshots: 1 passed, 1 total
```

The worktree was restored (`git diff --stat` empty afterwards).

## Prior-round findings — status

| id | status | evidence |
|---|---|---|
| C-1 R21 `$0`/`0%` for an unset money part | **FIXED** | `isWritten()` (`agreement-parts-body.tsx:60-62`) gates Ceiling / Retainer / Flat; `ProcurementLeaf` draws no line at all for a 0 percent. `NotYetSet()` carries today's words and today's treatment. Six new jest cases (`…test.tsx:762,774,788,796,804,817`). |
| C-2 empty clause/list draws a naked heading | **FIXED** | `ClauseLeaf` returns `null` on an empty body (`:96-99`), `ListLeaf` on no surviving item (`:117`); `PartSection` drops the whole `<section>` when the leaf is null (`:352`). `RateCardLeaf` gained `PerPhaseLeaf`'s `RecordedLine` fallback. Cases at `:694,707,723,970`. |
| C-3 flag-off kill switch never reaches the homeowner | **OPEN** | Unchanged at `commercial-document-shell.tsx:196`. R17's containment is still not on the backend branch: `grep -c agreement_projection …/w1-backend/supabase/migrations/00575_agreement_parts.sql` → `0`; backend's last code commit `27a5d91fd` predates the ruling. |
| C-4 hiding every part reverts to the full legacy body | **OPEN** | Bundle still filters on `client_visible` (`00575:2652`) and the shell still branches on `bundle.parts.length > 0`. |
| C-5 §6.6's named e2e assertion is a `test.fixme` | **OPEN** | `tests/threshold.spec.ts:449` still `test.fixme(`. The reachable negative half at `:392` runs. |
| C-6 the written-authorization sentence is removable with cadence | OPEN | `CadenceLeaf:245-247`. |
| C-7 four homeowner-copy losses on the composed path | OPEN | Rate-card framing sentence (`main:210-212`) still absent; headings still "Role rates" / "Ceiling" / "Exclusions". |
| C-8 a 50% deposit nobody typed | OPEN | `00575:2493-2495` still `COALESCE(…, 50)`; `ProcurementLeaf:263` prints it. |
| C-9 "Markup basis" on the homeowner's page | OPEN | `:251-255`. |
| C-10 unparseable ceiling → "No ceiling" | OPEN | `payloadCents:50-52`. |
| C-11 `money()` duplicated from the shell | OPEN (accepted) | `:25-31`, with the cycle comment. |
| C-12 `data-part-key` in the homeowner's DOM | OPEN | `:357`, `:381`. |
| C-13 attachment lettering past Z | OPEN | `:66-68`. |
| C-14 redundant classes on the attachment eyebrow | OPEN | `:383`. |
| C-15 deposit percent unclamped | PARTLY | negatives now excluded by `isWritten`; `33.333% deposit` still prints. |
| C-16 two files outside §2.3's pathspec table | OPEN (benign) | still the two `parts: []` fixture edits. |
| C-17 snapshot provenance | **RESOLVED** | re-verified directly against `main`'s component this round (above). |
| C-18 `required` crosses the edge unread | OPEN (contract-driven) | |
| C-19 duplicate part ids as React keys | OPEN (unreachable) | |

## New this round

### N-1 · major — the two surfaces drift at exactly R21

The build sheet's whole reason for implementing §4.5 twice is "so the two
surfaces cannot drift by accident" (`build-sheet.md:893`), and the designer
twin says the same in its own header. They now disagree on both R21 clauses,
and the disagreement is reachable on the **first** composed agreement:

`materialize_standard_parts` seeds `patina.ceiling` with
`cents = billing_ceiling_cents` and `patina.retainer` with
`cents = COALESCE(retainer_amount_cents, 0)` (`00575:2491`, `:2497-2501`) over
columns that are `NOT NULL DEFAULT 0`.

| state | client (this lane) | designer preview (`…/w1-designer/apps/designer-portal/src/components/document/commercial/agreement-parts-body.tsx`) |
|---|---|---|
| ceiling `cents: 0` | `Not yet set` (`:186`) | `$0` — `readCents(0) === 0` (`part-kinds.ts:179-183`), so the `cents === null` branch is skipped and `money(0)` prints (`:143-158`) |
| retainer `cents: 0` | `Not yet set`, activation sentence withheld (`:206-210`) | `$0` **plus** the activation sentence (`:161-175`) |
| clause with empty body | nothing at all (`:96-99`) | naked heading — `renderPartBody` returns `null` and the caller prints `<PartHeading>` unconditionally (`:298-303`), which its own comment states as the rule |
| list with no text | nothing at all | naked heading, same mechanism |

The designer's file comment asserts the opposite rule in prose: *"a part always
prints its heading, and a leaf with nothing in it prints the recorded line
rather than vanishing. The designer sees the same page the client will."* She
does not. R21 landed on one surface.

Fix: the designer lane applies R21 (`> 0` on ceiling/retainer/flat, percent
guard on procurement, drop the section when the body is null). The client side
is the correct one; nothing to change here.

### N-2 · minor — the anti-drift module exists and this lane does not use it

The designer lane created `packages/types/src/agreement-copy.ts`
(`AGREEMENT_PART_COPY`, `agreementRetainerActivation`, `agreementCadenceText`,
`agreementDepositLine`) with the explicit note *"A sentence typed twice drifts;
a sentence imported twice cannot. … both renderers must read it from here
rather than repeat it."* The client renderer retypes all six sentences
(`agreement-parts-body.tsx:79-82`, `:181`, `:203-205`, `:246`, `:263`, `:386`).

I diffed the strings: today they are verbatim identical, so nothing is wrong on
the page. But the mechanism ruled to prevent N-1 is bypassed on the very
surface it was built for. After the merge, the client should import from
`@patina/types` — plus `NotYetSet`'s words, which R21 added and which the
shared module does not yet carry.

### N-3 · minor — backend + client conflict on `packages/types/src/commercial.ts`

```
git merge-tree --write-tree agreement/w1-backend agreement/w1-client   → exit 1
CONFLICT (content): Merge conflict in packages/types/src/commercial.ts
```

Not a lane error: the two T0 commits are the same patch
(`git patch-id --stable` → `05f4abb30…` for both `4c46fd97e` and `13bc4445c`),
and the conflict comes from the backend's later `b1397519d` widening
`authorizedCents` to `number | null` inside the same hunk. Integration resolves
it by taking backend's side; the client portal reads `authorizedCents` only in
tests, so nothing downstream moves.

### N-4 · minor — the F-2 NULL collapse is still in this lane's adapter

§4.6: *"`ProjectBillingAuthority.ceilingCents` and `.remainingCents` widen to
`number | null` (F-2). Grep every reader and make it explicit — `ceilingCents
?? null` rendered as 'No ceiling', never as `$0`."*

`apps/client-portal/src/lib/commercial-documents.ts:690,695` still uses
`number(...)`, whose fallback is `0`, so an uncapped authority arrives in
`ProjectAuthoritySummary` as `ceilingCents: 0` / `remainingCents: 0` — the
exact collapse F-2 forbids, inside a type that now says `number | null`
(`ProjectAuthoritySummary extends Omit<ProjectBillingAuthoritySummary,'rates'>`,
`:217`). Latent only because nothing in `apps/client-portal/src/components`
reads either field (grepped). The lane fixed the same class of bug one field
over (`nullableNumber` for `billingCeilingCents`, `:281-287`) and stopped
there.

`effectiveAt` has the same shape at `:371` (`text()` → `''` for a null the
type now permits); nothing renders it.

### N-5 · nit — the register moves for Retainer and Billing cadence

Today's body sets those two in a two-column grid under `type-meta` eyebrows
(`main:230-250`). The composed body promotes both to `type-section-head`
`<h2>` like every other part. §4.5's table says "part `title`" as the heading,
so the renderer is faithful; the change to the homeowner's paper is real and
unruled. Same class as C-7.

### N-6 · nit — "ATTACHMENT" is a sixth noun

R7 names five: Agreement · Part · Library · Template · Addendum. The
homeowner-facing eyebrow reads `ATTACHMENT A · {title}` (`:384-386`), and the
designer twin reads `Attachment A · {title}` (CSS-uppercased, so the two
surfaces also differ in the DOM text a screen reader speaks and a copy-paste
carries). §4.5/§5.3 prescribe the word, so this is a question for the
orchestrator's copy ruling rather than a lane error.

## Build-sheet items — delivery check (§2.3)

| item | delivered |
|---|---|
| `lib/commercial-documents.ts` — bundle learns `parts` | yes; defensive adapter, `[]` on absent/non-array/malformed, drops rows missing `id`/`kind`/`title`, sorts by `position` |
| `commercial-document-shell.tsx` — §5.2 branch | yes, the sheet's literal `if (bundle.parts.length > 0)`; nothing above it moves |
| `agreement-parts-body.tsx` — the renderer | yes; every row of §4.5's table including the attachment leaf and the never-drawn attestation |
| `lib/commercial-documents.test.ts` — adapter cases | yes; all four §6.4 cases plus provenance and null-ceiling |
| `components/__tests__/commercial-document-shell.test.tsx` — flag-off snapshot + parts render | yes; 37 cases in the composed describe, snapshot verified against `main` |
| `tests/threshold.spec.ts` — one assertion (§6.5/§6.6) | **partly** — the negative half runs, the sheet's named positive assertion is a `test.fixme` (C-5) |
| sign route NOT modified | yes, and recorded (`client-notes.md:77-90`); `git diff main...HEAD -- apps/client-portal/src/app/api/proposals` is empty |

Scope, vocabulary and hygiene: the diff touches only
`apps/client-portal/**`, the sanctioned T0 `packages/types/**` cherry-pick, and
the program docs. No `.env`, no `.claude/`, no other lane's tree. Commit
subjects are Conventional, no `merge(...)`, no trailers. A refusal scan over
the added lines finds `variant` / `gate` only in code identifiers and comments,
never in a rendered string; no badge, count chip, red/green, checkmark, emoji
or confetti.

> The worktree's own `client-review-r2.md` (the lane's earlier round-2 review)
> is preserved in git at
> `git show 469fbb5ce:artifacts/agreement-composed-2026-09-06/build/waves/w1/client-review-r2.md`.
