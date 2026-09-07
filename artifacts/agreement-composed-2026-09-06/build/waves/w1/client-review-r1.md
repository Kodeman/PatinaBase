# Wave 1 — lane `client` — adversarial review, round 1

**Reviewer** separate context; did not write this code.
**Worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client` (`git rev-parse --show-toplevel` → same path)
**Branch** `agreement/w1-client` · **Date** 2026-09-06
**Verdict** `fix` — no blocker; **2 major**, 4 minor, 5 nit.

```
$ git -C .../agent-agr-w1-client log --oneline main..HEAD
1fe1d5465 docs(agreement): Wave 1 client lane log
8211a5a06 test(client): pin the composed agreement's part order on the client page
bb89bd889 feat(client): read a composed agreement as its parts, in order
7c28488c9 feat(client): carry agreement parts through the commercial document bundle
4c46fd97e feat(types): agreement parts vocabulary and payloads (T0)

13 files changed, 1490 insertions(+), 9 deletions(-)
```

---

## Gates — run by the reviewer, in this worktree

```
$ cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-client
$ pnpm turbo build --filter=@patina/types
  Tasks: 1 successful, 1 total · FULL TURBO
  packages/types/dist/agreement.{js,d.ts} present

$ pnpm --filter @patina/client-portal type-check
  > tsc --noEmit
  (clean — no diagnostics)

$ pnpm --filter @patina/client-portal test
  Test Suites: 129 passed, 129 total
  Tests:       1977 passed, 1977 total
  Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/client-portal test:coverage      # the enforced floor 70/60/70/70
  All files                        73.93 | 69.23 | 73.97 | 76.26   PASS
  agreement-parts-body.tsx        100    | 91.30 | 100   | 100
  commercial-documents.ts          92.68 | 86.14 | 100   |  95.33
  commercial-document-shell.tsx    75.49 | 78.63 |  89.65|  78.49
```

Note: `pnpm --filter @patina/client-portal test` runs `jest` **without** `--coverage`, so the
floor is *not* enforced by the sheet's literal lane command. `test:coverage` is the command
that gates it; run above, green.

E2E (`test:e2e`) was not re-run by the reviewer — it needs the shared local stack, which this
review must not touch. See **C1**.

---

## Build-sheet items — delivered / not

| §2.3 pathspec | State | Evidence |
|---|---|---|
| `src/lib/commercial-documents.ts` — bundle adapter learns `parts` | ✅ | `CommercialAgreementPart` (:181-198), `adaptAgreementParts` (:367-397), wired at `:518`/`:590` |
| `src/components/commercial-document-shell.tsx` — `DesignServicesBody` branch | ✅ | `:184-190`, one `if` above the whole existing body |
| `src/components/agreement-parts-body.tsx` — client part renderer | ✅ | new, 373 lines, all §4.5 leaves |
| `src/lib/commercial-documents.test.ts` — parts adapter cases | ✅ | 8 cases (absent → `[]`, non-array → `[]`, drop incomplete rows, order by `position`, provenance never crosses) |
| `src/components/__tests__/commercial-document-shell.test.tsx` — flag-off snapshot + parts render | ✅ | snapshot + 23 parts cases |
| `tests/threshold.spec.ts` — one assertion | ⚠️ | present but **vacuous** — see **C1** |
| `src/app/api/proposals/[id]/sign/route.ts` — NOT modified in W1 | ✅ | `git diff main...HEAD` touches it zero times; `consent-copy.test.ts` 27 passed |

T0 handshake: the lane's `4c46fd97e` and the backend lane's `13bc4445c` produce the **same tree**
(`faf8a7c5cd06408ecc0e6f8402638201ae5227bc` on both) — a clean cherry-pick, no fork of the frozen
§2.4 interface. Verified by diffing both patches (`IDENTICAL T0 PATCHES`).

Cross-lane interface conformance: the backend's bundle projection emits camelCase
`'partKey', ap.part_key` and filters `WHERE ap.client_visible`
(`00575_agreement_parts.sql:2215-2222`); the adapter reads `first(row, 'partKey', 'part_key')`
and never adapts `source_template_key` / `source_part_id`. Matches.

Wave leakage: `grep -E "save_agreement_part|save_agreement_as_template|materialize_agreement_template|studio_agreement_parts|agreement_templates|compose_agreement_consent|agreement_execution_snapshots"` over the whole diff → **0 hits**. The only `design_build` occurrence is the contract-mandated `AGREEMENT_TEMPLATE_CLASSES` literal in `packages/types/src/agreement.ts`.

Vocabulary (R7): every rendered string literal in `agreement-parts-body.tsx` was read.
No "clause library", no "contract builder", no "variant", no column name, no "AI"; homeowner copy
carries no "gate"/"task"/"dashboard"/"overdue"; no badge, no count chip, no red/green, no
checkmark-as-status, no emoji. `I received this` is a sentence, not a control — pinned
(`expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()`).

R5 (prose never carries money): `ClauseLeaf` and `ListLeaf` read only `body` / `items`; the
record-only default branch prints the title and one line. A `cost_plus` payload's own text is
asserted **absent** from the DOM.

---

## Attack K — flag-off byte-identity on the client (the load-bearing one)

The committed snapshot was written in the **same commit** as the component change
(`bb89bd889` adds both the `.snap` and the branch), so git cannot corroborate the lane's claim
that it was generated pre-edit. The reviewer proved byte-identity independently instead:

```
$ git show main:apps/client-portal/src/components/commercial-document-shell.tsx > /tmp/main-shell.tsx
$ cp /tmp/main-shell.tsx apps/client-portal/src/components/commercial-document-shell.tsx
$ pnpm --dir apps/client-portal exec jest -t "byte-identically"
  PASS src/components/__tests__/commercial-document-shell.test.tsx
  Snapshots: 1 passed, 1 total
$ <restored; git diff --stat on that path → empty>
```

The committed snapshot passes against **main's pre-branch component**. Flag-off byte-identity on
the client surface holds. (Reading the diff agrees: the only edits inside today's body hoist
`terms.billingCeilingCents` into a local and add a `!== null` guard; `Number.isFinite(null)` was
already `false` and `null > 0` already `false`, so the rendered tree could not move.)

---

## Findings

### C1 · major (confidence 0.85) — the e2e touchpoint asserts nothing about parts
`apps/client-portal/tests/threshold.spec.ts:380-445`

Every parts assertion sits inside `if (positions.length > 0)`. The lane's own notes state the
fixture cannot reach it: *"the seed lays down the proposal and its commercial document but no
`proposal_service_terms` row, so the shell prints its header, its execution mark and its footer
with no body at all."* With `serviceTerms === null`, `DesignServicesBody` returns `null` at
`commercial-document-shell.tsx:182` before the branch, so `positions.length` is always `0` and the
test executes only the else-arm — `expect(count('agreement-parts-body')).toBe(0)`, which is
trivially true for a body that renders nothing at all.

Sheet §6.6 asked for "one assertion on an agreement whose bundle carries parts: the part titles
appear in `position` order." As delivered, the spec passes identically whether the renderer works,
renders in reverse, or is deleted.

**Fix**: after 00575 lands, seed one agreement with a terms row *and* parts (integration steward),
then assert unconditionally. Until then a `test.fixme` naming the missing fixture is more honest
than a conditional that can only take one branch.

### C2 · major (confidence 0.6) — the `agreement-parts` kill switch does not reach the homeowner
`apps/client-portal/src/components/commercial-document-shell.tsx:188`

The client branches on **data** (`bundle.parts.length > 0`), not on the flag — as §5 prescribes.
But `materialize_standard_parts` writes nine rows the first time a pilot studio opens a draft under
the flag, and those rows never go away. Turn the flag off (the documented instant fail-closed lever,
`NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:false`) and the designer returns to the seven-facet
room, whose `upsert_design_services_draft` writes **only** the terms row — verified at
`supabase/migrations/00575_agreement_parts.sql:1638-1641`, which calls `_project_agreement_terms`
and touches `proposal_agreement_parts` nowhere.

Sequence: compose under the flag → flag off → studio raises the ceiling in the seven-facet room →
send. The homeowner reads the **stale parts** ($18,000 ceiling); countersign snapshots the
**authority from terms** ($30,000). The money on the signing surface is not the money that gets
authorized.

This is sheet-prescribed, cross-lane, and not the client lane's to fix unilaterally — it needs an
orchestrator ruling. The cheapest containments, in order of confidence:
(a) the bundle RPC omits `parts` unless the proposal's terms row is not newer than its newest part;
(b) `upsert_design_services_draft` refuses when parts rows exist;
(c) the client reads the flag too.

### C3 · minor (confidence 0.95) — the flag-off snapshot's provenance is unprovable from git
`apps/client-portal/src/components/__tests__/__snapshots__/commercial-document-shell.test.tsx.snap`

Review criterion K and §6.4 both require the snapshot be generated on `main` *before* the edit;
`git log --name-status` shows it first appearing in `bb89bd889`, the commit that also adds the
branch. Byte-identity is true (proved above), so this is a process gap, not a defect — but had the
branch moved the tree, the artifact would have silently blessed the move. Next time: commit the
snapshot in its own commit before the component change.

### C4 · minor (confidence 0.8) — `money()` is duplicated, against §5.2's letter
`apps/client-portal/src/components/agreement-parts-body.tsx:25-31`

§5.2 says the renderer uses "`money()` from the shell's own helper". The lane copied it instead,
justified by an import cycle (the shell imports the renderer). The cycle is real, but the fix is
extraction, not duplication: move `money` to a small module both import. As it stands two identical
formatters live in the same feature with nothing pinning them equal — the first currency or
rounding change to one of them drifts the two surfaces the whole §4.5 spec table exists to keep
aligned.

### C5 · minor (confidence 0.7) — an unreadable ceiling figure renders as an affirmative "no ceiling"
`apps/client-portal/src/components/agreement-parts-body.tsx:146-160`

`payloadCents` returns `null` for anything that is not a finite number, and `CeilingLeaf` maps
`null` to *"No ceiling — professional time is billed as it is worked."* — a substantive statement
about how the homeowner will be billed, produced from a payload the renderer could not read. The
test suite pins this deliberately (`payload: { cents: 'none' }` → that sentence).

Every sibling leaf already does the safer thing: `RetainerLeaf`, `FlatLeaf`, `PerPhaseLeaf` and
`ProcurementLeaf` all fall back to `RecordedLine` for the same condition. The ceiling leaf is the
only one that turns garbage into prose the client signs under. Distinguish *absent key* (a stated
uncapped ceiling, per F-2) from *unreadable value* (`RecordedLine`).

### C6 · minor (confidence 0.6) — a parts-carrying agreement with no terms row renders nothing
`apps/client-portal/src/components/commercial-document-shell.tsx:182`

`if (!terms) return null;` stays above the parts branch, exactly as §5.2 draws it, and `currency`
is read off `terms`. Unreachable today — `upsert_agreement_parts` always projects a terms row
(`00575:1894`) — but W2's `consultation` / `furnishings_services` classes may compose an agreement
that names no design-services terms, and the failure mode is a silently blank document rather than
an error anyone sees. Worth a comment naming the coupling at minimum, so W2 does not discover it in
production.

### C7 · nit (confidence 0.9) — title handling is silent in both directions
`apps/client-portal/src/lib/commercial-documents.ts:379-381`

`title: ''` drops the whole part (with everything it says) and `title: '   '` survives to render a
blank `<h2>`. Sheet §5.1 sanctions the drop, but neither case leaves a trace. `text(...).trim()`
plus a single fallback heading would make both visible.

### C8 · nit (confidence 0.9) — redundant `font-mono` on the attachment eyebrow
`apps/client-portal/src/components/agreement-parts-body.tsx:332`

`type-meta` already resolves to `--font-meta: var(--font-mono), 'DM Mono', monospace`
(`apps/client-portal/src/app/globals.css:664`), so `className="type-meta … font-mono"` restates it.

### C9 · nit (confidence 0.9) — part keys appear in the homeowner's page source
`agreement-parts-body.tsx:296-299, 326-329`

`data-part-key="patina.role_rates"` / `data-kind` / `data-position` are test hooks, not UI text, so
no R7 refusal is triggered. Recorded for completeness because the e2e depends on them: if the
orchestrator would rather not ship studio-namespace keys to the client's DOM, the position and kind
attributes alone carry the e2e.

### C10 · nit (confidence 1.0) — two files touched outside §2.3's pathspec table
`src/app/proposals/[id]/record/__tests__/page.test.tsx`, `src/components/threshold/__tests__/instrument-reading.test.tsx`

One line each (`parts: []`), forced by the new required field on `CommercialDocumentBundle`. In-lane
(`apps/client-portal/**`) and necessary for `type-check`, but not listed — flag at integration so
the designer lane does not land the same edits.

### C11 · nit (confidence 1.0) — attachment lettering falls off the alphabet
`agreement-parts-body.tsx:55-57`

`attachmentLetter(26)` → `"27"`, so a 27th attachment reads `ATTACHMENT 27` after `ATTACHMENT Z`.
Unreachable in W1 (no attachments are produced) and arguably better than nothing; noted only
because the renderer is meant to survive W2's templates.

---

## Attacks run and passed

| Criterion | Result |
|---|---|
| **K** flag-off byte-identity (client) | **PASS** — committed snapshot passes against main's pre-branch component |
| **T** unknown-kind resilience | **PASS** — `kind: 'phases'`, `variant: 'cost_plus'`, and five malformed payloads all render a titled line; no throw, no `NaN`, no `$0`, no raw JSON |
| **U** wave leakage | **PASS** — 0 hits for every W2/W3 symbol |
| **V** vocabulary (R7) | **PASS** — every rendered literal read |
| R5 prose never carries money | **PASS** — clause/list leaves read no money key; record-only branch prints none |
| Attachments as separate leaves (§5.3) | **PASS** — after every other part, in `position` order among themselves, own `<hr>`, lettered mono eyebrow, `I received this` display-only, no control |
| `attestation` never rendered | **PASS** — filtered from both lists; its payload asserted absent |
| Provenance never crosses the edge | **PASS** — `source_template_key`/`source_part_id` absent from the type, the adapter, and the serialized bundle |
| Sign route unchanged (§5.4) | **PASS** — zero diff; `consent-copy.test.ts` 27 passed unedited |
| Closing boundary said exactly once | **PASS** — asserted on both paths |
| T0 not forked | **PASS** — identical tree with the backend lane |
| Commits pathspec-clean | **PASS** — five commits, no `git add -A`, Conventional subjects, no trailers, not pushed |

---

## What this review could not verify

- No parts row has rendered against a real database. 00575 is unapplied on the shared stack and
  this review must not reset it; every parts assertion is jsdom against hand-built bundles plus the
  §2.4 text. The adapter↔RPC key match was checked by reading `00575:2215-2222`, not by executing it.
- `test:e2e` was not re-run (shared stack). C1 is derived from the spec's own control flow and the
  lane's stated fixture, not from a run.
- Designer-side parity of the §4.5 spec table is the designer lane's review, not this one.
