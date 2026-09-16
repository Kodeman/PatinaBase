# T1 · adversarial review — Agreement Room galley foundations

Reviewer: fresh context, did not implement. Read-only on source; nothing in the
worktree was edited.

| | |
|---|---|
| Worktree | `/Users/kody/Code/patina-merged/.codex/worktrees/agent-agreement-galley` |
| Branch | `agreement-room/galley` |
| Base | `7eed713b7` (origin/main) |
| Reviewed | `a30c42b52` (T1) · `bd3aa7180` (T1b) — 15 distinct files, 870+/111− then 153+/39− |
| Yardsticks | `build/build-sheet.md` §2 T1 · `specimens/SPEC.md` §1, §2 · `rulings.md` (worktree copy, AR-a…AM-3) |

**Verdict: FIX** — P1: `T1R-01`, `T1R-02`.
Nothing in T1 regresses a shipped surface, and every gate is green. The two P1s
are both *acceptance checks the sheet wrote for T1 that T1 does not meet*, and
neither is fixable by a later task as the file sets are drawn.

---

## §1 · Gates, run by the reviewer

All four run in the worktree, not the primary checkout.

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | `> tsc --noEmit` · **exit 0** |
| `pnpm --filter @patina/designer-portal test -- src/components/document/commercial src/components/document/rooms/drafting/agreement src/components/ui src/lib/document` | **150 suites / 2858 tests / 10 snapshots passed**, 8.7 s · exit 0 |
| `pnpm --filter @patina/client-portal type-check` | `> tsc --noEmit` · **exit 0** |
| `npx eslint` on the 10 touched/added source+test files | **0 errors, 1 warning** (`button.tsx:161` unused `eslint-disable` for `no-console` — pre-existing, inside the `asChild` fallback) · exit 0 |
| `pnpm turbo build --filter=@patina/types` (bonus) | 1 successful, 1 total · FULL TURBO |

`src/lib/document` contains both CSS guards named in the brief —
`contrast.test.ts` (F56 + R126) and `shadow-gate.test.ts` — and both are inside
the 150 green suites. `git diff 7eed713b7..bd3aa7180 | grep -c '^+.*box-shadow'`
→ **0**: no shadow introduced, so `shadow-gate.test.ts`'s "exactly one shadow in
globals.css, and it is `.doc-elevated`" still holds.

## §2 · What was verified clean

Recorded because the ruling asked for it, and because a reviewer who does not
say what passed has not narrowed anything.

- **Additive, provably.** Every one of the 14 new token names and every new
  class name (`.t-*`, `.field*`, `.money-row(s)`, `.studio-note`) has **zero**
  occurrences anywhere in `apps/designer-portal/src`, `packages/patina-design-system/src`
  or `packages/catalog-ui/src` at `7eed713b7`
  (`git grep -c 'var(--rail)' 7eed713b7 …` etc. → 0 for all fourteen). No
  existing declaration is edited, no selector is renamed. The "no other
  surface's rendering changed" ruling holds.
- **`maximumScale` removed** — `grep -rn 'maximum-scale\|maximumScale' apps/designer-portal/src` → **0** (sheet acceptance 3 ✓).
- **The paper's render is byte-identical to `7eed713b7`'s.** T1b fully reverts
  AR-g and AM-2: `PartHeading` is again
  `h3.mb-2 font-heading text-[1.05rem] italic text-[var(--color-charcoal)]`
  (`agreement-parts-body.tsx:64-70`, no diff hunk), `AGREEMENT_PART_COPY.noTotal`
  is gone, and `agreement-parts-body.test.tsx` has a **net-empty diff** against
  base — which matters because `:480-498` asserts the whole `AGREEMENT_PART_COPY`
  object by equality and would have gone red on either an added or a stale key.
  Structurally, `AgreementPartSection`'s non-attachment branch reduces to the
  old inline body with `headless=false` (`{!headless && <PartHeading>}` →
  `<PartHeading>`), `ridesWithScheduleOfValues` is the old inline predicate
  verbatim, the attachment branch returns the identical `<AttachmentLeaf>`, and
  the `<Fragment key={part.id}>` wrapper emits no DOM.
- **The two `.snap` files' net diff is exactly the aged-oak → `--ink-subtle`
  class swap** — five distinct class strings, nothing else.
- **`partKey` keying is correct and complete for the editor.** `persist()`
  (`agreement-composer.tsx:601-625`) already remaps `selectedId` by `partKey`
  after the DELETE-then-INSERT, so `key={selected.partKey}` at `:865` is the
  matching half of a fix that was previously only half-landed. `:893` already
  keyed `history-${selected.partKey}`.
- **`held` is genuinely opt-in.** `disabled` and `className` are destructured
  out of `rest`/`props` in both primitives; with `held` absent, `disabled`,
  `aria-disabled`, `data-held`, `className` and `onClick` are all byte-identical
  to base. Both suites assert the negative case explicitly.
- **`held` a11y core.** Focusable (`not.toBeDisabled()` + `toHaveFocus()`),
  `aria-disabled="true"`, `aria-describedby` forwarded and resolved to a real
  node, no `disabled` attribute rendered, `onClick` swallowed,
  `onHeldActivate` called exactly once, `events.actionSelected` not fired.
- **`parts?: AgreementPart[]`** is declared on the send sheet, unused, and the
  `type AgreementPart` import type-checks. No client-portal file, no migration,
  no edge function is touched by either commit.
- **No dark twin is the right call, and its stated reason is true.**
  `contrast.test.ts:47` parses globals.css with a block-blind regex; a
  `@media (prefers-color-scheme: dark)` re-declaration of `--clay-ink` would be
  the *last* hex the Map records and would be measured against the light
  grounds. The portal also has no dark paper set to resolve into (`.dark` at
  `globals.css:1519` is shadcn OKLCH tokens only).

---

## §3 · Findings

`P1` = must fix before this commit is a barrier the lanes branch from.
`P2` = fix in this wave. `P3` = record; fix if cheap.

| ID | Sev | Conf | file:line | Claim | Evidence | Proposed fix |
|---|---|---|---|---|---|---|
| **T1R-01** | **P1** | high | `…/drafting/agreement/**` (28 sites) | **Sheet acceptance check 4 is not met, and no downstream task owns the files.** "Every surviving `aged-oak` hit under `…/drafting/agreement/` styles `border-color`/`background`, never `color`." | `grep -rn 'aged-oak' …/drafting/agreement/` returns 28 `color`-carrying hits after T1: `part-editor.tsx:46,648` · `save-as-template-action.tsx:24` · `template-picker-sheet.tsx:25` · `part-history-strip.tsx:21,99` · `add-part-sheet.tsx:46` · `schedules/{cost-plus,flat,package,per-phase,day-rate,percent,procurement}-editor.tsx` · `schedules/authority-chip.tsx:25` (pinned by `__tests__/authority-chip.test.tsx:72`) · `turnkey/{sub-picker:18,120, lien-waiver-attachments:32, supervision-clause:33, schedule-of-values:34, sub-disclosure-clause:35,144, draws-editor:40, jurisdiction-attachments:28,71, draw-ledger:33,125, pricing-basis-editor:48}`. `--color-aged-oak` on paper measures **4.20:1** — the live AA failure N-14 named. T1's edit table listed only `agreement-composer.tsx:87,962,1048` + `parts-rail.tsx`, so T1 did what its table said; but the build sheet's §2 file sets give **T2** only `agreement-composer/part-editor/parts-rail` and **T3** only the drafting room + send sheet + instruments + `packages/types`. Nothing in the ladder owns `schedules/`, `turnkey/`, `add-part-sheet`, `template-picker-sheet`, `part-history-strip`, `save-as-template-action`. | Either extend T1's sweep to all 28 (a mechanical `text-[var(--color-aged-oak)]` → `text-[var(--ink-subtle)]` replace, plus the one-line update to `authority-chip.test.tsx:72`), or have the orchestrator narrow acceptance 4 in writing to the two files T1's table names and file the rest as owed. Do not leave the check standing unmet — T5 will read it green off T1's commit message. |
| **T1R-02** | **P1** | high | `packages/types/src/agreement-copy.ts:390` | **Sheet acceptance check 6 cannot pass as written.** `agreementConsequenceSentence` hard-codes `their signature`; both canonical strings the check names use **`his`**. | `synthesis.md:214` — `…the terms — and **his** signature preserves consent; nothing is billed…`; `synthesis.md:239` (the send sheet's row) — same. Implementation (`:390`): `` …— ${joinPhrases(phrases)} — and their signature preserves consent; ${closing}` ``, with the comment "The pronoun is `their` in every case". Every other token of the sentence reproduces §5 exactly — I walked the nine-part Okonkwo fixture: `the services` · `the deliverables` · `the exclusions` · `the role rates` · `the $24,000.00 ceiling` · `the $5,000.00 retainer` · `the monthly billing cadence` · `the Concept fee of $2,400.00` · `the terms`, joined with no serial comma, `agreementCadenceText("monthly") === "monthly"`, `agreementCountWord(9) === "nine"`. Only the pronoun differs. The build sheet's own gloss ("No name ⇒ … `their signature`") implies the *named* case is not `their`, which is unresolvable from a name. | Orchestrator ruling, then code. Either (a) rule `their` universal and amend `synthesis.md:214/239` + acceptance 6 so the contract and the code agree, or (b) add an optional `recipientPronoun` to the input and default to `their`. Whichever way, land the ruling before T2/T3 print the sentence to three surfaces. |
| **T1R-03** | P2 | high | `packages/types/src/agreement-copy.ts:229-395` | **The three new copy helpers have zero tests.** 175 new lines of pure string logic, exported from `@patina/types` for three surfaces, with no assertion anywhere. | `grep -rn 'agreementConsequenceSentence\|agreementPartNounPhrase\|agreementCountWord'` across `apps/` and `packages/` matches only `agreement-copy.ts` and its build output in `packages/types/dist/`. There is no `packages/types` test for them and no designer-portal test either. Acceptance 6 is therefore unverified by anything but reading. | Add a `packages/types` (vitest) or designer-portal spec reproducing §5 #25 and #26 verbatim off the SPEC §6 fixture, plus the unwritten-part exclusions and the `flat` title case. This is the cheapest possible guard for the wave's most-copied sentence. |
| **T1R-04** | P2 | high | `agreement-parts-body.tsx:552-563` | **`partDrawsNothing` does not agree with the body's own silent-part rule for two kinds.** It encodes only the `renderPartBody(...) === null` half; `AgreementPartsBody` *also* filters `clientVisible !== false` and `kind !== "attestation"` (`:621-624`) before it ever calls `renderPartBody`. | For an attestation part, `renderPartBody` falls through `if (part.kind !== "schedule") return <RecordedLine/>` (`:356-359`) → non-null → `partDrawsNothing === false`, i.e. "it draws", while the body prints nothing at all. Same for **any** part with `clientVisible === false`, of any kind, including an attachment (`partDrawsNothing` returns `false` for attachments unconditionally at `:558`). `AgreementPartSection` has the same gap: called on a hidden or attestation part it renders the section the body suppresses. The function's own docstring — "True when this part puts NOTHING on the paper — R27's rule" — is therefore false for those inputs. Neither case is in the new suite. | Move the body's two filters into the predicate (`if (part.clientVisible === false \|\| part.kind === "attestation") return true;`) and have `AgreementPartSection` return `null` on the same condition, so the galley cannot print a part the paper hides. If the galley is meant to show hidden parts to the *studio* (AR-e's Hide act), then rename the predicate to say what it actually asks and give the galley a separate visibility check — but do not leave one function answering two questions. |
| **T1R-05** | P2 | high | `…/commercial/agreement-part-section.test.tsx` | **The new suite never exercises `turnkey`, and never compares an attachment against the whole body.** Every render passes the default `turnkey={false}`. | The `it.each` parity test is genuine — it compares `alone.innerHTML` against the `[data-part-key]` `outerHTML` sliced out of a full `AgreementPartsBody` render, unmounted first, so it really is a markup comparison, not something weaker. But: (a) `ridesWithScheduleOfValues`, the `pricing_basis` + `ScheduleOfValuesSection` ride-along, `draws` and `allowances` are never rendered by any test in the file; (b) the nine-part fixture has no attachment, so the one attachment case (`"letters an attachment from the caller"`) only asserts `textContent` contains `Attachment B · …` — it never runs the parity comparison, which is exactly where a lettering or wrapper drift would show; (c) no `clientVisible: false` or `attestation` case (see T1R-04). The turnkey ride-along is the single subtlest branch in the export and it is the one branch with no coverage. | Add a turnkey fixture (pricing_basis + draws + allowances) and run the same `it.each` parity comparison over it, including the SOV ride-along; add an attachment to the parity fixture so `AttachmentLeaf` is compared and not merely sampled. Both are named in T4's row for this file — pull them forward, because T2 will be laying out around this predicate before T4 runs. |
| **T1R-06** | P2 | high | `document-action.tsx:227-232` | **The three held utility classes appended to `DocumentAction` are inert — every one of them loses the cascade.** The held look that actually renders comes from pre-existing CSS, so the code says one thing and the browser does another. | The classes are appended by raw string concatenation (not `cn`/twMerge, unlike `button.tsx:110`), so nothing is de-conflicted. `globals.css` is Tailwind v3 (`@tailwind utilities` at line 5; `tailwindcss: ^3.4.1`), so every utility is emitted at line 5 and the rest of the file follows it. Then: `text-[var(--ink-faint)]` (0,1,0) loses to `.da-act[aria-disabled='true'] { color: var(--text-faint) }` at `globals.css:1066` (0,2,0); `bg-[var(--rail)]` (0,1,0) loses to `.da-terminal[aria-disabled='true'] { background-color: var(--doc-rail-stock) }` at `:1080` (0,2,0) and, for every other variant, to `.da-act { background: none }` at `:753` (0,1,0, later source order); `opacity-100` sets the initial value and `BASE_CLASS` carries no opacity at all. The sheet's own prescribed shape (`data-[held=true]:…`, 0,2,0) would have tied `.da-terminal[aria-disabled]` and still lost on source order. **The rendered result is nonetheless correct** — `--text-faint` is `#65594E`, byte-identical to `--color-quiet-ink`/`--ink-faint`, and `--doc-rail-stock` is `--rail`, so N-6's 5.32:1 pair is what paints. The defect is that the comment ("Held is faint ink on the rail (N-6)") credits code that does nothing, and a future edit to `globals.css:1066-1086` would silently remove the held treatment while `button.test.tsx`'s class-name assertion stayed green. | Drop the three classes from `document-action.tsx` and replace the comment with the truth: held renders through `.da-act[aria-disabled='true']` / `.da-terminal[aria-disabled='true']`, which already carry N-6's pair. If a held-specific treatment is wanted beyond that, add a `.da-act[data-held='true']` rule in `globals.css` **after** `:1086` rather than a Tailwind utility. |
| **T1R-07** | P2 | med | `button.test.tsx:28,60` · `__tests__/document-action.test.tsx:513,533` | **Keyboard activation of a held act is never tested, and the `href` branch of `DocumentAction` is not tested at all.** | Both suites use `fireEvent.click` only. The brief's requirement is "activation swallowed for click AND keyboard". The implementation is *correct* — a native `<button>` and an `<a href>` both synthesize a click from Enter (and Space, for the button), and `button.tsx:180` additionally `preventDefault()`s — but nothing proves it, and jsdom will not synthesize the click for you, so a regression that (say) moved the swallow to `onMouseDown` would pass. The anchor branch's held path (`document-action.tsx:239-241`, `:265`) has no test of any kind: neither the `tabIndex` restoration nor the `onHeldActivate` call. | Add `await userEvent.keyboard('{Enter}')` and `'{ }'` cases to both suites, and one `DocumentAction href=… disabled held` case asserting the anchor stays in the tab order (`tabIndex` not `-1`), that `onHeldActivate` fires once and that navigation is prevented. |
| **T1R-08** | P2 | high | `button.tsx:119-155` | **`Button asChild + held` silently drops every part of `held`.** The `asChild` branch returns before the held handling: it rebuilds `className` from `cn(buttonVariants(...), child.props.className, className)` — *without* the held classes — and sets no `aria-disabled`, no `data-held`, and no swallowing `onClick`. | `classes` (which does contain the held classes, `:108-113`) is computed but never used in the `asChild` return at `:149-155`; `mergedOnClick` composes the caller's and the child's handlers with no `isHeld` branch. A caller writing `<Button asChild disabled held>` gets a fully live, unmarked control. No test covers it. | Either compute the `asChild` className from `classes` and apply the same `aria-disabled` / swallow there, or make it loud: `if (asChild && held) throw`/`console.error` in dev. Silent is the one option that will cost someone an afternoon. |
| **T1R-09** | P3 | high | `globals.css` (new `:root`, `--hairline-strong`) | `--hairline-strong: #D8CCB8` matches the build sheet but **deviates from `SPEC.md` §1** (`rgba(44, 41, 38, .14)`), and the in-file justification is factually wrong. | The comment says "flattened to its composite so a rule drawn on the rail does not double". The actual composite of `rgba(44,41,38,.14)` over `--paper` `#FAF7F2` is `#DDDAD5` (a neutral grey, 1.30:1) and over `--rail` `#E8E3DB` is `#CDC9C2`. `#D8CCB8` is neither: it is a warm tan at 1.48:1 on paper, a different pigment, not a flattening. It is used for `.field-control`'s box and `.money-rows`' top rule, so the §A14 fields will read warmer and slightly stronger than the specimens do. | Keep the value (the sheet ruled it) but fix the comment to say what it is — a warm hairline chosen over the sheet's neutral alpha — and record the SPEC §1 deviation in the ship report so the specimens and the portal do not drift unrecorded. |
| **T1R-10** | P3 | high | `globals.css` (new `:root`, `--ink-muted`/`--ink-subtle`) | The ink ramp is **shifted one step** against `SPEC.md` §1, and the token that carries SPEC's exact value is left unused. | SPEC §1: `--ink-muted: #4E4339`, `--ink-subtle: #5A4E43`. Landed: `--ink-muted: var(--text-body)` → `var(--color-mocha)` → `#5C4A3C` (8.06:1 on `--paper-doc`), `--ink-subtle: var(--text-muted)` → `#4E4339` (8.99:1 on paper) — i.e. SPEC's `--ink-muted` value now wears the `--ink-subtle` name. `--text-subtle: #5A4E43` (`globals.css:94`) is SPEC's `--ink-subtle` exactly and is not aliased. All three clear AA, so nothing fails today; but `.field-control`'s body ink is now the mocha step, and a future retune of `--text-body`/`--text-muted` moves the paper without touching the house sheet. This matches the build sheet's alias table, so it is a sheet-vs-SPEC conflict, not an implementation error. | One-line change to `--ink-muted: var(--text-muted)` / `--ink-subtle: var(--text-subtle)` gives exact SPEC values with no literals; or record the intended deviation. Either way, decide before T2 spends `--ink-muted` across the galley. |
| **T1R-11** | P3 | high | `parts-rail.tsx:156,160,161` | Something else still keys on the re-minted uuid: `key={part.id}`, `selected={part.id === selectedId}`, `blockedIds.has(part.id)`, and `SortableContext items={rows.map(p => p.id)}` (`:150`). Every `PartRow` remounts on save, dropping its local `menuOpen` (the ⋯ row menu closes). | The brief's grep: `agreement-composer.tsx` has only `key={selected.partKey}` (`:865`) and `key={`history-${selected.partKey}`}` (`:893`) — clean. `part-editor.tsx`'s keys are all `item.id`/`option.value`/`index` on payload sub-rows, unaffected by the RPC. `parts-rail.tsx:156` is the one remaining id-keyed list. | No action required in T1 — T2 deletes `parts-rail.tsx` for `part-outline.tsx`. Recorded so T2 does not copy the pattern forward; the outline must key rows on `partKey`. |
| **T1R-12** | P3 | high | `agreement-copy.ts:265-268` | `agreementCountWord(0)` returns `"0"`, not `"zero"`; `COUNT_WORDS[0] = "zero"` is dead. | `return whole >= 1 && whole <= 20 ? COUNT_WORDS[whole]! : String(whole)` — the guard starts at 1, so index 0 is unreachable. Harmless today (`agreementConsequenceSentence` branches on `phrases.length === 0` before calling it) but the array reads as though 0 is handled. | `whole >= 0 && whole <= 20`, or delete the `"zero"` entry and re-index. |
| **T1R-13** | P3 | high | `agreement-copy.ts:386` | The empty-composition sentence is invented, not from synthesis §5. | `` `${who} receives nothing this agreement has written yet; ${closing}` `` appears nowhere in `synthesis.md` §5, which pins only the six-part and nine-part forms. §5 was declared verbatim copy for this wave. | Get it ruled (it is one sentence) or route the empty case to a string §5 does pin. |
| **T1R-14** | P3 | high | `agreement-parts-body.tsx:562` | `partDrawsNothing` builds the React tree to test it for null — `renderPartBody(part, currency, turnkey) === null` — so a caller that asks and then renders constructs each part's body twice. | `renderPartBody` is pure and cheap for clause/list, but `PricingBasisLeaf`/`AllowancesLeaf`/rate-card map over payload rows. T2's outline will call this once per part per render. | Acceptable as-is; if the galley's render profile shows it, extract the emptiness predicates (`!body.trim()`, `items.length === 0`, `readCents(...) === null`) into a data-only check. |
| **T1R-15** | P3 | high | `globals.css` (new block) | No dark twin, where `SPEC.md` §1 mandates both (`@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`); and no `color-scheme` declaration, which SPEC's `:root` opens with. | Verified the stated reason is true (see §2). Verified the portal has no dark paper set to resolve into. Omitting `color-scheme: light dark` is in fact the safer choice here — `.field-control` is a real `<input>/<textarea>/<select>` and would otherwise pick up UA dark form chrome under a light palette. | No code change. Record the deviation and its reason in the house sheet the same way `--color-card-edge`'s dark companion is recorded, so the specimens' dark block is not read as shipped. |
| **T1R-16** | P3 | high | `button.tsx:85-91` · `document-action.tsx:83-89` · `button.test.tsx` (new file) | Scope the sheet did not ask T1 for: `onHeldActivate` on both primitives (T1b), and a brand-new 66-line `button.test.tsx` (T4's territory). | The sheet's T1 row specifies `held?: boolean` and the four class/attribute changes; `onHeldActivate` is not in it. It is plainly needed by T2 acceptance 5 ("activating the held Send writes the reason into `#room-status`") and T3's send row, and adding it in the barrier commit is the right place — but it is scope growth in the one commit both lanes branch from, so it should be named rather than absorbed. | None. Log both in the T1 ship note so the T2/T3 briefs know the callback exists and the suite is already there. |
| **T1R-17** | P3 | med | `document-action.tsx:274-278` | The `DocumentAction` **button** branch does not `preventDefault()` on a held activation, where `Button` does (`button.tsx:180`). A caller passing `type="submit"` alongside `held` would submit the enclosing form while the act itself is swallowed. | `type={(rest as …).type ?? 'button'}` (`:298`) defaults safely, so this needs an explicit `type="submit"`; no current caller does. `Button` guards it, so the two primitives disagree. | One line: `event.preventDefault()` in the `if (unavailable)` branch at `:275`. |
| **T1R-18** | P3 | high | `button.tsx:106` · `document-action.tsx:167` | `held` without `disabled`/`loading` is a silent no-op (`isHeld = held && unavailable`), yet the prop name reads as a state, not a modifier. A caller writing `held` alone gets a fully live act with no warning. | Documented in both JSDoc blocks ("read only in company with `disabled`/`loading`"), but nothing enforces or reports it. | Dev-only `console.warn` when `held && !unavailable`, or rename to `heldWhenDisabled`. Cheap insurance across three call sites in T2/T3. |
| **T1R-19** | P3 | high | `overlays/doc-sheet.tsx:80` vs `document-action.tsx:300`, `button.tsx:177` | T1 now emits `aria-disabled="true"` on held **buttons**, and `getFocusableElements` still filters `element.getAttribute('aria-disabled') !== 'true'`. A held act inside any `DocSheet` is unreachable by Tab — precisely N-4. | Confirmed at `doc-sheet.tsx:80`. No live regression: T1 ships no `held` caller. The send sheet's Send — the first real held act — lives inside `DocSheet`, and T3 owns the `doc-sheet.tsx:87` edit. | None in T1. Hard-order it: T3's `doc-sheet` clause must land in the same merge as any `held` act inside a sheet, or the act ships keyboard-unreachable — the exact failure `held` exists to prevent. |
| **T1R-20** | P3 | high | `globals.css` (new `:root`) | SPEC §1 tokens T2/T3 will need are not landed, and T1's file set is the only one that may touch `globals.css`. | Landed: 14 of SPEC §1's tokens. **Not** landed: `--hairline`, `--radius-box`, `--elevation-sheet`, `--press-in`/`--press-out`/`--ease`, `--clay`/`--golden`/`--sage` and their remaining `-ink` twins, the seven `--tab-*` plates. Also absent: the whole `.act`/`.act--*`/`.chip`/`.consequence` §A5–§A6 block, which SPEC §1 pastes and which T2's `galley-part.tsx` and T3's send sheet both spend by name. The build sheet's T2/T3 "must not touch" columns both name `globals.css`. | Decide now whether T2/T3 use the portal's own `DocumentAction` tiers (likely — `.da-*` already implements §A5 and carries the `[aria-disabled]` held treatment, see T1R-06) or need `.act`. If the latter, it must be a T1 amendment; it cannot be a T2 edit as the file sets are drawn. |
| **T1R-21** | P3 | high | `globals.css` (new block, ~`:1954-2186`) | The new block is **unlayered CSS after `@tailwind utilities`**, so `.t-*`, `.field*`, `.money-row*` and `.studio-note` beat every Tailwind utility of equal specificity on the same element. | Tailwind v3 replaces `@tailwind utilities` in place at `globals.css:5`; everything after wins at equal specificity. So `<div class="t-body text-[12.5px]">` renders at 16px, not 12.5px, and `<input class="field-control p-2">` keeps the 12px padding. This is invisible in Jest (no CSS) and will only show in the walk. | No change — it is the intended behaviour for a house sheet. Put it in the T2/T3 briefs in one line: **do not mix a `.t-*`/`.field*` class with a Tailwind utility that sets the same property; pick one.** |

---

## §4 · Per the brief's seven questions

1. **Correctness against binding shapes / hidden behaviour for other callers.**
   All seven edits match their shapes. The one deliberate deviation is
   `DocumentAction`'s `aria-disabled={isHeld || undefined}` on the button branch
   where the sheet wrote `aria-disabled={unavailable || undefined}` — the
   narrower form is *better*, because the sheet's version would have put
   `aria-disabled="true"` on all 34 natively-disabled sites and broken the
   "every existing caller byte-identical" ruling. No hidden behaviour change for
   any other caller: `held` defaults false, `disabled`/`className` are
   destructured out of the rest-spread, the class append is guarded on `isHeld`,
   and the token/class names are unspelled anywhere else in the tree (§2).
2. **`globals.css`.** No selector collides (verified by grep over
   designer-portal, `patina-design-system` and `catalog-ui`, all three of which
   are in the Tailwind `content` glob). The new tokens resolve — every alias
   target exists at `:root` except the three font families, which are declared
   on `body` (`:1560-1562`, deliberately, for `next/font`) and inherit into every
   element and every React portal target. The portal has no dark mechanism to
   resolve into, correctly (T1R-15). `contrast.test.ts` still passes: the two new
   literal `-ink` tokens are picked up by `parseTokens` and measured (`#7C5E30`
   5.61:1 on paper / 4.70:1 on rail; `#9C5340` clears every light ground), and
   `aliasedInkNames`' `[]` assertion survives because `--ink` is `--` + `ink`
   with no segment before `-ink` and so does not match `(--[a-z0-9-]+-ink)`.
   `shadow-gate.test.ts` passes; **no `box-shadow` is introduced**.
3. **`AgreementPartSection`.** The T1 test genuinely compares markup
   (`innerHTML` vs the whole body's `outerHTML` slice, separately mounted) — not
   something weaker. Rendering is identical for all nine fixture parts. But
   `turnkey` is never exercised and the attachment is never compared (T1R-05),
   and `partDrawsNothing` disagrees with the body for `clientVisible === false`
   and `kind === "attestation"` (T1R-04).
4. **`partKey` keying.** The editor is correct and complements the pre-existing
   `persist()` remap. `parts-rail.tsx:156` still keys rows on `id` (T1R-11);
   `part-editor.tsx` has no id-keyed state.
5. **`held`.** Focusability, `aria-describedby`, no `disabled` attribute,
   swallowed click, exactly one `onHeldActivate` — all correct and all tested.
   Keyboard and the anchor branch are correct but untested (T1R-07). The held
   visual is correct on `Button` (twMerge resolves it) and correct-by-accident on
   `DocumentAction`, where the appended classes are inert (T1R-06). `asChild`
   drops `held` entirely (T1R-08).
6. **Gates.** §1. All green.
7. **Unasked-for scope.** `onHeldActivate`, the new `button.test.tsx`, the
   `--ink-paper` token, `cursor-not-allowed` on `Button`'s held classes, and the
   `ridesWithScheduleOfValues` helper. All defensible; T1R-16 logs the two that
   matter.

---

## §5 · Verdict

**FIX.** P1: **`T1R-01`** (aged-oak acceptance check 4 unmet with no downstream
owner) and **`T1R-02`** (the consequence sentence cannot satisfy acceptance
check 6 without a ruling).

Counts: **21 findings — 2 · P1, 6 · P2, 13 · P3.**

Neither P1 is a code defect in what T1 built; both are contract failures that
will be inherited by T2 and T3 and read as green off T1's commit message. T1's
actual implementation is sound, additive as ruled, and byte-identical for every
other caller and for the paper — which is the hard part, and it holds.
