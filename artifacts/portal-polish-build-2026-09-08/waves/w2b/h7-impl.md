# Lane H7 — Wave 2 follow-ups (implementation)

**Branch** `portal-polish/h7` (pushed) · **worktree**
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-h7` · cut from `origin/main`
`5fdd83a34` (carries the Wave 2 merge `f5fd0aeb4`).

**Commits**

| | SHA | Subject |
|---|---|---|
| 1 | `3bb8810b4` | `fix(client): note signature wiring; cents and legal dates on the house page (PP-2)` |
| 2 | `7f7abc7f5` | `fix(client): hairline alias, story-pole label, key gating, unused pay tokens, seed draw, Sign out` |

Two commits, split by hunk where a file carried work belonging to both
(`threshold.tsx`, `threshold.test.tsx`, `room-band.tsx`, `tests/threshold.spec.ts`) so each
commit stands on its own. Working tree clean after both.

---

## Gates (real output, run in the worktree after the second commit)

```
$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                       (exit 0, no output)

$ pnpm --filter @patina/client-portal test -- --coverage
All files    |   75.77 |    71.56 |   75.91 |   78.08 |
Test Suites: 143 passed, 143 total
Tests:       2426 passed, 2426 total
Snapshots:   1 passed, 1 total

$ pnpm --filter @patina/client-portal lint
✖ 63 problems (11 errors, 52 warnings)
```

Coverage floor 70/60/70/70 (`jest.config.js:71-78`) — **75.77 / 71.56 / 75.91 / 78.08**, every
metric clears it. Wave 2 shipped at 142 suites / 2417 tests; this lane is **143 / 2426**
(one new suite, nine new tests, no suite lost).

Lint is the Wave 2 baseline **unchanged** — 11 errors, 52 warnings, the same 63 problems the
ship report records. Not one of the 11 errors is in a file this lane touched (all are
React-compiler rules).

**Not run, by the brief:** `supabase db reset` and the Playwright e2e. Wave 3 owns the local
database and the integration step; `w3-ship.md` does not exist yet. The e2e assertions are
updated in this lane (below) but unexecuted — **the integration step must run
`tests/threshold.spec.ts` after a reset**, because that is the only thing that proves the new
seed row (item 8) and the new e2e assertions together.

A pre-existing repo-wide Prettier drift makes the commit hook warn on staged files; it warns
identically on files this lane never opened (`plan-key.tsx`, `mat.tsx`), so nothing was
reformatted.

---

## The nine items

### 1 · The note's signature reaches production

`threshold.tsx` handed `<TheNote>` `authorName={studioName}` and **no** `studioName` at all, so
H1's three-part signature rendered one segment. Passing `studioName` alone would have printed
the studio twice ("Local Dev Studio · Local Dev Studio · 4 August") — so the wiring is:

* `threshold.tsx:723` — the lead designer's `full_name` is lifted into `leadDesignerName`
  (`words(...)`), and `designerGivenName` now derives from it rather than re-running the find.
* the call gets `authorName={leadDesignerName ?? studioName}` and `studioName={studioName}`. The
  fallback keeps a house with no lead named signing with the studio rather than losing its
  signature entirely.
* `the-note.tsx` `signatureOf` drops the studio segment when it equals the author's name — a
  solo studio's identity is often the designer's own, and printed twice it reads as a stutter.

**Deviation, flagged:** the brief said "passes `studioName` (the prop the file already
derives)". Doing only that ships the duplicate. The two extra lines above are what make the
three-part signature true.

Tests: `threshold.test.tsx` — *"signs the letter in full — the hand, the studio, and the day"*
asserts `Nora Quist · Quist Interiors · 4 August 2026` off the real fixture.
`the-note.test.tsx` gains the same-name case and takes the year on both existing signatures.

### 2 · Cents (PP-2 / §F-B)

`formatCurrency` from `@patina/shared` (`$4,060.00`) replaces `moneyInWords` (whole dollars) at:

| File | What |
|---|---|
| `house-ledger.tsx` | the announced owed figure, the reconciling sentence's three clauses, the stands sentence, both ledger rows |
| `letterbox.tsx` | the figure line (total · paid · balance) and the Pay act's label |
| `earlier-invoices.tsx` | the folded letters' figure and their outstanding-balance clause |
| `instruments/spine-toll.tsx` | Total / Paid / Balance inside the opened letterbox |
| `instruments/spine-gate.tsx` | the vitals line and the deposit/release caption |
| `wall-gate.tsx` | the draws caption and the Stamp's "$X released" |
| `door-gate.tsx` | the paper's line schedule and its total |

The wall gate's act label and both gates' consequence sentences already went through
`formatCurrency` (H4) — nothing to change; the cents they printed are now the only idiom in
their block instead of the odd one out. **Not touched:** `/pay` (out of scope by the brief),
the landmark ledger and story pole (neither prints money), and the surfaces off the house page
that still use `moneyInWords` — `plan-key.tsx`, `road-orders.tsx`, `scope-change-ask.tsx`,
`review-ask.tsx`, `standing.ts`'s standing sentence, `standing-sentence.ts` itself.

**Two sites reach past the brief's list, for one reason.** `SpineToll` sits *inside* the opened
letterbox, directly under the summary line the brief did name; the door's line schedule sits
directly above a consequence sentence that already printed cents. Leaving either produces
exactly the fault §F-B bans — "$4,060.00" one line above "$4,060" for the same money.
`spine-gate.tsx`'s own comment named that failure ("a gate that reads '$12,500.00' above 'The
draw of $1,440 releases…' is speaking two money idioms inside one block"); the comment is now
rewritten to say the opposite, because the answer flipped.

Nine jest suites pinned whole dollars and all nine are updated: `house-ledger`, `letterbox`,
`earlier-invoices`, `open-chapter` (SpineGate + SpineToll), `wall-gate`, `door-gate`,
`approval-ask`, `threshold`, `dateline`.

e2e: `AUTHORIZATION_TOTAL`, `HELD_DRAW`, `INVOICE_BALANCE` take their cents. One assertion had
to change meaning, not just text: `not.toContainText('$0.00')` on the whole `#ledger` is now
false by design — the reconciling sentence prints "$0.00 paid" and the specimen does too. It
is re-scoped to the **rows**, which are the things that filter falsy:
`page.locator('#ledger [data-ledger-figure]').allTextContents()` must not contain `$0.00`.

### 3 · Legal dates

`legalDate` (year spelled, every time, no reckoning against today) now covers: the letterbox's
due date, `owedDueLine` (the money block), `SpineToll`'s due date, the folded letters' paid /
due / sent dates, an approval ask's `Due …`, the door's "signed …" receipt and "Shut since …",
every `Stamp` `dateLabel` (wall gate + the two in `approval-ask`), the room band's "agreed …"
stamp detail, and the note's signature.

`dayMonth` stays where the brief left it and where a day is read inside a sentence about this
year: the story pole's graduations, Previously's rows, the note's own dateline
("4 August · yesterday"), correspondence, the road, the making spine, the papers sheet, room
capture, the scope-change and review asks, `ground-floor`.

`owedDueLine` and `SpineToll` keep their `today` parameter (callers still thread it) but no
longer read it for the day; `letterbox`/`earlier-invoices` dropped it from their date helpers.
No `en-US` **date** formatter is left under `components/threshold` or `lib/threshold` (the
three `en-US` hits that remain are `Intl.NumberFormat` currency, which is correct).

### 4 · `--hairline`

No `--doc-rail-stock` token exists in `globals.css`, so the sheet's literal it is:
`--hairline: #E8E3DB` in H2's house-sheet token block. **Not** `var(--rail)`, which carries the
same hex — §A10 keeps `--rail` for fills and grounds and forbids drawing a line in it, and a
stroke token resolving *through* it would read as that borrowing to the next person who follows
the chain. Not `--border-default` either: that is `#E5E2DD`, a different value.

`tracking-row.tsx:168` (the piece plate) and `room-band.tsx:370` (the concept plate) swap
`var(--border-default)` → `var(--hairline)`. `house-sheet-tokens.test.ts` adds `--hairline` to
`NEW_TOKENS` and a case asserting it is neither borrowed from `--rail` nor from
`--border-default`; `tracking-row.test.tsx` and `room-band.test.tsx` each assert the plate's
stroke.

### 5 · Story-pole bar label and the held tick

The `sections` array entries gain `short` (required on `StoryPoleProps`, so a caller cannot
forget it): doorstep → "the doorstep", letterbox → "the letterbox", the gate → "the wall" /
"the door" (`firstGateAnchor` is only ever those two), key → "the whole house", a band → its
room name, road → "the road", note → "the note", previously → "Previously", mat → "the mat".
The ≤600px bar prints `You are in: {short}`; the desktop rail keeps the whole sentence.

The held graduation's tick was `w-5` (20px) from `-left-4` (16px), so it ran 4px past the rail
into its own label where every other tick stopped 7px short. Both are now `w-[9px]` — the
sheet's own pole is a fixed mark column with one gap (`.pole-mark { width: 12px }`,
`.pole-list li { gap: 8px }`), so uniform is the specimen's answer, and the held mark is still
told apart by its 2px weight and its brass. A story-pole test asserts every mark shares the
offset and the width.

### 6 · The `key` section entry

**Already gated** on `origin/main` — `threshold.tsx:1342`,
`...(roomsUnread ? [] : [{ id: "key", … }])`, landed in `0e4f1684e` (H3's fix round). `PlanKey`
renders under the same `!roomsUnread` and always draws `#key` when mounted; no landmark or pole
chapter targets `key` either. Nothing to change, so the item ships as the missing test:
*"points nothing at the key on a page that could not draw one"* — with `roomsQuery.isError`,
`#key` is absent **and** no `a[href="#key"]` exists anywhere on the page.

### 7 · The unread Pay tokens

`grep -rn "pay-act" apps packages` (excluding `node_modules`/`.next`/`dist`) finds
`--pay-act-bg`, `--pay-act-fg` and `--pay-act-bg-hover` **only** at their six declaration sites
in `invoice-sheet.tsx:80-88`. Every other `pay-act` hit is the `data-testid`. Both blocks
(`[data-pay-sheet]` and `.dark [data-pay-sheet]`) and the D-1 comment are gone; `SHEET_RULES`
is print only. Four non-sheet hexes (`#1F1D1A`, `#F0E9DD`, `#1D1914`, `#FFFAF0`) leave with
them. New test in `invoice-sheet.test.tsx`: the rendered `<style>` declares none of the three,
and still carries `@media print`. Pay suite: **6 suites / 91 tests green**.

### 8 · The seeded gating draw — LOCAL SEED ONLY

`supabase/seed/the-client-page.sql` — one `trade_scope_draws` row on the Cedar Lane shelving
scope: `'On acceptance'`, 100%, **298000 cents**, `sort_order 0`, `gates_on_acceptance = TRUE`.
Written **while the proposal is still `draft`**, immediately before the block that accepts it:
`guard_trade_scope_draws` (00423:608-628) returns early for a draft and refuses every INSERT
after. The amount equals `trade_scope_terms.client_price_cents` (298000), so the sum rule holds.

No migration. Nothing touches Strata. `supabase db reset` **not run** — Wave 3 owns the
database; **the integration step verifies this seed**, and the e2e now asserts what it makes
true (`Accepting releases $2,980.00 to Marta Voss`, and the act labelled
`Accept the finished work · $2,980.00`), which closes W2 ship divergence 5.

**⚠ One thing for the orchestrator to rule on.** `send_trade_scope`'s own validation
(00423:1679-1686) refuses a schedule whose **first** draw gates on acceptance — "the first draw
is billed at signature, so it must not be the acceptance-gated one". A single 100% gated draw
is exactly that shape. The seed bypasses the RPC (it raw-`UPDATE`s draft → accepted, as it
already did for everything else in this block), so it applies; but the fixture is a state the
product's own send path would refuse. The brief named the figure ($2,980.00 = the whole scope)
and the specimen's sentence needs it, so it is seeded as asked. Splitting it into a deposit
plus a smaller gated draw would satisfy the rule and break the specimen's figure. **Ruling
owed.**

### 9 · "Leave the house" → "Sign out"

`ProjectsEmptyState.tsx:66` (R141). The component had no suite at all; it has one now —
`src/components/projects/__tests__/projects-empty-state.test.tsx`, three cases: the act is named
"Sign out" and "Leave the house" is absent, it calls `signOut`, and the other act opens the
details sheet. (`@patina/help-system` is mocked: its barrel pulls `@portabletext/react`, which
is ESM-only under this jest transform.)

---

## Owed / for the integration step

1. **Run `pnpm supabase:reset` then `tests/threshold.spec.ts`** — the seeded draw and every
   updated e2e assertion are unverified until then. Expect the wall act to carry
   `· $2,980.00` and the letterbox due line to read `… 2026`.
2. **A ruling on the single gated draw** (item 8's ⚠) — the send RPC would refuse this shape.
3. `--hairline` is now a sheet token in the client portal only. If the designer portal wants
   it, that is a Wave 3 conversation, not this lane's.
