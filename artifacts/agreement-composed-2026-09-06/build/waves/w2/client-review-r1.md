# Wave 2 · client lane · adversarial review, round 1

**The Agreement, Composed** · 2026-09-07 · reviewer context is separate from the implementer's.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`
(`git -C … rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w2-client`).
Branch `agreement/w2-client`, head `2c9f5af29`, merge-base with `main` = `a6584dbc5` (the wave base
in `env.md`). `main` has moved one docs commit ahead (`8bc8bcc4d`); nothing in it touches this lane.

**Verdict: `fix`.** One blocker (the named e2e touchpoint is not delivered), five majors. No
refusal in homeowner copy, no vocabulary violation, no pathspec breach, both named gates green.

---

## Gates, run by the reviewer

Bare `cd` into the worktree in its own call, then:

| Gate | Command | Result |
|---|---|---|
| Types | `pnpm --filter @patina/client-portal type-check` | **clean** — `tsc --noEmit`, no output |
| Jest | `pnpm --filter @patina/client-portal test` | **129 suites · 2035 tests · 1 snapshot — all passed**, 11.22 s |
| Coverage floor 70/60/70/70 | `pnpm --filter @patina/client-portal test:coverage` | **74.16 / 69.48 / 74.26 / 76.48 — over floor** |
| e2e transpile | `npx playwright test --list tests/threshold.spec.ts` | 15 tests listed, the added one at `:490` |

Note the named `test` gate runs `jest` without `--coverage`, so the floor is only enforced by the
separate `test:coverage` script. Both were run.

Per-file coverage on the changed surfaces:

```
agreement-parts-body.tsx    100    / 90.14 / 100 / 100
door-gate.tsx              95.38  / 86.80 /  88 / 98.29
commercial-documents.ts    93.10  / 87.56 / 100 / 95.59
record-sheet.tsx           80.00  / 68.18 /  50 / 80.00
```

## Diff shape

```
16 files changed, 1599 insertions(+), 22 deletions(-)
```

`packages/types/src/agreement.ts` (+130) is **not** a pathspec breach: commit `213686f39` is the
T0 handshake, byte-identical to the designer branch's `213686f39` and patch-identical to the
backend branch's `68532c2a1` (`git patch-id --stable` → `fd2ed8857b06` for both). Everything else
is under `apps/client-portal/**` plus the lane log. Commits are Conventional, pathspec-scoped, no
trailers, working tree clean.

The keepsake spec incident the lane self-reports (§7 of its notes) checks out: `782456758` deleted
92 lines of Wave 1 cases from `record/__tests__/page.test.tsx`, `66fe78e11` restored them. Every
Wave 1 `it()` title on `main` is present at HEAD, in order; the only net change is the two new
bundle keys on `BUNDLE` plus the appended Wave 2 block.

---

## Findings

### C1 · blocker · the e2e touchpoint the sheet names is not delivered

Build sheet §6 "e2e touchpoint" and §7's gate `test:e2e -- tests/threshold.spec.ts` require **one
added test**: *"a seeded per-phase agreement's door shows the composed consent sentence, the
acknowledgment gate blocks the hold action until ticked, and after signing the DB carries the
metadata. Assert the DB write with `expect.poll`."*

What landed at `apps/client-portal/tests/threshold.spec.ts:490` asserts that
`/proposals/<id>/record` answers `200` rather than a redirect, and that no snapshot section is
drawn. It covers **none** of the three named behaviours. `git diff main...HEAD | grep expect.poll`
→ no match; there is no DB assertion of any kind in the diff.

The lane raised the cause honestly (its notes §5): `supabase/seed/the-client-page.sql` lays the
solo household's design-services agreement down `executed` (`:551`) with no
`commercial_document_signatures` row, so there is no `sent` door to drive, and `supabase/seed/**`
is the backend lane's pathspec. Both claims verified against the seed. That makes the fix a
cross-lane ask, not a rewrite — but the item is still missing, and the lane brief is explicit that
a missing item is a blocker.

**Fix:** ask the backend lane (or the integration steward) for a seeded `sent` per-phase
design-services agreement addressed to `client-solo@patina.dev` carrying one
`acknowledgeRequired` attachment, then write the test the sheet names, unconditionally (R26).

### C2 · major · the keepsake's "what she agreed to" is wired to a key nothing emits

`record/page.tsx:141` feeds `agreedSentence={signature.consentSentence}`, and
`commercial-documents.ts` reads that from a flat `consentSentence` on the signature row or from a
nested `metadata.consentSentence`. Neither exists.

`get_client_commercial_document_bundle` at its latest body
(`supabase/migrations/00575_agreement_parts.sql`, the `grep | sort | tail -1` head) enumerates
signature keys and says so in its own comment:

```
-- 00425: the paper tell, projected as a BOOLEAN and nothing more. Raw
-- metadata never crosses this edge — it carries recordedBy, which is a
-- studio member's uuid, and the client has no business with it.
```

and the build sheet's **frozen** bundle interface (§2, "Bundle additions") lists only the
document-level `consentSentence` and `executionSnapshot`. No per-signature key is in the contract.

So build sheet §5.4's central requirement — *"The consent sentence shown on the record comes from
the signature metadata, not from `compose_agreement_consent`"* — ships dead: `agreedSentence` is
`null` for every signature, forever, and the keepsake prints nothing under it. The jest case
("prints the sentence she ticked") proves the adapter and the component, not the pipe.

The lane names this in its notes §3.2 and says *"Raise this to the backend lane at integration."*
That is the right diagnosis and the wrong altitude: §2 of the sheet says a lane that needs a
change in another lane's pathspec **raises it** — to the orchestrator, before the wave closes, as
a contract amendment. It is not raised anywhere the backend lane will see it.

**Fix:** escalate a one-line addition to the frozen bundle interface —
`'consentSentence', s.metadata->>'consentSentence'` on the signature projection (a scalar text
key, not raw metadata, so the 00425 discipline holds) — and get it ruled before integration.

### C3 · major · the composed door contradicts itself in the sentence above the consent line

`door-gate.tsx:520` still renders `summaryLineFor(kind, proposal.title)`:

> By signing, you accept the services, signed role rates, design authorization ceiling, retainer,
> and terms in "…". The agreement becomes effective only after the studio countersigns.

Directly beneath it, the new `door-consent-line` may now read

> I agree to these design-services terms and the flat design fee, and understand …

On a flat-fee or per-phase composed agreement the door tells the homeowner, on the signature
surface, that she accepts **role rates, a ceiling and a retainer the agreement does not contain**.
The same sentence is the keepsake's `question` (`record/page.tsx:133`).

The build sheet froze this deliberately ("*Nothing else in the gate changes*", §5.3) and
`consent-copy.ts`'s header forbids rewording, so the lane is compliant — but composition is
exactly what makes the frozen sentence false, and it is a legally-flavoured misstatement on a
signing act. This needs an orchestrator ruling, not a silent fix.

**Fix (needs a ruling):** either compose `summaryLineFor` from the same parts, or reduce it for a
composed agreement to the kind-neutral half ("By signing, you accept the terms in "…". The
agreement becomes effective only after the studio countersigns.").

### C4 · major · `p_consent` goes on every services signature, with no fallback and no flag

`sign/route.ts:283-291` sends `p_consent` on **every** design-services signature — composed or
not, flag on or off; the un-composed case sends `{consentSentence: null, attachmentsAcknowledged: []}`
and the route test at `:259` pins that. There is no 4-arg fallback and nothing holds it back.

Consequence: the moment this Worker is live ahead of the migration that widens
`sign_design_services_agreement_with_trusted_ip`, PostgREST cannot resolve the call and **every**
services signature answers `sign_failed` — including agreements that carry no parts at all. The
program's own rule ("with either flag off both portals render exactly as Wave 1 shipped") holds
for rendering but not for this path.

The lane documents the ordering constraint (notes §3.3) and it matches the sheet's §10 deploy
chain, so the hazard is sequenced rather than unmanaged. But nothing in the code degrades, and the
one-way door is not visible from the deploy script.

**Fix (cheapest):** send `p_consent` only when the bundle is composed (`commercialBundle?.composed
=== true || required.length > 0 || consentSentence != null`), so an un-composed signature keeps
resolving through the old arity in either deploy order.

### C5 · major · the keepsake is the client portal's only `dangerouslySetInnerHTML`, and the escaping it trusts does not exist yet

`record-sheet.tsx:368-378` renders `executedHtml` through `dangerouslySetInnerHTML`.
`grep -rln "dangerouslySetInnerHTML" apps/client-portal/src` returns **exactly one file — this
one**. The whole escaping contract lives in `public._render_agreement_snapshot_html`, which the
build sheet describes (§3, "escape every interpolated string, replace chain for `& < > \"`") and
which does not exist on any branch this lane can see. The client adds no sanitizer, no allow-list,
no length cap, and no test asserting the rendered snapshot is inert.

The strings interpolated into that HTML are designer-authored part titles and bodies, and the
sheet's own escape chain omits `'`, so an attribute-context single-quote break in a future
renderer edit is enough. It renders inside the homeowner's authenticated session on a PWA origin.

The sheet sanctions the approach, so this is not a deviation — it is an unverified trust boundary
that no gate in this lane exercises.

**Fix:** a jest case pinning that a snapshot carrying `<img src=x onerror=…>` / `<script>` renders
no executable node, and an integration assertion (backend's SQL case 7) that
`_render_agreement_snapshot_html` escapes `& < > " '` in title *and* body.

### C6 · minor · door and route derive "required attachments" from two different readers

The door filters the **adapted DTO** (`adaptAgreementParts` drops any row missing `id`, `kind` or
`title`, `commercial-documents.ts:440-452`) on `payload.acknowledgeRequired === true`.
`requiredAttachmentKeys` in `sign/route.ts:46-60` re-derives from the **raw bundle jsonb**,
needing only `kind === 'attachment'` plus a key, and additionally accepts a
`payload.acknowledge_required` spelling the door never looks for.

Any divergence produces a permanent `409 not_signable` that the homeowner has no client-side way
to satisfy — the door shows no tick to tick. The known divergence is unreachable today
(`00575:200` `CHECK (char_length(btrim(title)) > 0)` plus the RPC's own "every part of an
agreement needs a title" guard), so this is latent, not live.

**Fix:** have the route read the same predicate the door does, or drop the `acknowledge_required`
spelling so the two readers are provably identical.

### C7 · minor · the reused refusal sentence is wrong for the state it now covers

An unticked required attachment answers `409 not_signable`, whose door copy is *"This paper is not
open for signing any more. Your designer can send a fresh one."* The paper **is** open; she has a
box to tick. The sheet forbade a new token (`REFUSAL_TOKENS` is pinned by the drift guard against
the route source), so the lane is compliant — but if C6 ever fires, the homeowner is told her
agreement is dead and to ask for a replacement.

### C8 · minor · the consent tick survives the sentence changing under it

`composeConsentLine(kind, consentParts)` is evaluated on every render, and the consent checkbox is
rendered unconditionally — including while `bundle.isLoading`, when `parts` is `[]` and the label
is therefore the **legacy** line. `agreed` is not reset when the bundle resolves and the label
swaps to the composed sentence. `ready` requires `drawn`, so she cannot sign during the load, but
she can tick sentence A and sign under sentence B.

**Fix:** either hold the consent block until `drawn`, or clear `agreed` when the composed line
changes.

### C9 · minor · the acknowledgment rule lives in two different scopes

`ready` gates on `allAcknowledged` for **every** kind (`door-gate.tsx:236-243`), while the route
validates acknowledgments only after the `furnishings_authorization` and `trade_scope` branches
have returned — the route test at "never gates a furnishings authorization" pins that asymmetry
deliberately. The door is the stricter half so nothing is exploitable, but a furnishings
authorization carrying an `acknowledgeRequired` attachment part is blocked client-side and
unvalidated server-side.

### C10 · minor · the named type-check gate does not see any of the new test code

`apps/client-portal/tsconfig.json` excludes `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts`,
`**/*.spec.tsx`. `type-check` therefore covers none of the ~640 new lines of spec, and the
Playwright spec is neither type-checked nor run by jest — its only evidence is one manual run in
the lane's notes. Pre-existing config; recorded because C1 already leans on that spec.

### C11 · minor · drift case 8 exercises seven of the eight record-only variants

§5.2 case 8 and R9's record-only set include `percent_of_spend`; the test at "consents to nothing
a record-only variant carries (R9)" uses `percent_of_cost` and omits `percent_of_spend`. One line.

### C12 · nit · M5 landed in a file the sheet does not name

The sheet's client file list assigns the attachment leaves to
`components/commercial-document-shell.tsx`; the lane implemented them in
`components/agreement-parts-body.tsx`. Inside the lane's pathspec
(`apps/client-portal/src/**`) and arguably the right home — the shell delegates the composed body
to that component — but a steward diffing by the sheet's file list will not find M5 where it looks.

### C13 · nit · `I received {title}.` reads badly against real titles

The door renders `I received ${part.title}.` verbatim per the sheet. W1's own shell spec uses
titles like `Wisconsin notice` and `Photography release`, which render as *"I received Wisconsin
notice."* The lane's tests hide this by choosing titles that already begin with "the"
(`the lead-paint notice`, `the care guide`).

### C14 · nit · a `service_addendum` consents to "these design-services terms"

`composeConsentLine` emits the same opening clause for `service_addendum` as for
`design_services`, and the lane added a thirteenth case pinning it. Sheet-directed (§5.1 rule 5 and
rule 7 read together, and today's `consentLineFor` already says it), so it is not a deviation —
recorded because an addendum is not the agreement it amends.

### C15 · nit · the added e2e assertion passes on either branch

`page.getByTestId('record-sheet').or(page.getByText(/nothing to keep/i))` is true whichever way the
fixture falls, so the test proves only that the route is not a redirect. That is deliberate and
explained in the test's own comment, but it is a weaker assertion than the sheet's R26 standard.

---

## What was checked and is clean

- **Every existing `consent-copy.ts` export is byte-identical.** The whole file diff carries one
  `-` line, and it is the `---` header. `consentLineFor`, `signLabelFor`, `summaryLineFor`,
  `SIGNATURE_NOTICE`, `KIND_LABEL`, `refusalSentence`, `REFUSAL_TOKENS` untouched; the pinned
  route-on-disk drift guard passes unchanged (40 tests in that suite).
- **Canonical variant order** is `rate_card, ceiling, flat, per_phase, retainer, procurement`,
  fixed independently of the caller's array order, and case 10 proves it against a reversed input.
  `cadence` contributes nothing; the record-only variants contribute nothing.
- **Zero money parts returns today's literal verbatim** — asserted twice, once against
  `consentLineFor('design_services')` and once against the reproduced literal. `null` and
  `undefined` too.
- **All four sentence-table literals** (nine standard parts, consultation, flat, per-phase +
  non-refundable retainer, furnishings) match the build sheet character for character, asserted
  with `toBe`. The lane's notes reproduce them for the SQL side to pin.
- **Bundle parity.** `get_client_commercial_document_bundle` already filters `parts` to
  `client_visible` (00575) and emits `partKey`, so the door's `clientVisible: true` mapping is
  sound and `composeConsentLine` rule 1 is enforced on the data that actually arrives; the
  `clientVisible:false` case is covered directly against the composer.
- **The consent recorded against a signature is the database's.** The route reads
  `commercialBundle.consentSentence` and never the POST body; a test drives a browser sending its
  own `consentSentence` and asserts it is ignored.
- **Unknown acknowledgment keys are dropped silently; a shortfall answers `409 not_signable`; no
  new refusal token was added** — `REFUSAL_TOKENS` is unchanged and its drift guard passes.
- **R12 discipline on the keepsake.** No PDF, no download affordance, no print stylesheet, no
  empty state: `executedHtml` absent renders nothing, and a jest case plus the e2e assert the
  absence. The mark is twelve characters of `documentHash` via the existing `checksumMark`, and a
  test asserts the full 64-hex string never reaches the page.
- **M5.** Attachment leaves sit outside `data-testid="agreement-parts-body"` and below its closing
  boundary paragraph, in their own `agreement-attachments` rail that is not drawn at all when the
  agreement carries none — asserted with `compareDocumentPosition`, not by text order. `I received
  this` on the paper is still conditional on `acknowledgeRequired`, so the paper and the door agree
  about which attachments ask for a tick.
- **Vocabulary and refusals.** New homeowner strings are `I received {title}.`, *"Tick each
  attachment you received, type your full name, and tick the line to sign."*, *"The agreement as
  executed"*, `Mark {twelve characters}`, and the composed sentences. No badge, no count chip, no
  red/green, no checkmark-as-status, no emoji. "gate" appears only in code comments. No column
  name, no "variant", no "clause library" / "contract builder", no "AI" in any rendered string.
  R5 holds: no figure is interpolated into the consent sentence.
- **No `page.waitForTimeout`, no `networkidle`** anywhere in the diff.
- **Wave 1 flag-off byte-identity.** The client portal has no flag gate and never had one — W1's
  kill switch is data-shaped (no parts ⇒ today's body), and every W2 addition here is inert on a
  parts-less agreement. The one exception is C4, which is behavioural rather than visual.
- **Scope.** Nothing outside the lane's section: no refactor, no new abstraction, no designer or
  backend file, no `.env`, no `.claude/`, no migration, no seed.

---

## Recommended order of work

1. **C1** — get the seed, write the sheet's e2e test. Blocking.
2. **C2** — escalate the signature-level `consentSentence` projection as a contract amendment.
3. **C4** — make `p_consent` conditional so the deploy order stops being a one-way door.
4. **C3** — orchestrator ruling on `summaryLineFor` under composition.
5. **C5** — the inert-HTML jest case, and hold backend to the escape chain.
6. C6–C11 as time allows; C12–C15 are recordings, not asks.
