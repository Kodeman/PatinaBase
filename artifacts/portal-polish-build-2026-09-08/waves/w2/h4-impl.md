# Lane H4 — Action tiers and the gates (PP-3) — implementation

**Branch** `portal-polish/h4` · **worktree** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4`
**Base** `origin/main` `1059f5275` · **HEAD** `b334b9711` · pushed to `origin/portal-polish/h4`
**Commits**
- `5d1c61ef9` feat(client): terminal action tier, unconditional rest rules, aria-disabled hold (PP-3)
- `b334b9711` feat(client): consequence sentences at the wall and door gates; Pay joins the terminal tier

---

## Gates — all green

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit
(no output — clean)

$ pnpm --filter @patina/client-portal test -- src/components/threshold src/app/pay
Test Suites: 47 passed, 47 total
Tests:       1124 passed, 1124 total
Time:        58.584 s

$ (cd apps/client-portal && npx eslint src/components/threshold src/app/pay)
approval-ask.tsx  1080:7  error  react-hooks/set-state-in-effect
tracking-row.tsx   104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)
```

Both eslint problems are **pre-existing** and in files this diff does not touch —
`git diff --stat origin/main -- approval-ask.tsx tracking-row.tsx` is empty. (Note: eslint
must be run from `apps/client-portal`; from the repo root it cannot find a config.)

Whole-suite check beyond the lane's gate:

```
$ pnpm --filter @patina/client-portal test
Test Suites: 135 passed, 135 total
Tests:       2270 passed, 2270 total
```

(An earlier full run showed one failure in `src/components/auth/__tests__/ClientPortalLogin.test.tsx:239`
— an async `findByText`. It passes in isolation in this worktree and on the main checkout, and
passed on the repeat full run. A load-timing flake, unrelated to this diff.)

## Diff stat

```
 apps/client-portal/src/app/globals.css                                    | 140 ++-
 apps/client-portal/src/app/pay/[token]/invoice-sheet.tsx                  |  14 +-
 apps/client-portal/src/app/trade/[token]/__tests__/trade-agreement-signature.test.tsx |   4 +-
 apps/client-portal/src/components/threshold/__tests__/approval-ask.test.tsx           |  18 +-
 apps/client-portal/src/components/threshold/__tests__/door-gate.test.tsx              |  64 +-
 apps/client-portal/src/components/threshold/__tests__/scope-change-ask.test.tsx       |   4 +-
 apps/client-portal/src/components/threshold/__tests__/wall-gate.test.tsx              |  72 +-
 apps/client-portal/src/components/threshold/door-gate.tsx                             |  63 +-
 apps/client-portal/src/components/threshold/instruments/__tests__/hold-action.test.tsx|   5 +-
 apps/client-portal/src/components/threshold/instruments/__tests__/scored-action.test.tsx | 201 +++
 apps/client-portal/src/components/threshold/instruments/scored-action.tsx             | 272 ++--
 apps/client-portal/src/components/threshold/wall-gate.tsx                             |  40 +-
 12 files changed, 709 insertions(+), 188 deletions(-)
```

**Four files beyond the lane's list.** The `HoldAction` change from `disabled` to `aria-disabled`
(step 4) breaks every existing `toBeDisabled()` assertion aimed at a held act, so the three other
HoldAction consumers' tests had to move with it — otherwise the gate is red by construction:

| File | Change | Why |
|---|---|---|
| `instruments/__tests__/hold-action.test.tsx` | 1 assertion | `toBeDisabled` → `not.toBeDisabled` + `aria-disabled="true"` |
| `__tests__/approval-ask.test.tsx` | 9 assertions | `submit response` is a `HoldAction` |
| `__tests__/scope-change-ask.test.tsx` | 2 assertions | `scope-change-approve` is a `HoldAction` (the `scope-change-withdraw-*` `ScoredAction` at :559 is untouched and still `toBeDisabled`) |
| `app/trade/[token]/__tests__/trade-agreement-signature.test.tsx` | 2 assertions | `trade-agreement-signature.tsx` is the fourth `HoldAction` caller |

No non-test file outside the lane's list was touched.

---

## Steps 1–10, as built

**1. `terminal` variant.** `ScoredActionVariant` gains `'terminal'`; `VARIANT_CLASS.terminal =
'da-terminal font-medium'`. CSS in the Scored Ink block: `padding: 13px 22px`, `min-height: 48px`,
`border-radius: 3px`, `background-color: var(--color-charcoal)`, `color: var(--ink-paper)`;
`.da-terminal .da-label` overrides the shared mono caps with `var(--font-body)` / 16px / 500 /
`letter-spacing: 0` / `text-transform: none` / `font-variant-numeric: tabular-nums`;
`.da-label::before,::after { content: none }`; hover `#1F1D1A`; active `translateY(1px)`.
`.da-terminal .da-pool` is re-inset to `0` at 3px radius in `--ink-faint` so a hold inks the whole
face rather than a rule under a word.

**2. Tertiary rests visible.** `transform: scaleX(0)` deleted from `.da-tertiary .da-label::before`;
the rule rests at 1px `var(--color-aged-oak)` (= the sheet's `--oak`, byte-identical `#8B7355`).
Hover becomes the sheet's `1.5px` / `--color-quiet-ink` (= `--ink-faint`); `:active` likewise
deepens rather than draws. The reduced-motion block's `opacity: 0` gate on the same pseudo-element
— the stilled equivalent of `scaleX(0)` — is deleted with it, or a reduced-motion reader would
still see no rest rule. No `@media (hover: none)` variant exists anywhere in the file.

**3. No `opacity-50`.** Both `disabled:opacity-50` and `aria-disabled:opacity-50` are gone from
`BASE_CLASS`; `disabled:cursor-not-allowed` / `aria-disabled:cursor-not-allowed` stay. New CSS
gives every non-terminal tier `--color-quiet-ink` text with `--hairline-strong` scores when
unavailable, and gives `.da-terminal` its **role**: `--rail` ground, `--ink-faint` text, 1px
`--hairline-strong` border (also under `:hover`, so an unavailable terminal does not darken).

**4. `HoldAction` stops using `disabled`.** The button takes `aria-disabled={unavailable ||
undefined}` and no `disabled`; it keeps its tab position (no `tabIndex` change). Two new props:

```ts
unmetReason?: string;   // announced when the client tries anyway
unmetFocusId?: string;  // the control activation sends focus to
```

`unmetFocusId` is an **id, not a ref**, because `SignatureLine` forwards nothing and both gates
already thread that id through `aria-describedby` — a ref would have meant editing
`signature-line.tsx`, which is not this lane's file. A `refuse()` callback on the click handler and
the Enter/Space keydown path writes the reason into the act's own `role="status"` line and focuses
the unmet control; it returns early while `loading`, so a loading act never announces a stale
reason. The line clears by derivation (`disabled ? said : ''`), not by an effect — the
`react-hooks/set-state-in-effect` rule is live in this portal.

**5. The hold sentence is visible.** `saidId` now labels a drawn `.t-meta` caption in
`--ink-subtle` directly under the act (`data-testid="{actionKey}-hold-caption"`), no longer
`sr-only`. It is still the target of `aria-describedby`, so the existing screen-reader test passes
unchanged. `HOLD_MS`, keyboard parity, scroll cancel, early release and reduced motion are
untouched. The wrapper now nests: the `data-hold-dock` span (with its `max-[600px]:sticky` classes
and `wrapperClassName`) is unchanged inside a plain `block` span that also carries the caption and
the status line — the `mobile_dock` presentation test still passes.

**6. Focus.** `.da-act:focus-visible` swaps `outline: none` for `outline: 2px solid
var(--color-clay-ink); outline-offset: 2px`. The proofreader's caret (`.da-act::before`, opacity 0
→ 1 on focus) is untouched; `.da-terminal::before` recolours it to `--ink-paper` so it reads on the
fill.

**7. `--color-error` — the grep.** R141 clause five (already ruled by A1) supersedes the plan's
"re-point the hover" branch: the token **and** its only reader are removed, and
`--color-terracotta-ink` is explicitly *not* adopted. The grep, run in this worktree before the edit:

```
$ grep -rn -- '--color-error' apps/client-portal/src
apps/client-portal/src/app/globals.css:58:  --color-error: #C77B6E;
apps/client-portal/src/app/globals.css:374:  color: var(--color-error);
apps/client-portal/src/components/threshold/instruments/__tests__/open-chapter.test.tsx:242:
    expect(container.innerHTML).not.toContain('--color-error');
apps/client-portal/src/components/account/AvatarUploadField.tsx:130:
    --color-error, which is red (VISION §6, Kody 2026-09-04). This
```

Exactly one consumer: `.da-danger:hover { color: var(--color-error) }` at `:373-375`. The
declaration at `:58` and that rule are both deleted; a danger act now hovers in the same scored
grammar as every other act. The two remaining hits are an absence assertion and a prose comment,
neither a consumer. After the edit, `grep` over `apps/client-portal/src` returns only those two
plus the new absence assertion in `scored-action.test.tsx`.

**8. The wall gate.** The act is `variant="terminal"`, labelled
`Accept the finished work · $1,440.00` (the figure appended only when a gated draw carries one).
Above it, `<p data-testid="wall-consequence" className="consequence">`, present in every act state,
composed from the fields already read at `:132-147`:

> Accepting releases $1,440.00 to Prairie Coat Painting for the finished work. It does not close
> the project or change your invoice.

Missing facts drop their clause rather than being guessed: no party → *"Accepting releases
$1,440.00 for the finished work."*; no gated draw → *"Accepting records that this work is
finished."* and a bare `Accept the finished work` label. The sentence sits **above** the signature
rule, matching `client-house.html:883`. After acceptance both the act and the sentence unmount —
the block is already inside `{!accepted && …}` — and the Stamp record stands alone (asserted).

**9. The door gate.** Same pattern: `variant="terminal"`, `unmetReason` / `unmetFocusId`, and

> Signing records your name on this paper and returns it to Quist Interiors. The deposit of
> $3,445.00 becomes payable; signing does not pay it.

composed from the `studioName` prop and `depositCents` (`furnishings.depositRequiredCents ??
tradeScope.draws[0].amountCents`), falling back to *"…returns it to your studio."* and *"Nothing is
charged by signing."* The act and its sentence are wrapped in one fragment under the existing
`{!signedAt && …}`, so both go when the paper is signed (asserted).

**10. `/pay/<token>`.** The bespoke `--pay-act-bg` button at `:773` becomes
`class="da-act da-terminal flex w-full …"` with its text in a `.da-label` span and a `.da-hit`
witness. `data-testid="pay-act"`, the `onClick`, and `disabled={submitting}` are unchanged; the
`disabled:opacity-70` is gone. All six `src/app/pay` suites (89 tests) pass unchanged.

---

## Review-checklist answers

- **No `disabled` attribute on any gating act** — `HoldAction`'s button has none. `ScoredAction`
  still sets `disabled`; steps 3 and 4 scope the change to `BASE_CLASS` and `HoldAction` only, and
  nothing in the plan asks `ScoredAction` to move.
- **Consequence sentence present in the unavailable state** — asserted at both gates in the
  `aria-disabled="true"` state *and* after arming.
- **Hold caption visible to pointer users** — asserted `not.toHaveClass('sr-only')`.
- **Focus is outline *plus* caret** — asserted; the `::before` caret rule is intact.
- **Terminal at exactly three sites** —
  `grep -rn 'variant="terminal"' apps/client-portal/src | grep -v __tests__` → `door-gate.tsx:867`,
  `wall-gate.tsx:299`; `grep -rn 'da-terminal'` (non-test, non-CSS) →
  `invoice-sheet.tsx:776` and the `VARIANT_CLASS` entry. Three call sites.
- **No `opacity: .5` anywhere in the diff** — asserted in CSS by regex
  (`/opacity:\s*(0?\.5|50%)\s*;/`) and in the component source by string.
- **`mobile_dock` still works** — `hold-action.test.tsx`'s dock test passes untouched.

## Deliberate deviations, for the integration lane to rule on

1. **Sheet-only token names.** `--ink-paper`, `--ink-faint`, `--rail` and `--hairline-strong` are
   written by their sheet names in the new terminal / unavailable rules; **H2's `:root` block is
   their home** and they do not resolve on this branch alone. Integration order is H2 → H1 → H4, so
   they land first. Rules I *edited* rather than added use the client's existing names
   (`--color-aged-oak`, `--color-quiet-ink`, `--color-clay-ink`) which are byte-identical to the
   sheet's `--oak` / `--ink-faint` / `--clay-ink`, so nothing already shipped depends on H2.
2. **`.consequence` is declared locally**, in the Scored Ink block, with a comment naming H2's type
   block as its home — per the brief. **Integration must dedupe.**
3. **Money precision.** The terminal labels and both consequence sentences use `formatCurrency`
   from `@patina/shared` (cents: `$1,440.00`) — the same formatter the Pay act already uses, which
   is what makes one grammar across the three terminal acts, and what the sheet's own examples
   print. The wall gate's *other* figures (`SpineGate` caption, the Stamp) still use
   `moneyInWords` (whole dollars: `$1,440`), which is the house's prose idiom. **The two sit in one
   block and disagree in precision.** `spine-gate.tsx` is not this lane's file; if the caption
   should go, that is a ruling for integration.
4. **The door's label carries no amount.** The sheet says "never a bare verb on a terminal act",
   but no money moves at the instant of signing — the deposit becomes payable and is paid from the
   letterbox. Appending the deposit figure to `Sign the furnishings authorization` would read as
   "signing pays this". The sentence names the figure instead. This also keeps the eight
   `signLabelFor(kind)` label assertions in `door-gate.test.tsx` (incl. the exact-label loop at
   :685) green.
5. **`--pay-act-bg` / `--pay-act-fg` / `--pay-act-bg-hover` are now unread.** Their declarations
   are in `SHEET_RULES` at `invoice-sheet.tsx:80-87`, which is neither the `:773` region this lane
   owns nor H1's `:895`. **Left in place; someone should delete them.** Consequence worth naming:
   that block gave the Pay button a `.dark`-class inversion; the terminal tier inverts through
   `--ink-paper` under `prefers-color-scheme` instead, which is H2's business.

## Not done

- `apps/client-portal/tests/threshold.spec.ts:390` and `:664` still `await expect(…).toBeDisabled()`
  on the two gate acts. Playwright's `toBeDisabled` reads `aria-disabled` as well as the attribute,
  so these may still pass — but the copy table assigns e2e copy to **W2 integration**, and no lane
  runs Playwright, so they are untouched and unverified here.
- No dev server, no `supabase db reset`, no render pass, no coverage run (`--coverage` is not part
  of the lane's gate; the full 135-suite jest run is the evidence above).
- `signature-line.tsx`, `spine-gate.tsx`, `review-ask.tsx` and the designer portal's
  `document-action.tsx` are untouched.
