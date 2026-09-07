# Wave 3 · designer lane — notes

Branch `agreement/w3-designer`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agr-w3-designer`.
Base `112e6f838` + the T0 types commit `b854dad52` that was already on the branch at fork time.

## What landed, by commit

| sha | subject |
|---|---|
| `248f3a7b2` | `test(document): pin the design-build-off Contract Room before Wave 3 touches it` |
| `f9efd0acc` | `feat(document): the turnkey data layer — attestation, draw ledger, Trade Agreements` |
| `b95dca43e` + `340d9f33e` | `feat(document): turnkey arithmetic …` + its prettier pass |
| `1b3a2abcd` | `feat(document): the turnkey composer — pricing basis, draws, allowances, sub disclosure, supervision` |
| `92b5d5a27` | `feat(document): the licensing gate, the draw ledger, Trade Agreements and the hidden-part act` |

The first commit is deliberate and load-bearing: the flag-off snapshots were generated on the
untouched Wave 2 tree and committed **before** a line of Wave 3 code existed, so "the flag-off room
is unchanged" is proved by a pin taken before the change rather than asserted after it.

## I-1 — the cross-lane handshake

`COMMERCIAL_DOCUMENT_KINDS` already carried `'design_build'` on this branch (the T0 commit
`b854dad52`, applied before the lane forked), along with `DesignBuildAgreement`, its members in
`ClientCommercialDocumentBundle.document`, and the design-build payload shapes. Verified, then
`pnpm turbo build --filter=@patina/types` so the dist-resolved package actually carries it.

**The forcing function fired, which is the proof I-1 landed.**
`pnpm --filter @patina/client-portal type-check` now fails at exactly the two sites §3.3 predicted:

```
src/components/commercial-document-shell.tsx(26,7): error TS2741: Property 'design_build' is missing …
src/components/threshold/door-gate.tsx(266,7): error TS2322: Type '"design_build"' is not assignable to type 'MakingGateKind'.
```

Both are the **client lane's** files and its fixes. (The same run also shows five pre-existing
`@patina/aesthete-quiz` module-resolution errors — that package's dist is not built in this
worktree; unrelated to this wave.)

## Deviations from the build sheet, and why

1. **The e2e spec is `e2e/agreement/design-build.pw.ts` with its own
   `playwright.design-build.config.ts`, not `e2e/document/design-build.spec.ts`.**
   The base `playwright.config.ts` has `testDir: './e2e'` and no `testMatch`, so a `.spec.ts`
   anywhere under `e2e/` is collected by the DEFAULT run — where all three flags are off and the
   spec could only fail. `playwright.config.ts` itself is uneditable from a lane (it carries the
   local demo `service_role` JWT and the pre-commit secret scan reads a changed file's full staged
   content — `feedback_playwright_config_secret_scan_trap.md`). Wave 1 made the identical deviation
   for the identical reason (`playwright.agreement.config.ts`); this is its sibling rather than an
   edit to it, because Wave 1's config pins `agreement-parts` alone and its spec asserts on the
   Wave-1 rail footer — turning `agreement-library` on there would change the room out from under a
   spec that is not this wave's.

2. **The Licensing card is self-contained rather than four edits to `account-studio-page.tsx`.**
   §4.2 asked for a `handleSaveAttestation` sibling to `handleSaveBilling` and the state alongside
   it. `agreement-library-card.tsx` (Wave 2, the most recent precedent in this exact file) instead
   owns its own hooks and state and the page gains one mount. That keeps the shared file's diff to
   three lines — an import, the flag read, and the mount — and Billing is untouched either way. The
   card copies Billing's shell (`mb-6 border-t border-[var(--color-pearl)] pt-5`, the same
   LABEL/HELP/FIELD type, the same `DocumentActionGroup` save posture) rather than restyling it.

3. **R39's visibility act is gated on `design-build`.** R39 is a Wave 3 deliverable, and the
   program rule is that with the flag off both portals render exactly as Wave 2 shipped. So the
   "Hidden from your client" toggle, its chip on the rail, and its chip in the editor header all
   sit behind the same flag as every other Wave 3 surface. A studio on `agreement-library` alone
   does not get the act until `design-build` widens. (R33's *readiness* half — the hidden-fee
   sentence — is Wave 2's and is untouched and ungated.)

4. **A `TurnkeyContext` was added to `PartEditor`.** Every other editor in the room is a pure
   function of one part's payload, and that is right for a clause or a rate card. The turnkey class
   is not made that way: the draws are drawn against the pricing basis' contract sum, an allowance
   IS a `category: 'allowance'` cost line (one number said twice), the schedule of values renders in
   the mode the sub-disclosure clause elected, and the no-double-count rule is a refusal about a
   PAIR of parts. So the composer hands the turnkey editors a narrow window — read every part, write
   one other part's payload in the same act — and supplies it **only** when `design-build` is on AND
   the document is `design_build`. With no context no turnkey editor mounts and the part editor is
   byte-for-byte Wave 2's.

5. **`SINGLE_INSTANCE_VARIANTS` was NOT extended with the three turnkey variants.** That map is the
   RPC's own per-variant refusal, keyed by variant, and readiness prints its sentences verbatim. The
   backend lane owns whether `upsert_agreement_parts` refuses a second `pricing_basis`; adding the
   variants here would put words in the database's mouth. Readiness reads the first of each instead,
   and the turnkey validators are the gate. **Flagged for the backend lane / reviewer.**

6. **A `turnkey/draw-ledger.tsx` was added beyond §4.1's nine-component list.** Walk step 15 issues
   Rough-in and I-7 says "the designer lane invokes `commercial-document-notify` after issuing draw
   2+", so the act needs a home; folding it into `lien-waiver-attachments.tsx` would have made that
   component two things. It is inside the lane's `turnkey/**` pathspec.

7. **The Trade Agreements strip lives in the turnkey composer's right rail**, which §4.1 names as
   the option that "needs no shared-file edit" — `authorizations-ledger.tsx` is not this lane's
   file. Its own folder, `components/document/commercial/trade-agreements/`, is.

## Cross-lane facts the reviewer should check

- The composer calls `useReplayCommercialNotification` with `transition: 'agreement_draw_ready'`
  and `eventId: <agreement_draw_invoices row id>` (I-7). The **edge** lane must widen
  `CommercialTransition` and route it to `design_build` alone, and must NOT add `design_build` to
  the `deposit_ready` branch.
- The designer surface calls, all owned by the **backend** lane:
  `issue_agreement_draw_invoice(p_proposal_id, p_draw_key)` → the I-3 payload;
  `list_trade_agreements(p_project_id)`; `create_trade_agreement(p_project_id, p_contact_id, p_payload)`;
  `void_trade_agreement(p_agreement_id, p_reason)`. Tables read directly under RLS:
  `studio_license_attestations`, `agreement_jurisdiction_notices` (enabled-only SELECT),
  `agreement_draw_invoices` (embedding `invoices(id, status)` and `agreement_draw_lien_waivers(*)`),
  and `agreement_draw_lien_waivers` for the insert.
- Sending a Trade Agreement goes through the **edge** function `trade-agreement-send`
  (`{ agreementId, mode: 'send' }`), never `send_trade_agreement` + a browser-side mint.
- The composer materializes the turnkey class by picking `patina.design_build` on an ordinary
  design-services draft; `materialize_agreement_template` is what flips `proposals.document_kind`
  (backend PART 8). The picker lists the template **disabled** without a live attestation and never
  hides it.
- `readSubMarkupBps` reads `payload.subMarkupBps` off the pricing basis. The backend's
  `_validate_no_double_count` must read the same key.
- The sub-disclosure mode is written to **two** places in one act: `mode` on the clause payload
  (what the room reads) and `subDisclosure` on the pricing basis (what
  `_validate_pricing_basis_payload` requires "exactly once per contract").

## Gates run in this worktree

| command | result |
|---|---|
| `pnpm turbo build --filter=@patina/types` | 1 successful |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test` | 93 files, 1141 passed / 12 skipped |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test` (FULL) | **543 suites, 6624 tests, 12 snapshots — all passed** |
| `pnpm --filter @patina/designer-portal lint` | 2 errors, 203 warnings — **both errors pre-existing** (`piece-room-save-gate.test.tsx` `import/first`, `use-commercial-documents.test.ts` `rules-of-hooks`), neither in a file this lane touched; the Wave 1 rulings already record them as byte-identical on origin/main |
| `pnpm --filter @patina/admin-portal build` | **passed** (the repo's strictest gate, run because shared packages changed) |

## Not run, and why

- `pnpm --filter @patina/designer-portal test:e2e -- --config playwright.design-build.config.ts`
  — the spec needs the wave's two migrations on the local stack (`studio_license_attestations`,
  `agreement_jurisdiction_notices`, `agreement_draw_invoices`, the six seeded notices, the seeded
  `patina.design_build` template) and the backend lane is writing them concurrently. This lane is
  also forbidden to reset the shared local stack. **The spec is written and unrun.**
- `pnpm --filter @patina/client-portal test` / `type-check` as a gate — its two type errors are the
  client lane's I-1 fixes, named above.
- No production mutation of any kind: no `supabase db push`, no `functions deploy`, no
  `wrangler deploy`, no reset or write to the shared local stack.

## Owed / flagged

- The `design-build` PostHog flag does not exist; the feature is dark until Kody creates it.
  Local/e2e: `NEXT_PUBLIC_FLAG_OVERRIDES=agreement-parts:true,agreement-library:true,design-build:true`.
- The 34-word disclaimer ships verbatim from research 03 §5 and **no word count is rendered**;
  `licensing-attestation-card.test.tsx` asserts the card's text matches no `\d+ words?` pattern.
- Six jurisdiction notices are named code-side in `turnkey/jurisdiction-attachments.tsx` so the
  strip can say "Held for counsel review" — the SELECT policy admits enabled rows only, so a
  disabled row is invisible to a studio read and the room would otherwise say nothing at all.
  Keep that list in step with migration 1 PART 4's seed.

---

# Round 1 — adversarial review, five findings answered

Date 2026-09-07. Five findings (one blocker, four majors); all five addressed, no minors deferred.

## D1 (blocker) — two sibling writes in one act collided

`agreement-composer.tsx`. `mutate(next)` took a plain array derived from the render's `parts`, and
`changePayload` / `writePart` both closed over that same array. Every turnkey editor that writes a
sibling calls both in one handler (the allowances editor lays down its cost line; the
sub-disclosure clause stores its mode on the pricing basis), so the second setter discarded the
first: the allowance never reached its payload, and the clause's own `mode` never moved while the
pricing basis' copy did — R13's two halves disagreeing, the schedule of values rendering in one
mode while the payload the client reads says the other.

**Fix**: `mutate` now takes `AgreementPart[] | ((current) => AgreementPart[])` and every act that
derives from the current list — `changePayload`, `writePart`, `setClientVisible`, `renamePart` —
passes the updater form, so each write is applied to what the one before it produced. The
whole-array acts (`addPart`, `removePart`, `reorderPart`, `attachNotice`, `addFromLibrary`) still
pass a value, which is correct: each is one write.

**Proof the test bites**: with `changePayload` alone reverted to the plain form the new cases still
passed — React applies value-then-updater in order, so the *last* write survives. Reverting BOTH
reproduced the reported failure exactly (2 failed / 3 passed), and restoring the fix returned 5/5.
The lane's own `turnkey-editors.test.tsx` could never have caught this: it hands the editor two
independent `jest.fn()`s and never puts them back into one state container.

## D2 (major) — flag-off readiness failed OPEN, and §4.1's read-only prose was missing

`readiness.ts` gated the turnkey block on `isTurnkey && turnkey` but exempted the R-5 class fee
floor on `isTurnkey` ALONE. With `design-build` off the composer supplies no `turnkey`, so a
`design_build` document carrying no money at all passed clean — where the same document raised
"This agreement names no fee." before Wave 3 touched the file. A fail-closed flag's rollback path
must be the stricter side.

**Fix**: one `turnkeyFloor` binding (`isTurnkey && turnkey ? turnkey : null`) is now the whole
gate, read by the turnkey block AND by the fee-floor exemption. `agreement-composer.tsx` also
implements §4.1: `readOnly` now includes `document.kind === "design_build" && !designBuildOn`, so a
flag-off turnkey agreement lists its parts as prose with no rename, reorder, remove, add, template
or Save act, and no turnkey editor mounted.

## D3 (major) — draw keys could collide with no way to clear the refusal

The add button minted `draw_${length + 1}`. Remove a middle draw and add one and the key repeats;
`validateDrawSet` then refuses with "Two draws share a key. Rename one." — and the key is minted
only when falsy, so no control in the editor could rename it. The draw key is the identity the
ledger row and the invoice are stamped with (I-3 takes `p_draw_key`), so this was not only a dead
end in the room.

**Fix**: `mintDrawKey(others, position, label)` reads the keys actually in use — `retainage_release`
and `deposit` included — and counts past every one. `position === 0` always answers `deposit`,
which is what `validateDrawSet` requires of the first row. `drawKeyFrom` is gone. A duplicate that
arrives from a payload this editor did not author still refuses; Remove is the escape hatch and it
is always offered.

## D4 (major) — the allowance rebuild deleted lines and reordered the schedule

`write()` dropped every `category:'allowance'` cost line and re-appended the matched ones. Two
consequences: an allowance-category line authored on the pricing basis (its category select offers
"Allowance") was destroyed — changing the contract sum — the moment any allowance field was
touched; and re-appending moved which SOV row absorbs the "last row takes the remainder" rounding.

**Fix**: the rebuild walks `costLines` in place. A line whose id is in the new allowance list is
rewritten where it stands; a line whose id WAS an allowance and is not one now is dropped (the
designer removed it); any other allowance-category line is left exactly where it was. Only a
genuinely new allowance appends.

The line → allowance direction is named rather than refused: `unbackedAllowanceLine()` in
`lib/document/design-build.ts` returns a sentence, rendered as a quiet line in the allowances
editor and pushed to `readiness.notes` — **advisory, never a blocker**. `_validate_allowances_payload`
asks allowance → line only, so a blocker here would refuse a send the server accepts, and this room
does not get to be stricter than the database.

## D5 (major) — the licensing attestation would have rendered as an ordinary rail row

Build sheet PART 13's eleventh entry, `patina.licensing_attestation` (kind `attestation`), is the
gate: materialized at compose, never editable in the rail, never read by the client. Nothing
filtered it, so it would have listed as a renameable, draggable, removable row with the generic
fall-through editor.

**Fix**: `parts-rail.tsx` filters `kind === "attestation"` out of the rows it lists, the sortable
set, and the "no parts yet" test. Reorder is translated from rail indices to composition indices
(`moveRow`), so moving a visible row past a hidden one still swaps the two rows the designer sees —
`PartRow` now takes `onMove` (rail indices) rather than `onReorder`. The composer's
`firstRailPartId()` is what every selection default now reads, so the room never opens on a row
that is not in the rail. The part is NOT dropped from the composition: it rides along and one
`upsert_agreement_parts` writes it back.

Still contingent on the backend lane actually seeding PART 13's eleventh entry — the filter is
correct whether or not the row exists.

## Round-1 gates

| Command | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | **clean** (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal test -- <the four touched/new test files>` | parts-rail **18/18**, turnkey-editors **22/22**, readiness-turnkey **17/17**, agreement-composer-turnkey **5/5** |
| `pnpm --filter @patina/designer-portal test` (full) | **544 suites / 6642 tests / 12 snapshots — all passed**, 29.0s |
| `pnpm --filter @patina/designer-portal lint` | 2 errors, 203 warnings — **both errors pre-existing and unchanged**: `git diff 112e6f838 -- <both files> apps/designer-portal/eslint.config.mjs` is empty, so they are byte-identical to base |

The flag-off snapshot file `agreement-composer-design-build-off.test.tsx.snap` is **unchanged** — no
`-u`, 12 snapshots passed. That is the pin that says the flag-off room is still the paper Wave 2
shipped.

## Round-1 diff

9 files changed, 669 insertions(+), 55 deletions(-), plus one new 440-line test file
(`__tests__/agreement-composer-turnkey.test.tsx`).
