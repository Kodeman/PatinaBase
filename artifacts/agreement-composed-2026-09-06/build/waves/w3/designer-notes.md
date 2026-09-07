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
