# Wave 1 · designer lane · adversarial review (this reviewer's round 1)

Reviewer: separate context, did not write this code.
Worktree: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w1-designer`
(`git rev-parse --show-toplevel` → that path). Branch `agreement/w1-designer`,
27 commits ahead of `main`, working tree clean.

> Note on rounds. The lane already carries three self-run review rounds
> (`designer-review-r1.md` … `-r3.md`, last code commit 20:14, last review doc
> 20:29). `build/rulings-2026-09-06.md` gained its **Wave 1 integration
> rulings R17–R21** at **21:10** — *after* the lane stopped. Findings 1–5
> below are those rulings; they are not work the lane failed to do, they are
> work the lane has not yet been given. They are still blocking, because
> R17–R21 are recorded in the binding rulings file.

This file replaces the lane's own `designer-review-r1.md` at the orchestrator's
instruction (the review artifact for this lane, this round, lives at this path).

---

## Gates — run by this reviewer, not quoted from the lane

| Command | Result |
|---|---|
| `pnpm turbo build --filter=@patina/types` | 1/1 successful, FULL TURBO; `packages/types/dist` carries `agreement.js` **and** `agreement-copy.js` |
| `pnpm --filter @patina/designer-portal type-check` | **pass** — `tsc --noEmit`, no output |
| `pnpm --filter @patina/designer-portal lint` | **red: 205 problems (2 errors, 203 warnings)**. The two errors are `piece-room-save-gate.test.tsx:159` (`import/first` rule not found) and `use-commercial-documents.test.ts:930` (`react-hooks/rules-of-hooks` on `useSendTradeRfq`). I re-ran lint in the **main checkout**: byte-identical pair, same two line numbers. Pre-existing, matches the backlog note in `rulings-2026-09-06.md`. Not a lane regression. |
| `pnpm --filter @patina/designer-portal test` (full) | **pass — 523/523 suites, 6304/6304 tests, 2/2 snapshots, 24.8 s** |
| `pnpm --filter @patina/admin-portal build` | **pass** — the gate the lane recorded as *not run* (notes §"Not verified", and again in "Still open after round 2"). It first failed on `Module not found: '@patina/api-client'`, a stale worktree dist, not a type break; after `pnpm --filter @patina/api-client build` the admin build compiles clean. The `@patina/types` nullability widening does **not** break the repo's strictest gate. |
| Flag-off byte-identity (designer room) | **proved independently.** I copied `main`'s `service-agreement-drafting-room.tsx` over the branch's, ran `service-agreement-drafting-room.test.tsx --ci`: 8/8 tests, **1/1 snapshot passed**. The committed snapshot is genuinely `main`'s markup, and commit `ba80eee66` (which added it) precedes every edit to the room. Branch file restored; tree clean. |
| e2e | **not run, by either side.** `agreement-parts.agreement.pw.ts` needs 00575 on the shared local stack, which this lane may not touch. Grepped: no `page.waitForTimeout` in `e2e/agreement/`. |

---

## Findings

Severity per the brief. Confidence is this reviewer's, on the evidence cited.

### BLOCKERS

**D-R1 · R18 is unimplemented, and the room hits the DB refusal it forbids.**
Confidence 0.95.
`ADD_PART_OPTIONS` (`part-kinds.ts:129`) is a static list of all seven W1
schedule variants, and `AddPartMenu` renders it unfiltered — a designer can add
a second Ceiling, Retainer, Cadence, Furnishings deposit or Role rates.
`readiness.ts` has only the duplicate-**partKey** rule (`:101`); a second
ceiling created from the rail carries a fresh `custom.<uuid>` key, so readiness
returns `ready: true`. The backend then refuses:
`00575_agreement_parts.sql:2168-2192` raises
`'an agreement carries only one ceiling'` with `ERRCODE = 'check_violation'`.
R18, verbatim: *"the Add menu must not offer a second
ceiling/retainer/cadence/deposit/rate card, and readiness reports the duplicate
as a blocker so Save can never hit 23514 from the room."* Both halves missing.
Fix: filter `ADD_PART_OPTIONS` against the variants already present, and add a
readiness blocker for a duplicated money variant.

**D-R2 · R21 — an empty clause or list part renders a naked heading.**
Confidence 0.97.
`agreement-parts-body.tsx:304` prints `<PartHeading>{part.title}</PartHeading>`
for every section unconditionally; `renderPartBody` returns `null` for an empty
clause (`:79`) and an empty list (`:89`). R21: *"Empty clause/list parts render
nothing, not a naked heading (R3-6)."* The behaviour is not accidental — the
file's header comment argues the opposite rule, and
`agreement-parts-body.test.tsx:290` **pins** it:
`it("keeps the heading of a part with nothing written in it")`. The client
lane's renderer does the same thing, so this is wave-wide, but the designer
side is this lane's to fix (and the pinning test must invert).

**D-R3 · R21 — the composed homeowner copy does print `$0` and `0% deposit`.**
Confidence 0.9.
`blankPayload` (`part-kinds.ts:96-125`) seeds a new Retainer at `cents: 0` and
a new Flat fee at `cents: 0`. `scheduleValueIsSet` accepts a retainer at
`cents >= 0`, and `readiness.ts` raises no blocker for a zero retainer, so the
agreement is `ready: true`. `agreement-parts-body.tsx` then renders
`money(0)` → **"$0"** plus the activation sentence for the retainer, and
`agreementDepositLine(0)` → **"0% deposit"** for a procurement part chipped to
0. R21: *"The composed homeowner body never prints `$0` or `0%` for an unset
money part."* A designer who adds a Retainer part and moves on ships "$0 · Due
under the terms of the fully executed agreement" to the homeowner. Note the
tension the fix must resolve: a **deliberate** zero (R-8's "including zero when
none is due") and an **untouched** default currently look identical in the
payload — the fix probably has to seed `cents: null` and let readiness ask.

**D-R4 · R17(b) — the flag-off room says nothing about a composed agreement.**
Confidence 0.9.
`grep -rn "agreement_composed\|composed from parts\|Open it in the Contract
Room" apps/ packages/` → no matches on this branch. R17(b) requires the
flag-off seven-facet room to render *"This agreement is composed from parts.
Open it in the Contract Room with parts on to change it."* as one plain
sentence and to disable Save. Today a flag-off designer (or a flag-off
co-member of a flag-on studio) opens a composed agreement in the seven facets,
edits it, and calls `upsert_design_services_draft` against a projected row.
The backend half is missing too (no `app.agreement_projection` GUC, no
`agreement_composed` refusal, no `REVOKE` in 00575 — only the table's own
`REVOKE` at `:155`), so the write currently **succeeds** and silently
de-syncs the parts from the money row. Recorded here so the steward sees both
halves; the sentence and the disabled Save are the designer lane's.

Related and worse in the same room: `service-agreement-drafting-room.tsx:501`
now reads `dollars(terms.billingCeilingCents ?? 0)`. A composed agreement with
a NULL (uncapped) ceiling shows **`0`** in that input on the flag-off path, and
a Save writes a real `0` ceiling over "uncapped".

### MAJORS

**D-R5 · R21 — the R4 floor does not filter `clientVisible`.** Confidence 0.9.
`readiness.ts:192-207` (`namesAFee`) and `:209-216` (`billsTime`) iterate every
part. R21: *"The R4 floor reads only client-visible money parts (R3-3)."* A
studio-only Flat fee therefore satisfies the floor for a document whose
homeowner copy names no fee at all.

**D-R6 · The paper door is now stricter than the server it claims to mirror.**
Confidence 0.85.
`service-agreement-instruments.tsx:164`:
`const paperReady = Boolean(terms) && rates.length > 0;`
with a comment asserting *"the RPC requires terms and at least one role rate."*
00575 makes that false: `_issue_design_services_agreement_on_paper`
(`00575:880-888`) now requires a rate row **only when
`_agreement_requires_rate_card(p_proposal_id)`**, and adds the R4 floor
instead. A legal flat-fee composition (no rate card ⇒ zero
`proposal_service_rates` rows) hides "Issue on paper" at `:282` and `:383` for
work the server would accept. This is the same defect the lane fixed for the
send sheet with `readinessOverride`, missed one surface over.

**D-R7 · `packages/types/src/agreement-copy.ts` — an unruled new module in a
pathspec the lane may not touch, whose stated purpose is not achieved.**
Confidence 0.95.
Build sheet §2.2: lane `designer` **"May not touch: `packages/**`"**. §2.0's T0
handshake permits exactly one shared commit — the backend lane's types commit,
cherry-picked. I diffed the two lanes: `commercial.ts` and `agreement.ts` are
**byte-identical** to `agent-agr-w1-backend`'s (good), and `index.ts` differs by
exactly the `export * from "./agreement-copy";` block (merges clean). But
`agreement-copy.ts` itself is a new 51-line module with **one** consumer.
Its header claims *"one source, two surfaces … both renderers must read it from
here rather than repeat it."* I grepped the client lane:
`grep -rn "agreement-copy\|AGREEMENT_PART_COPY"` over
`agent-agr-w1-client/apps` and `/packages` → **no matches**. The client lane
retypes all six sentences literally in its own
`apps/client-portal/src/components/agreement-parts-body.tsx` (`:69`, `:153`,
`:337`). The module buys nothing today and is an unruled boundary crossing.
Either the client lane imports it (and the deviation gets a ruling), or it
folds back into the designer app.

**D-R8 · The app-local `useStudioAgreementDefaults` collides with the frozen
interface's hook on the same query key, with an incompatible shape.**
Confidence 0.9.
Build sheet §2.4 freezes `useStudioAgreementDefaults(studioId)` as a
`@patina/supabase` hook, and §2.1 assigns
`packages/supabase/src/hooks/use-studio-agreement-defaults.ts` to the backend
lane — which built it. The designer lane built a second one at
`apps/designer-portal/src/hooks/use-studio-agreement-defaults.ts`, keyed
`['studio-agreement-defaults', studioId]` — **the same key** — but returning
`StudioAgreementDefaultsRow` (snake_case) where the package hook returns
`StudioAgreementDefaults` (camelCase: `rateCard`, `depositPercent`,
`retainerCreditRule`, `defaultExclusions`). The file's own comment promises
*"the integration step is a one-line import swap, not a behaviour change."*
That is false: swapping the import leaves `account-studio-page.tsx` reading
`agreementDefaults.rate_card` / `.deposit_percent` / `.retainer_credit_rule` /
`.default_exclusions` — all `undefined` — which seeds an empty form and then
**upserts that empty form over the studio's saved defaults** on the next Save.
Fix at integration must be the field rename, and the card's tests must be
re-pointed at the package hook.

**D-R9 · The defaults read fails soft on *every* error, including a denied one
— and a Save then overwrites the studio's row.** Confidence 0.85.
`use-studio-agreement-defaults.ts:115`:
`if (error) return defaultStudioAgreementDefaults(studioId as string);`
This is exactly the rule the lane itself wrote for parts one commit earlier
(`91288fb4f` "fail soft on a missing parts table only, never on a denied
read"), applied backwards here. A denied read, a dropped connection or a
schema-cache miss resolves to the Patina standard; the seeding effect fills the
form with empty rate card / null deposit; `agreementDefaultsDirty` compares
against that same fallback, so one field edit flips dirty and
`handleSaveAgreementDefaults` upserts **every** column — wiping a stored rate
card and deposit the reader could not see. Narrow the catch to
`42P01`/`PGRST205` exactly as `isMissingRelation` does in
`use-commercial-documents.ts:334-347`.

### MINORS

**D-R10 · `FEE_VARIANTS` silently replaces the sheet's R-5 rule.**
Confidence 0.95. Build sheet §4.4 R-5: *"at least one part whose `variant` is
in `AUTHORITY_VARIANTS`."* `readiness.ts:58` substitutes
`["rate_card","flat","per_phase","ceiling"]`, dropping `retainer` and
`cadence`. The reasoning in the comment is sound (a retainer is not a fee) and
the test at `:267` pins it, but no ruling records the deviation — R20 records a
different one. Needs a ruling or a revert.

**D-R11 · The `admin-portal build` gate was never run by the lane.**
Confidence 1.0. Sheet §4.6 assigns it to this lane's P0 item verbatim. The
notes concede it twice. I ran it (see gates): green. No defect behind it, but
the lane reported P0 complete without its named gate, and the note that
*"This lane changed no `packages/**` file"* (designer-notes.md, "Not verified")
is contradicted by `bab1b9b92`, `883586d43` and `96634b560`.

**D-R12 · The parts read runs on the flag-off path and can now blank a room
that renders today.** Confidence 0.8.
`use-commercial-documents.ts:416` awaits `fetchAgreementParts` unconditionally
in `fetchCommercialDocumentBundle` — for every commercial document, flag on or
off — and it sits **before** `if (proposalResult.error) throw` at `:418`. Two
consequences: (a) a serial extra round-trip on every flag-off room; (b) any
parts-read failure that is not `42P01`/`PGRST205` throws first, masking the
proposal/terms error and rendering the room's error gate where the seven facets
render today. Markup byte-identity is intact; the data path's failure surface
is not.

**D-R13 · The read-only Account view prints raw stored values.**
Confidence 0.9. `account-studio-page.tsx` non-manager `<dl>`:
`{agreementDefaults?.cadence ?? '—'}` → `biweekly`;
`{agreementDefaults?.retainer_credit_rule ?? '—'}` → `non_refundable`. The
manager view two hundred lines above shows "Every two weeks" and
"Non-refundable" from `AGREEMENT_CREDIT_RULES`. A plain member reads machine
text where an owner reads English.

**D-R14 · Money formatting drift in the same card.** Confidence 0.9.
`agreementDollars = (cents) => (cents / 100).toString()` renders
`$125.5/hr` in the read-only `<dl>`, where every other money surface in the
wave goes through `Intl.NumberFormat`.

**D-R15 · The e2e spec and its gate command diverge from the sheet.**
Confidence 1.0. Sheet §2.2 / §6.6 name
`e2e/agreement/agreement-parts.spec.ts` and a modification to
`playwright.config.ts`; the lane shipped
`agreement-parts.agreement.pw.ts` + a derived `playwright.agreement.config.ts`.
The justification is real and documented
(`feedback_playwright_config_secret_scan_trap.md`), but the sheet's gate line
no longer runs anything and the spec is excluded from the default e2e run —
so nothing in CI or in the integration gate list will ever execute it unless
the steward adds the `--config` invocation.

**D-R16 · `readCents` rounds a percent.** Confidence 0.85.
`part-kinds.ts:170-174` is reused for `depositPercent`; a 12.5% deposit becomes
13. `readCents(true)` returns `1`. Neither is reachable from the editor (which
clamps and rounds first), both are reachable from a payload written elsewhere.

**D-R17 · The composed body renders on `/doc` surfaces with no flag.**
Confidence 0.9. `commercial-document-body.tsx:42` and
`service-agreement-instruments.tsx:131,356,367` pass `parts` unconditionally.
Defensible — it matches the client surface, which W1 ships unflagged (§5) —
and it is what makes P0's "Not yet set never renders on a sendable document"
true off the composer. But it is beyond §2.2's file list and beyond "flag
branch only", and it means a flag-**off** designer sees a composed body. Wants
a one-line ruling rather than a silent choice.

**D-R18 · Flag-on, non-draft, zero parts renders an empty composition.**
Confidence 0.6 that it is reachable at all.
`agreement-composer.tsx:104-106` skips materialize when `readOnly`, so a sent
legacy agreement shows "This agreement has no parts yet." in the rail and
"Pick a part on the left, or add one." in the centre —
`agreement-composer.test.tsx:242` and `:461` pin exactly this. Contract §2:
*"proposals with no parts rows render as today (the seven-facet room, flag-off
path)."* Mitigated in practice: `drafting-room.tsx:156-159` redirects any
document whose `draftingEditability` is not `editable` before the composer
mounts, so the state is close to unreachable through the product. Left minor
for that reason, not because the copy is right.

**D-R19 · Nothing pins the preview's flag-off markup.** Confidence 0.85.
`service-agreement-preview.tsx` was re-indented wholesale into a
`{composed ? … : <>…</>}` fork, and the room snapshot does **not** cover the
preview body (grepped the `.snap`: "Design authorization ceiling · dollars" is
the room's own input label, not the preview's figure). I reasoned the JSX
through — fragment children and whitespace-only JSX lines do not reach the DOM,
and `ceilingIsSet` / `retainerIsSet` answer identically for non-null input — so
I believe it is byte-identical, but the wave's own standard is a snapshot, and
there isn't one.

### NITS

**D-R20** `UnsupportedPartCard` (`part-editor.tsx:576-580`) prints raw
`{kind} · {variant}` — "schedule · percent_of_cost" — to the designer. Sheet
§4.2 sanctions "kind/variant as a mono chip", so this is the sheet's nit as
much as the lane's, but it puts underscored machine vocabulary on the page.

**D-R21** The R-11 blocker prints a raw key: `"Two parts share the key
patina.ceiling. Rename one."` (`readiness.ts:101`).

**D-R22** `agreement-copy.ts`'s header claims *"Every string below is the
client shell's own wording."* Only three of six are on `main`'s
`commercial-document-shell.tsx` (`:240`, `:241`, `:248`); `ceilingUncapped`,
`recorded` and `attachmentAcknowledgment` are new.

**D-R23** Attachment eyebrow renders `Attachment A · {title}`; sheet §4.5
specifies `ATTACHMENT · {title}`. The added letter is an improvement, but it
is an unrecorded deviation and the client lane must match it.

---

## What I checked and found correct

- **Flag branch** is above every early return, reuses `AgreementGate` and its
  exact message, and fails closed on `useFeatureFlag`'s `{value:false,
  isLoading:true}` (`service-agreement-drafting-room.tsx:80-90, 105-118`).
- **Flag-off snapshot provenance**: added by `ba80eee66`, never re-recorded,
  and it passes against `main`'s room file (my substitution test above). This
  is the one gate a lane can fake, and this one is honest.
- **P0 DTO collapse**: `ServiceAgreementTerms` / `ServiceRate` are aliases, not
  second declarations; the vocabulary arrays re-export. I ran the sheet's own
  §4.6 grep over `apps/designer-portal/src` — every `trade_scope`-sensitive
  branch routes through `commercialDocumentExperience`, whose `default:`
  returns `'legacy'`; the two pinning tests exist
  (`commercial-documents.test.ts:76-84`).
- **Composer key**: `key={proposalId}`, not the terms `updatedAt` — the fix in
  `0c8e4f19d` is right, and its regression suite
  (`service-agreement-drafting-room-composer-key.test.tsx`) pins it.
- **Save identity**: `persist()` re-selects by `partKey` because the RPC is
  DELETE-then-INSERT and hands back new uuids. Correct, and tested.
- **Materialize**: ref-guarded against StrictMode, skipped when parts exist and
  when read-only, tested three ways.
- **R6 freeze**: `readOnly` removes `+ Add a part` and every row menu; tested.
- **R8**: the renderer filters `clientVisible !== false` and skips
  `attestation`; tested.
- **Unknown kind/variant**: `UnsupportedPartCard` and the renderer's
  `RecordedLine` never throw and never print raw JSON; tested both for an
  unknown kind and an unknown schedule variant.
- **F-2 fallout**: `money-region.tsx`, `project-authority-band.tsx` and
  `adaptProjectBillingAuthority` all say "no ceiling"/"No ceiling" rather than
  `$0`, with tests. This is §4.6's "grep every reader" done properly.
- **Vocabulary**: no "clause library", no "contract builder" outside the
  comment that forbids them; no "facet" in composer copy (every hit is a
  comment, a test name, or `main`'s own flag-off string); no badge, no colour
  status, no emoji, no count chip beyond the room's existing `count` slot,
  which `main` already uses for "N of 7 facets written".
- **Commit hygiene**: 27 commits, explicit pathspecs throughout, Conventional
  subjects, no `merge(...)`, no trailers, no `git add -A`. Program docs
  force-added. Working tree clean.

---

## Verdict

**fix** — four blockers (D-R1 … D-R4) and five majors (D-R5 … D-R9). None of
them is in the lane's finished work being wrong about itself; the blockers are
R17/R18/R21, ruled 41 minutes after the lane stopped, and the majors are two
real UI/DB mismatches (D-R6, D-R9), one integration trap (D-R8) and one
boundary crossing (D-R7). The built surface itself — the flag branch, the
composer, readiness, the preview fork, the defaults card, the P0 collapse — is
sound, gated, and honestly evidenced.
