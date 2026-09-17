# Lane A1 — Governance amendments + the house sheet's canonical home (implementation)

- **Branch:** `portal-polish/a1` (pushed, tracking `origin/portal-polish/a1`)
- **Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-a1`
- **Base:** `origin/main` @ `02eb0a95fc10acfb3bdf2cf83c7604a6b2fb9520`
- **Head:** `2dd8421d4af9715813362f5b0afe281bfc1aa8e1`
- **Gates:** green (the four named jest files: 4 suites pass, 84 passed + 1 todo)

---

## What landed

### Step 1 — the house sheet's canonical home

`docs/design/house-sheet/SPEC.md`, copied with `cp` from
`artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md`. Not edited, not reflowed, not
summarised — §A–§E and §F verbatim, 1,005 lines.

```
$ diff artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md docs/design/house-sheet/SPEC.md
$ echo $?
0
$ shasum -a 256 artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md docs/design/house-sheet/SPEC.md
0734061147e812abb33fffdfdb2b80e30378ec87f8fe1e2e511a01bd3ad1ea64  artifacts/.../specimens/SPEC.md
0734061147e812abb33fffdfdb2b80e30378ec87f8fe1e2e511a01bd3ad1ea64  docs/design/house-sheet/SPEC.md
```

### Step 2 — five DECISIONS.md entries, appended

Read before writing: I107 (`:6584-6611`), R126 in full including the elevation clause
(`:9981-10108`, `:9992`, `:10023-10036`), R135 (`:10701-10722`), R137 (`:10734`), R51 (`:2049`),
**both** `### R107` entries (`:3765` Room View, `:8044` the fidelity ladder), R134 (`:10693`) and
R138 (`:10749`) as amendment templates, and V8 (`VISION-DECISIONS.md:106-138`).

| Entry | Line | What it does | Cites |
|---|---|---|---|
| **R139** | `:10759` | Amends **I107**. Quotes and retires the clause *"tertiary = unscored until hover, when its score draws in"* — the rest rule is unconditional at 1px `--color-aged-oak #8B7355`, 4.20:1. States the two-score secondary is unchanged, and that no tier gains a box. Rules the fourth `terminal` tier: filled charcoal `#2C2926`, paper ink, 3px radius, the amount in an Inter 500 16px sentence-case label, spent only where money moves or a paper is signed, never olive. Rules `/pay/<token>`'s Pay act and the client verdict pills onto the same scale. | PP-3; IX02, IX03, IX04, IX10, B01; deck sheets 10 and 12; SPEC §A5, §F-C; R137, R51, I91 |
| **R140** | `:10777` | Amends **R126**. Retires *"typography goes no further than the mockup"* as spent, names the seven-step scale + `.t-money` as the contract, 96–120px plates above a value threshold, and the owed figure outranking the agreed figure. Explicitly leaves R126's colour-at-three-sites clause (`:9992`) and elevation clause (`:10023-10036`) untouched, and R126's THE STUDIO carve-out standing. | PP-2, PP-4, PP-5; VC-44, L6, IA-32; deck sheets 10, 11, 13; SPEC §A3, §A10, §F-B |
| **R141** | `:10791` | Amends **R135**. Restates R135's header refusal at `:10717` as *not reopened* and draws the distinction (a header is a bar of destinations that leaves; a ledger is a table of contents that stays). "Sign out" replaces "Leave the house". The colophon is client-surface furniture, with PP-9's Desk carve-out. A consequence sentence above every terminal act in every state. Records the `--color-error` grep and its consequence. | PP-1, PP-3, PP-5; deck sheets 10–12, 14; R135, R139 |
| **R142** | `:10817` | **Extends R107 at `:3765`** — the Room View entry — and says in the entry that a second `### R107` exists at `:8044` (the fidelity ladder) and is not the one extended. The source hierarchy enforced by caption; studio-uploaded concept renders labeled on-image "Concept · not installed" at ≥14px, permitted to lead a room band with no installed photograph; never stock, gradients, procedural fills or generated rooms; the eleven-pixel **rendered** floor on drawn geometry. | PP-4, PP-7; VC-38, VC-39, VC-40, VC-44, VC-45, C01; deck sheets 10, 13, 14; SPEC §A10 |
| **I153** | `:10831` | The house sheet's canonical home and what it holds — seven steps, `.t-money`, the 24px module, three radii, three stocks, state pigments, no shadows, no truncation. States PP-5's "surface by surface as each is touched" is not a licence to restyle an untouched surface, and that a build lane reports rather than edits. | PP-5; SPEC §A3, §A4, §A1, §A5, §A6, §A8, §A10, §A11, §F |

Sentinels written, in order: `R139`, `R140`, `R141`, `R142`, `I153`. The log's last id advances from
**R138 / I152** to **R142 / I153**.

The `--color-error` grep R141 asked for, run in the worktree and quoted verbatim in the entry:

```
$ grep -rn -- '--color-error' apps/client-portal/src/
apps/client-portal/src/app/globals.css:58:  --color-error: #C77B6E;
apps/client-portal/src/app/globals.css:374:  color: var(--color-error);
apps/client-portal/src/components/threshold/instruments/__tests__/open-chapter.test.tsx:242:    expect(container.innerHTML).not.toContain('--color-error');
apps/client-portal/src/components/account/AvatarUploadField.tsx:130:            --color-error, which is red (VISION §6, Kody 2026-09-04). This
```

**Result:** two of the four hits are not consumers — `open-chapter.test.tsx:242` asserts the token's
*absence* from rendered markup, and `AvatarUploadField.tsx:130` is a prose comment recording R135's own
removal. `.da-danger:hover` (`globals.css:373-375`) is therefore the **only** consumer, so R141 takes
the first branch: **the token at `:58` is removed, and the `.da-danger:hover` rule that reads it is
removed with it** (a token deleted alone would leave a `var()` pointing at nothing).
`--color-terracotta-ink` is **not** adopted. The CSS edit itself is Lane H4's; A1 only records the
ruling.

### Step 3 — V9 in `docs/vision/VISION-DECISIONS.md`

New `## Ruled — 2026-09-08 (portal polish)` section, then `### V9` in V8's shape — bold
**Question** / **Decision** / **Consequence for the refusals in VISION §6 — what this does not
license** / **Source**. Content: the five principles as ruled PP-1…PP-5 with P1 binding **client pages
only** (PP-9 carves out the Desk's PATINA wordmark and footer identity, tied back to V8's two-faces
framing); PP-7's concept-render fence; rules are back on and the amendments are named by id. The
"does not license" clause states plainly: no shadows (R126's one token at its three sites, both gates
stay), no badges/status dots/pills/✓ glyphs/spinners/green success fills, no dashboards and no
engagement metrics (the landmark ledger is a table of contents, not a nav; V8's daily-return carve-out
still does not license measuring the homeowner), no tab bars (V7 · D1), no engagement chrome in the
studio's own tools (S4). Source cites Kody 2026-09-08, `rulings.md` PP-1…PP-9, the deck sheets, and
`synthesis.md`.

Sentinel: `*Entries add: C1 · S1–S6 · V1–V7 · V8 · V9 · last id = V9*`.

### Step 4 — `apps/designer-portal/CLAUDE.md`, three surgical edits

- **D4 line (`:21`)** — appends R126's one token at three sites with its CSS-level gate, then:
  *"The portal-polish program (R139–R142, I153) adopts no depth at all: no new site, no new token, and
  the eslint and CSS shadow gates both stay."* The shadow ban is intact and strengthened.
- **Typography-first (`:23`)** — now names `docs/design/house-sheet/SPEC.md` as the type and rhythm
  contract (I153, PP-5), surface by surface, no new hex literal outside the sheet.
- **Success criterion (`:48`)** — now ends *"…a shadow, a zone, a badge, or a dashboard; the only
  filled control she ever sees is a terminal act where money moves or a paper is signed."*

### Step 5 — `document-action.test.tsx`

One row added to `VARIANTS`: `{ variant: 'terminal', retiredChrome: null, tracking: 'tracking-[0]',
weight: 'font-medium', hasPool: true }`. **Every other row is byte-unchanged.** `retiredChrome: null`
is the `<none>` the plan asks for — `terminal` retires no chrome, because the charcoal fill that is
retired chrome for `primary`/`inked` is this tier's correct grammar.

`DocumentActionVariant` has no `terminal` member yet, so the two `it.each` calls now iterate
`BUILT_VARIANTS` — `VARIANTS.filter()` behind a type predicate that excludes the terminal row — and a
`test.todo` carries the reason in its name:

```
'renders the terminal variant in the scored-ink grammar — skipped because DocumentAction has no
 terminal variant yet; Wave 3 lane D4 adds it under R139 and folds this row back into the it.each'
```

Two lines changed from `VARIANTS` to `BUILT_VARIANTS`; no assertion in either block was altered.
**Lane D4's job:** add `'terminal'` to `DocumentActionVariant`, delete the `BuiltVariant` /
`BUILT_VARIANTS` pair, point both `it.each` calls back at `VARIANTS`, and delete the `test.todo`.

---

## Gate — real output

```
$ pnpm --filter @patina/designer-portal test -- \
    src/components/document/__tests__/document-action.test.tsx \
    src/lib/document/__tests__/shadow-gate.test.ts \
    src/lib/document/__tests__/contrast.test.ts \
    src/components/document/__tests__/rail-stock.test.ts

PASS src/components/document/__tests__/rail-stock.test.ts
PASS src/lib/document/__tests__/shadow-gate.test.ts
PASS src/lib/document/__tests__/contrast.test.ts
PASS src/components/document/__tests__/document-action.test.tsx

Test Suites: 4 passed, 4 total
Tests:       1 todo, 84 passed, 85 total
Snapshots:   0 total
Time:        2.001 s
```

`shadow-gate.test.ts`, `contrast.test.ts` and `rail-stock.test.ts` were **not edited** and are green.

```
$ git diff --stat            # before commit; exactly the five files
 apps/designer-portal/CLAUDE.md                                     |  6 +-
 .../components/document/__tests__/document-action.test.tsx         | 25 +++++-
 docs/design/the-document/DECISIONS.md                              | 91 ++++++++++++++++++++++
 docs/vision/VISION-DECISIONS.md                                    | 84 ++++++++++++++++++++
 4 files changed, 201 insertions(+), 5 deletions(-)
$ git ls-files --others --exclude-standard
docs/design/house-sheet/SPEC.md               # the fifth, new
```

Append-only proof for both logs:

```
$ git diff --numstat -- docs/design/the-document/DECISIONS.md docs/vision/VISION-DECISIONS.md
91	0	docs/design/the-document/DECISIONS.md
84	0	docs/vision/VISION-DECISIONS.md
$ git diff -U0 -- <both logs> | grep -c '^-[^-]'
0
```

Zero deleted lines in either log — no past entry was edited.

Commit: `2dd8421d4` — `docs(governance): R139–R142, I153, V9 — the portal polish rulings; house sheet
canonical copy` · 5 files changed, 1206 insertions(+), 5 deletions(-) (the 1206 includes SPEC.md's
1,005 new lines). Staged with five explicit pathspecs; no `git add -A`.

---

## Review checklist

| Item | Status |
|---|---|
| No past entry edited — diff append-only in both logs | ✅ 91/0 and 84/0, zero `^-` lines |
| Sentinel lines advanced in both | ✅ `last id = I153` (and R142) in DECISIONS.md; `last id = V9` in VISION-DECISIONS.md |
| H3 heading level correct in both | ✅ all five DECISIONS entries `###`; V9 `###` under a new `##` section, matching V8's shape |
| Every entry dated 2026-09-08 and citing a PP-n | ✅ R139 PP-3 · R140 PP-2/4/5 · R141 PP-1/3/5 · R142 PP-4/7 · I153 PP-5 · V9 PP-1…PP-9 |
| `SPEC.md` copy byte-identical | ✅ `diff` exit 0, matching SHA-256 |
| R140 leaves R126's colour and elevation clauses alone | ✅ both named as unamended, with line refs `:9992` and `:10023-10036` |
| V9 says what it does not license | ✅ a four-bullet clause: shadows, badges, dashboards/engagement metrics, tab bars/studio engagement chrome |
| CLAUDE.md keeps the shadow ban intact | ✅ D4 line strengthened — "adopts no depth at all… both gates stay" |
| Deck cited by sheet number | ✅ sheets 10–14, 16, 17 across the entries |

---

## Notes and what I did not do

- **Two `### R107` entries.** `:3765` (the Room View) and `:8044` (the fidelity ladder). R142 extends
  the first and says so in the entry, naming the second so the next reader does not have to work it
  out. Neither id was renumbered — this log has duplicate ids already and fixing one is not A1's job.
- **`R137` has no sentinel line** in the existing log (it ends at `:10748` with no
  `*Entries add: …*`). Pre-existing; not touched, since no past entry may be edited.
- **Prettier drift is pre-existing, not introduced.** The pre-commit hook warned on all five files.
  Run against the *unmodified* copies on `main`, prettier warns on all five paths identically
  (`npx prettier --check docs/design/the-document/DECISIONS.md docs/vision/VISION-DECISIONS.md
  apps/designer-portal/CLAUDE.md .../document-action.test.tsx
  artifacts/portal-polish-review-2026-09-08/specimens/SPEC.md` → 5 warns). No file was reformatted;
  reformatting `docs/design/house-sheet/SPEC.md` would break the byte-identical requirement.
- **`type-check` is red on `main` and equally red here.** 73 `error TS` lines, **all** in
  `packages/patina-design-system/src/components/Media/*` (`Cannot find module '@patina/types/media'`,
  implicit `any`). Zero errors under `apps/designer-portal/src` — my test-file edit type-checks clean.
  Pre-existing; not this lane's to fix.
- **The pre-push hook printed "Affected verification has advisory failures"** (same pre-existing
  type-check). The push landed: `git rev-parse HEAD origin/portal-polish/a1` returns the same sha.
- **I did not touch** the client `globals.css` (`--color-error` removal is Lane H4's), `mat.tsx` or its
  test (Lane H1's "Sign out"), `shadow-gate.test.ts`, `contrast.test.ts`, `rail-stock.test.ts`, or any
  file outside the five the lane names. No dev server started, no database touched, no migration.
- **Owed to Lane D4:** un-skip the `test.todo`, add `'terminal'` to `DocumentActionVariant`, drop
  `BuiltVariant`/`BUILT_VARIANTS`, and point both `it.each` calls back at `VARIANTS`.
