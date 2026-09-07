# Wave 2 — client lane notes

**The Agreement, Composed** · Wave 2 (*the Library*) · 2026-09-07
Lane: `client` · Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(`git -C … rev-parse --show-toplevel` →
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`)
Branch `agreement/w2-client` · wave base `a6584dbc5a07dd91af9eec67489ec669deb5961e`,
**lane start `213686f399cf6f9635daf1dbad03dd822e3786e4`** — the T0 handshake commit
(`feat(types): agreement parts vocabulary and payloads`, one file,
`packages/types/src/agreement.ts`) was already cherry-picked onto this branch before the
lane opened. It is not this lane's work and was not touched.

Lane head `4ff95d3adf27652dcbc042adb73a881019bbb82e`.
**15 files changed, +1464 / −22** against the lane start: 14 under `apps/client-portal/`
plus this log. No file outside the lane's pathspec was touched.

---

## 1 · W1 pre-flight

```
grep -n "parts" apps/client-portal/src/components/commercial-document-shell.tsx
  14:  import { AgreementPartsBody } from '@/components/agreement-parts-body';
 205:  if (bundle.composed ?? bundle.parts.length > 0) {
 206:    return <AgreementPartsBody parts={bundle.parts} currency={terms.currency} />;
```

W1's client render is present, so this lane's job was to **extend** it, as the build sheet
requires. `AgreementPartsBody` already drew attachment leaves with the lettered
`ATTACHMENT A · …` eyebrow and its own rule; Wave 2 moved them and made the
acknowledgment real.

---

## 2 · What landed, item by item

| Build sheet item | Where | Commit |
|---|---|---|
| §5.1 `composeConsentLine`, one new export, every legacy export byte-identical | `components/threshold/consent-copy.ts` | `be2b39375` |
| §5.2 the drift cases | `components/threshold/__tests__/consent-copy.test.ts` (one added `describe`, no existing block touched) | `be2b39375` |
| Bundle DTO: `consentSentence`, `executionSnapshot`, per-signature `consentSentence` | `lib/commercial-documents.ts` + its spec | `f4527d262` |
| §5.3 the door: composed consent, attachment ticks, widened POST body | `components/threshold/door-gate.tsx` + spec | `55baee765` |
| §5.3 the sign route: `p_consent`, server-side acknowledgment check | `app/api/proposals/[id]/sign/route.ts` + spec | `326712e87` |
| §5.4 the keepsake: frozen snapshot + the sentence she ticked | `components/record/record-sheet.tsx`, `app/proposals/[id]/record/page.tsx` + spec | `782456758`, spec restored in `66fe78e11` |
| M5 attachments as leaves below the body | `components/agreement-parts-body.tsx` + shell spec | `3b85d5b1d` |
| e2e touchpoint | `tests/threshold.spec.ts` | `0b039c9cc` |

### The composer

Canonical fragment order, fixed and independent of the designer's part order:
`rate_card · ceiling · flat · per_phase · retainer · procurement`. `cadence` contributes
nothing; the eight record-only variants contribute nothing (R9). Only `kind === 'schedule'`
parts with `clientVisible === true` contribute. Zero fragments — or `null` / `undefined` /
`[]` parts, or any kind outside `design_services | service_addendum` — returns
`consentLineFor(kind)` **verbatim**, which is why the pinned blocks above it still pass
untouched.

Assembly: `'I agree to ' + oxford(['these design-services terms', ...fragments]) + ', and
understand my signature alone does not authorize work until the studio countersigns.'`

**Thirteen** cases in the new block (the sheet's twelve, plus `service_addendum` composing
identically to `design_services`). Every sentence asserted with `toBe`.

### The sentences the SQL side must match byte-for-byte

Reproduce these verbatim in `supabase/tests/commercial/agreement_fee_schedules_test.sql` —
they are the literals `consent-copy.test.ts` pins, and the drift test exists to catch a
change made on one side only.

```
legacy / zero money parts:
I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.

nine standard parts (rate_card + ceiling 24000_00 + retainer 5000_00 credited + cadence + deposit 50%):
I agree to these design-services terms, the signed role rates, the design authorization ceiling, the retainer credited against fees, and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.

patina.consultation (rate_card + ceiling):
I agree to these design-services terms, the signed role rates, and the design authorization ceiling, and understand my signature alone does not authorize work until the studio countersigns.

flat only:
I agree to these design-services terms and the flat design fee, and understand my signature alone does not authorize work until the studio countersigns.

per_phase + non-refundable retainer:
I agree to these design-services terms, the per-phase fee schedule, and the retainer, which is not refundable, and understand my signature alone does not authorize work until the studio countersigns.

patina.furnishings_services (procurement deposit only):
I agree to these design-services terms and the furnishings deposit, and understand my signature alone does not authorize work until the studio countersigns.
```

Note the legacy literal has **no** comma before "and understand"; every composed form does.

---

## 3 · What the backend lane must emit for this client to work

Coded against the build sheet's frozen interfaces. Three of them are load-bearing:

1. **`get_client_commercial_document_bundle`** gains `consentSentence` (text) and
   `executionSnapshot` `{ html, documentHash, createdAt }`. Both are read tolerantly
   (camelCase or snake_case, top level or on the nested document object) and both are
   inert when absent — every document today, and every flag-off document tomorrow, adapts
   to `null`.

2. **Each signature row in the bundle must carry the consent sentence its own metadata
   recorded.** The adapter reads a flat `consentSentence` / `consent_sentence` on the
   signature row, or the same key inside a nested `metadata` object. **This is not in the
   build sheet's frozen bundle list** — §5.4 requires the keepsake to print what she
   ticked rather than re-compose it, and the only place that sentence lives is
   `commercial_document_signatures.metadata.consentSentence`. If the RPC projects neither
   shape, the keepsake silently prints no agreed sentence (it does not break, it just says
   nothing). **Raise this to the backend lane at integration.**

3. **`sign_design_services_agreement_with_trusted_ip` must accept `p_consent jsonb`
   before the client portal deploys.** The route sends `p_consent` on **every**
   design-services signature, composed or not — the un-composed case sends
   `{consentSentence: null, attachmentsAcknowledged: []}`. Deploy order is therefore
   binding: **migration first, portal second** (build sheet §10 already orders it this
   way). A portal shipped ahead of the migration turns every services signature into
   `sign_failed`. The rollback lever is the same in reverse: the migration is additive and
   the old four-argument call still resolves through the default, so the previous Worker
   keeps working after the migration lands.

Attachment parts must reach the bundle with `partKey` (W1 already sends it) and
`payload.acknowledgeRequired === true`; the route reads both spellings of each.

---

## 4 · Decisions and deviations, with reasons

- **`composeConsentLine(kind, bundle.parts)` maps rather than passes.** `ConsentPart` is
  the frozen shape and carries `clientVisible`; `CommercialAgreementPart` does not, because
  the bundle drops every hidden part before the row crosses that edge (W1's DTO says so in
  its own doc comment). The door maps with `clientVisible: true` and says why in a comment.
  Rule 1 of the composer is still enforced, and the `clientVisible: false` drift case is
  covered directly against the composer.

- **The record sheet gained `agreedSentence` beside `consentSentence`, not instead of it.**
  `consentSentence` on that component is the *method* statement ("Signed electronically by
  typed name: Harper Vale."), which the sheet has always carried and which the Wave 1 spec
  pins. What she agreed to is a different fact and takes its own line. Both come from the
  signature row; neither is re-composed at read time.

- **Attachments moved out of the body's `space-y-8` and below its closing boundary** (M5),
  in `agreement-parts-body.tsx` rather than in `commercial-document-shell.tsx` — the shell
  delegates the composed body to that component, so that is where the leaves live. The
  rail (`data-testid="agreement-attachments"`) is not drawn at all when the agreement
  carries no attachment. The existing W1 ordering assertion still passes unchanged.

- **No new refusal token.** A required attachment left unticked answers `409 not_signable`,
  which the door already speaks — `REFUSAL_TOKENS` is pinned by the drift guard against the
  route source on disk, so a new token would be two edits for a state the client already
  reads correctly. Unknown acknowledgment keys are dropped silently.

- **The consent sentence recorded against a signature is the DATABASE's**, read off the
  bundle, never the browser's. A test drives a browser that sends its own
  `consentSentence` and asserts the route ignores it.

---

## 5 · The gap this lane could not close

**The e2e touchpoint the build sheet names — "a seeded per-phase agreement's door shows the
composed consent sentence, the acknowledgment gate blocks the hold action until ticked, and
after signing the DB carries the metadata" — cannot be written inside this lane's
pathspec.** Evidence:

- `supabase/seed/the-client-page.sql` lays the solo household's design-services agreement,
  furnishings authorization and trade scope down **all executed** (`:551`, `:254`, `:670`).
  There is no `sent` commercial document for either seeded client, so there is no door on
  the page to drive.
- The seed writes **no `commercial_document_signatures` rows at all**
  (`grep -rn "commercial_document_signatures" supabase/seed/*.sql` → only the ACL seed), so
  the keepsake for the seeded agreement takes its "nothing to keep" branch.
- `supabase/seed/**` is the backend lane's pathspec, and R26 forbids a conditional
  assertion ("assert it if the stack carries one").

What was written instead, unconditionally, is the half of §5.4 the current fixture *can*
prove: `/proposals/<id>/record` still answers 200 rather than folding onto `#door`
(`retired-routes.ts` leaves it standing), and the sheet says nothing at all about an
agreement-as-executed it does not carry — R12's rule for an execution that predates the
snapshot, which is the state every existing production agreement is in. The composed
reading also now asserts the attachment rail is absent when the agreement carries none.

**Ask for integration:** a seeded `sent` per-phase design-services agreement with one
`acknowledgeRequired` attachment, addressed to `client-solo@patina.dev`, would let the door
half of the touchpoint be written in an hour. Until then the three behaviours are covered
by jest (`door-gate.test.tsx` — composed line, tick gate, POST body; sign route spec —
`p_consent` contents and the 409) and by walk steps 9–10.

---

## 6 · Gates

Run from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(bare `cd` first, its own Bash call).

| Gate | Command | Result |
|---|---|---|
| Types | `pnpm --filter @patina/client-portal type-check` | clean (`tsc --noEmit`, no output) |
| Jest | `pnpm --filter @patina/client-portal test` | **129 suites · 2035 tests · 1 snapshot — all passed** (base was 1995) |
| Coverage floor 70/60/70/70 | `pnpm --filter @patina/client-portal test:coverage` | **74.16 / 69.48 / 74.26 / 76.48 — over floor** |
| e2e touchpoint | `TZ=UTC npx playwright test tests/threshold.spec.ts --workers=1 --grep "claims no snapshot"` with `SUPABASE_SERVICE_ROLE_KEY` exported from `supabase status -o env` | **1 passed (37.3s)** |

Suite-level evidence for the two most load-bearing files:

```
consent-copy.test.ts        40 passed  (13 of them the new composer block)
door-gate.test.tsx          51 passed  (7 of them the composed-door block)
sign/route.test.ts          21 passed  (6 of them Wave 2)
proposals/[id]/record       16 passed  (4 of them Wave 2, 12 restored Wave 1)
commercial-document-shell   72 passed  (2 of them the attachment rail)
commercial-documents.test   55 passed  (9 of them the new bundle keys)
```

The e2e was run against the shared local stack **read-only** — the added test issues GETs
only, seeds nothing, and parks nothing. The stack was not reset, stopped or written to;
`http://127.0.0.1:54321/rest/v1/` answered 200 before and after, and the dev server
Playwright started was torn down with it (`lsof -ti:3002` empty afterwards).

### Not run, and why

- `pnpm supabase:reset` and the SQL suites — the backend lane owns the migrations and this
  lane may not reset the shared stack.
- `pnpm db:generate` — no schema change in this lane.
- designer-portal and admin-portal gates — no file of theirs was touched, and this lane
  changed nothing under `packages/`.
- The rest of `tests/threshold.spec.ts` — only the added test was run. The two
  pre-existing reds recorded at Wave 1 (`threshold.spec.ts:158` timezone, `:221` seed
  accumulation) are untouched by this diff.
- `pnpm --filter @patina/client-portal lint` — **fails on the base with 11 errors**, every
  one in a file this lane did not touch (`auth/invite/[token]/page.tsx`,
  `auth/verify-otp/page.tsx`, `field/[token]/site-request-guest.tsx`,
  `quiz/results/results-view.tsx`, `components/auth/ClientPortalLogin.tsx`,
  `components/proposal-document.tsx`, `components/threshold/approval-ask.tsx`,
  `hooks/use-aesthete-matches.ts`, `hooks/use-feature-flag.ts`, `hooks/use-hydrated.ts`).
  It is not a build-sheet gate for this portal. Pre-existing; recorded, not fixed.

---

## 7 · One thing that went wrong, and how it was caught

The keepsake's spec at `app/proposals/[id]/record/__tests__/page.test.tsx` **already
existed** on the wave base and was overwritten rather than extended — twelve Wave 1 cases
(the release sentence, the paper-signed mark, the twelve-character fingerprint discipline,
the never-an-IP rule, and every refusal branch) were lost for four commits. Caught by
reading `git diff --numstat` against the base and seeing 208 deletions on a file that
should have had none. Restored verbatim from `a6584dbc5` — given only the two keys the
widened DTO now requires — with the Wave 2 cases appended as their own block
(16 tests, all passing). Recorded here because the reviewer should check the same way:
`git diff <base> HEAD --numstat` and question any deletion count that is not explained by
a named refactor.

---

## 8 · Vocabulary

Swept the whole diff for the forbidden words (R7 and the homeowner rules): `clause
library`, `contract builder`, `snippet`, `block`, `section`, `variant`, `dashboard`,
`overdue`, `AI`, `badge`, `confetti`. Every hit is a code identifier, an HTML element name,
or a comment — no designer- or homeowner-facing string carries one. The homeowner strings
this lane adds in full:

- `I received {attachment title}.` (the door's tick)
- `Tick each attachment you received, type your full name, and tick the line to sign.` (the hint)
- `The agreement as executed` (the keepsake's eyebrow)
- `Mark {twelve characters}` (the keepsake's frozen-document mark, the existing idiom)
- the composed consent sentences above.

---

# Round 1 fixes — 2026-09-07

Against `03a5a233a` (the review commit). Findings C1–C5 from
`client-review-r1.md`. Gates re-run and pasted in §F6 below.

**10 files changed, +544 / −21** — nine under `apps/client-portal/src`, one
under `apps/client-portal/tests`, plus this log.

| # | Severity | Where it landed |
|---|---|---|
| C1 | blocker | `tests/threshold.spec.ts` — the touchpoint the sheet names, written in full |
| C2 | major | escalated, §F1 — a one-line amendment to the frozen bundle interface |
| C3 | major | `consent-copy.ts` + `door-gate.tsx` + `record/page.tsx` — the summary no longer names terms the paper does not carry |
| C4 | major | `sign/route.ts` — `p_consent` only when there is something to record |
| C5 | major | `record-sheet.tsx` — the snapshot is made inert, and a case pins it |

---

## F1 · ESCALATIONS — three asks that need the orchestrator, not this lane

### E1 (C2) · CONTRACT AMENDMENT REQUEST — one scalar key on the bundle's signature projection

**Ask:** add to `get_client_commercial_document_bundle`'s per-signature
projection, in the same migration that widens the signature metadata:

```sql
'consentSentence', s.metadata->>'consentSentence',
```

**Why it is not optional.** Build sheet §5.4 requires the keepsake to print the
sentence she ticked *from the signature's own metadata*, never
`compose_agreement_consent` at read time — an addendum moves the parts, and a
record that quietly restates today's terms is a record of a signature nobody
gave. The only place that sentence lives is
`commercial_document_signatures.metadata.consentSentence`, which
`00575_agreement_parts.sql` deliberately does not cross that edge:

> *Raw metadata never crosses this edge — it carries `recordedBy`, which is a
> studio member's uuid, and the client has no business with it.*

That discipline is right and the amendment keeps it: **a scalar text key
extracted with `->>`, never the metadata object.** No uuid, no actor, nothing
but the sentence she agreed to.

**Until it is ruled and built,** `record-sheet`'s `agreedSentence` is null for
every signature and §5.4's "what she agreed to" ships dead. The client adapter
already reads a flat `consentSentence` *or* a nested `metadata.consentSentence`
on the signature row (`lib/commercial-documents.ts:715-717`), so either
projection shape works and no client change is needed once it lands. Nothing
breaks in the meantime — the line is simply absent.

**Who rules:** the orchestrator, before the backend lane merges. The frozen
bundle interface in build sheet §2 lists only document-level `consentSentence`
and `executionSnapshot`, and §2 says a lane that needs another lane's change
raises it rather than reaching across. This is that raise.

### E2 (C3) · RULING RECORDED, AND THE READING TAKEN

The reviewer found the composed door contradicting itself: `summaryLineFor`'s
services sentence — *"By signing, you accept the services, signed role rates,
design authorization ceiling, retainer, and terms in …"* — was printed directly
above a consent line that may read *"…and the flat design fee"*. On a flat-fee
or per-phase agreement the homeowner was told, **on the signing surface**, that
she accepts role rates, a ceiling and a retainer the paper does not contain.

The build sheet froze `summaryLineFor` byte-identical (§5.3, "Nothing else in
the gate changes"), so the lane was compliant — and composition is exactly what
made the frozen sentence false. **A false statement on a signing act is not a
thing to leave standing while a ruling is sought**, so this lane took the
reviewer's second option and says so here rather than shipping the
contradiction:

- `summaryLineFor` is **untouched, still byte-identical**, still exported, still
  pinned by its own tests. It answers every uncomposed paper.
- A new **add-only** export, `composeSummaryLine(kind, title, parts)`, returns
  `summaryLineFor` verbatim for any paper with no parts — flag off, legacy,
  pre-Wave-2 — and for every kind but the two services kinds. For a **composed**
  agreement it returns the half that is true of all of them:

  > `By signing, you accept the terms in “{title}”. The agreement becomes effective only after the studio countersigns.`

  Both sentences are `summaryLineFor`'s own words; the composed one is its
  second half, verbatim, with the four-facet clause reduced to "the terms".
- The door (`door-gate.tsx:520`) and the keepsake's `question`
  (`record/page.tsx`) both call it. What money the paper carries is named once,
  below, by `composeConsentLine`.

**If the orchestrator prefers option one** — compose `summaryLineFor` from the
same parts, so the summary enumerates them a second time — it is a change to one
function and its six new cases. This lane's reading is that saying the money
twice on one leaf is worse than saying it once, and that the reduction is the
smaller edit to a frozen string.

### E3 (C5) · HOLD THE RENDERER TO THE FULL ESCAPE CHAIN

`public._render_agreement_snapshot_html` is the whole escaping contract for the
one piece of markup this portal sets rather than writes. Two asks on it:

1. **Escape `'` as well as `& < > "`.** Build sheet §3.3 names a four-character
   replace chain. A single quote inside a designer-typed part title lands inside
   an attribute the moment the renderer emits one, and `<table>`/`<article
   class="leaf">` already do.
2. **SQL test case 7 should assert inertness, not only presence.** Give a part a
   title and a body carrying `<script>`, `<img src=x onerror=…>` and `'`, and
   assert the rendered `html` contains no `<script`, no `onerror` and no bare
   quote inside an attribute.

The client no longer *depends* on either (see F5), but a snapshot is written
once and kept for years; the escaping is the layer that should be right.

---

## F2 · C1 — the e2e touchpoint, written

`tests/threshold.spec.ts` now carries the test build sheet §6 names, in one act
and unconditionally (R26):

1. the door of a seeded per-phase agreement shows the composed consent
   sentence, asserted with `toHaveText` against the literal — the same string
   `composeConsentLine` and `compose_agreement_consent` must both produce;
2. the acknowledgment gate: name typed and consent ticked, the act is still
   **disabled** and the hint says why; ticking *I received the lead-paint
   notice.* arms it;
3. after signing, **`expect.poll` against the database** — the client
   signature's `metadata->>'consentSentence'` equals the composed line and
   `metadata->'attachmentsAcknowledged'` equals `['patina.lead_paint_notice']`.

Mechanics worth naming:

- The DB read goes through a lazily-built service-role client, the pattern
  `pay-link.spec.ts` / `plans-link.spec.ts` already keep in this directory. The
  key is **not** written into the file (the pre-commit scan rejects any file
  carrying a service_role JWT, the CLI's demo key included) — it is exported
  from `supabase status` before the run, exactly as those two say.
- The act is a press-and-hold, so it is driven as one: `mouse.down()`, wait on
  the `data-hold-state="holding"` attribute the control itself publishes, and
  release once the doorway has gone. **No `page.waitForTimeout` anywhere** —
  `grep -n waitForTimeout tests/threshold.spec.ts` returns one hit, and it is
  the sentence in the doc comment saying there is none.
- Assertions poll (`expect`/`expect.poll`), never `networkidle`.

### THE FIXTURE THIS TEST NEEDS — the ask that goes with it

`supabase/seed/**` is the **backend lane's** pathspec, and this lane may not
write there. The seed today lays every commercial paper down **executed**
(`the-client-page.sql:255`, `:552`, `:671`) and writes no
`commercial_document_signatures` row at all, so there is no `sent` door on
either seeded client's page for any e2e to drive. R26 says a seed file creates
the fixture; this is the fixture it must create:

⚠ **Use `…cb04`, not `…cb02`.** The first draft of this ask named `…cb02`, which
is already the solo household's seeded **furnishings authorization**
(`the-client-page.sql:358`, `v_fa_proposal`) — implemented literally,
`pnpm supabase:reset` would fail on a duplicate primary key. `…cb01` is the
composed agreement and `…cb03` the trade scope; `…cb04` and `…cb05` are free.
The spec's `PER_PHASE_AGREEMENT_ID` now reads `…cb04`.

```sql
-- In supabase/seed/the-client-page.sql, beside v_ds_proposal, in the same
-- draft → terms → parts → promote order the composed agreement above uses.
-- Left at 'sent': this is the one door the client suite drives.
--   proposals   b0000000-0000-0000-0000-00000000cb04
--               'Cedar Lane — Phase Work', design_services,
--               status 'sent', commercial_state 'sent',
--               client uid_solo, designer uid_designer, project v_project
--   parts       1 clause              'Services'
--               2 schedule/per_phase  'Phase fees'
--                   {"phases":[{"key":"concept","label":"Concept","cents":350000},
--                              {"key":"documentation","label":"Documentation","cents":450000},
--                              {"key":"selections","label":"Selections","cents":300000}]}
--               3 schedule/retainer   'Retainer'
--                   {"cents":500000,"creditRule":"non_refundable"}
--               4 attachment          part_key 'patina.lead_paint_notice',
--                   title 'the lead-paint notice',
--                   {"body":"…","acknowledgeRequired":true}
--               5 clause              'Terms'
--   signatures  none — the e2e writes the client's
```

The expected sentence, byte for byte, is the per-phase + non-refundable-retainer
row of build sheet §5.1 and is pinned as `PER_PHASE_CONSENT_LINE` at the head of
the spec.

**The test is written against that fixture and runs unconditionally.** It goes
green when two things are true on the stack: the fixture above exists, and the
Wave 2 migrations are applied (the sentence comes from
`compose_agreement_consent` and the metadata from the widened
`sign_design_services_agreement_with_trusted_ip`). Both land at integration,
which is also where build sheet §7 runs `pnpm supabase:reset` **before** the
e2e — the order this test is written for, and the same order every SQL suite in
that list assumes.

**It signs, so it consumes the fixture.** Run twice against one stack with no
reset and the second run finds a door already open; that is the fixture's
nature, not a flake, and the spec says so at the constant.

**Not run in this lane**, and this is the one thing in this fix round without
command output behind it: the shared local stack carries neither the fixture nor
the Wave 2 migrations, and this lane may not write to it or reset it. What was
verified here is that the spec type-checks standalone (`tsc --noEmit` over
`tests/threshold.spec.ts`, clean) and that Playwright collects it
(`playwright test --list` → **16 tests in 1 file**, the new one at `:623`).

---

## F3 · C4 — the portal survives either deploy order

`sign/route.ts` sent `p_consent` on **every** design-services signature,
composed or not, flag on or off. PostgREST resolves an RPC by the argument
**names** it is given, so a client-portal Worker live ahead of the migration
that widens `sign_design_services_agreement_with_trusted_ip` cannot resolve the
call at all — and every services signature answers `sign_failed`, including
agreements carrying no parts. The deploy order was documented; nothing in the
code degraded.

Now the wider call is made only when there is something to record:

```ts
const composedBundle =
  commercialBundle?.composed === true ||
  commercialDocument?.composed === true ||
  (Array.isArray(commercialBundle?.parts) && commercialBundle.parts.length > 0);
…
if (composedBundle || required.length > 0 || consentSentence !== null) {
  signArgs.p_consent = { consentSentence, attachmentsAcknowledged: acknowledged };
}
```

An un-composed agreement — every agreement today, and every agreement with
either flag off — keeps taking the four-argument call it has always taken and
signs whichever way round the two deploys land. Four new route cases pin it:
nothing to record → **no `p_consent` key**; `composed:false` with an empty part
array → no key; one part → the key; `composed:true` → the key. The pre-existing
case at `:227` was re-pinned to the four-argument call with the reason written
above it.

---

## F4 · C3 — what the code now does

`composeSummaryLine` is add-only; `summaryLineFor` and every other export in
`consent-copy.ts` are still byte-identical, and the file's "nothing here may be
reworded" rule still binds them. Six new cases in `consent-copy.test.ts` (its
own `describe`, no existing block touched), two in `door-gate.test.tsx`, two in
the record page's spec. Reasoning and the alternative are in E2 above.

---

## F5 · C5 — the snapshot is made inert here too

`record-sheet.tsx` is the client portal's only `dangerouslySetInnerHTML`
(`grep -rln dangerouslySetInnerHTML apps/client-portal/src` → one file), and the
strings inside the snapshot are designer-typed part titles and bodies. The
escaping contract is real and is `_render_agreement_snapshot_html`'s — but it
lives in a database function on the far side of a deploy, and this sheet renders
inside the homeowner's signed-in PWA session. One layer is not enough for that.

`inertSnapshotHtml(html)` runs before the set: paired `<script>`/`<style>`
blocks removed **with their contents** (so a script's source does not survive as
visible text on the keepsake), then any stray
script/style/iframe/object/embed/link/meta/base/form tag, then every `on*`
handler attribute, then every `javascript:` URL in `href`/`src`/`xlink:href`. A
snapshot the renderer escaped correctly passes through untouched — there is
nothing in it for these rules to find.

Pinned by a case that feeds the sheet `<img src=x onerror=…>`, `<script>`,
`<a href="javascript:…">` and an `<iframe>` and asserts the rendered node
carries no `script`, no `iframe`, no `onerror`, no `javascript:` and no visible
trace of the script's source — while the agreement's own text still reads.

This is **defence in depth, not a replacement** for the server's escaping: E3
above still asks the backend lane for the full chain and the SQL assertion. A
string sanitizer is not a parser, and the layer that should be right is the one
that writes the snapshot once and keeps it.

---

## F6 · Gates, re-run

Run from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`.

| Gate | Command | Result |
|---|---|---|
| Types | `pnpm --filter @patina/client-portal type-check` | **clean** — `tsc --noEmit`, no output |
| Jest | `pnpm --filter @patina/client-portal test` | **129 suites · 2050 tests · 1 snapshot — all passed** (was 2035 before the fixes) |
| Coverage floor 70/60/70/70 | `pnpm --filter @patina/client-portal test:coverage` | **74.2 / 69.54 / 74.3 / 76.51 — over floor**, no threshold error |
| The touched suites | `test -- --testPathPattern "(consent-copy\|door-gate\|record\|sign)"` | **7 suites · 192 tests passed** |
| The e2e, type-checked | `npx tsc --noEmit … tests/threshold.spec.ts` | clean |
| The e2e, collected | `npx playwright test tests/threshold.spec.ts --list` | **16 tests in 1 file**, the new one at `:623` |

Unchanged from the first round, and still true: `lint` fails on the base with 11
errors in files this lane never touched, and it is not a build-sheet gate for
this portal; the SQL suites, `db:generate` and the other portals' gates belong to
lanes whose files this one does not carry.

### What was NOT verified, plainly

- **The new e2e has not been executed.** See the last paragraph of F2. It is
  written, it type-checks, Playwright collects it; it needs the seed fixture and
  the Wave 2 migrations, and this lane may neither write the seed nor touch the
  shared stack.
- **E1 is unresolved**, so `agreedSentence` is still null on every signature
  until the bundle projects the key.
- The `record-sheet` sanitizer is asserted against the four vectors named above,
  not against an exhaustive corpus.

---

# ROUND 2 — the adversarial review's four findings, answered

Four commits, no other file touched:

| Finding | Sev | Commit | What was done |
|---|---|---|---|
| R2-5 | major | `8ba20a5bb` | `composeSummaryLine` composes from the parts instead of reducing |
| R2-3 | major | `8f35d14d2` | the string sanitizer is gone; the frozen snapshot is set as written |
| R2-2 | major | `bdbeec893` | the dead `agreedSentence` block is cut, DTO field and all |
| R2-1 | blocker | `55ab07892` | the e2e fixture id moves off `…cb02`; the ask is corrected |

## R2-5 · the summary composes, it does not reduce

The reviewer is right on both counts: §5.3 said nothing else in the gate
changes, and the round-1 `composeSummaryLine` reduced on **any** composed
agreement — so the nine standard parts, where the frozen sentence was true and
complete, lost the services, the role rates, the ceiling and the retainer from
the signing surface. Reducing a true sentence is not a fix.

Option one, as offered. `composeSummaryLine` now walks the SAME parts through
the SAME presence rule (`consentFragment`) in the SAME canonical variant order
as the consent line, and maps each named term to the bare noun `summaryLineFor`
has always used — every retainer, whatever its credit rule, is "retainer" up
there; the rule belongs to the sentence she ticks:

```
By signing, you accept ${oxford(['the services', ...nouns, `terms in “${title}”`])}.
The agreement becomes effective only after the studio countersigns.
```

| Part set | Sentence |
|---|---|
| no parts at all | `summaryLineFor` **verbatim** (flag off, legacy, pre-W2) |
| rate_card + ceiling + retainer | `…the services, signed role rates, design authorization ceiling, retainer, and terms in “T”.` — **byte-identical to `summaryLineFor`** |
| the nine standard parts | the same, plus `furnishings deposit` before "and terms" |
| flat only | `…the services, flat design fee, and terms in “T”.` |
| per_phase + retainer | `…the services, per-phase fee schedule, retainer, and terms in “T”.` |
| composed, no visible money | `…the services and terms in “T”.` |

Two properties are now pinned rather than assumed: the classic set is asserted
`toBe(summaryLineFor(...))` — the commonest composed agreement says exactly
what Wave 1 shipped — and the summary can name nothing the consent line beneath
it leaves out, because both read presence from one function. Order is canonical
(reversed input, same sentence).

`summaryLineFor` itself is still untouched and still pinned by the drift guard.

## R2-3 · the frozen document is set, not rewritten

Reproduced exactly as reported. The four regexes ran over the whole snapshot
string, and `=` is not in the renderer's escape chain (`& < > "`), so ordinary
prose reached them and was edited:

```
<p>Phase one=Concept, phase two=Documentation.</p>  →  <p>Phase phase two=Documentation.</p>
<p>Delivery online=yes</p>                          →  <p>Delivery></p>
```

R12 makes that block the homeowner's copy of the agreement **as executed**, and
the mark under it is the document's fingerprint, not a hash of the HTML — so
nothing on the sheet, or years later, could detect the difference. A
string-level scrub is worse than none here.

`inertSnapshotHtml` is deleted and `executedHtml` is set as the database wrote
it. The guarantee is `_render_agreement_snapshot_html`'s escaping, held by
build sheet §6's SQL test 7, and it is deliberately the only one. A DOM-parsed
scrub was considered and rejected: `RecordSheet` renders through Next's server
pass, where `DOMParser` does not exist, and a parse/serialize round trip is
still a rewrite of a document the mark attests.

Two jest cases replace the hostile-payload one:

- **set byte-for-byte** — a benign body carrying `=` in its prose, asserted
  `expect(executed.innerHTML).toBe(frozen)`;
- **runs nothing** — a `<script>` inside the snapshot leaves its marker unset,
  because markup inserted through `innerHTML` never executes.

## R2-2 · the dead block is cut

Confirmed dead: `get_client_commercial_document_bundle`
(`00577_agreement_fee_schedules.sql:2242-2268`) enumerates a signature's keys —
`signedOnPaper`, `paperSignedOn`, `paperScanDocumentId` — and projects no
consent key, keeping 00425's rule. The DTO field was null for every signature,
the block never rendered, and the jest case fabricated the key on an
already-adapted bundle, so the suite was green over nothing.

Cut, not escalated a second time: the bundle addition is unruled, and this lane
may not widen a frozen interface it does not own. Removed — `RecordSheet`'s
`agreedSentence` prop and its paragraph, the page's wiring, the DTO field, the
adapter's read, and the two tests that stood on it. Kept — the **top-level**
`bundle.consentSentence`, which IS in the build sheet's frozen bundle list and
is what the sign route sends as `p_consent.consentSentence`; the sentence is
still recorded against the signature at insert.

What replaces the fabricated case is a pin with teeth: the adapter is asserted
to produce a signature carrying exactly the eight keys the RPC projects, so a
ninth added without a projection fails here rather than shipping blank.

**Still owed, and now the only thing owed for §5.4's second half:** a ruling on
one scalar — `'consentSentence', s.metadata->>'consentSentence'` in the bundle's
signature projection. With it, the prop and its paragraph come back in an hour.

## R2-1 · the fixture's id, and who owes it

`…cb02` is the solo household's seeded **furnishings authorization**
(`the-client-page.sql:358`, `v_fa_proposal`). The round-1 constant pinned it and
the round-1 ask named it for a NEW proposal — implemented literally,
`pnpm supabase:reset` fails on a duplicate primary key. Caught before it was
written, which is the only reason it cost nothing.

- `PER_PHASE_AGREEMENT_ID` is now `b0000000-0000-0000-0000-00000000cb04`
  (`…cb01` composed agreement, `…cb02` furnishings authorization, `…cb03` trade
  scope; `…cb04` and `…cb05` free).
- The §F2 fixture block above carries the same correction and a ⚠ naming the
  collision.
- The spec's fixture note no longer claims the seed lays this door down. It
  does not: every seeded commercial paper is executed and no
  `commercial_document_signatures` row is written at all.

The test stays **unconditional** (R26) and is **red until the fixture and the
Wave 2 migrations are on the stack** — its first assertion carries the reason in
its own message. It is not skipped, and it is not made conditional to hide the
gap.

**OWED BY THE BACKEND LANE OR THE INTEGRATION STEWARD, BEFORE THE E2E RUNS:**
the seeded `sent` per-phase agreement at `…cb04` with one
`acknowledgeRequired` attachment, exactly as §F2 spells it.

## Gates, round 2

Run from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(bare `cd` first, its own Bash call).

| Gate | Command | Result |
|---|---|---|
| Types | `pnpm --filter @patina/client-portal type-check` | **clean** — `tsc --noEmit`, no output |
| Jest | `pnpm --filter @patina/client-portal test` | **129 suites · 2054 tests · 1 snapshot — all passed** |
| Coverage floor 70/60/70/70 | `pnpm --filter @patina/client-portal test:coverage` | **74.25 / 69.61 / 74.31 / 76.54 — over floor** |
| The touched suites | `test -- --testPathPattern "(consent-copy\|door-gate\|record\|commercial-document)"` | **7 suites · 289 tests passed** |
| The e2e, collected | `npx playwright test tests/threshold.spec.ts --list` | **16 tests in 1 file** |
| No `waitForTimeout` | `grep -n waitForTimeout tests/threshold.spec.ts` | one hit, the doc line saying there is none |

The first full-suite run reported `129 total · 128 passed · 2035 tests passed`
with one suite failing to RUN — `A jest worker process (pid=49602) was
terminated by another process: signal=SIGSEGV`, no assertion failure. Re-run
immediately: 129/129, 2054 tests. Recorded rather than swept: a SIGSEGV in a
worker is the machine, not the diff, and the second run is the one that counts.

### Still not verified, plainly

- **The e2e has still not been executed**, and now for a named reason with a
  named owner (R2-1 above).
- `lint` still fails on the base with the same 11 errors in files this lane has
  never touched. Not a build-sheet gate for this portal.
- The SQL suites, `db:generate` and the other portals' gates belong to lanes
  whose files this one does not carry.
