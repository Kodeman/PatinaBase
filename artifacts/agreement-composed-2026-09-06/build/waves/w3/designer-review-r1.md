# Wave 3 · designer lane — adversarial review, round 1

Reviewer context, separate from the implementer. Branch `agreement/w3-designer`, worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-designer` (`git rev-parse --show-toplevel`
confirmed). Base `main`. Eight commits, `10,496 +` / `103 −` across 61 files.

**Verdict: BLOCK.** One blocker, four majors. Two of the findings were proved by running the real
composer, not by reading it.

---

## Gates, run in this worktree by the reviewer

| command | result |
|---|---|
| `pnpm turbo build --filter=@patina/types` | 1 successful, 1 total (FULL TURBO) |
| `pnpm --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal lint` | ✖ 205 problems (2 errors, 203 warnings) |
| `pnpm --filter @patina/designer-portal lint` **on `main`** | ✖ 205 problems (2 errors, 203 warnings) — **identical** |
| `pnpm --filter @patina/designer-portal test` (FULL) | **543 suites passed / 543 · 6624 tests passed / 6624 · 12 snapshots passed** |

The two lint errors (`piece-room-save-gate.test.tsx` `import/first`; `use-commercial-documents.test.ts`
`rules-of-hooks`) are byte-identical to `main`'s and are not in files this lane touched. The lane added
**zero** new warnings.

### The flag-off pin is honest

`__snapshots__/agreement-composer-design-build-off.test.tsx.snap` was created in `248f3a7b2` — the
first commit on the branch after the types-only `b854dad52` — when the whole `agreement/` folder was
byte-identical to `main`, and `git log` on the `.snap` shows **one** commit: it has not been touched
since. The only later edit to the spec adds `licenseAttestationIsLive: () => false` to the
`@patina/supabase` mock (a newly imported named export). The 12 snapshots pass at HEAD. This is a
real before-pin, not an after-assertion.

---

## Findings

### D1 · BLOCKER — two sibling `setParts` writes in one act collide; the allowances editor and the sub-disclosure mode selector do not work

`agreement-composer.tsx:315-347`. `mutate(next)` calls `setParts(renumber(next))` with a **plain
value**. `changePayload` and `writePart` are both closures over the same render's `parts`, and every
turnkey editor that writes a sibling calls them in sequence inside one event handler:

- `allowances-editor.tsx:55-72` — `onChange({...payload, allowances: next})` then
  `turnkey.writePart(pricingBasis, {...})`
- `sub-disclosure-clause.tsx:56-62` — `onChange({...payload, mode})` then
  `turnkey.writePart(pricingBasis, {...})`

React applies both setters in order; the second is derived from the pre-change `parts`, so the
**first write is discarded**.

Proved against the real component (temporary spec, run and deleted):

```
FAIL src/.../__tests__/zz-reviewer-proof.test.tsx
  ✕ adding an allowance lands in the allowances payload
      expect(screen.queryByLabelText("Allowance 1")).not.toBeNull();
      Received: null
  ✕ choosing open-book moves the clause's own mode
      Expected: "true"   Received: "false"    (aria-pressed on the Open-book button)
```

Consequences:

1. **Walk step 7 cannot be performed.** Clicking `+ Add an allowance` draws no allowance row; the
   pricing basis silently gains an unnamed `category:'allowance'` cost line, moving the contract sum.
2. **Walk step 8's first half cannot be performed.** The open-book / closed-book radio never moves.
3. **R13 / RC-4 divergence.** The pricing basis' `subDisclosure` *does* move (the surviving write)
   while the clause's own `mode` does not. `pricing-basis-editor.tsx:78-81` renders the schedule of
   values in the **clause's** mode, and `validatePricingBasis` / the DB validate the **basis'**. The
   room can therefore show a studio pro-rated closed-book lines while the stored, client-read payload
   says open-book — a disclosure-mode split on exactly the field R13 exists to control.

Why the lane's own tests miss it: `turnkey-editors.test.tsx:353-368, 411-426` stubs `onChange` and
`writePart` as two independent `jest.fn()`s and asserts each was called. It never puts them back into
one state container.

Fix shape: make `mutate` take a functional updater (`setParts(prev => renumber(fn(prev)))`) and
compose `changePayload`/`writePart` on top of it, or give `TurnkeyContext` one `writeParts(patch)`
that applies both payloads to a single array. Add a composer-level test for both acts.

---

### D2 · MAJOR — flag-off readiness fails **open** on a `design_build` document, and §4.1's "renders read-only prose" is not implemented

`readiness.ts:333` computes `isTurnkey = document.kind === "design_build"` and `:334` gates the whole
turnkey floor on `isTurnkey && turnkey` — but `:421` exempts the class floor on `isTurnkey` **alone**:
`if (!isTurnkey && !namesAFee && hiddenFees.length === 0)`. The composer only supplies `turnkey` when
`design-build` is on. Proved (temporary spec, run and deleted), one clause part, no money at all:

```
FLAG-OFF blockers: []
FLAG-ON  blockers: [{"message":"A design-build agreement needs a pricing basis."},
                    {"message":"A design-build agreement needs a draw schedule."}]
```

With the flag off the room reports a design-build agreement with no pricing basis, no draws, no fee
and no attestation as ready. Before this change the same document raised "This agreement names no
fee." — so the wave *removes* a guard on the rollback path. The database still refuses at send
(backend PART 11), so this is a UI fail-open, not a data breach.

Related and from the same root: build sheet §4.1 says that with the flag off "a `design_build`
proposal … renders read-only prose". Nothing implements that.
`lib/document/commercial-documents.ts:129-136` maps `design_build` onto the `design_services`
experience with **no flag guard**, and `readOnly` in the composer is still only
`document.state !== "draft"`. Flag off, a design-build draft opens fully editable in the Wave 2
composer with the turnkey editors absent (`pricing_basis` falls through to Wave 1's read-only card,
`draws` and `allowances` likewise), which is a worse state than either of the two the sheet allows.

Fix: gate the fee-floor exemption on the same `turnkey` presence as the rest of the block, and decide
explicitly what a flag-off `design_build` document renders.

---

### D3 · MAJOR — draw keys can collide and there is no way to fix it

`draws-editor.tsx:212-224` mints a new draw's key as `draw_${draws.length + 1}`. Remove a middle draw
and add one and the key repeats: `[deposit, draw_2, draw_3]` → remove `draw_2` → add → `draw_3` again.
`validateDrawSet` (`design-build.ts:497-500`) then refuses with "Two draws share a key. Rename one."
— and there is **no rename affordance**: the label handler mints a key only when `draw.key` is falsy
(`draws-editor.tsx:129-136`), which never happens for a row the button created. `drawKeyFrom()` is
effectively dead code. The studio reaches a readiness blocker it cannot clear from the room.

Also: the draw key is the identity the ledger row and the invoice are stamped with (I-3 takes
`p_draw_key`), so a collision is not only a UI dead end.

---

### D4 · MAJOR — the allowance rebuild destroys unmatched allowance cost lines and reorders the schedule of values

`allowances-editor.tsx:60-72`. `write()` drops **every** `category:'allowance'` cost line and re-adds
only those with a matching allowance entry, appended at the end of `costLines`.

- The pricing-basis editor's category select offers **Allowance** (`pricing-basis-editor.tsx:43-47`),
  so a designer can create an allowance-category cost line there. `validateAllowances` only checks
  allowance → line, never line → allowance, so that line passes readiness — and is then silently
  deleted, changing the contract sum, the moment any allowance field is touched.
- Appending rebuilt allowance lines at the end reorders `costLines`, which moves which SOV row absorbs
  the "last row takes the remainder" rounding (`design-build.ts:262-272`). The Halvorsen fixture
  happens to put allowances last so the walk's figures survive; an interleaved set would not.

---

### D5 · MAJOR — `patina.licensing_attestation` has no handling in the rail

Build sheet §3 PART 13 seeds an eleventh entry into `patina.design_build`: `patina.licensing_attestation`,
`kind = 'attestation'`, `client_visible = false`, materialized at compose and **"never editable in the
rail"**. Nothing in the designer lane knows about it — `TURNKEY_PART_KEYS` (`turnkey/context.ts:36-47`)
omits it, `turnkeyEditorFor` answers `null` for `kind: 'attestation'`, and `parts-rail.tsx` filters
nothing. It will render as an ordinary rail row (glyph `✧`, `part-kinds.ts:43`), renameable, draggable
and removable, with the generic fall-through editor. Confidence is moderate only because whether the
row exists depends on the backend lane actually seeding PART 13's eleventh entry.

---

### Minor

| id | finding |
|---|---|
| **m1** | `subMarkupBps` is written by `pricing-basis-editor.tsx:157-160`, read by `readSubMarkupBps` and (per the lane notes) by `_validate_no_double_count` — but it is **absent from `DesignBuildPricingBasisPayload`**, the frozen I-1 interface the client and sub lanes consume, and `readPricingBasis` (`design-build.ts:90-110`) drops it. Any consumer round-tripping through the typed shape loses the markup. Either add the field or state in the type why the client's copy must not carry it. |
| **m2** | `useAgreementJurisdictionNotices()` is called **unconditionally** in `AgreementComposer` (`:186`) — every studio on `agreement-parts` with `design-build` off now issues a request against a table that does not exist until the backend migration lands. It fails soft (`if (error) return []`), but "with the flag off, exactly as Wave 2 shipped" should include the network. Guard it on `designBuildOn` the way the attestation and draw-ledger reads are. |
| **m3** | `SEEDED_JURISDICTIONS` (`jurisdiction-attachments.tsx:32-39`) does not match build-sheet PART 4's seed titles — case ("Notice of cancellation" vs "Notice of Cancellation") and the trailing summary clause ("— 3 business days; refund within 10 days"). The lane's own notes say to keep the two in step; they are not. |
| **m4** | Studio-facing copy carries an internal payload key and a code literal: `"The first draw is the deposit, and its key is \`deposit\`."` and `"Every draw needs a key."` (`design-build.ts:504-508`). The paper register does not print backticked identifiers, and there is no key control to act on (see D3). |
| **m5** | `attachNotice` (`agreement-composer.tsx:404-437`) mints a **new** part `patina.notice_of_cancellation.<st>` while PART 13 row 9 already lays down an empty `patina.notice_of_cancellation` attachment. The template's own row is never filled and would reach the client's copy as a blank attachment leaf. |
| **m6** | Files edited outside §2.3's "owns exactly these pathspecs": `components/document/client-note-composer.tsx`, `components/document/commercial/service-agreement-instruments.tsx`, `lib/document/document-guide.ts`, `lib/document/document-guide-inputs.ts`, `packages/supabase/src/hooks/use-proposals.ts`. None belongs to another lane, so no collision — but the `use-proposals.ts` change is a type refactor (`document_kind` union → `CommercialDocumentKind`) the wave did not ask for. |
| **m7** | `lib/analytics/document-events.ts` was reformatted wholesale by prettier (single → double quotes, 155 changed lines) for roughly 30 lines of new events. Unrequested style churn on a shared file; it inflates the merge surface for anything else touching it. |
| **m8** | §4.1: analytics "fired from the composer's container, never inline … in a leaf". `documentEvents.*` is fired from `turnkey/draw-ledger.tsx:79`, `turnkey/lien-waiver-attachments.tsx:96` and `trade-agreements/trade-agreement-composer.tsx:110`. The namespaced module is used (no raw `posthog.capture`), so half the rule is kept. |
| **m9** | `LicensingAttestationCard`'s seed effect keys on `[onFile]` (`licensing-attestation-card.tsx:75-85`), a fresh object on every React Query refetch. Window-focus refetch is on by default, so a studio typing the credential number and tabbing away loses the in-progress edit and the ticked affirmation. |
| **m10** | `TradeAgreementComposer.submit(true)` creates then sends (`trade-agreement-composer.tsx:88-116`). If the send throws, the created draft persists and `onDone()` is skipped — the natural retry creates a **second** Trade Agreement. |
| **m11** | `DrawLedger` gates billing on `!draw.invoiceId` (`draw-ledger.tsx:108-110`), so SQL-T7's "allows a re-issue after the invoice is voided" is unreachable from the studio's surface; `drawStanding` also reports a voided invoice as "Sent". |
| **m12** | `attestationLive` is `false` while `useStudioLicenseAttestation` is loading, and `enabledJurisdictions` is `[]` while the notices query is loading, so readiness transiently shows `TURNKEY_ATTESTATION_BLOCKER` and a "held for counsel review" blocker on every open of a turnkey draft. Fail-closed is right; flashing a refusal is not. |
| **m13** | `DrawsEditor`'s percent field is `value={draw.pct === 0 ? "" : String(draw.pct)}` with `Number(v) || 0` (`:141-148`) — a fractional percentage cannot be typed (the intermediate `"0."` collapses to `""`). And `retainageBps: percentToBps(...) ?? 0` (`:89-93`) contradicts `money.ts`'s own stated R21 rule that an empty field is not a zero. |

### Nits

- `design-build-arithmetic.test.ts` reads `artifacts/agreement-composed-2026-09-06/source/fixtures.json`
  by relative path from the portal. On-brief (J-5 says to), but it couples a portal jest suite to a
  dated program directory that will eventually be archived.
- Draws table: the Remove button carries `col-start-6` while the "Hold" checkbox already occupies
  column 6, wrapping Remove onto a second grid row.
- `validatePricingBasis` never range-checks `subMarkupBps` the way it does `feeBps`.

---

## What is right, and worth saying

- **Arithmetic.** Recomputed independently against `source/fixtures.json`: cost basis `7130000`,
  fee `1283400`, GMP `8413400`, SOV `4484000 / 1121000 / 849600 / 743400 / 472000 / 413000 / 330400`
  = `8413400`, draw gross `841340 / 2524020 / 3365360 / 1682680` = `8413400`, retainage
  `0 / 126201 / 168268 / 84134`, cumulative `126201 / 294469 / 378603`, net
  `841340 / 2397819 / 3197092 / 1598546`, release `378603`, closing identity `8413400`. Integers
  throughout, no `toFixed`, no float comparison, last row takes the remainder in both the SOV and the
  draw table. Retainage is withheld, never billed. `validateDrawSet` sums percentages in basis points
  rather than floats.
- **R10.** The template is listed-and-locked, never hidden; the reason line and the
  `/desk?account=studio` doorway both exist and the doorway is real (`desk-doorway.tsx:133`); the
  34-word disclaimer ships verbatim and no word count is rendered anywhere; "Patina stores this.
  Patina does not verify it." is on the card; nothing anywhere verifies a credential.
- **R11.** No enable control exists on any studio surface; the hook filters `enabled === true`
  client-side on top of the policy; held notices are greyed and non-attachable; readiness refuses a
  send carrying an uncleared jurisdiction.
- **D-W3-1.** Zero Stripe: no `create-checkout-session`, no key, no `stripe-webhook` reference
  anywhere in the diff.
- **R7 / register.** "Trade Agreement" everywhere a person reads; "subcontract" only in comments (and
  `trade-agreements.test.tsx` asserts the rendered text does not contain it). No badges, no count
  chips, no red/green, no checkmark-as-status, no emoji. Billing is untouched — the Licensing card is
  one mount plus an import and a flag read.
- **R39 (carried).** The toggle writes `client_visible`, the chip shows on both the rail row and the
  editor header, the preview already filters (`agreement-parts-body.tsx:326`), and the save path
  carries the field (`use-agreement-parts.ts:129`). Gating it on `design-build` rather than
  `agreement-library` is defensible under the program's "flag off reverts every studio surface".
- **Commits** are pathspec-clean, Conventional Commits, no trailers, no `merge(...)` subjects; the
  lane log is force-added.

## Not verified here (out of this lane's reach)

- `e2e/agreement/design-build.pw.ts` is written and unrun — it needs the backend lane's two
  migrations on a stack this lane may not reset. It carries the chromium pin, uses
  `helpers/supabase-admin`, and contains no `page.waitForTimeout`.
- Every cross-lane call the composer makes (`issue_agreement_draw_invoice`, `list_trade_agreements`,
  `create_trade_agreement`, `void_trade_agreement`, `trade-agreement-send`,
  `agreement_draw_lien_waivers`, `studio_license_attestations`, `agreement_jurisdiction_notices`) is
  unexercised against a database in this review.
