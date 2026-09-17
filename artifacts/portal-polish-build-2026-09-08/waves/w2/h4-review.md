# Lane H4 review — Action tiers and the gates (PP-3)

**Reviewer context:** separate from the implementer. Branch `origin/portal-polish/h4` (HEAD
`eb551e3f6`) inspected read-only at `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4`.
Compared against `docs/superpowers/plans/2026-09-08-portal-polish-build.md` (Lane H4 section +
Review protocol + Review checklist), `docs/design/house-sheet/SPEC.md` §A5/§A6 (read from the
worktree, since it is not yet on my local main), the lane's own
`artifacts/portal-polish-build-2026-09-08/waves/w2/h4-impl.md`, and
`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html`.

## Verdict

**needs-fix** — two P1/P2 findings below.

## Gates — reproduced independently

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h4 --filter @patina/client-portal type-check
> tsc --noEmit                                            (clean, no output)

$ pnpm --dir ...agent-pp-h4 --filter @patina/client-portal test -- src/components/threshold src/app/pay
Test Suites: 47 passed, 47 total
Tests:       1124 passed, 1124 total

$ cd .../agent-pp-h4/apps/client-portal && npx eslint src/components/threshold src/app/pay
approval-ask.tsx  1080:7  error  react-hooks/set-state-in-effect
tracking-row.tsx   104:9  warning  Unused eslint-disable directive
✖ 2 problems (1 error, 1 warning)
```

All three numbers match the lane's own report exactly. I confirmed both eslint hits are
pre-existing and untouched by this diff: `git diff origin/main...origin/portal-polish/h4 --stat --
apps/client-portal/src/components/threshold/approval-ask.tsx
apps/client-portal/src/components/threshold/instruments/tracking-row.tsx` returns nothing — the
lane's disclaimer holds.

## Pathspec discipline

Diff stat (`git diff origin/main...origin/portal-polish/h4 --stat`): 12 files + the impl report.
All 8 non-test file/region entries match the lane's file list exactly (`scored-action.tsx`,
`globals.css` Scored Ink block, `wall-gate.tsx`, `door-gate.tsx`, `invoice-sheet.tsx:773`). No
non-test file outside the lane's list was touched — confirmed.

**Four test files beyond the declared list were touched**, all consequences of the
`disabled`→`aria-disabled` change on the shared `HoldAction`:
`instruments/__tests__/hold-action.test.tsx`, `__tests__/approval-ask.test.tsx`,
`__tests__/scope-change-ask.test.tsx`, `app/trade/[token]/__tests__/trade-agreement-signature.test.tsx`.
Each edit is a mechanical `toBeDisabled()` → `toHaveAttribute('aria-disabled', 'true')` swap, no
new assertions beyond that, and the change is unavoidable — leaving them alone would make the gate
red by construction, since all four consume `HoldAction`. Transparently disclosed in the impl
report with a table of exactly what changed and why. — **P3, high confidence.** Procedural
finding for the record; I would not block on it, but the plan's "touch ONLY the files your lane
lists" is a hard global constraint and this is a real, if narrow and justified, breach of it. The
review protocol names this class of check explicitly, so it goes in the report.

## House sheet fidelity

Compared `.da-terminal`, the unavailable block, the tertiary rest rule and the focus rule against
`SPEC.md` §A5/§A6 line by line (read in the worktree's `docs/design/house-sheet/SPEC.md`):

- `.da-terminal` padding/min-height/radius/background/color/hover/`:active` all match the sheet's
  `.act--terminal` (radius is hardcoded `3px` rather than routed through a `--radius-box` token —
  correct, since no such token exists anywhere on `main` or on H2's branch; hardcoding the sheet's
  own stated value is the only option available today).
- Terminal label override (Inter 500/16px/0 tracking/sentence case/tabular figures) matches; the
  `line-height: 20px` addition isn't in the sheet but doesn't contradict it and is a reasonable
  fill-in for the larger type size.
- Tertiary rest rule: `scaleX(0)` removed, rests at `--color-aged-oak` unconditionally, no
  `@media (hover:none)` variant, and the reduced-motion override of the same pseudo-element is
  removed too (a reduced-motion reader would otherwise still see zero interactive marks) — matches
  R139/sheet exactly, and the reduced-motion catch is good, deliberate work.
- `--color-error` grep-and-remove: reproduced the grep myself (`grep -rn -- '--color-error'
  apps/client-portal/src`) — exactly the two non-consumer hits (an absence assertion, a prose
  comment) the report claims, both post-dating the fix. Matches R141 clause 5.
- `opacity: .5` / `opacity-50`: grepped `globals.css` and `scored-action.tsx` myself — none present.
  (Pre-existing, untouched `loading` dot on plain `ScoredAction` at `scored-action.tsx:178` uses
  `opacity-70` with `animate-pulse` — a pulsing dot is arguably spinner-adjacent under the house
  sheet's "no spinner" rule, but it predates this diff and this lane never touches that code path
  for any of its three terminal call sites. Flagging for awareness only, not against this lane —
  **P3, low confidence relevance to H4 specifically, but real and unaddressed in the codebase.**)
- Terminal at exactly three sites: reproduced the report's own greps —
  `grep -rn 'variant="terminal"' apps/client-portal/src | grep -v __tests__` → `wall-gate.tsx:299`,
  `door-gate.tsx:867`; `grep -rn 'da-terminal' --include=*.tsx | grep -v __tests__ | grep -v
  scored-action.tsx` → `invoice-sheet.tsx:776`. Confirmed, exactly three.
- Unavailable block: `.da-primary`/`.da-secondary`/`.da-tertiary`/`.da-danger` get
  `--color-quiet-ink` text on disabled/aria-disabled, matching the sheet's intent for
  tertiary/secondary (and reasonably extended to the legacy primary/danger tiers, which aren't part
  of the sheet's three-tier system but would otherwise have gone fully unstyled once
  `disabled:opacity-50` was removed from the shared `BASE_CLASS`). I checked whether
  `.da-secondary[aria-disabled] .da-label::after` is missing from the hairline-strong list (the
  sheet's CSS includes `.act--secondary[aria-disabled="true"] .label::after`) — it is missing here,
  but I traced `.da-secondary .da-label::after` to a pre-existing, untouched
  `{ content: none; }` rule, so the client's secondary variant never renders a second score at all.
  **Confirmed non-issue** — noting only so a future reader doesn't re-flag it blind.
- `.da-terminal[aria-disabled='true']` role preserved: rail ground, ink-faint text, hairline border,
  and the `:hover` override so an unavailable terminal doesn't darken on hover — matches the sheet
  exactly, and I hand-verified the sheet's own claimed 5.32:1 contrast for `--color-quiet-ink`
  (#65594E) on `--rail` (#E8E3DB) — it computes to 5.32:1. Correct.
- Focus: `.da-act:focus-visible { outline: 2px solid var(--color-clay-ink); outline-offset: 2px; }`
  alongside the untouched caret opacity rule, plus `.da-terminal::before { color: var(--ink-paper);
  }` so the caret reads on the charcoal fill. Both present and correctly cascade-ordered (the
  terminal override sits after the base rule in source, same specificity, correct winner).

## PP-3 ruling: consequence sentences

Both `wall-gate.tsx` and `door-gate.tsx` compose the consequence sentence from data already read
in the file (no new fetch, no invented fact), drop the money clause when the amount is genuinely
unknown rather than printing a guess or a `$0`, and render it in every act state including
`aria-disabled="true"` (verified directly: `wall-gate.test.tsx` and `door-gate.test.tsx` both
assert the sentence's exact text before and after the name is typed). In-flow order in the wall
gate — consequence → name (`SignatureLine`) → hold caption → act — matches the sheet's own stated
order (`SPEC.md:883`) exactly. On acceptance/signature, the act **and** its consequence sentence
unmount together (asserted in both test files); the record stands alone. Good, faithful work.

## Two real findings

### 1. The Pay act (`invoice-sheet.tsx:773`) keeps native `disabled`, and its submitting state
regresses to the *unavailable* look, not a loading one — **P1/P2 borderline, high confidence**

`invoice-sheet.tsx:775` still reads `disabled={submitting}` — unchanged from before this diff. That
directly contradicts the review checklist's own line, "No `disabled` attribute on any gating act,"
and it is the one place in this diff where it is checkable: the Pay act is one of the exactly three
terminal-tier sites this lane is responsible for, and the file/region (`:773`) is explicitly this
lane's own. Both siblings — the wall gate's `Accept` and the door gate's `Sign` — were converted to
`HoldAction`'s `aria-disabled` pattern in this same diff; the Pay button was not (it isn't a
`HoldAction`/`ScoredAction`, it's a hand-built `<button>` carrying `da-act da-terminal` classes).

Consequence, verified in the CSS: `.da-terminal:disabled, .da-terminal[aria-disabled='true'], ...`
share one rule — rail ground, `--ink-faint` text, hairline border. That rule is meant to say
"unavailable," and now it is also what `submitting` triggers via the native `:disabled` pseudo-class
on this one button. I grepped the whole diff and the surrounding file for `is-loading` and
`aria-busy` on this button — neither exists. Compare the sheet's own Loading section for the
terminal tier (`SPEC.md` §A5): a submitting terminal act should stay filled
(`.act--terminal.is-loading { background: var(--ink); }`), swap its label ("Pay $4,060.00" →
"Opening payment"), and set `aria-busy="true"` on the wrapper — none of that exists for the Pay
button. So today, mid-submission, a client seeing the Pay button switch to rail/ink-faint/bordered
is seeing exactly the same visual state as "this is blocked" — not "this is working." Before this
diff the button dimmed to `opacity-70` while staying filled, which read (barely) as "still here,
just fading"; after this diff, removing `disabled:opacity-70` without adding the sheet's `is-loading`
treatment converts that into the full unavailable look. This is a real, user-visible regression this
lane introduced, on a file/region it owns, against a criterion the review protocol names explicitly.
I am marking it **P2** on balance — it is transient (a few seconds around a real network call, not a
permanent block) and does not prevent payment — but it is a clean violation of a named checklist
item and deserves a fix before this lane is called done: either route the Pay act through
`HoldAction`/`ScoredAction`'s `loading`/`aria-disabled`/`loadingLabel` machinery (consistent with
"three action tiers become one," which is literally step 10's stated goal), or at minimum drop the
native `disabled` for `aria-disabled` and add the `is-loading` label swap by hand.

### 2. Money-precision inconsistency on the wall gate — **P3, high confidence, already disclosed**

`wall-gate.tsx` now prints `formatCurrency` (cents precision, `$1,440.00`) in the new consequence
sentence and the terminal label, sitting directly beside the pre-existing `SpineGate` caption and
Stamp text, both of which use `moneyInWords` (whole-dollar prose, e.g. "one thousand four hundred
forty dollars"). I confirmed both usages exist in the same file
(`grep -n 'moneyInWords\|formatCurrency' wall-gate.tsx`) and that the sheet's own worked examples
(`SPEC.md:836`, `:845`, `:466`) consistently use cents-precision `$X,XXX.XX` everywhere, including
the stamp/record line — so the pre-existing `moneyInWords` usage was already off-sheet, but it was
invisible until this diff put a cents-precision sentence directly next to it on the same gate. The
lane's own report already surfaces this exact tension under "Deliberate deviations… for the
integration lane to rule on" (item 3) — I am not raising a new discovery, only confirming it is real
and correctly scoped as an integration-lane decision, not something H4 could fix within its file
list (`standing-sentence.tsx` is not this lane's file).

## Other checklist items — no findings

- **`aria-disabled` not `disabled`, focusable, `aria-describedby`:** verified in `HoldAction` for
  both the wall and door gates — `aria-disabled={unavailable || undefined}`, no `disabled` prop
  reaches the DOM, `tabindex` is never set to `-1`, and clicking/Enter-ing an unmet act moves focus
  to `unmetFocusId` and writes `unmetReason` into a per-act `role="status"` line
  (`gate_accept-status`, `gate_sign-status`) rather than doing nothing. Both gates' new tests assert
  this directly and I read the assertions, not just their names.
- **44px targets:** unchanged base (`min-height/min-width: 44px`), terminal adds `min-height: 48px`
  — both comfortably clear the floor.
- **Hold caption visible:** `t-meta` caption, `data-testid` present, asserted
  `not.toHaveClass('sr-only')` in the new `scored-action.test.tsx`, and I read the component: the
  span carries no `sr-only` class and is rendered unconditionally, not conditionally hidden.
  Confirmed pointer-visible.
- **Copy strings changed have tests:** `Accept the finished work · $X` covered
  (`/accept/i` regex plus an explicit amount assertion, as the plan's copy-pin table requires); both
  new consequence sentences are asserted verbatim in both gates' test files; the door's label is
  deliberately unchanged (no amount appended, explained and justified in the report — money doesn't
  move at the instant of signing, and appending the deposit would misstate what signing does).
- **No anchor id renamed:** the diff never touches a top-level `id=` on any of the protected
  anchors; the new ids (`nameId`, `hintId`, `saidId`, `unmetFocusId`) are all instrument-scoped, new,
  and additive.
- **Tests ship with the new file:** `scored-action.test.tsx` is a genuinely new file (confirmed
  absent on `origin/main`) and its own tests are its coverage; I read the full file, not just the
  count — it covers the terminal variant's classes, the tertiary rest rule, the unavailable block,
  the focus rule, the `--color-error` absence, and every `HoldAction` behavior named in the plan's
  "Tests" paragraph.
- **`mobile_dock` still works:** untouched by this diff at the test level;
  `hold-action.test.tsx`'s dock assertions pass in my own run.

## Comparison to the specimen

`artifacts/portal-polish-review-2026-09-08/specimens/client-house.html` row 8 (the wall gate) and
its terminal act render exactly what this diff builds: consequence sentence above the signature
line, hold caption below the act, the act itself filled charcoal with the amount in the label. I did
not find a visual divergence between the built component and the specimen's markup/CSS for the
regions this lane owns — the one open gap is the Pay act's loading state (finding 1), which the
specimen does not exercise (it has no submitting-state frame to compare against), so this is a gap
the specimen itself doesn't catch, not a divergence from it.

## What I did not do

No dev server, no Chromium render, no Playwright run (sandbox blocks Chromium; not this lane's gate
either). No re-run of the full 135-suite jest pass — the lane-scoped 47-suite run is the gate this
lane is held to and it passed identically in my hands. I did not attempt to verify Playwright's
`toBeDisabled()` behavior against `aria-disabled` at `apps/client-portal/tests/threshold.spec.ts:390,
664` — the lane correctly notes this is W2 integration's copy table item, not this lane's gate.
