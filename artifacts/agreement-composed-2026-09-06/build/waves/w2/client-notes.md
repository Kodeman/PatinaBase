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
