# Desk Claim Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the designer portal's Desk roster with one hybrid rendering — a job with a claim on the studio's hand takes a Claim card, every quiet job takes an at-rest ledger row — and ship it to production.

**Architecture:** The shipped `deriveDeskRoster` stays exactly as it is and keeps every export it has today. A new pure derivation, `deriveDeskClaims`, takes the roster it returns and splits it into two halves: `cards` (lines with `mark !== null`, ranked by custody band then oldest need date then name) and `ledger` (the remaining lines, still grouped under the seven stage plates). Two new presentational components — `DeskClaimCard` and `DeskLedgerRow` — render the halves; `DeskRoster` stays the container name and composes them, so the Desk page, the tour anchors and the day's-line anchor ids all survive. Two shipped a11y defects (the roster mark in material pigments, the roster's focus rings in `--color-clay`) are fixed first, in their own commit, before any of that lands.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind + CSS custom properties in `apps/designer-portal/src/app/globals.css` · Jest (`next/jest`) + React Testing Library · Playwright (chromium project) · Cloudflare Workers via OpenNext.

**Spec:**
- `artifacts/desk-cards-2026-09-09/rulings.md` — rulings D1–D11 + R5. Decided; do not reopen.
- `artifacts/desk-cards-2026-09-09/panel/synthesis.md` — the six registers, copy grammar, mark/custody semantics, hover/focus model.
- `artifacts/desk-cards-2026-09-09/three-cards-for-the-desk.html` — the built specimens. Card 3 (`.claim-card`) is the card; Card 2 (`.ledger-row`) is the at-rest row.
- `artifacts/desk-cards-2026-09-09/panel/memo-critic.md` — a11y findings F1–F11, the contrast matrix.
- `artifacts/desk-cards-2026-09-09/panel/memo-interaction.md` — hit model, keyboard order, `.row-wash` reuse, `.da-pool` act press.

> `rulings.md` is untracked in the main checkout at `/Users/kody/Code/patina-merged/artifacts/desk-cards-2026-09-09/rulings.md` and is **not** on `origin/main`. Read it from that path. The other four spec files are on `origin/main` and present in the worktree.

**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards`, branch `desk-cards/build`, created from `origin/main` at `f2ee0061c`. All paths below are absolute. Never `cd`; use `git -C <worktree>` and `pnpm --dir <worktree>`. Never edit `/Users/kody/Code/patina-merged` directly — that checkout is 88 commits stale and dirty.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Auth is Supabase Auth (GoTrue) only.** Never NextAuth.
- **Types come from `@patina/types`**; DB row shapes from `packages/supabase/src/database.types.ts`. Never redefine a domain type.
- **Components** come from `@patina/design-system` plus the portal-local `apps/designer-portal/src/components/ui/controls/`. Acts on The Document come from `@/components/document/document-action`.
- **Data access**: `@patina/supabase` hooks for Supabase, `@patina/api-routes` proxy routes for NestJS services. No ad-hoc `fetch` to a service. (This program adds no data access at all — it is pure derivation plus presentation over data the Desk page already fetches.)
- **Commits**: Conventional Commits (`type(scope): summary`). Stage explicit pathspecs; **never `git add -A` / `git add .`** — the tree carries untracked landmines and other agents' worktrees.
- **D1 strict focus** — no tabs, no split view, no view switcher. The facets stay two facets.
- **D4 zero shadows** — no `box-shadow`, no Tailwind `shadow-*` utility, anywhere in this program. Depth is `--doc-paper` on the ground plus a 1px edge.
- **Radii 2px and 3px only** — `--radius-hair: 2px` for marks, cards and small plates; 3px for stage plates and image plates. Never the retired folder card's `0 8px 8px 8px`.
- **Wrap, never truncate** — no `text-overflow: ellipsis`, no `truncate`. Every name-bearing element carries `min-w-0` and `[overflow-wrap:anywhere]`.
- **State pigments only, ink members for anything read or marked.** `--color-terracotta-ink #9C5340`, `--color-mocha #5C4A3C`, `--color-clay-ink #7C5E30`, `--color-aged-oak #8B7355` (rules and scores only — 4.20:1, never text). Never `--color-terracotta`, `--color-dusty-blue`, `--color-clay` or `--color-sage` behind a mark or a word.
- **"Designer-Taught Intelligence", never "AI".** Sentence case. No emoji.
- **Dates read `12 Aug`** — day, three-letter month, no period, year only when not this year. Use `dayMonth()` from `@/lib/document/dates`. Never a growing day count except where the promise is already broken (`Overdue 6 days`), and never both.
- **Act tiers by consequence** — `variant="tertiary"` for an act that only opens something, `variant="secondary"` where the act moves a reminder or opens money. Never two acts on one card.
- **44px targets** — every act is a `DocumentAction`, which carries its 44px floor on its `[data-action-hit]` halo.
- **Focus ring is `var(--color-clay-ink)`, 2px solid, 2px offset.** Never `--color-clay` (2.18:1).
- **No engagement counters** — no unread counts, dots, "last active", dwell timers, streaks, percentages, progress bars or recency-rewarding sort. The one permitted count is a quantity of *work* inside a need sentence, and the `At rest · N jobs` head.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts` | Source scan: no Desk component spends `--color-clay` as a focus ring |
| `apps/designer-portal/src/components/document/desk-claim-card.tsx` | `DeskClaimCard` — the six registers, the 88px hit zone, the act band |
| `apps/designer-portal/src/components/document/desk-ledger-row.tsx` | `DeskLedgerRow` — the at-rest row's five-column grid |
| `apps/designer-portal/src/components/document/desk-claims.tsx` | `DeskClaimsGrid` — the responsive card grid |
| `apps/designer-portal/src/components/document/desk-claim-card.test.tsx` | RTL tests for the card |
| `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx` | RTL tests for the row |
| `apps/designer-portal/e2e/document/desk-claims.spec.ts` | The one new e2e: a claim takes a card, a quiet job takes a row |
| `artifacts/desk-cards-2026-09-09/ship/report.md` | The ship report (Task 6) |

**Modified**

| Path | Change |
|---|---|
| `apps/designer-portal/src/components/document/desk-roster.tsx` | Mark + focus pigments (T1); composes the two halves (T4) |
| `apps/designer-portal/src/components/document/desk-roster.test.tsx` | Mark values (T1); RosterLine fixture fields (T3); the composition (T4) |
| `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx` | RosterLine fixture fields (T3); the settle target (T4) |
| `apps/designer-portal/src/app/globals.css` | `--color-card-edge` (T2); the Claim/ledger CSS block (T4) |
| `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` | The card-edge guard (T2) |
| `apps/designer-portal/src/lib/document/desk-derivation.ts` | `owner` on 10 need branches; `firstName` exported (T3) |
| `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts` | Owner coverage (T3) |
| `apps/designer-portal/src/lib/document/desk-roster-derivation.ts` | `custodyWord`, new `RosterLine` fields, `deriveDeskClaims`, the new day's line, `groupClaimsByPerson` (T3) |
| `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts` | All of T3 |
| `docs/design/house-sheet/SPEC.md` | The one new token, light and dark (T2) |
| `docs/design/the-document/DECISIONS.md` | R143, R144 (T2) |
| `apps/designer-portal/e2e/document/action-visibility.spec.ts` | Retarget the roster assertions at the two halves (T5) |
| `apps/designer-portal/e2e/wp3-screenshots.spec.ts` | Drop "never a card"; retarget `desk-folio`; new shots (T5) |

**Untouched, deliberately**: `apps/designer-portal/src/components/document/folder-card.tsx` and `src/components/document/__tests__/desk-folio-preview.test.tsx` (orphaned, out of scope); `apps/designer-portal/e2e/document/desk-error-state.spec.ts` (its assertions are on the `Every job` heading and `[data-roster-line]`, both of which survive — verify in T5 and change nothing if it passes).

---

## Task 0: Worktree bootstrap and the baseline gate

Nothing is edited in this task. It exists because a fresh worktree has no `node_modules` and no compiled workspace `dist/`, and because a plan that starts editing before the baseline is green cannot tell its own breakage from the tree's.

**Files:**
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: a bootstrapped worktree at `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards` with `node_modules` installed and every dist-resolved workspace package built, plus a recorded green baseline every later task compares against.

- [ ] **Step 1: Confirm you are in the worktree, not the shared checkout**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards rev-parse --show-toplevel
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards log --oneline -1
```

Expected: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards`, then `f2ee0061c docs(design): desk project cards — panel proposal "Three Cards for the Desk"`.

If the first line prints `/Users/kody/Code/patina-merged`, stop — you are in the shared main checkout, which is 88 commits stale and dirty. Do not edit it.

- [ ] **Step 2: Install**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards install --frozen-lockfile
```

Expected: completes with no `ERR_PNPM_OUTDATED_LOCKFILE`.

- [ ] **Step 3: Build every workspace package the designer portal resolves as compiled dist**

`@patina/utils`, `@patina/api-routes`, `@patina/types`, `@patina/api-client` and `@patina/help-system` all set `"main": "./dist/..."`, so a fresh worktree serves nothing until they are built — and `@patina/aesthete-quiz` is in the portal's dependency graph too. Build the whole `^...` graph rather than naming them, which is exactly what `infra/deploy-portal.sh` phase 1 does:

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  turbo build --filter=@patina/designer-portal^...
```

Expected: `Tasks: N successful, N total`, no failures. This must succeed before any type-check is meaningful — a missing dist reports as a module-resolution type error that looks like your own change.

- [ ] **Step 4: Run the baseline type gate**

`apps/designer-portal/next.config.js` sets `typescript.ignoreBuildErrors: true`, so `build` is **not** a type gate here. `type-check` is.

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: exits 0 with no error output.

- [ ] **Step 5: Run the baseline Desk unit suites**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-roster-derivation.test.ts \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-action-labels.test.ts \
  src/lib/document/__tests__/contrast.test.ts \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx \
  'src/app/(document)/desk/page.test.tsx'
```

Expected: all 7 suites pass. Write down the suite/test counts — Task 6 compares against them.

If any suite is red on the untouched baseline, **stop and report it** before editing anything. A pre-existing failure inherited silently becomes your failure at Task 6.

- [ ] **Step 6: No commit**

This task commits nothing. `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards status --short` must print only ignored/untracked build output (`node_modules`, `.next`, `dist`), never a tracked modification.

---

## Task 1 (D9): The mark and the focus ring take the ink pigments

Two live defects in shipped production code, both one-token swaps to values that already exist, both independent of the cards. D9 rules they land **first, in their own commit**.

The roster's 7px mark is drawn from `--color-terracotta` (#D4A090, **2.13:1** on paper) and `--color-dusty-blue` (#8B9CAD, **2.64:1**) — the *material* members of the pigment pairs, failing WCAG 1.4.11 for a non-text graphical object. The replacements are `--color-terracotta-ink` (#9C5340, 5.28:1) and `--color-mocha` (#5C4A3C, 7.86:1).

The two focus rings in `desk-roster.tsx` use `--color-clay` (#C4A57B, **2.18:1**), failing 1.4.11 and 2.4.11. The spec'd value is `--color-clay-ink` (#7C5E30, 5.61:1).

**Scope note, verified in the worktree:** the global `*:focus-visible` rule in `globals.css` (in the `@layer base` block near the end of the file) already uses `var(--color-quiet-ink)` (#65594E, 6.35:1) and is **not** a defect — do not change it. Other `--color-clay` focus rings exist elsewhere in the portal (`doc/[id]/page.tsx`, the scope-builder components, `.da-glyph-btn` in `globals.css`); those are outside this program's surface and are **not** in scope. The source-scan test below is scoped to `src/components/document/desk-*.tsx` so it holds this program's files and nothing else.

**Files:**
- Modify: `apps/designer-portal/src/components/document/desk-roster.tsx` (the `MARK_COLOR` constant near the top; the `focus-visible:outline-[var(--color-clay)]` occurrence inside the `INLINE_ACT` class string; the same occurrence on the roster name `<Link>` inside `JobLine`)
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx` (the `describe('DeskRoster — the marks are unchanged by the wash')` block)
- Create: `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing new in TypeScript. It leaves the module-private `MARK_COLOR` at `{ urgent: 'var(--color-terracotta-ink)', quiet: 'var(--color-mocha)' }`, which every later task's mark rendering reads.

- [ ] **Step 1: Write the failing source-scan test**

Precedent for reading source in a test is `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`, which parses `globals.css` and globs `src/` for offenders rather than restating hexes.

Create `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts`:

```ts
/**
 * D9 — the Desk's focus ring is clay-INK.
 *
 * --color-clay (#C4A57B) reads 2.18:1 on paper and fails WCAG 1.4.11/2.4.11
 * as a focus indicator; --color-clay-ink (#7C5E30) reads 5.61:1 and is what
 * the house sheet specifies. The wrong token was wired while the right value
 * was already computed and commented one line away.
 *
 * Scoped to the Desk's own components rather than the portal, because other
 * surfaces carry the same defect and fixing them is a separate program.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DESK_DIR = join(__dirname, '../../../components/document');

const deskFiles = readdirSync(DESK_DIR).filter(
  (name) => name.startsWith('desk-') && name.endsWith('.tsx') && !name.includes('.test.'),
);

describe('D9 · the Desk spends clay-ink for focus, never clay', () => {
  it('finds the Desk component files, so a rename fails loudly', () => {
    expect(deskFiles).toContain('desk-roster.tsx');
    expect(deskFiles.length).toBeGreaterThanOrEqual(1);
  });

  it.each(deskFiles)('%s writes no --color-clay focus ring', (name) => {
    const source = readFileSync(join(DESK_DIR, name), 'utf8');
    const offenders = source
      .split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => line.includes('outline-[var(--color-clay)]'))
      .map(([lineNo, line]) => `${name}:${lineNo} ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Update the existing mark test to the ruled values**

In `apps/designer-portal/src/components/document/desk-roster.test.tsx`, replace the body of the `describe('DeskRoster — the marks are unchanged by the wash')` block. Find:

```tsx
  it('keeps terracotta for urgent and dusty blue for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-color')).toBe(
      'var(--color-dusty-blue)',
    );
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta)',
    );
  });
```

Replace with:

```tsx
  // D9 — the material pigments read 2.13:1 (terracotta) and 2.64:1 (dusty
  // blue) on paper and failed 1.4.11 as graphical objects. The ink members
  // read 5.28:1 and 7.86:1 and are the same two registers.
  it('keeps terracotta-ink for urgent and mocha for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-color')).toBe('var(--color-mocha)');
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta-ink)',
    );
  });
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  src/components/document/desk-roster.test.tsx
```

Expected: `desk-focus-ring.test.ts` fails with two offender strings naming `desk-roster.tsx` (the `INLINE_ACT` line and the name `<Link>` line); `desk-roster.test.tsx` fails with `Expected: "var(--color-mocha)" Received: "var(--color-dusty-blue)"`.

- [ ] **Step 4: Make the swaps in `desk-roster.tsx`**

(a) The `MARK_COLOR` constant. Find:

```tsx
const MARK_COLOR = {
  urgent: 'var(--color-terracotta)',
  quiet: 'var(--color-dusty-blue)',
} as const;
```

Replace with:

```tsx
const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;
```

(b) In the `INLINE_ACT` class string, change the single occurrence of `focus-visible:outline-[var(--color-clay)]` to `focus-visible:outline-[var(--color-clay-ink)]`.

(c) On the roster name `<Link>` inside `JobLine`, change its single occurrence of `focus-visible:outline-[var(--color-clay)]` to `focus-visible:outline-[var(--color-clay-ink)]`.

Both are inside long single-line class strings; a `replace_all` on the exact substring `focus-visible:outline-[var(--color-clay)]` within this one file changes exactly these two and nothing else. Confirm the count first:

```bash
grep -c 'focus-visible:outline-\[var(--color-clay)\]' \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src/components/document/desk-roster.tsx
```

Expected before the edit: `2`. After: `0`.

- [ ] **Step 5: Update the two doc comments so the code and its reasons agree**

The `MARK_COLOR` comment above the constant currently reads:

```tsx
/** SP-20's device — a quiet need (a setup chore, an unopened proposal, a PO
 *  nobody answered) never wears the red letter's own ink. */
```

Replace with:

```tsx
/** SP-20's device — a quiet need (a setup chore, an unopened proposal, a PO
 *  nobody answered) never wears the red letter's own ink.
 *
 *  D9: both are the INK members of their pairs. The material pigments
 *  (#D4A090 at 2.13:1, #8B9CAD at 2.64:1) failed 1.4.11 as graphical
 *  objects; terracotta-ink reads 5.28:1 and mocha 7.86:1 on paper. */
```

In the `INLINE_ACT` comment block, the sentence "It carries the sheet's own focus rule for every tier: the 2px ring AND the proofreader's caret" stays; append to that paragraph:

```
 *  D9: the ring is clay-INK (5.61:1). The base clay it carried before read
 *  2.18:1 and was the same defect the roster's mark carried.
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx
```

Expected: 3 suites pass.

- [ ] **Step 7: Gate on the type-check**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: exits 0, no output.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "fix(desk): mark and focus ring take the ink pigments" -- \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 3 files in the commit.

---

## Task 2 (D4, R5): The one boundary grey, and the two amendments in writing

D4 rules a card edge into existence: one boundary grey at ~3:1 on paper, near `#8F8C88`. D4a scopes it to Claim cards only — ledger rows keep the existing hairline. R5 rules that the two contradicted rules are amended in `DECISIONS.md` **in wave 1**, before the build lands, rather than left contradicted in silence.

`#8F8C88` reads **3.13:1** on `--color-off-white` #FAF7F2 and **3.21:1** on `--doc-paper` #FCFAF6 — clearing the 3:1 floor 1.4.11 attaches to a component boundary. No existing token reaches it: hairline 1.20:1, `--hairline-strong` composites to 1.30:1, paper-doc on paper 1.025:1. D4 forbids the shadow that would otherwise rescue it.

**Dark value — the check the ruling asks for.** `apps/designer-portal/src/app/globals.css` contains no `@media (prefers-color-scheme: dark)` block at all, and its `.dark` class block (inside `@layer base`) carries only the shadcn OKLCH tokens — it redefines **none** of the paper, ink, hairline or stage-plate tokens. So the portal paints no dark paper set, and a dark value written into `globals.css` would be dead code. The dark companion is therefore recorded where the sheet's dark set actually lives: `docs/design/house-sheet/SPEC.md`'s `@media (prefers-color-scheme: dark)` block, which the dual-theme specimens build against. Its value is **`#77736E`**, which reads 3.19:1 on the sheet's dark ground `--paper #2A2622`.

**Files:**
- Modify: `apps/designer-portal/src/app/globals.css` (the `:root` token block, in the Extended Palette region)
- Modify: `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` (append one `describe`)
- Modify: `docs/design/house-sheet/SPEC.md` (§A1 prose + the light and dark token blocks)
- Modify: `docs/design/the-document/DECISIONS.md` (append R143 and R144)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the CSS custom property `--color-card-edge` (`#8F8C88`), which Task 4's `.desk-claim-card` rule is the only consumer of.

- [ ] **Step 1: Write the failing token guard**

Append to `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`. The file already defines `tokens` (a `Map<string,string>` parsed out of `globals.css`) and `contrastRatio(a, b)` at module scope — reuse them, do not restate hexes:

```ts
/**
 * D4 — the one boundary grey.
 *
 * A card is a component boundary where a row is not, so WCAG 1.4.11's 3:1
 * attaches to it. Nothing in the palette reached it — hairline 1.20:1,
 * hairline-strong 1.30:1, paper-doc on paper 1.025:1 — and D4 forbids the
 * shadow that would rescue it. R144 amends "no new token" exactly once, for
 * this one value, on Claim cards only.
 */
describe('D4 · --color-card-edge is the one boundary grey', () => {
  it('is declared, and at the ruled value', () => {
    // A retune has to be a ruling, not an edit.
    expect(tokens.get('--color-card-edge')).toBe('#8F8C88');
  });

  it('clears 3:1 on both light grounds a card is ever laid on', () => {
    const edge = tokens.get('--color-card-edge')!;
    const measured = {
      'on --doc-paper': Number(contrastRatio(edge, '#FCFAF6').toFixed(2)),
      'on --color-off-white': Number(contrastRatio(edge, '#FAF7F2').toFixed(2)),
    };
    const failing = Object.entries(measured).filter(([, ratio]) => ratio < 3);
    expect(failing).toEqual([]);
  });

  it('is not an ink token, so the AA text guard never claims it', () => {
    // It is a boundary, never a word. Naming that here keeps a later rename
    // to `--color-card-edge-ink` from silently entering the 4.5:1 suite.
    expect('--color-card-edge'.endsWith('-ink')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/contrast.test.ts
```

Expected: `Expected: "#8F8C88" Received: undefined`.

- [ ] **Step 3: Add the token to `globals.css`**

In the `:root` block, find the Extended Palette group:

```css
  /* — Extended Palette — */
  --color-sage: #A8B5A0;
  --color-dusty-blue: #8B9CAD;
  --color-terracotta: #D4A090;
  --color-golden-hour: #E8C547;
```

Replace with:

```css
  /* — Extended Palette — */
  --color-sage: #A8B5A0;
  --color-dusty-blue: #8B9CAD;
  --color-terracotta: #D4A090;
  --color-golden-hour: #E8C547;

  /* D4 / R144 — the one boundary grey, and the only exception to "no new
     token". A Claim card is a component boundary where a roster row is not,
     so WCAG 1.4.11's 3:1 attaches to it; nothing in the palette reached it
     (hairline 1.20:1, hairline-strong 1.30:1, paper-doc on paper 1.025:1)
     and D4 forbids the shadow that would rescue it. 3.21:1 on --doc-paper,
     3.13:1 on --color-off-white. Claim cards ONLY (D4a) — the at-rest
     ledger rows keep the existing hairline. Never a word, only an edge.
     This portal paints no dark paper set (no prefers-color-scheme block
     anywhere in this file; the .dark class carries shadcn tokens only), so
     the dark companion #77736E is recorded in docs/design/house-sheet/SPEC.md
     rather than written here as dead code. */
  --color-card-edge: #8F8C88;
```

- [ ] **Step 4: Run the guard to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/contrast.test.ts
```

Expected: the whole file passes, including the pre-existing `F56` and `R126` describes.

- [ ] **Step 5: Record the token in the house sheet**

In `docs/design/house-sheet/SPEC.md` §A1, find the opening prose:

```
Paste this block verbatim. Do not add tokens. Do not use a hex literal
anywhere else in the file.
```

Replace with:

```
Paste this block verbatim. Do not add tokens — with the single exception
recorded as R144 (`--color-card-edge`, below), which was ruled into the
sheet rather than added to a surface. Do not use a hex literal anywhere
else in the file.
```

In the light `:root` block, after the `--oak` group, insert:

```css
  /* — the one boundary grey (R144). A component boundary answers to 1.4.11's
       3:1, which no hairline reaches. Claim cards ONLY. — */
  --card-edge:        #8F8C88;  /* 3.21:1 on paper-doc · 3.13:1 on paper */
```

In the `@media (prefers-color-scheme: dark)` block, after `--oak: #B39572;`, insert:

```css
    --card-edge:       #77736E;  /* 3.19:1 on the dark ground */
```

The designer portal names the same value `--color-card-edge`, following that file's own `--color-*` prefix convention; the sheet names it `--card-edge`, following its own. Note that difference in the R144 entry so nobody later "fixes" one to match the other.

- [ ] **Step 6: Append the two amendments to `DECISIONS.md`**

The log is append-only. Its last entries close with `*Entries add: R142 · last id = R142*` and `*Entries add: I153 · last id = I153*`. Append at the very end of the file:

```markdown
### R143 · The Desk is a hybrid — a claim takes a card, a quiet job takes a line — 2026-09-09

**Ruled by Kody, 2026-09-09** (**D1**, **D2**, **D5**, **R5**; against the panel proposal
*Three Cards for the Desk*, `artifacts/desk-cards-2026-09-09/three-cards-for-the-desk.html`). This
**amends I150** (`Wave B2 — the ticket everywhere, and the Desk roster`, 2026-08-26), which ruled the
four-up folio grid into one stage-grouped roster, *one line per live job … never a card*.

The amended rule, in full: **one line per job in the at-rest ledger; a job with a claim on the studio's
hand takes a Claim card.** The predicate is the one the roster already computes — `mark !== null` in
`desk-roster-derivation.ts`, which is every job carrying a need, urgent or quiet. In-motion chips and
quiet jobs stay lines. Nothing folds on first paint; the headings still never fold; the ledger half is
still grouped under the seven stage plates in the paper's own order.

What did **not** change, and why the amendment is narrow rather than a reversal: the density rule that
made I150 right is still the rule for the body of the list. At 16 jobs the Desk is about five cards over
eleven rows; at 45, about six over thirty-nine. The card is the *emphasis* granted to a job with a claim,
not a container granted to every job — fifteen equal cards was the shape I150 correctly refused, and this
ruling does not bring it back. Two things the row could not give are what buy the card: a need sentence
that wants two lines, and a name that wants an honest 44px target (the roster's name link was the Desk's
one sub-44px hit area).

**One rendering, not a third facet** (**D2**). No view switcher — a switcher is one step from the dashboard
the vision refuses. The two facets stand and now compose over both halves: *Only what needs me* hides the
ledger entirely (the cards already are what needs her); *By person* regroups **both** halves by assigned
designer. Labels never change with state; `aria-pressed` carries it (IX18).

**The Desk ranks, and prints its reason** (**D3**). Cards are ordered by custody band — the studio's own pen
and overdue, then the studio's own pen, then with the client, then with the maker — oldest need date first
within a band, ties broken on **name**, never on a UUID. This inverts the shipped stage-first sort for the
card half only; the ledger half keeps stage-first. Ranking is a real claim on a surface that promises the
studio won't notice Patina, so the reason is printed plainly on the card ("overdue since 4 Sep") — a wrong
rank has to be legible and correctable, never mysterious.

**Custody is stated, never inferred at render** (**D6**). Ten need kinds carried no `owner` — `damage_claim`,
`proposal_declined`, `proposal_expired`, `lines_flagged`, `awaiting_inspection`, `schedule_conflict` (all
three branches), `schedule_proposal`, `schedule_unconfigured`. All ten are filled as `'designer'` in the
need table itself, which is where the rule that derived the need already knows the answer. The word on the
card is one of four: `Your pen` · `With {first name}` (or `With the client` where the row carries no name
we will print) · `With the maker` · `At rest`.

**The day's line quotes the grid** (**D7**). Up to three lines, each naming one of the top three cards in
rank order, plus the answered-client note as a fourth when one landed inside 24 hours. Before this the line
selected by its own rule while the roster ordered by another — tolerable under stage plates, incoherent in
a grid where position *is* the message.

**The hit model** (**D10**). The link is scoped to the card's upper block — custody, name, person·phase, at
least 88px — as an absolutely-positioned overlay behind the face, with the custody row and person line
raised above it so their text stays selectable. The act is a separate full-width 44px band below. Two clean
targets per card, name then act, DOM order, no nesting, no roving tabindex, no stretched-link swallowing
the sentence a designer copies into email.

*Entries add: R143 · last id = R143*

### R144 · One new token, and one only — the card edge — 2026-09-09

**Ruled by Kody, 2026-09-09** (**D4**, **D4a**, **R5**; the accessibility critic's finding F1). This **amends
the "no new token" rule** recorded in **I153** (`The house sheet has a home`, 2026-09-08), whose §A1 reads
*"Do not add tokens."*

A card is a component boundary where a row is not, so WCAG 1.4.11's 3:1 attaches to its edge. Measured on
the shipped palette, nothing reaches it: `--hairline` on paper **1.20:1**, `--hairline-strong` composited
**1.30:1**, `--doc-paper` on `--paper` **1.025:1**. D4's zero-shadow rule forbids the elevation that would
otherwise carry the boundary, and `--elevation-sheet` is R126's, scoped to margin chips, the ledger sheet
and the drawer — not spendable here. The exception is therefore granted, once and narrowly:

**One boundary grey. `#8F8C88` — 3.21:1 on `--doc-paper`, 3.13:1 on `--color-off-white`.** Named
`--card-edge` in `docs/design/house-sheet/SPEC.md` (following that file's convention) and
`--color-card-edge` in `apps/designer-portal/src/app/globals.css` (following that file's `--color-*`
convention). The two names are deliberate, not drift.

**Claim cards only** (**D4a**). The at-rest ledger rows keep the existing hairline — they are rows, and a row
is not a component boundary. Nothing else in either portal spends this token. It is an edge and never a
word: it is not an `-ink` companion, it clears no text floor, and no letter is ever set in it.

The dark companion is **`#77736E`** (3.19:1 on the sheet's `--paper #2A2622`), recorded in the house sheet's
`@media (prefers-color-scheme: dark)` block. It is deliberately **not** written into the designer portal's
`globals.css`: that file declares no `prefers-color-scheme` block and its `.dark` class redefines none of
the paper, ink or hairline tokens, so a dark value there would be dead code claiming a dark surface the
portal does not paint.

*Entries add: R144 · last id = R144*
```

- [ ] **Step 7: Gate**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/contrast.test.ts
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: contrast suite green; type-check exits 0.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/lib/document/__tests__/contrast.test.ts \
  docs/design/house-sheet/SPEC.md \
  docs/design/the-document/DECISIONS.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "docs(design): Claim cards — R143–R144" -- \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/lib/document/__tests__/contrast.test.ts \
  docs/design/house-sheet/SPEC.md \
  docs/design/the-document/DECISIONS.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 4 files.

---

## Task 3 (D5, D6, D3, D7): The derivation — custody, the claim ranking, and the day's line that quotes it

All of this is pure functions over data the Desk page already fetches. No hooks, no data access, no React.

`deriveDeskRoster` keeps every export and every behaviour it has today — `deriveDeskClaims` takes its *output* and splits it. That is deliberate: `deriveDeskRoster`, `filterRosterToNeeds`, `groupRosterByPerson`, `deriveRosterPeople`, `facetHeading`, `ROSTER_STAGE_ORDER`, `OPEN_THE_JOB`, `NOTHING_NEEDS_YOU` and `rosterLineNeedsAHand` are all imported elsewhere, and none of their signatures change. The only signature that changes is `deriveDeskDayLine`, which is imported by exactly one file (`desk-roster.tsx`) and rewritten here, because D7 replaces its selection rule outright.

**Files:**
- Modify: `apps/designer-portal/src/lib/document/desk-derivation.ts`
- Modify: `apps/designer-portal/src/lib/document/desk-roster-derivation.ts`
- Modify: `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts`
- Modify: `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts`
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx` (fixture fields only)
- Modify: `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx` (fixture fields only)

**Interfaces:**

- **Consumes** from `desk-derivation.ts` (all pre-existing): `NeedLine` (whose `owner?: 'designer' | 'client' | 'maker' | null` field already exists), `NeedKind`, `DocumentStateRow`, `DeskFolder`, `MotionChip`, `SectionKey`, `folderTab`. From `overdue-condition.ts`: `deriveOverdue`, `overdueElapsedPhrase`, `NOT_OVERDUE`, `OverdueCondition`. From `dates.ts`: `dayMonth`.

- **Produces**, newly exported from `desk-derivation.ts`:

```ts
/** R106's first-name helper, now also the custody word's. `fallback` is
 *  returned for an empty or absent name. */
export function firstName(name: string | null | undefined, fallback?: string): string;
```

- **Produces**, newly exported from `desk-roster-derivation.ts`:

```ts
/** D6 — whose hand the job is in, in words, written at derivation and never
 *  guessed at render. Exactly one of:
 *    'Your pen' · `With ${first}` · 'With the client' · 'With the maker' · 'At rest'
 *  A need with no `owner` at all defaults to 'Your pen' (D6). No need at all
 *  is 'At rest'. */
export function custodyWord(
  need: NeedLine | null,
  row: DocumentStateRow,
): string;

/** D3's rank bands. 0 = the studio's own pen and overdue; 1 = the studio's
 *  own pen; 2 = with the client; 3 = with the maker. */
export type ClaimBand = 0 | 1 | 2 | 3;

export interface ClaimCard {
  /** The roster line this card is a rendering of — the card introduces no
   *  job the roster does not list. */
  line: RosterLine;
  stage: SectionKey;
  /** Sentence case; the plate's CSS uppercases. */
  stageLabel: string;
  /** `line.custody`, lifted for the card's second register. */
  custody: string;
  band: ClaimBand;
}

export interface ClaimPersonGroup {
  key: string;
  label: string;
  count: number;
  cards: ClaimCard[];
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  answeredNotes: readonly AnsweredClientNote[];
  now: Date;
}

export interface DeskClaims {
  /** D5 — every line with `mark !== null`, in D3's rank order. */
  cards: ClaimCard[];
  /** D8 — the rest, grouped under the seven stage plates, stage-first. */
  ledger: RosterGroup[];
  /** `Every job · 16 live · 2 overdue` — the roster's own heading, unchanged. */
  heading: string;
  /** `At rest · 11 jobs` / `At rest · 1 job`. Empty string when the ledger is. */
  restHeading: string;
  /** D7 — up to three card lines plus the answered note. Null when neither. */
  dayLine: DeskDayLine | null;
}

export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims;

export function groupClaimsByPerson(
  cards: readonly ClaimCard[],
  people: readonly RosterPerson[],
): ClaimPersonGroup[];
```

- **Produces**, changed on the existing `RosterLine` interface (four fields added; nothing removed or renamed):

```ts
  /** D6 — the custody word. Always written. */
  custody: string;
  /** The need's own owner, for D3's ranking. Null where there is no need. */
  needOwner: 'designer' | 'client' | 'maker' | null;
  /** The need's date as `12 Aug`, where the need states one; null otherwise.
   *  The ledger's value column, and the card sentence's dated clause. */
  valueText?: string | null;
  /** The in-motion chip's own sentence, unconcatenated (MotionChip.text). */
  motionText?: string | null;
```

- **Produces**, changed signatures on two existing exports:

```ts
/** D7 — the line now quotes the grid it sits above, so a line can never
 *  contradict the first card. */
export function deriveDeskDayLine(
  cards: readonly ClaimCard[],
  answeredNotes: readonly AnsweredClientNote[],
  now: Date,
): DeskDayLine | null;

/** `key` is `card-${engagementId}` or `'answered'`. */
export interface DayLine {
  key: string;
  engagementId: string;
  parts: DayLinePart[];
}

/** `more` now points at the claims grid, which has no stage. */
export interface DeskDayLine {
  lines: DayLine[];
  more: { count: number; anchorId: string } | null;
}

/** The id the `more` link lands on — the claims grid's own element. */
export const CLAIMS_ANCHOR_ID = 'desk-claims';
```

`MAX_DAY_LINES` stays exported at `3` and now caps the **card** lines; the answered note is a fourth line on top of it (D7).

- [ ] **Step 1: Write the failing derivation tests (a) — the ten owners**

Append to `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts`. The suite already imports `deriveNeeds`-family helpers and builds `DocumentStateRow` fixtures; add a table-driven test that asserts the property directly on the exported `NEED_ACTION_LABELS` key set, so a new need kind added later without an owner fails here:

```ts
import { NEED_ACTION_LABELS, type NeedKind } from '@/lib/document/desk-derivation';

/**
 * D6 — every need kind states whose hand it is in. Ten kinds carried no
 * `owner` and the card would have had to guess at render, which is exactly
 * what the ruling forbids. The default is the studio's own pen.
 */
const OWNER_BY_KIND: Record<NeedKind, 'designer' | 'client' | 'maker'> = {
  overdue_decision: 'client',
  overdue_invoice: 'client',
  proposal_signed: 'designer',
  damage_claim: 'designer',
  proposal_declined: 'designer',
  proposal_expired: 'designer',
  lines_flagged: 'designer',
  new_lead: 'designer',
  ceremony_pending: 'designer',
  reconnect_due: 'designer',
  hesitating_proposal: 'client',
  awaiting_inspection: 'designer',
  schedule_conflict: 'designer',
  schedule_proposal: 'designer',
  task_due: 'designer',
  schedule_unconfigured: 'designer',
  po_unsent: 'designer',
  po_unacknowledged: 'maker',
  pulse_due: 'designer',
};

describe('D6 · every need kind states its owner', () => {
  it('covers every kind the action-label table knows, and no more', () => {
    // A new NeedKind added without an owner fails here rather than shipping
    // a card that guesses.
    expect(Object.keys(OWNER_BY_KIND).sort()).toEqual(
      Object.keys(NEED_ACTION_LABELS).sort(),
    );
  });
});
```

Then, for each of the ten branches, assert the produced `NeedLine.owner` through the same `deriveNeeds`/`partitionDesk` entry points the surrounding tests in that file already use. Find the existing test in this file that exercises each kind (each of the ten kinds is already covered there for its `kind`, `text` and `actionLabel`) and add one assertion to it:

```ts
    expect(need.owner).toBe('designer');
```

The ten to touch, by rule function and kind:

| # | Rule function in `desk-derivation.ts` | `kind` | Unique anchor line in the branch |
|---|---|---|---|
| 1 | `needProposal` | `proposal_declined` | `stamp: { label: 'DECLINED', ...STAMP.terracotta },` |
| 2 | `needProposal` | `proposal_expired` | `stamp: { label: 'EXPIRED', ...STAMP.terracotta },` |
| 3 | `needProposal` | `lines_flagged` | `stamp: { label: 'FLAGGED', ...STAMP.clay },` |
| 4 | `needDamageClaim` | `damage_claim` | `stamp: { label: 'CLAIM OPEN', ...STAMP.terracotta, tone: 'damaged' },` |
| 5 | `needAwaitingInspection` | `awaiting_inspection` | `stamp: { label: 'DELIVERED', ...STAMP.sage },` |
| 6 | `needScheduleCollision` | `schedule_conflict` | `stamp: { label: conflict.collision.label, ...STAMP.terracotta },` |
| 7 | `needScheduleContradiction` | `schedule_conflict` | `text: schedule.contradictionText,` |
| 8 | `needScheduleProposalConflict` | `schedule_conflict` | `text: 'A recorded date contradicts an anchor already committed',` |
| 9 | `needScheduleProposal` | `schedule_proposal` | `stamp: { label: 'PROPOSED', ...STAMP.clay },` |
| 10 | `needScheduleUnconfigured` | `schedule_unconfigured` | `stamp: { label: 'BAND', ...STAMP.clay },` |

- [ ] **Step 2: Write the failing derivation tests (b) — the custody word**

Append to `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts`, reusing that file's existing `row()`, `need()`, `folder()`, `chip()`, `input()` builders and its `NOW` constant:

```ts
import { custodyWord } from '@/lib/document/desk-roster-derivation';

describe('D6 · custodyWord — whose hand, in words', () => {
  it('says Your pen for the studio’s own need', () => {
    expect(custodyWord(need({ owner: 'designer' }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('defaults to Your pen when the rule stated no owner at all', () => {
    // D6's recommendation, taken: default, never guess at render.
    expect(custodyWord(need({ owner: undefined }), row('a', 'project'))).toBe(
      'Your pen',
    );
    expect(custodyWord(need({ owner: null }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('names the client by first name where the row carries one', () => {
    const r = row('a', 'project', { client_name: 'Nora Ellison' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With Nora');
  });

  it('falls back to With the client where the name is a placeholder', () => {
    // `clientOf` refuses the seed's `Client User` as a real family name, and
    // so does this — a role noun never stands in for a name we do not have.
    const r = row('a', 'project', { client_name: 'Client User' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('falls back to With the client where the row carries no name', () => {
    const r = row('a', 'project', { client_name: null });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('says With the maker for a vendor-owned need', () => {
    expect(custodyWord(need({ owner: 'maker' }), row('a', 'project'))).toBe(
      'With the maker',
    );
  });

  it('says At rest where there is no need at all', () => {
    expect(custodyWord(null, row('a', 'project'))).toBe('At rest');
  });
});

describe('D6 · deriveDeskRoster writes the custody word onto every line', () => {
  it('carries the word and the owner on the line itself', () => {
    const withNeed = row('claimed', 'project', { client_name: 'Nora Ellison' });
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [withNeed, quiet],
        folders: [folder(withNeed, need({ owner: 'client' }))],
      }),
      NOW,
    );
    const lines = roster.groups[0].lines;
    const claimed = lines.find((l) => l.engagementId === 'claimed')!;
    const at = lines.find((l) => l.engagementId === 'quiet')!;

    expect(claimed.custody).toBe('With Nora');
    expect(claimed.needOwner).toBe('client');
    expect(at.custody).toBe('At rest');
    expect(at.needOwner).toBeNull();
  });

  it('carries the need’s date as a value and the chip’s own sentence', () => {
    const dated = row('dated', 'project');
    const moving = row('moving', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [dated, moving],
        folders: [folder(dated, need({ dueOn: '2026-08-12' }))],
        chips: [chip(moving, 'Two pieces on the way')],
      }),
      NOW,
    );
    const lines = roster.groups[0].lines;

    expect(lines.find((l) => l.engagementId === 'dated')!.valueText).toBe(
      '12 Aug',
    );
    expect(lines.find((l) => l.engagementId === 'moving')!.valueText).toBeNull();
    expect(lines.find((l) => l.engagementId === 'moving')!.motionText).toBe(
      'Two pieces on the way',
    );
  });
});
```

- [ ] **Step 3: Write the failing derivation tests (c) — the claim split, the ranking, the ledger**

Append to the same file:

```ts
import {
  CLAIMS_ANCHOR_ID,
  deriveDeskClaims,
  groupClaimsByPerson,
  type ClaimCard,
} from '@/lib/document/desk-roster-derivation';

function claims(over: Partial<DeskRosterInput> = {}, notes: AnsweredClientNote[] = []) {
  return deriveDeskClaims({
    roster: deriveDeskRoster(input(over), NOW),
    answeredNotes: notes,
    now: NOW,
  });
}

describe('D5 · a claim takes a card, a quiet job takes a line', () => {
  it('cards every marked line and leaves every unmarked one in the ledger', () => {
    const claimed = row('claimed', 'project');
    const quietA = row('quiet-a', 'project');
    const quietB = row('quiet-b', 'care');
    const result = claims({
      live: [claimed, quietA, quietB],
      folders: [folder(claimed)],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(['claimed']);
    expect(result.ledger.map((g) => g.key)).toEqual(['project', 'care']);
    expect(result.ledger[0].lines.map((l) => l.engagementId)).toEqual(['quiet-a']);
    expect(result.ledger[0].count).toBe(1);
  });

  it('drops a stage group the split emptied', () => {
    const claimed = row('claimed', 'project');
    const result = claims({ live: [claimed], folders: [folder(claimed)] });

    expect(result.ledger).toEqual([]);
  });

  it('keeps the roster’s own heading, and counts the ledger head', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const result = claims({ live: [claimed, quiet], folders: [folder(claimed)] });

    expect(result.heading).toBe('Every job · 2 live · 0 overdue');
    expect(result.restHeading).toBe('At rest · 1 job');
  });

  it('pluralises the ledger head, and says nothing over an empty ledger', () => {
    const a = row('a', 'project');
    const b = row('b', 'project');
    expect(claims({ live: [a, b] }).restHeading).toBe('At rest · 2 jobs');
    expect(claims({ live: [] }).restHeading).toBe('');
  });
});

describe('D3 · the cards rank by custody band, then oldest, then name', () => {
  const ownedOverdue = row('z-owned-overdue', 'project', { title: 'Z overdue' });
  const owned = row('m-owned', 'project', { title: 'M owned' });
  const ownedOlder = row('a-owned-older', 'project', { title: 'A owned older' });
  const client = row('client-held', 'project', { title: 'Client held' });
  const maker = row('maker-held', 'project', { title: 'Maker held' });

  it('bands designer+overdue, designer, client, maker — in that order', () => {
    const result = claims({
      live: [maker, client, owned, ownedOverdue],
      folders: [
        folder(maker, need({ owner: 'maker' })),
        folder(client, need({ owner: 'client' })),
        folder(owned, need({ owner: 'designer' })),
        folder(ownedOverdue, need({ owner: 'designer', dueOn: '2026-08-01' })),
      ],
    });

    expect(result.cards.map((c) => c.band)).toEqual([0, 1, 2, 3]);
    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'z-owned-overdue',
      'm-owned',
      'client-held',
      'maker-held',
    ]);
  });

  it('puts the oldest need date first inside a band', () => {
    const result = claims({
      live: [owned, ownedOlder],
      folders: [
        folder(owned, need({ owner: 'designer', dueOn: '2026-09-20' })),
        folder(ownedOlder, need({ owner: 'designer', dueOn: '2026-09-01' })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'a-owned-older',
      'm-owned',
    ]);
  });

  it('breaks a tie on the name, never on the id', () => {
    // A UUID tiebreak is stable but arbitrary; a name is legible.
    const zed = row('aaa', 'project', { title: 'Zeta house' });
    const ash = row('zzz', 'project', { title: 'Ash house' });
    const result = claims({
      live: [zed, ash],
      folders: [folder(zed, need({ owner: 'designer' })), folder(ash, need({ owner: 'designer' }))],
    });

    expect(result.cards.map((c) => c.line.name)).toEqual([
      'Ash house',
      'Zeta house',
    ]);
  });

  it('carries the stage and its sentence-case label on the card', () => {
    const result = claims({ live: [owned], folders: [folder(owned)] });

    expect(result.cards[0].stage).toBe('project');
    expect(result.cards[0].stageLabel).toBe('Project');
  });
});

describe('D8 · the ledger keeps the paper’s own stage order', () => {
  it('groups the at-rest half stage-first, in ROSTER_STAGE_ORDER', () => {
    const live = [...ROSTER_STAGE_ORDER].reverse().map((s) => row(s, s));
    const result = claims({ live });

    expect(result.ledger.map((g) => g.key)).toEqual([...ROSTER_STAGE_ORDER]);
    expect(result.cards).toEqual([]);
  });
});
```

- [ ] **Step 4: Write the failing derivation tests (d) — the day's line**

Append to the same file:

```ts
describe('D7 · the day’s line quotes the grid it sits above', () => {
  it('names the first three cards, in the grid’s own order', () => {
    const late = row('late', 'project', { title: 'Vandersteen residence' });
    const mine = row('mine', 'project', { title: 'Cedar Lane study' });
    const theirs = row('theirs', 'proposal', { title: 'Halvorsen loft' });
    const fourth = row('fourth', 'care', { title: 'Osterberg cottage' });
    const result = claims({
      live: [late, mine, theirs, fourth],
      folders: [
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
        folder(mine, need({ owner: 'designer', text: 'Two rooms await your mark-up' })),
        folder(theirs, need({ owner: 'client', text: 'Opened, not signed' })),
        folder(fourth, need({ owner: 'maker', text: 'The maker has not acknowledged' })),
      ],
    });

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-late',
      'card-mine',
      'card-theirs',
    ]);
    expect(result.dayLine!.lines[0].parts[0]).toEqual({
      kind: 'job',
      text: 'Vandersteen residence',
      engagementId: 'late',
    });
  });

  it('prints the overdue clause in the red letter’s own part kind', () => {
    const late = row('late', 'project');
    const result = claims({
      live: [late],
      folders: [folder(late, need({ owner: 'designer', dueOn: '2026-08-01' }))],
    });

    const overduePart = result.dayLine!.lines[0].parts.find(
      (p) => p.kind === 'overdue',
    );
    expect(overduePart).toBeDefined();
    expect(overduePart!.text).toContain('overdue');
  });

  it('counts the cards it could not name, and points at the grid', () => {
    const live = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 'project'));
    const result = claims({
      live,
      folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
    });

    expect(result.dayLine!.lines).toHaveLength(3);
    expect(result.dayLine!.more).toEqual({ count: 2, anchorId: CLAIMS_ANCHOR_ID });
  });

  it('adds the answered client note as a fourth line, inside 24 hours', () => {
    const claimed = row('claimed', 'project', { client_name: 'Nora Ellison' });
    const answeredRow = row('answered', 'care', {
      client_name: 'Erin Byrne',
      project_id: 'p-1',
    });
    const result = claims(
      {
        live: [claimed, answeredRow],
        folders: [folder(claimed, need({ owner: 'designer' }))],
      },
      [{ projectId: 'p-1', answeredAt: '2026-08-25T06:00:00Z' }],
    );

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-claimed',
      'answered',
    ]);
    expect(result.dayLine!.lines[1].parts[0]).toEqual({
      kind: 'text',
      text: 'Erin Byrne replied last night — ',
    });
  });

  it('drops an answered note older than the window', () => {
    const answeredRow = row('answered', 'care', {
      client_name: 'Erin Byrne',
      project_id: 'p-1',
    });
    const result = claims({ live: [answeredRow] }, [
      { projectId: 'p-1', answeredAt: '2026-08-20T06:00:00Z' },
    ]);

    expect(result.dayLine).toBeNull();
  });

  it('says nothing at all when nothing claims her hand', () => {
    // A "nothing needs you" banner over sixteen live jobs is a second queue.
    expect(claims({ live: [row('a', 'project')] }).dayLine).toBeNull();
  });
});

describe('IA-11 / IA-12 · the two facets compose over both halves', () => {
  it('Only what needs me is the card half — filterRosterToNeeds agrees', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({ live: [claimed, quiet], folders: [folder(claimed)] }),
      NOW,
    );
    const result = deriveDeskClaims({ roster, answeredNotes: [], now: NOW });
    const narrowed = filterRosterToNeeds(roster.groups);

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(
      narrowed.flatMap((g) => g.lines.map((l) => l.engagementId)),
    );
  });

  it('By person regroups the card half by designerId', () => {
    const mine = row('mine', 'project', { designer_id: 'user-leah' });
    const hers = row('hers', 'project', { designer_id: 'user-anneke' });
    const people = deriveRosterPeople([
      {
        user_id: 'user-leah',
        role: 'owner',
        status: 'active',
        profiles: { full_name: 'Leah Hartwell', display_name: null },
      },
      {
        user_id: 'user-anneke',
        role: 'member',
        status: 'active',
        profiles: { full_name: 'Anneke Sund', display_name: null },
      },
    ]);
    const result = claims({
      live: [mine, hers],
      folders: [folder(mine), folder(hers)],
    });
    const grouped = groupClaimsByPerson(result.cards, people);

    expect(grouped.map((g) => [g.label, g.count])).toEqual([
      ['Leah Hartwell', 1],
      ['Anneke Sund', 1],
    ]);
    expect(grouped[0].cards[0].line.engagementId).toBe('mine');
  });

  it('groups an unassigned card under the principal, never dropping it', () => {
    const orphan = row('orphan', 'project', { designer_id: null });
    const people = deriveRosterPeople([
      {
        user_id: 'user-leah',
        role: 'owner',
        status: 'active',
        profiles: { full_name: 'Leah Hartwell', display_name: null },
      },
    ]);
    const result = claims({ live: [orphan], folders: [folder(orphan)] });

    expect(groupClaimsByPerson(result.cards, people)[0].count).toBe(1);
  });

  it('returns nothing to group when the studio has no named people', () => {
    const result = claims({ live: [row('a', 'project')], folders: [] });
    expect(groupClaimsByPerson(result.cards, [])).toEqual([]);
  });
});
```

- [ ] **Step 5: Run the derivation tests to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-roster-derivation.test.ts
```

Expected: failures naming `custodyWord is not a function`, `deriveDeskClaims is not a function`, `groupClaimsByPerson is not a function`, `CLAIMS_ANCHOR_ID` undefined, and the ten `expect(need.owner).toBe('designer')` assertions receiving `undefined`.

- [ ] **Step 6: Fill the ten owners in `desk-derivation.ts`**

For each of the ten branches in the Step 1 table, add `owner: 'designer',` immediately after that branch's `urgent: false,` line. Two shapes exist in the file — a `seal({ ... })` call (branches 1, 2, 3) and a bare `return { ... };` (branches 4–10) — the field goes in the same object either way. Example, branch 1:

```ts
    if (row.proposal_status === 'declined') {
      return seal({
        kind: 'proposal_declined',
        text: 'Proposal declined — follow up',
        actionLabel: NEED_ACTION_LABELS.proposal_declined,
        stamp: { label: 'DECLINED', ...STAMP.terracotta },
        urgent: false,
        owner: 'designer',
      });
    }
```

Verify the count when done:

```bash
grep -c "owner: 'designer'," \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src/lib/document/desk-derivation.ts
```

Expected: `17` — the 7 that already carried it (`proposal_signed`, `ceremony_pending`, `reconnect_due`, `new_lead`, `task_due`, `po_unsent`, `pulse_due`) plus the 10 added here.

- [ ] **Step 7: Export `firstName` from `desk-derivation.ts`**

Find:

```ts
function firstName(name: string | null | undefined, fallback = 'them'): string {
```

Replace with:

```ts
export function firstName(
  name: string | null | undefined,
  fallback = 'them',
): string {
```

Extend its comment block's last sentence to say why it is exported now:

```
// D6: also the custody word's first name — "With Nora". The roster's own
// module reads it from here rather than growing a second copy that could
// drift from the parked card's copy.
```

- [ ] **Step 8: Add `custodyWord` and the four new `RosterLine` fields**

In `apps/designer-portal/src/lib/document/desk-roster-derivation.ts`:

(a) Extend the import from `./desk-derivation` to include `firstName`.

(b) Add the constants and the function, immediately after `clientOf`:

```ts
/** D6's four words. `At rest` is the fifth, and belongs to a job with no need
 *  at all rather than to an owner. */
const CUSTODY_YOUR_PEN = 'Your pen';
const CUSTODY_THE_CLIENT = 'With the client';
const CUSTODY_THE_MAKER = 'With the maker';
const CUSTODY_AT_REST = 'At rest';

/**
 * D6 — whose hand the job is in, said in one of four ways.
 *
 * The owner is READ off the need, never inferred at render: the rule that
 * derived the need already knew the answer, and a card that guesses is the
 * thing the ruling forbids. A need whose rule states no owner defaults to the
 * studio's own pen — the recommendation Kody took — rather than falling silent
 * or claiming a client we cannot name.
 *
 * The client's first name is printed only where `clientOf` will vouch for it:
 * the seed's placeholder `Client User` is refused here exactly as it is
 * refused on the line, because a role noun never stands in for a real name.
 */
export function custodyWord(
  need: NeedLine | null,
  row: DocumentStateRow,
): string {
  if (!need) return CUSTODY_AT_REST;
  if (need.owner === 'maker') return CUSTODY_THE_MAKER;
  if (need.owner === 'client') {
    const client = clientOf(row);
    return client ? `With ${firstName(client)}` : CUSTODY_THE_CLIENT;
  }
  return CUSTODY_YOUR_PEN;
}
```

`NeedLine` must be added to the type-only import from `./desk-derivation`.

(c) Add the four fields to the `RosterLine` interface, after `needText`:

```ts
  /** D6 — whose hand this job is in, in words, written at derivation. One of
   *  'Your pen' · `With ${first}` · 'With the client' · 'With the maker' ·
   *  'At rest'. The card's second register reads this and nothing else. */
  custody: string;
  /** The need's own owner, which D3's rank bands read. Null with no need. */
  needOwner: 'designer' | 'client' | 'maker' | null;
  /** The need's date rendered in the surface's one date style ("12 Aug"), or
   *  null where the rule stated none. The ledger's value column prints it;
   *  because D5 sends every needful job to a card, an at-rest row's value is
   *  null today and its cell renders empty — the column is kept so figures
   *  align down the page the moment one carries a value. */
  valueText?: string | null;
  /** The in-motion chip's own sentence, unconcatenated. `state` already joins
   *  it with the client and the phase; the ledger row needs it standing
   *  alone. */
  motionText?: string | null;
```

(d) In `deriveDeskRoster`'s `entries` map, add the four to the returned `line` object, after `needText`:

```ts
        custody: custodyWord(need, row),
        needOwner: need?.owner ?? null,
        valueText: dayMonth(need?.dueOn ?? null),
        motionText: chip?.text ?? null,
```

`dayMonth` is already imported in this module and returns `string | null`.

- [ ] **Step 9: Rewrite the day's line and add the claims derivation**

Replace the whole `/* ── The day's line (IA-05) ── */` section's `DayLine` / `DeskDayLine` interfaces and `deriveDeskDayLine` function, and delete the now-unused `FlatLine`, `flatten`, `byDueThenId` and `LEAD_SENTENCE` helpers, with:

```ts
/** The id the `more` link lands on — the claims grid's own element. The grid
 *  has no stage, so the old `#roster-stage-{key}` target is gone with the
 *  stage-first grid it pointed into. */
export const CLAIMS_ANCHOR_ID = 'desk-claims';

/** `overdue` is the clause after the dash, which the Desk prints in
 *  terracotta ink; `job` is the inline act into the card. */
export type DayLinePart =
  | { kind: 'text'; text: string }
  | { kind: 'job'; text: string; engagementId: string }
  | { kind: 'overdue'; text: string };

export interface DayLine {
  /** `card-${engagementId}` for a quoted card, `answered` for the note. */
  key: string;
  /** The card this line is a view of. */
  engagementId: string;
  parts: DayLinePart[];
}

export interface DeskDayLine {
  lines: DayLine[];
  /** `and N more below`, pointing at the claims grid. */
  more: { count: number; anchorId: string } | null;
}

/** D7 — the line quotes the top THREE cards. The answered note is a fourth
 *  line on top of that, not one of the three. */
export const MAX_DAY_LINES = 3;

/** "Replied last night" is only true inside a day. */
export const ANSWERED_NOTE_WINDOW_MS = 86_400_000;

/**
 * D7 — the day's line, now a view of the grid it sits above.
 *
 * Before this it selected by its own rule (oldest overdue → newest lead →
 * client-answered) while the roster ordered by another. That was tolerable
 * under stage plates, where the line was a shortcut into a list; in a grid,
 * where POSITION is the message, a line contradicting the first card means
 * neither is trusted. So it quotes the first three cards in rank order and
 * introduces no job the grid does not already print.
 */
export function deriveDeskDayLine(
  cards: readonly ClaimCard[],
  answeredNotes: readonly AnsweredClientNote[],
  now: Date,
): DeskDayLine | null {
  const lines: DayLine[] = [];
  const taken = new Set<string>();

  for (const card of cards.slice(0, MAX_DAY_LINES)) {
    const { line } = card;
    taken.add(line.engagementId);
    const elapsed = overdueElapsedPhrase(line.overdue);
    lines.push({
      key: `card-${line.engagementId}`,
      engagementId: line.engagementId,
      parts: [
        { kind: 'job', text: line.name, engagementId: line.engagementId },
        elapsed
          ? { kind: 'overdue', text: ` — overdue ${elapsed}` }
          : {
              kind: 'text',
              // The card's own reason, not a second sentence about it: a line
              // that paraphrases the card is a second queue in miniature.
              text: ` — ${line.needText ?? line.act.label.toLowerCase()}`,
            },
      ],
    });
  }

  // The client's own answer, inside the last day. Without a client name the
  // line cannot be said — the roster refuses a role noun standing in for a
  // name it does not have, and so does this.
  const floor = now.getTime() - ANSWERED_NOTE_WINDOW_MS;
  const answered = answeredNotes
    .map((note) => ({ note, at: Date.parse(note.answeredAt) }))
    .filter(
      (entry) =>
        Number.isFinite(entry.at) &&
        entry.at >= floor &&
        entry.at <= now.getTime(),
    )
    .sort((a, b) => b.at - a.at);
  for (const { note } of answered) {
    const match = cards.find(
      (card) =>
        card.line.projectId === note.projectId &&
        !!card.line.client &&
        !taken.has(card.line.engagementId),
    )?.line;
    if (!match) continue;
    taken.add(match.engagementId);
    lines.push({
      key: 'answered',
      engagementId: match.engagementId,
      parts: [
        { kind: 'text', text: `${match.client} replied last night — ` },
        { kind: 'job', text: match.name, engagementId: match.engagementId },
      ],
    });
    break;
  }

  // Nothing claims her hand: the band does not render. A "nothing needs you"
  // banner over sixteen live jobs is itself a second queue.
  if (lines.length === 0) return null;

  const quoted = lines.filter((line) => line.key !== 'answered').length;
  const remaining = cards.length - quoted;
  return {
    lines,
    more: remaining > 0 ? { count: remaining, anchorId: CLAIMS_ANCHOR_ID } : null,
  };
}
```

> **Note on the answered-note match.** It now searches `cards`, not the whole roster, so the note can only name a job the grid prints. A quiet job whose client replied is at rest by definition and does not claim a line.

Then add the claims derivation, immediately after the day's line section:

```ts
/* ── The claims split (D5, D3, D8) ──────────────────────────────────────────
 *
 * R143: one line per job in the at-rest ledger; a job with a claim on the
 * studio's hand takes a Claim card. The predicate is the mark the roster
 * already draws — `mark !== null`, every job carrying a need — so the split
 * reads the same fact the margin does rather than deriving a second one.
 * ─────────────────────────────────────────────────────────────────────────── */

/** D3's rank bands. 0 = the studio's own pen and overdue; 1 = the studio's own
 *  pen; 2 = with the client; 3 = with the maker. */
export type ClaimBand = 0 | 1 | 2 | 3;

export interface ClaimCard {
  /** The roster line this card renders. A card introduces no job the roster
   *  does not list. */
  line: RosterLine;
  stage: SectionKey;
  /** Sentence-case; the plate's CSS uppercases. */
  stageLabel: string;
  /** `line.custody`, lifted so the card's second register reads one field. */
  custody: string;
  band: ClaimBand;
}

export interface ClaimPersonGroup {
  key: string;
  label: string;
  count: number;
  cards: ClaimCard[];
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  answeredNotes: readonly AnsweredClientNote[];
  now: Date;
}

export interface DeskClaims {
  cards: ClaimCard[];
  ledger: RosterGroup[];
  /** The roster's own heading, unchanged: the counts are the whole Desk's. */
  heading: string;
  /** `At rest · 11 jobs`. Empty string when the ledger is empty. */
  restHeading: string;
  dayLine: DeskDayLine | null;
}

function claimBand(line: RosterLine): ClaimBand {
  if (line.needOwner === 'maker') return 3;
  if (line.needOwner === 'client') return 2;
  // 'designer', and the D6 default for a need whose rule stated no owner.
  return line.overdue.isOverdue ? 0 : 1;
}

function restHeadingFor(count: number): string {
  if (count === 0) return '';
  return `At rest · ${count} ${count === 1 ? 'job' : 'jobs'}`;
}

/**
 * D5 · D3 · D8 — the Desk in two halves.
 *
 * Takes the roster `deriveDeskRoster` already built rather than rebuilding it,
 * so the head's counts, the stage grouping and every line's own derivation are
 * one computation with one source of truth. The card half is RE-ORDERED (D3:
 * rank, with the reason printed on the card); the ledger half keeps the
 * stage-first order it shipped with, because a ledger has headings to skip and
 * a grid does not.
 */
export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims {
  const { roster, answeredNotes, now } = input;

  const cards: ClaimCard[] = [];
  const ledger: RosterGroup[] = [];

  for (const group of roster.groups) {
    const rest: RosterLine[] = [];
    for (const line of group.lines) {
      if (rosterLineNeedsAHand(line)) {
        cards.push({
          line,
          stage: line.stage,
          stageLabel: STAGE_LABEL[line.stage],
          custody: line.custody,
          band: claimBand(line),
        });
      } else {
        rest.push(line);
      }
    }
    if (rest.length > 0) {
      ledger.push({ ...group, count: rest.length, lines: rest });
    }
  }

  cards.sort(
    (a, b) =>
      a.band - b.band ||
      anchorTime(a.line.dueOn) - anchorTime(b.line.dueOn) ||
      a.line.name.localeCompare(b.line.name),
  );

  const restCount = ledger.reduce((total, group) => total + group.count, 0);

  return {
    cards,
    ledger,
    heading: roster.heading,
    restHeading: restHeadingFor(restCount),
    dayLine: deriveDeskDayLine(cards, answeredNotes, now),
  };
}

/**
 * Regroups the CARD half by the person who carries the job, on exactly the
 * rule `groupRosterByPerson` uses for the ledger half: a card with no
 * `designerId`, or one naming nobody on the list, groups under the principal
 * rather than vanishing.
 */
export function groupClaimsByPerson(
  cards: readonly ClaimCard[],
  people: readonly RosterPerson[],
): ClaimPersonGroup[] {
  if (people.length === 0) return [];

  const principal = people.find((person) => person.isPrincipal) ?? people[0];
  const known = new Set(people.map((person) => person.id));
  const cardsByPerson = new Map<string, ClaimCard[]>(
    people.map((person) => [person.id, []]),
  );

  for (const card of cards) {
    const id =
      card.line.designerId && known.has(card.line.designerId)
        ? card.line.designerId
        : principal.id;
    cardsByPerson.get(id)!.push(card);
  }

  return people
    .map((person) => ({
      key: `person-${person.id}`,
      label: person.name,
      count: cardsByPerson.get(person.id)!.length,
      cards: cardsByPerson.get(person.id)!,
    }))
    .filter((group) => group.count > 0);
}
```

`groupClaimsByPerson` must be declared after `RosterPerson`; if it is easier, place both new sections at the end of the file — order within a module does not matter for exported functions, only for the `const` declarations they close over (`STAGE_LABEL` and `anchorTime` are both module-scope and hoisted-safe as `const` only if the call happens after evaluation, which it does).

- [ ] **Step 10: Update the six RosterLine literals in the two component test fixtures**

The two new **required** fields (`custody`, `needOwner`) break the hand-built fixtures. Find them:

```bash
grep -rn "overdueText:" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src
```

Expected: 6 hits outside `desk-roster-derivation.ts` — three in `desk-roster-settle.test.tsx`, three in `desk-roster.test.tsx`. In each literal, add the two fields next to `mark`:

```tsx
            custody: 'Your pen',
            needOwner: 'designer',
```

except in `desk-roster.test.tsx`'s `byrne` line, whose need is `hesitating_proposal` (client-owned) and whose client is named — use:

```tsx
            custody: 'With Erin',
            needOwner: 'client',
```

- [ ] **Step 11: Run the derivation tests to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-roster-derivation.test.ts \
  src/lib/document/__tests__/desk-action-labels.test.ts \
  src/lib/document/__tests__/desk-overdue-order.test.ts \
  src/lib/document/__tests__/desk-schedule-conflict.test.ts \
  src/lib/document/__tests__/desk-schedule.test.ts \
  src/lib/document/__tests__/desk-flagged-lines.test.ts \
  src/lib/document/__tests__/desk-task-due.test.ts \
  src/lib/document/__tests__/desk-conflicts.test.ts \
  src/lib/document/__tests__/desk-receivables.test.ts
```

Expected: all 10 suites pass. The seven suites beyond the two you edited are the ones that build `NeedLine`s and would catch an owner written onto the wrong branch.

- [ ] **Step 12: Type-check will still fail — that is expected here**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: **one** class of error, in `apps/designer-portal/src/components/document/desk-roster.tsx`, from `deriveDeskDayLine`'s changed first parameter and `DeskDayLine.more`'s changed shape. Task 4 closes it. Confirm no *other* file errors — if one does, a signature you were told not to change has changed.

- [ ] **Step 13: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/lib/document/desk-derivation.ts \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): custody, the claim ranking, and a day's line that quotes the grid" -- \
  apps/designer-portal/src/lib/document/desk-derivation.ts \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 6 files.

---

## Task 4: The Claim card, the at-rest ledger row, and the grid

**Naming.** The plan's components are `DeskClaimCard`, `DeskLedgerRow` and `DeskClaimsGrid` — not `ClaimCard`, `DeskLedgerRow`, `DeskClaims` — because `ClaimCard` and `DeskClaims` are already the names of the *types* Task 3 exports, and a same-name type and value across two modules is exactly the drift a plan should not create. The container keeps the name `DeskRoster` to limit churn: the Desk page's import, its `data-testid="desk-roster"` and the tour anchors all stay as they are.

**Files:**
- Create: `apps/designer-portal/src/components/document/desk-claim-card.tsx`
- Create: `apps/designer-portal/src/components/document/desk-ledger-row.tsx`
- Create: `apps/designer-portal/src/components/document/desk-claims.tsx`
- Create: `apps/designer-portal/src/components/document/desk-claim-card.test.tsx`
- Create: `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx`
- Modify: `apps/designer-portal/src/components/document/desk-roster.tsx`
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx`
- Modify: `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx`
- Modify: `apps/designer-portal/src/app/globals.css`

**Interfaces:**

- **Consumes** from Task 3: `ClaimCard`, `ClaimPersonGroup`, `DeskClaims`, `DeskClaimsInput`, `DayLinePart`, `DeskDayLine`, `RosterGroup`, `RosterLine`, `RosterMember`, `RosterPerson`, `CLAIMS_ANCHOR_ID`, `deriveDeskClaims`, `groupClaimsByPerson`, `groupRosterByPerson`, `deriveRosterPeople`, `facetHeading`, `NOTHING_NEEDS_YOU`. From the existing tree: `DocumentAction`, `DocumentActionGroup`, `SectionEyebrow`, `RowWash`, `useRowWash`, `RowWashTone`, `openLedger`, `useAnsweredNotes`.

- **Produces:**

```tsx
// desk-claim-card.tsx
export function DeskClaimCard(props: {
  card: ClaimCard;
  tone: RowWashTone;
  /** The settle stagger index; omitted when the Desk is not settling. */
  index?: number;
  settle: boolean;
  tourAnchor?: string;
}): JSX.Element;

// desk-ledger-row.tsx
export function DeskLedgerRow(props: {
  line: RosterLine;
  tone: RowWashTone;
}): JSX.Element;

// desk-claims.tsx
export function DeskClaimsGrid(props: {
  cards: readonly ClaimCard[];
  settle: boolean;
  /** The running index across the whole Desk, so the settle stagger does not
   *  restart per person group. */
  startIndex?: number;
  /** Set on the first card only, so the walkthrough's fourth stop lands. */
  firstTourAnchor?: string;
  /** The id the day's line's `more` link lands on. */
  id?: string;
}): JSX.Element;
```

The `rosterLineAnchorId(engagementId)` helper stays exported from `desk-roster.tsx` unchanged, and both the card and the ledger row set it as their element `id` — that is what keeps the day's line's `#roster-line-{id}` anchors landing.

- [ ] **Step 1: Write the failing card test**

Create `apps/designer-portal/src/components/document/desk-claim-card.test.tsx`:

```tsx
import { render, within } from '@testing-library/react';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard } from './desk-claim-card';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function card(over: Partial<ClaimCard> = {}): ClaimCard {
  return {
    stage: 'project',
    stageLabel: 'Project',
    custody: 'Your pen',
    band: 0,
    line: {
      engagementId: 'vandersteen',
      name: 'Vandersteen residence',
      stage: 'project',
      designerId: null,
      state: 'Anne Vandersteen · Procurement And Orders',
      overdueText: 'Overdue 6 days — Invoice 1042 · $17,500 overdue',
      mark: 'urgent',
      needKind: 'overdue_invoice',
      overdue: { isOverdue: true, days: 6 },
      jobHref: '/doc/vandersteen',
      act: { label: 'Send reminder', href: '/doc/vandersteen' },
      client: 'Anne Vandersteen',
      custody: 'Your pen',
      needOwner: 'designer',
      dueOn: '2026-08-12',
      valueText: '12 Aug',
      needText: 'Invoice 1042 · $17,500 overdue',
      motionText: null,
      projectId: null,
    },
    ...over,
  };
}

describe('DeskClaimCard — the six registers, in DOM order', () => {
  it('prints stage, custody, name, person · phase, sentence, act — in that order', () => {
    // DOM order IS the screen-reader order, and the registers ARE an order.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const article = container.querySelector('[data-claim-card]')!;
    const registers = Array.from(
      article.querySelectorAll('[data-register]'),
    ).map((el) => el.getAttribute('data-register'));

    expect(registers).toEqual([
      'stage',
      'custody',
      'name',
      'person',
      'sentence',
      'act',
    ]);
  });

  it('carries the custody word beside the mark, and hides the mark', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const custody = container.querySelector('[data-register="custody"]')!;

    expect(custody).toHaveTextContent('Your pen');
    expect(custody.querySelector('[data-roster-mark]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('marks urgent in terracotta-ink and quiet in mocha', () => {
    const { container: hot } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const { container: cool } = render(
      <DeskClaimCard
        card={card({ line: { ...card().line, mark: 'quiet' } })}
        tone="project"
        settle={false}
      />,
    );

    expect(
      hot.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-terracotta-ink)');
    expect(
      cool.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-mocha)');
  });

  it('names the job on the link, and the job on the act’s accessible name', () => {
    // Eleven cards otherwise announce eleven identical "Send reminder"s.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const name = container.querySelector('[data-roster-name]')!;
    const act = container.querySelector('[data-action-key^="roster-"]')!;

    expect(name).toHaveAttribute('href', '/doc/vandersteen');
    expect(name).toHaveTextContent('Vandersteen residence');
    expect(act).toHaveAttribute(
      'aria-label',
      'Send reminder — Vandersteen residence',
    );
  });

  it('prints the overdue clause in terracotta-ink and nothing in a counter', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const sentence = container.querySelector('[data-register="sentence"]')!;

    expect(
      within(sentence as HTMLElement).getByText(/Overdue 6 days/),
    ).toHaveClass('text-[var(--color-terracotta-ink)]');
  });

  it('lands the day’s line’s anchor on the card itself', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('#roster-line-vandersteen')).not.toBeNull();
  });

  it('takes the card edge, the paper face and a 2px radius — and no shadow', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const article = container.querySelector('[data-claim-card]')!;

    expect(article.className).toContain('desk-claim-card');
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
```

- [ ] **Step 2: Write the failing ledger-row test**

Create `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DeskLedgerRow } from './desk-ledger-row';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function line(over: Partial<RosterLine> = {}): RosterLine {
  return {
    engagementId: 'reinhardt',
    name: 'Reinhardt lake house',
    stage: 'discovery',
    designerId: null,
    state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
    overdueText: null,
    mark: null,
    needKind: null,
    overdue: { isOverdue: false, days: 0 },
    jobHref: '/doc/reinhardt',
    act: { label: 'Open the job', href: '/doc/reinhardt' },
    client: 'Reinhardt',
    custody: 'At rest',
    needOwner: null,
    dueOn: null,
    valueText: null,
    needText: null,
    motionText: null,
    projectId: null,
    ...over,
  };
}

describe('DeskLedgerRow — the at-rest row', () => {
  it('prints the five cells in the ledger’s own column order', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const cells = Array.from(
      container.querySelectorAll('[data-ledger-cell]'),
    ).map((el) => el.getAttribute('data-ledger-cell'));

    expect(cells).toEqual(['mark', 'name', 'sentence', 'value', 'act']);
  });

  it('wears the at-rest ring, never a filled mark', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const mark = container.querySelector('[data-roster-mark]')!;

    expect(mark.getAttribute('data-mark-tone')).toBeNull();
    expect(mark.getAttribute('data-mark-color')).toBeNull();
  });

  it('carries the custody word and the person · phase run under the name', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const nameCell = container.querySelector('[data-ledger-cell="name"]')!;

    expect(nameCell).toHaveTextContent('At rest');
    expect(nameCell).toHaveTextContent('Reinhardt lake house');
  });

  it('prints the in-motion sentence where the job has one', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ motionText: 'Two pieces on the way' })}
        tone="discovery"
      />,
    );

    expect(
      container.querySelector('[data-ledger-cell="sentence"]'),
    ).toHaveTextContent('Two pieces on the way');
  });

  it('says nothing needs your hand where it does not', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(
      container.querySelector('[data-ledger-cell="sentence"]'),
    ).toHaveTextContent('Nothing needs your hand.');
  });

  it('renders an empty value cell rather than dropping the column', () => {
    // The column is the grid that makes a ledger a ledger; figures align down
    // the page the moment one carries a value.
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-ledger-cell="value"]')!.textContent).toBe(
      '',
    );
  });

  it('names the job on the act, and writes no shadow anywhere', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(
      container.querySelector('[data-action-key^="roster-"]'),
    ).toHaveAttribute('aria-label', 'Open the job — Reinhardt lake house');
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
    }
  });
});
```

- [ ] **Step 3: Write the failing composition test**

Replace the fixture and add three describes in `apps/designer-portal/src/components/document/desk-roster.test.tsx`. The `roster()` fixture already returns a `DeskRosterModel` with a quiet-marked `byrne` and an urgent `vandersteen`; add a third, unmarked line so the ledger half has something to print. In the `project` group's `lines` array, append:

```tsx
          {
            engagementId: 'reinhardt',
            name: 'Reinhardt lake house',
            stage: 'project',
            designerId: LEAH,
            state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/reinhardt',
            act: { label: 'Open the job', href: '/doc/reinhardt' },
            custody: 'At rest',
            needOwner: null,
          },
```

and bump that group's `count` to `2`, `liveCount` to `3`, and `heading` to `'Every job · 3 live · 1 overdue'`.

Then append:

```tsx
describe('DeskRoster — R143, the Desk in two halves', () => {
  it('cards the two marked jobs and leaves the quiet one a ledger row', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(
      Array.from(container.querySelectorAll('[data-claim-card]')).map((el) =>
        el.getAttribute('data-claim-card'),
      ),
    ).toEqual(['vandersteen', 'byrne']);
    expect(
      Array.from(container.querySelectorAll('[data-ledger-row]')).map((el) =>
        el.getAttribute('data-ledger-row'),
      ),
    ).toEqual(['reinhardt']);
  });

  it('heads the ledger half with its count', () => {
    render(<DeskRoster roster={roster()} />);

    expect(screen.getByText('At rest · 1 job')).toBeInTheDocument();
  });

  it('keeps the desk-folio tour anchor on the first card', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const anchored = container.querySelector('[data-tour-anchor="desk-folio"]')!;

    expect(anchored.getAttribute('data-claim-card')).toBe('vandersteen');
  });

  it('hides the ledger half under Only what needs me', async () => {
    const user = userEvent.setup();
    const { container } = render(<DeskRoster roster={roster()} />);

    await user.click(screen.getByRole('button', { name: 'Only what needs me' }));

    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
  });

  it('regroups both halves by person under By person', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await user.click(screen.getByRole('button', { name: 'By person' }));

    // Leah is the principal: the unassigned Vandersteen card lands with her,
    // as does her own at-rest Reinhardt row; Anneke keeps her Byrne card.
    expect(container.querySelectorAll('[data-person-plate]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(1);
  });
});

describe('DeskRoster — no shadow reaches either half', () => {
  it('writes no shadow utility on any element it prints', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
```

The pre-existing `describe('DeskRoster — no shadow reaches the roster')` block already asserts this; delete it in favour of the block above rather than keeping two.

Also update `desk-roster-settle.test.tsx`: its three fixture lines all carry `mark: null` or a mark — check each. Any line with `mark !== null` now settles as a card (`[data-claim-card]`), any with `mark: null` as a row (`[data-ledger-row]`). Change its `container.querySelectorAll<HTMLElement>('[data-roster-line]')` selector to `'[data-claim-card], [data-ledger-row]'` and leave both `desk-settle` assertions as they are.

- [ ] **Step 4: Run the three suites to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-claim-card.test.tsx \
  src/components/document/desk-ledger-row.test.tsx \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx
```

Expected: the two new suites fail with `Cannot find module './desk-claim-card'` / `'./desk-ledger-row'`; `desk-roster.test.tsx` fails on the missing `[data-claim-card]` elements.

- [ ] **Step 5: Add the structural CSS to `globals.css`**

Values are lifted from the specimen (`three-cards-for-the-desk.html`, `.claim-card` / `.ledger-row` / `.claim-grid` / `.rest-head`) and translated to the portal's token names. Append a block after the existing `.row-wash-score` rules:

```css
/* ── R143 · The Claim card and the at-rest ledger ────────────────────────────
   A card is a treatment for NEED, not a container for a job. Structure lives
   here rather than in arbitrary Tailwind because three of these rules cannot
   be written as utilities: the :has() focus wrap, the 899px collapse (not a
   Tailwind breakpoint), and the forced-colors block. Colour and spacing stay
   on the components as classes. ─────────────────────────────────────────── */

.desk-claims-grid {
  display: grid;
  gap: 24px;
  align-items: start;             /* a quiet card IS shorter, and says so */
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 640px) {
  .desk-claims-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .desk-claims-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.desk-claim-card {
  position: relative;
  background: var(--doc-paper);
  /* D4/R144 — the one boundary grey, 3.21:1 on this face. D4a: cards only. */
  border: 1px solid var(--color-card-edge);
  border-radius: 2px;
  padding: 20px 20px 0;
  overflow: hidden;
}

/* D10 — the link's hit zone is the WHOLE upper block, at least 88px: the
   roster's name link was the Desk's one sub-44px target. The overlay is the
   name link's own ::before, positioned against .desk-claim-upper, so there is
   one accessible name and no nested interactive content. The custody row and
   the person line are raised above it, which keeps their text selectable —
   she copies client names into email. */
.desk-claim-upper { position: relative; min-height: 88px; }
.desk-claim-upper > *:not([data-register='name']) {
  position: relative;
  z-index: 1;
}
.desk-claim-upper [data-roster-name]::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 2px;
}
.desk-claim-sentence,
.desk-claim-band { position: relative; z-index: 2; }
.desk-claim-band {
  margin-top: 16px;
  /* The LIGHTER rule (the specimen's --hairline). --rule-hair is a full
     shorthand value — `1px solid rgba(44,41,38,.10)` — so it is spent whole,
     never as `1px solid var(--rule-hair)`. */
  border-top: var(--rule-hair);
  min-height: 44px;
  display: flex;
  align-items: center;
}
.desk-claim-band .da-act { width: 100%; justify-content: flex-start; }

/* The ring is drawn around the whole zone, so focus REVEALS the click area
   rather than outlining a word inside it. */
@supports selector(:has(*)) {
  .desk-claim-upper:has([data-roster-name]:focus-visible) {
    outline: 2px solid var(--color-clay-ink);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .desk-claim-upper:has([data-roster-name]:focus-visible)
    [data-roster-name]:focus-visible { outline: none; }
  /* .row-wash-score fires on CARD hover, so hovering the act would also light
     the name. Two lit targets is a lie about where the click will land. */
  .desk-claim-card:has(.da-act:hover) .row-wash-score::after {
    background: var(--color-aged-oak);
  }
}

.desk-ledger-row {
  position: relative;
  display: grid;
  grid-template-columns: 24px 320px minmax(0, 1fr) 132px 96px;
  align-items: baseline;
  column-gap: 24px;
  padding: 24px 0;
  border-top: 1px solid var(--doc-ink-border);
  background: transparent;   /* D4a — a row is not a component boundary */
}
.desk-ledger-row [data-ledger-cell='sentence'] { max-width: 44ch; }
.desk-ledger-row [data-ledger-cell='value'],
.desk-ledger-row [data-ledger-cell='act'] { text-align: right; }
.desk-ledger-row [data-ledger-cell='mark'] { align-self: start; margin-top: 9px; }

/* The ledger degrades back into the roster row it came from. */
@media (max-width: 899px) {
  .desk-ledger-row {
    grid-template-columns: 16px minmax(0, 1fr);
    row-gap: 12px;
    column-gap: 12px;
  }
  .desk-ledger-row > *:not(.row-wash) { grid-column: 2; }
  .desk-ledger-row [data-ledger-cell='mark'] { grid-column: 1; }
  .desk-ledger-row [data-ledger-cell='sentence'] { max-width: none; }
  .desk-ledger-row [data-ledger-cell='value'] { text-align: left; }
}

/* F9 — the portal's first forced-colors block. In High Contrast a mark drawn
   as a background on an empty span vanishes entirely, and the wash repaints
   as a solid fill over the words. */
@media (forced-colors: active) {
  [data-roster-mark] {
    forced-color-adjust: none;
    background: transparent !important;
    border: 3.5px solid currentColor;
  }
  .row-wash { display: none; }
  .desk-claim-card, .desk-ledger-row { border-color: CanvasText; }
  .desk-claim-upper:has([data-roster-name]:focus-visible) {
    outline-color: Highlight;
  }
}
```

**The two rule weights, verified in `globals.css`.** `--doc-ink-border: rgba(44, 41, 38, 0.18)` is this portal's stock for the house sheet's `--hairline-strong` (globals.css says so in the `.da-terminal` disabled block) — it carries the ledger row's top rule and the at-rest head's rule, matching the specimen's `.ledger-row` and `.rest-head`. `--rule-hair: 1px solid rgba(44, 41, 38, 0.10)` is the lighter one and is a **full shorthand**, so it is spent as `border-top: var(--rule-hair)` — it carries the card's act band, matching the specimen's `.claim-band`. Do not swap them: the ledger's rule separates rows and the card's separates registers inside one box.

- [ ] **Step 6: Write `desk-claim-card.tsx`**

```tsx
'use client';

/**
 * The Claim card (R143 · D10).
 *
 * A card is a treatment for NEED, not a container for a JOB: it exists only
 * for a job with a claim on the studio's hand, and it earns the box by holding
 * two things a roster row could not — a need sentence that wants two lines,
 * and a name with an honest 44px target.
 *
 * Six registers, fixed order, one type role each. DOM order IS the
 * screen-reader order, so the order below is the design.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';

/** D9 — the INK members. The material pigments read 2.13:1 and 2.64:1 on
 *  paper and failed 1.4.11 as graphical objects. */
const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;

const STAGE_TAB: Record<ClaimCard['stage'], string> = {
  brief: 'bg-[var(--tab-brief)]',
  discovery: 'bg-[var(--tab-discovery)]',
  direction: 'bg-[var(--tab-direction)]',
  proposal: 'bg-[var(--tab-proposal)]',
  project: 'bg-[var(--tab-project)]',
  install: 'bg-[var(--tab-install)]',
  care: 'bg-[var(--tab-install)]',
};

const HEAD_TYPE =
  'font-mono text-[11px] font-medium uppercase tracking-[0.08em]';

export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

export function DeskClaimCard({
  card,
  tone,
  index = 0,
  settle,
  tourAnchor,
}: {
  card: ClaimCard;
  tone: RowWashTone;
  index?: number;
  settle: boolean;
  tourAnchor?: string;
}) {
  const wash = useRowWash();
  const { line } = card;
  // The act's telemetry key carries the job: two jobs sharing a need kind are
  // two acts, not one fired twice.
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;
  // Secondary where the act moves a reminder or opens money; tertiary where it
  // only opens something. Consequence, not emphasis.
  const variant = line.act.ledger ? 'secondary' : 'tertiary';

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-claim-card={line.engagementId}
      data-tour-anchor={tourAnchor}
      className={`desk-claim-card has-wash${settle ? ' desk-settle' : ''}`}
      style={settle ? ({ '--i': index } as CSSProperties) : undefined}
    >
      <RowWash tone={tone} />
      <div className="desk-claim-upper">
        {/* 1 · stage — one word on the plate, never "· 3" on a card.
            2 · custody — whose hand, beside the 7px mark. */}
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span
            data-register="stage"
            className={`inline-flex items-center rounded-[3px] px-2.5 py-[3px] text-white ${HEAD_TYPE} ${STAGE_TAB[card.stage]}`}
          >
            {card.stageLabel}
          </span>
          <span
            data-register="custody"
            className={`inline-flex items-center gap-2 text-[var(--text-subtle)] ${HEAD_TYPE}`}
          >
            <span
              aria-hidden="true"
              data-roster-mark
              data-mark-tone={line.mark ?? undefined}
              data-mark-color={line.mark ? MARK_COLOR[line.mark] : undefined}
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={line.mark ? { backgroundColor: MARK_COLOR[line.mark] } : undefined}
            />
            {card.custody}
          </span>
        </span>
        {/* 3 · name — wraps, never truncates; the whole upper block is its
            hit zone (see .desk-claim-upper in globals.css). */}
        <span data-register="name" className="mt-2 block">
          <Link
            href={line.jobHref}
            data-roster-name
            className="row-wash-score min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] motion-reduce:transition-none"
          >
            {line.name}
          </Link>
        </span>
        {/* 4 · person · phase — no label, no ordinal, no "Client:". */}
        <span
          data-register="person"
          className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
        >
          {line.state}
        </span>
      </div>
      {/* 5 · the one true sentence — the overdue clause in the red letter's
          own ink, and never a growing day count beside a date. */}
      <p
        data-register="sentence"
        className="desk-claim-sentence mt-3 text-[15px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.overdueText ? (
          <span data-roster-overdue className="text-[var(--color-terracotta-ink)]">
            {line.overdueText}
          </span>
        ) : (
          line.needText
        )}
      </p>
      {/* 6 · the one act, never two. */}
      <div data-register="act" className="desk-claim-band">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant={variant}
            onClick={() => openLedger(line.act.ledger!.name, line.act.ledger!.context)}
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant={variant}
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 7: Write `desk-ledger-row.tsx`**

```tsx
'use client';

/**
 * The at-rest ledger row (R143 · D8).
 *
 * The roster row given an internal grid. Its win over the row it replaces is
 * that dates and figures ALIGN down the page across forty rows — the one thing
 * a wrapping row could never do. It takes no card edge (D4a): a row is not a
 * component boundary, and it keeps the hairline it always had.
 */

import Link from 'next/link';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';
import { rosterLineAnchorId } from './desk-claim-card';

const AT_REST_SENTENCE = 'Nothing needs your hand.';

export function DeskLedgerRow({
  line,
  tone,
}: {
  line: RosterLine;
  tone: RowWashTone;
}) {
  const wash = useRowWash();
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-ledger-row={line.engagementId}
      className="desk-ledger-row has-wash"
    >
      <RowWash tone={tone} />
      {/* A job at rest wears a ring, never a filled mark: the two marks are
          two registers, and a third would be a third urgency tier. */}
      <span
        aria-hidden="true"
        data-roster-mark
        data-ledger-cell="mark"
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-[color:var(--text-faint)]"
      />
      <span data-ledger-cell="name" className="min-w-0">
        <span className="block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          {line.custody}
        </span>
        <Link
          href={line.jobHref}
          data-roster-name
          className="row-wash-score mt-1 block min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] motion-reduce:transition-none"
        >
          {line.name}
        </Link>
        <span className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {line.state}
        </span>
      </span>
      <span
        data-ledger-cell="sentence"
        className="min-w-0 text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.motionText ?? AT_REST_SENTENCE}
      </span>
      {/* Tabular figures, right-aligned: the column exists so that the moment
          one row carries a figure, it lines up with every other. */}
      <span
        data-ledger-cell="value"
        className="font-mono text-[15px] leading-[1.5] tracking-[0.02em] tabular-nums text-[var(--text-primary)]"
      >
        {line.valueText ?? ''}
      </span>
      <span data-ledger-cell="act">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            onClick={() => openLedger(line.act.ledger!.name, line.act.ledger!.context)}
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}
```

- [ ] **Step 8: Write `desk-claims.tsx`**

```tsx
'use client';

/**
 * The claims grid (R143 · D3).
 *
 * Three columns at ≥1024, two at 640–1023, one below — the arithmetic is
 * forced: 390 − 48 padding − 48 gutters ÷ 3 is a 98px card, and a Playfair
 * name cannot wrap into it without truncating, which is banned.
 *
 * `align-items: start` (globals.css) is the point: a quiet card is shorter
 * than a loud one and the page has to look like that.
 */

import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard } from './desk-claim-card';
import type { RowWashTone } from './row-wash';

const STAGE_TONE: Record<ClaimCard['stage'], RowWashTone> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'direction',
  proposal: 'proposal',
  project: 'project',
  install: 'install',
  care: 'install',
};

export function DeskClaimsGrid({
  cards,
  settle,
  startIndex = 0,
  firstTourAnchor,
  id,
}: {
  cards: readonly ClaimCard[];
  settle: boolean;
  startIndex?: number;
  firstTourAnchor?: string;
  id?: string;
}) {
  return (
    <ul id={id} className="desk-claims-grid">
      {cards.map((card, position) => (
        <DeskClaimCard
          key={card.line.engagementId}
          card={card}
          // The wash follows the JOB's stage, never its group's: By person
          // regroups the same cards away from their stage.
          tone={STAGE_TONE[card.line.stage]}
          index={startIndex + position}
          settle={settle}
          tourAnchor={position === 0 ? firstTourAnchor : undefined}
        />
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: Rewrite `desk-roster.tsx` to compose the halves**

Keep: the file's `'use client'`, `useSettleOnce`, `DayLineText`, `INLINE_ACT`, `FACET_CLASS`, `FacetAct`, `SectionEyebrow` head row, the `overdueLine` paragraph, the `DocumentActionGroup` wrapper, the `facetEmpty` fallback and the empty-Desk sentence. Remove: `JobLine`, `MARK_COLOR`, `STAGE_TAB`, `STAGE_TONE` and `rosterLineAnchorId` (all now live in `desk-claim-card.tsx` / `desk-claims.tsx`) — re-export the anchor helper so existing importers do not break:

```tsx
export { rosterLineAnchorId } from './desk-claim-card';
```

Update the file's header comment. Find:

```
 * The density rule is the whole design: one line per job, wrapping to two or
 * three; never a card; headings never fold; nothing folded on first paint.
```

Replace with:

```
 * R143 amends the density rule that built this: one line per job in the
 * at-rest ledger; a job with a claim on the studio's hand takes a Claim card.
 * Headings never fold; nothing is folded on first paint; the card is the
 * emphasis granted to a claim, never a container granted to every job.
```

The body becomes:

```tsx
export function DeskRoster({
  roster,
  studioMembers,
}: {
  roster: DeskRosterModel;
  studioMembers?: readonly RosterMember[];
}) {
  const settle = useSettleOnce();
  const [needsMe, setNeedsMe] = useState(false);
  const [byPerson, setByPerson] = useState(false);
  const { data: answeredNotes } = useAnsweredNotes();

  // One derivation for the whole Desk: the day's line, the cards and the
  // ledger are three views of it, so no line can name a job the grid does not
  // print and no count can disagree with what is on the page.
  const claims = useMemo(
    () =>
      deriveDeskClaims({
        roster,
        answeredNotes: answeredNotes ?? [],
        now: new Date(),
      }),
    [roster, answeredNotes],
  );

  const people = useMemo(
    () => deriveRosterPeople(studioMembers ?? []),
    [studioMembers],
  );

  // IA-11 — "Only what needs me" hides the ledger outright: the cards already
  // ARE what needs her, so narrowing them again would be a no-op that looked
  // like a filter.
  const showLedger = !needsMe && claims.ledger.length > 0;
  const cardGroups = byPerson ? groupClaimsByPerson(claims.cards, people) : [];
  const ledgerGroups = byPerson
    ? groupRosterByPerson(claims.ledger, people)
    : claims.ledger;

  const facetEmpty =
    roster.groups.length > 0 &&
    claims.cards.length === 0 &&
    (needsMe || (byPerson && cardGroups.length === 0 && ledgerGroups.length === 0));

  return (
    /* head row + overdueLine + day's line, unchanged from the shipped file
       except that the `more` link's href is now `#${claims.dayLine.more.anchorId}`
       and the day's line reads `claims.dayLine` rather than its own `dayLine`.

       Then, inside the existing <DocumentActionGroup surfaceKey="desk"
       regionKey="every-job">: */
    <>
      {facetEmpty ? (
        <p
          data-tour-anchor="desk-folio"
          data-roster-facet-empty
          className="font-heading text-[15px] italic text-[var(--text-muted)]"
        >
          {NOTHING_NEEDS_YOU}
        </p>
      ) : byPerson ? (
        <>
          {cardGroups.map((group) => (
            <div key={group.key} className="mb-8 last:mb-0">
              <h3
                id={`roster-${group.key}`}
                data-person-plate={group.key}
                className={PERSON_PLATE_CLASS}
              >
                {group.label} · {group.count}
              </h3>
              <DeskClaimsGrid
                cards={group.cards}
                settle={settle}
                firstTourAnchor={
                  group.key === cardGroups[0]?.key ? 'desk-folio' : undefined
                }
                id={group.key === cardGroups[0]?.key ? CLAIMS_ANCHOR_ID : undefined}
              />
            </div>
          ))}
          {showLedger && <LedgerHalf groups={ledgerGroups} heading={claims.restHeading} byPerson />}
        </>
      ) : (
        <>
          <DeskClaimsGrid
            cards={claims.cards}
            settle={settle}
            firstTourAnchor="desk-folio"
            id={CLAIMS_ANCHOR_ID}
          />
          {showLedger && <LedgerHalf groups={ledgerGroups} heading={claims.restHeading} />}
        </>
      )}
    </>
  );
}
```

with one local helper in the same file:

```tsx
const PERSON_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] bg-[var(--doc-rail-stock)] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]';

const STAGE_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white';

const STAGE_TAB: Record<RosterGroup['key'], string> = {
  brief: 'bg-[var(--tab-brief)]',
  discovery: 'bg-[var(--tab-discovery)]',
  direction: 'bg-[var(--tab-direction)]',
  proposal: 'bg-[var(--tab-proposal)]',
  project: 'bg-[var(--tab-project)]',
  install: 'bg-[var(--tab-install)]',
  care: 'bg-[var(--tab-install)]',
};

const STAGE_TONE: Record<RosterGroup['key'], RowWashTone> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'direction',
  proposal: 'proposal',
  project: 'project',
  install: 'install',
  care: 'install',
};

/** The at-rest half. Its head carries the count because a quantity of WORK is
 *  the one count this surface permits — never a quantity of attention. */
function LedgerHalf({
  groups,
  heading,
  byPerson = false,
}: {
  groups: readonly (RosterGroup | RosterPersonGroup)[];
  heading: string;
  byPerson?: boolean;
}) {
  return (
    <div className="mt-12">
      <p className="mb-4 border-t border-[color:var(--doc-ink-border)] pt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
        {heading}
      </p>
      {groups.map((group) => (
        <div key={group.key} className="mb-8 last:mb-0">
          <h3
            id={byPerson ? `roster-${group.key}` : `roster-stage-${group.key}`}
            data-person-plate={byPerson ? group.key : undefined}
            data-stage-tab={byPerson ? undefined : group.key}
            className={
              byPerson
                ? PERSON_PLATE_CLASS
                : `${STAGE_PLATE_CLASS} ${STAGE_TAB[group.key as RosterGroup['key']]}`
            }
          >
            {group.label} · {group.count}
          </h3>
          <ul>
            {group.lines.map((line) => (
              <DeskLedgerRow
                key={line.engagementId}
                line={line}
                tone={STAGE_TONE[line.stage]}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

The DOM order — head row, overdue sentence, day's line, claims grid, at-rest head, ledger — puts the day's line first at every width, which is what the 390px reflow asks for; no width-specific reordering is needed.

- [ ] **Step 10: Run all four component suites to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-claim-card.test.tsx \
  src/components/document/desk-ledger-row.test.tsx \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  'src/app/(document)/desk/page.test.tsx'
```

Expected: all 6 suites pass. `desk-focus-ring.test.ts` now also holds the three new `desk-*.tsx` files.

- [ ] **Step 11: Gate on the type-check and the full unit suite**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci
```

Expected: type-check exits 0. The full suite passes at or above Task 0's recorded baseline count, plus the suites this program added.

- [ ] **Step 12: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/components/document/desk-claim-card.tsx \
  apps/designer-portal/src/components/document/desk-claim-card.test.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.test.tsx \
  apps/designer-portal/src/components/document/desk-claims.tsx \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): the Claim card and the at-rest ledger row" -- \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/components/document/desk-claim-card.tsx \
  apps/designer-portal/src/components/document/desk-claim-card.test.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.test.tsx \
  apps/designer-portal/src/components/document/desk-claims.tsx \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 9 files.

---

## Task 5: The e2e — a claim takes a card, a quiet job takes a row

**Which Playwright config you are in.** `apps/designer-portal/playwright.config.ts`, `testDir: e2e/`, three browser projects. Its `webServer.env` pins `NEXT_PUBLIC_FLAG_OVERRIDES = 'procurement-workspace-pilot:true,the-document-pilot:true'` — that pinned value **beats `.env.local`** and only reaches a server Playwright starts itself. If a `pnpm dev` server is already running without those flags and `reuseExistingServer` picks it up, `/desk` redirects to `/portal` and every assertion below fails mysteriously. Kill any running dev server and let Playwright boot its own.

**Waits.** No `page.waitForTimeout` — the ban is a documented convention here and nothing enforces it (`e2e/.eslintrc.json` is unreachable under ESLint 9, and `eslint.config.mjs` ignores `e2e/**`). Use `expect(...)` web-first assertions with the `COLD` budget the sibling specs already use.

**Fixture.** `seedWorkflowGateFixture()` (`e2e/helpers/workflow-gate-fixture.ts`) is the shared seed both `wp3-screenshots.spec.ts` and the workflow specs use; it returns a `WorkflowGateIds` whose `overdue` entry is a published, past-due gate — that is the seeded job that produces an `overdue_decision` need, and therefore the seeded Claim card. Do not add a second seed; the sibling specs share this one and a teardown here would pull it out from under a suite still running.

**Single-actor and shared-row.** This suite drives the one seeded designer and reads the Desk, which is a per-studio surface. Pin chromium, matching `wp3-screenshots.spec.ts`.

**Files:**
- Create: `apps/designer-portal/e2e/document/desk-claims.spec.ts`
- Modify: `apps/designer-portal/e2e/wp3-screenshots.spec.ts`
- Modify: `apps/designer-portal/e2e/document/action-visibility.spec.ts`
- Verify only: `apps/designer-portal/e2e/document/desk-error-state.spec.ts`

**Interfaces:**
- Consumes: the DOM contract Task 4 produced — `[data-claim-card="<engagementId>"]`, `[data-ledger-row="<engagementId>"]`, `[data-register="act"]`, `[data-tour-anchor="desk-folio"]`, `#desk-claims`, and the `At rest · N jobs` head.
- Produces: no code interfaces. Screenshots land in `docs/design/workflow-alignment/screenshots/wp3/`.

- [ ] **Step 1: Write the new e2e spec**

Create `apps/designer-portal/e2e/document/desk-claims.spec.ts`:

```ts
/**
 * R143 — the Desk in two halves.
 *
 * LOCAL STACK ONLY. Seeds the shared workflow-gate fixture, whose `overdue`
 * gate is the past-due decision that gives the seeded studio exactly one job
 * with a claim on its hand.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';

const COLD = 30_000;

test.describe.configure({ mode: 'serial' });
// Single actor on a shared studio row: the three browser projects would run
// as the same seeded designer and race each other.
test.skip(({ browserName }) => browserName !== 'chromium', 'single seeded actor');

test.beforeAll(() => {
  seedWorkflowGateFixture();
});

test('a job with a claim takes a card; a quiet job takes a ledger row', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster).toBeVisible({ timeout: COLD });

  // At least one card, and the first one is top-left of the grid — D3's whole
  // claim is that position carries the ranking.
  const cards = roster.locator('[data-claim-card]');
  await expect(cards.first()).toBeVisible({ timeout: COLD });
  const rows = roster.locator('[data-ledger-row]');
  await expect(rows.first()).toBeVisible({ timeout: COLD });

  // No job is both.
  const cardIds = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-claim-card')),
  );
  const rowIds = await rows.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-ledger-row')),
  );
  expect(cardIds.filter((id) => rowIds.includes(id))).toEqual([]);

  // Every card carries exactly one act, named for its job.
  const firstAct = cards.first().locator('[data-action-key^="roster-"]');
  await expect(firstAct).toHaveCount(1);
  const label = await firstAct.getAttribute('aria-label');
  expect(label).toMatch(/ — .+$/);

  // The act's 44px floor rides the invisible halo the primitive renders last.
  const halo = firstAct.locator('[data-action-hit]');
  await expect
    .poll(async () => (await halo.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);

  // The upper block is an honest 88px hit zone — the defect the card fixes.
  await expect
    .poll(async () =>
      (await cards.first().locator('.desk-claim-upper').boundingBox())?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(88);

  // The at-rest half announces its count, which is a quantity of WORK.
  await expect(roster.getByText(/^At rest · \d+ jobs?$/)).toBeVisible();

  // Nothing folds on first paint, in either half.
  await expect(roster.locator('[aria-expanded]')).toHaveCount(0);
  await expect(roster.locator('[hidden]')).toHaveCount(0);
});

test('Only what needs me hides the ledger and leaves the cards', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-ledger-row]').first()).toBeVisible({
    timeout: COLD,
  });
  const cardsBefore = await roster.locator('[data-claim-card]').count();

  await roster.getByRole('button', { name: 'Only what needs me' }).click();

  await expect(roster.locator('[data-ledger-row]')).toHaveCount(0);
  await expect(roster.locator('[data-claim-card]')).toHaveCount(cardsBefore);
  // IX18 — the label never changes with state; aria-pressed carries it.
  await expect(
    roster.getByRole('button', { name: 'Only what needs me' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the Desk does not scroll sideways at 390', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-claim-card]').first()).toBeVisible({
    timeout: COLD,
  });

  // One column below 640: three columns at 390 is a 98px card, into which a
  // Playfair name cannot wrap without truncating, and truncation is banned.
  const widths = await roster
    .locator('[data-claim-card]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThan(280);

  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
});
```

- [ ] **Step 2: Run the new spec to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts --project=chromium
```

Expected: 3 passed. If `/desk` redirects to `/portal`, a dev server without the pinned flags was reused — kill it and rerun.

- [ ] **Step 3: Update `wp3-screenshots.spec.ts`**

In the `test('Desk roster — one line per job, and the one aggregate sentence')` block:

(a) Rename the test:

```ts
test('Desk — cards for the claims, lines for the rest', async ({
```

(b) Replace the comment above the `folios` locator. Find:

```ts
    // B2 — the folio grid and The studio today are one roster now. The first
    // job line still carries the `desk-folio` tour anchor, so the walkthrough's
    // fourth stop lands where it always did.
```

Replace with:

```ts
    // R143 — the roster is two halves now. The first CLAIM CARD carries the
    // `desk-folio` tour anchor, so the walkthrough's fourth stop lands where
    // it always did.
```

(c) Replace the density-rule block. Find:

```ts
    // The density rule is the whole design: one line per job, never a card,
    // and nothing folded on first paint — no line hides behind a disclosure.
    const lines = roster.locator('[data-roster-line]');
    await expect(lines.first()).toBeVisible({ timeout: 30_000 });
```

Replace with:

```ts
    // R143's amended density rule: one line per job in the at-rest ledger, a
    // card for a job with a claim on the studio's hand — and nothing folded on
    // first paint in either half.
    await expect(roster.locator('[data-claim-card]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(roster.locator('[data-ledger-row]').first()).toBeVisible({
      timeout: 30_000,
    });
```

(d) Add the two program shots after the existing `desk-roster-${name}.png` screenshot, inside the same loop:

```ts
    await page.locator('#desk-claims').scrollIntoViewIfNeeded();
    await page.locator('#desk-claims').screenshot({
      path: `${SHOT_DIR}/desk-claims-${name}.png`,
    });
```

The loop's two viewports are `DESKTOP` (1512×1000) and `MOBILE` (390×844); add a third entry `['wide', { width: 1440, height: 1000 }]` to the `for (const [name, viewport] of [...])` array so the 1440 reading the program asks for is captured.

(e) Verify no `never a card` string remains anywhere:

```bash
grep -rn "never a card" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal
```

Expected: no output. (Task 4 already replaced the one in `desk-roster.tsx`.)

- [ ] **Step 4: Update `action-visibility.spec.ts`**

In `test('desktop surfaces expose one legible primary per region')`, find:

```ts
    // One line per job, under a stage heading, and every line carries its own
    // act at a real 44px target.
    await expect(roster.locator('h3').first()).toBeVisible({ timeout: COLD });
    const firstLine = roster.locator('[data-roster-line]').first();
    await expect(firstLine).toBeVisible({ timeout: COLD });
    const rosterAction = firstLine.locator('[data-action-key^="roster-"]');
```

Replace with:

```ts
    // R143 — a card for a claim, a line for the rest. Both halves carry the
    // same one act per job at a real 44px target, and the region still elects
    // no leader.
    const firstCard = roster.locator('[data-claim-card]').first();
    await expect(firstCard).toBeVisible({ timeout: COLD });
    const rosterAction = firstCard.locator('[data-action-key^="roster-"]');
```

Then, immediately after the existing `await expectMinTarget(rosterAction);`, add:

```ts
    // The at-rest half's act is the same instrument at the same floor.
    const firstRow = roster.locator('[data-ledger-row]').first();
    await expect(firstRow).toBeVisible({ timeout: COLD });
    const ledgerAction = firstRow.locator('[data-action-key^="roster-"]');
    await expect(ledgerAction).toHaveCount(1, { timeout: COLD });
    await expect(ledgerAction).toContainText(ROSTER_ACTION, { timeout: COLD });
    await expectMinTarget(ledgerAction);
```

Around line 249 the same file has a second `[data-roster-line]` reference inside a comment about the roster's lines only existing after React runs; change that locator to `'[data-claim-card], [data-ledger-row]'` and leave the comment.

Check for any remaining `[data-roster-line]` in the e2e tree:

```bash
grep -rn "data-roster-line" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/e2e
```

Expected after the edits: the only remaining hit is `action-visibility.spec.ts`'s `test.fixme` block around line 291 that measures roster line boxes at 390 — that fixme's owner note reads *"Un-fixme when: the roster line fits its own content box at 390"*. Retarget its locator to `'[data-claim-card], [data-ledger-row]'` and leave the fixme in place; the new spec's own 390 assertion is what proves the reflow, and un-fixme-ing someone else's deferred item is out of scope.

- [ ] **Step 5: Verify `desk-error-state.spec.ts` needs no change**

Its assertions are on `getByTestId('desk-roster')`, `getByRole('heading', { name: /Every job/ })` and `[data-roster-line]`. The first two survive untouched. Run it:

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-error-state.spec.ts --project=chromium
```

If it passes, change nothing and say so. If it fails on its `[data-roster-line]` locator, retarget that one locator to `'[data-claim-card], [data-ledger-row]'` and rerun.

- [ ] **Step 6: Run the three touched e2e specs together**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts \
  e2e/document/action-visibility.spec.ts \
  e2e/document/desk-error-state.spec.ts \
  e2e/wp3-screenshots.spec.ts \
  --project=chromium
```

Expected: all pass; the shots exist under `docs/design/workflow-alignment/screenshots/wp3/` (`desk-claims-desktop.png`, `desk-claims-wide.png`, `desk-claims-mobile.png`).

- [ ] **Step 7: Compress the new screenshots before staging**

Docs history already carries 138 MB of PNGs.

```bash
sips -Z 1600 \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/docs/design/workflow-alignment/screenshots/wp3/desk-claims-*.png \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/docs/design/workflow-alignment/screenshots/wp3/desk-roster-*.png \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/docs/design/workflow-alignment/screenshots/wp3/desk-folio-*.png
```

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards status --short
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/e2e/document/desk-claims.spec.ts \
  apps/designer-portal/e2e/document/action-visibility.spec.ts \
  apps/designer-portal/e2e/wp3-screenshots.spec.ts \
  docs/design/workflow-alignment/screenshots/wp3
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "test(desk): e2e — a claim takes a card, a quiet job takes a row" -- \
  apps/designer-portal/e2e/document/desk-claims.spec.ts \
  apps/designer-portal/e2e/document/action-visibility.spec.ts \
  apps/designer-portal/e2e/wp3-screenshots.spec.ts \
  docs/design/workflow-alignment/screenshots/wp3
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Add `apps/designer-portal/e2e/document/desk-error-state.spec.ts` to both lists only if Step 5 required a change. Run `git status --short` first and confirm nothing unexpected is staged — **never `git add -A`**.

---

## Task 6: The full gate, the merge, the deploy, and the ship report

**Deploy authorization.** Kody authorized this deploy in advance, as ruling **D11** — *"Build, verify, ship to prod (rec); then Kody's signed-in walk."* The full chain (portals → verify) is authorized without per-step re-asking. **Do not stop to ask.** This program touches no migrations, no edge functions and no services, so the chain is one portal deploy.

**Files:**
- Create: `artifacts/desk-cards-2026-09-09/ship/report.md`

**Interfaces:**
- Consumes: everything Tasks 1–5 produced.
- Produces: `desk-cards/build` merged to `main` and pushed; the designer portal live on Cloudflare Workers; the ship report.

- [ ] **Step 1: Run the full designer-portal gate**

Per the verification matrix: `type-check` is the real type gate here (the build sets `ignoreBuildErrors: true` and proves nothing about types); `lint` is meaningful because `apps/designer-portal/eslint.config.mjs` is the one working flat ESLint config in the repo.

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal lint
```

Expected:
- `type-check`: exits 0, no output.
- `test`: green, at or above Task 0's recorded baseline plus this program's new suites.
- `lint`: the **same two pre-existing errors** recorded in I150 — `piece-room-save-gate.test.tsx:159:1` (`import/first`) and `use-commercial-documents.test.ts:930:8` (`react-hooks/rules-of-hooks`) — and no others. Neither file is touched by this program. **A third error is a regression; fix it before going further.**

- [ ] **Step 2: Run the Desk e2e set once more against a clean server**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts \
  e2e/document/action-visibility.spec.ts \
  e2e/document/desk-error-state.spec.ts \
  e2e/document/desk-walkthrough.spec.ts \
  --project=chromium
```

`desk-walkthrough.spec.ts` is included because the walkthrough's fourth stop anchors on `[data-tour-anchor="desk-folio"]`, which Task 4 moved onto the first Claim card.

Expected: all pass. Record what was **not** covered: firefox and webkit were not run (chromium only, locally).

- [ ] **Step 3: Reconcile against `origin/main` and merge**

Another program may have landed while this one built.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards fetch origin main
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  log --oneline origin/main -1
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor origin/main HEAD && echo UP-TO-DATE || echo BEHIND
```

If `BEHIND`, rebase or merge `origin/main` into `desk-cards/build` in the worktree and re-run Step 1 before proceeding. This program mints **no** migration, so there is no migration number to reconcile.

Then push the branch and merge:

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards push origin desk-cards/build
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  push origin desk-cards/build:main
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor desk-cards/build origin/main && echo MERGED || echo NOT-MERGED
```

Expected: `MERGED`. Paste that output — never claim a merge from memory or from the branch's existence.

If `push origin desk-cards/build:main` is rejected as non-fast-forward, `origin/main` moved between Step 3's fetch and the push; refetch, merge, re-run Step 1, and retry.

- [ ] **Step 4: Deploy the designer portal**

`./infra/deploy-portal.sh` is the **only** correct portal deploy path. Never `opennextjs-cloudflare build` or `wrangler deploy` from an app dir: the script's phase 1 rebuilds workspace-package dists first, and skipping it is how `TypeError: proposalTierVisibility is not a function` shipped to production from a stale `@patina/utils` dist.

Deploy from a checkout that is on the merged `main`. Refresh the shared checkout first — it is 88 commits stale — and confirm it is clean of tracked modifications before using it; if it is not, deploy from the worktree instead, which is now identical to `main`.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  rev-parse HEAD
bash /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/infra/deploy-portal.sh designer
```

Expected: the script ends with `==> Done: designer portal deployed.` Record the HEAD sha and the deploy start time — both go in the report.

- [ ] **Step 5: Verify the deploy landed**

The deployments list is **oldest-first** — read the **bottom** row. `/api/version` is not a freshness signal on the Workers path (it returns static defaults, since neither `deploy-portal.sh` nor `wrangler.jsonc` sets `APP_VERSION`/`BUILD_SHA`); it proves liveness only.

```bash
npx wrangler deployments list --name patina-designer-portal
```

Expected: the bottom row's timestamp is newer than the Step 4 start time.

Then the behaviour probes:

```bash
# (a) Liveness.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://patina-designer-portal.kody-be3.workers.dev/api/version

# (b) The gate holds: a signed-out fetch of /desk does not serve the Desk.
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  https://patina-designer-portal.kody-be3.workers.dev/desk

# (c) The served bundle actually contains the new code. This is the
#     deploy-placeholder lesson: a portal can deploy and still serve a stale
#     chunk, and the only proof is grepping the chunk that ships.
curl -s https://patina-designer-portal.kody-be3.workers.dev/desk \
  | grep -oE '/_next/static/chunks/[a-zA-Z0-9_.-]+\.js' | sort -u > /tmp/desk-chunks.txt
while read -r chunk; do
  if curl -s "https://patina-designer-portal.kody-be3.workers.dev${chunk}" \
     | grep -q 'desk-claim-card'; then
    echo "FOUND desk-claim-card in ${chunk}"
  fi
done < /tmp/desk-chunks.txt
```

Expected: (a) `200`; (b) a 3xx to `/auth/...` or a 200 that is not the Desk — record whichever it is; (c) at least one `FOUND desk-claim-card in …` line. If (c) finds nothing, the deploy shipped a stale bundle — rerun `deploy-portal.sh designer` and re-probe before writing the report.

```bash
npx wrangler tail patina-designer-portal
```

Watch for ~60 seconds; expected: no new error spike.

- [ ] **Step 6: Write the ship report**

Create `artifacts/desk-cards-2026-09-09/ship/report.md`. It must contain, with real values and no paraphrase:

```markdown
# Desk Claim Cards — ship report (2026-09-09)

**What shipped.** R143 — the Desk is two halves: a Claim card for a job with a
claim on the studio's hand, an at-rest ledger row for the rest. R144 — one new
token, `--color-card-edge` / `--card-edge` #8F8C88, Claim cards only. D9's two
a11y fixes: the roster mark takes terracotta-ink and mocha; the Desk's focus
rings take clay-ink.

**Rulings delivered.** D1, D2, D3, D4, D4a, D5, D6, D7, D8, D9, D10, D11, R5.

**Commits.** <sha> fix(desk): … · <sha> docs(design): … · <sha> feat(desk): custody … ·
<sha> feat(desk): the Claim card … · <sha> test(desk): e2e … ; merged to main at <sha>.

**Gates run, and their real output.**
- `pnpm --filter @patina/designer-portal type-check` — <verbatim result>
- `pnpm --filter @patina/designer-portal test -- --ci` — <n suites / n tests>
- `pnpm --filter @patina/designer-portal lint` — <the two pre-existing errors, named>
- `pnpm --filter @patina/designer-portal test:e2e -- <specs> --project=chromium` — <n passed>

**Deploy.** `./infra/deploy-portal.sh designer`, from main at <sha>, started <time>.
`wrangler deployments list --name patina-designer-portal` bottom row: <id> <timestamp>.

**Behaviour probes.**
- `/api/version` → <code> (liveness only; version strings are static defaults on
  the Workers path and prove nothing about freshness).
- signed-out `/desk` → <code> <redirect>.
- served chunk grep → `FOUND desk-claim-card in <chunk>`.
- `wrangler tail` for 60s → <observed>.

**Not verified.** <firefox and webkit e2e projects not run; the signed-in walk is
Kody's, per D11; the 45-job density claim was not exercised against a seeded
45-job studio; other portal surfaces still carry `--color-clay` focus rings and
were deliberately left out of scope — list the files.>

**Owed to Kody.** The signed-in prod walk of /desk at 1440 and 390 (D11).
```

- [ ] **Step 7: Commit and push the report**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  artifacts/desk-cards-2026-09-09/ship/report.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "docs(desk): ship report — Claim cards live on app.patina.cloud" -- \
  artifacts/desk-cards-2026-09-09/ship/report.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  push origin desk-cards/build:main
```

- [ ] **Step 8: Retire the worktree**

Mandatory, not optional — a 2026-07-29 sweep found 185 accumulated worktrees consuming tens of GB.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor desk-cards/build origin/main && echo MERGED || echo NOT-MERGED
git -C /Users/kody/Code/patina-merged worktree remove /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards
git -C /Users/kody/Code/patina-merged branch -d desk-cards/build
git -C /Users/kody/Code/patina-merged worktree list
```

Remove only after `MERGED`. If `git worktree remove` reports the worktree is `locked`, run `git -C /Users/kody/Code/patina-merged worktree unlock <path>` first.

---

## Self-review

**Spec coverage — rulings D1–D11 + R5, each to a task.**

| Ruling | Where it lands |
|---|---|
| D1 Hybrid: cards on top, ledger rows beneath | T3 (`deriveDeskClaims`), T4 (`DeskClaimsGrid` + `LedgerHalf`) |
| D2 Replace, one rendering; no switcher; facets stay | T4 Step 9 (`showLedger`, `groupClaimsByPerson` + `groupRosterByPerson`), T3 facet tests |
| D3 Rank by need, bands, oldest-first, tie on name, reason printed | T3 Step 3 + `claimBand`; T4 the sentence register |
| D4 One boundary grey ~#8F8C88 | T2 |
| D4a Claim cards only; ledger keeps the hairline | T2 (R144 text), T4 Step 5 (`.desk-ledger-row { background: transparent }`, no edge) |
| D5 `mark !== null` earns a card | T3 Step 3, T4 composition test, T5 e2e |
| D6 Ten unowned kinds default to designer; custody word in code | T3 Steps 1, 2, 6, 8 |
| D7 Day's line quotes the top three cards + the answered note | T3 Steps 4, 9 |
| D8 At-rest ledger under the seven stage plates; the six columns | T3 (`ledger` grouping), T4 (`DeskLedgerRow` + `LedgerHalf`) |
| D9 Mark → ink pigments; focus ring → clay-ink; own commit, first | T1 |
| D10 88px upper block, act a full-width 44px band | T4 Steps 5, 6; T5 e2e measures both |
| D11 Build, verify, ship to prod | T6, with the authorization stated |
| R5 Amend the two rules in writing, wave 1 | T2 Step 6 (R143, R144) |

Also placed: the 390 reflow (T4 grid + T5's 390 test), forced-colors (T4 Step 5, closing critic F9), the `.row-wash` reuse and the two-lit-targets suppression (T4 Step 5), `.da-pool` act press (inherited unchanged from `DocumentAction`), reduced motion (globals.css's existing `prefers-reduced-motion` block covers `.row-wash` and `.row-wash-score`; the card and row add no new transition).

**Spec items I could not place in a task, stated rather than smuggled:**
1. **D9's wider reading.** The ruling says "portal focus ring `--color-clay` → clay-ink"; the brief scopes it to `desk-roster.tsx`'s two sites. Six other portal files still spend `--color-clay` as a focus ring (`(document)/doc/[id]/page.tsx`, three `scope-builder` components, `.da-glyph-btn` in `globals.css`). Task 1 fixes the Desk's two and the source-scan test holds the Desk's files only; the rest are named in the ship report's "not verified" section as a known, unfixed defect.
2. **The 45-job density claim.** The proposal argues ~6 cards over 39 rows at 45 jobs. The local seed has no 45-job studio and this program adds no fixture for one; T5's e2e proves the split and the reflow, not the density at scale. Named in the ship report.
3. **The ledger's value column is empty in production today.** D5 sends every job carrying a need to a card, so a ledger row has no `dueOn` and no money. The column is built and tested (T4 Step 2's `renders an empty value cell` test) and documented as such on `RosterLine.valueText`. If Kody wants a figure there, that is a ruling, not a lane's edit.
4. **`folder-card.tsx` and `desk-folio-preview.test.tsx`** stay in place, orphaned, per the brief. Not in scope.

**Placeholder scan:** no `TBD`, no "similar to Task N", no "add appropriate error handling", no "write tests for the above". Every test step carries its assertions; every implementation step carries the code or the exact old→new strings. The one deliberately abbreviated block is Task 4 Step 9's `DeskRoster` body, which states in prose exactly which shipped regions are kept verbatim (head row, overdue paragraph, day's line, `DocumentActionGroup`, empty states) and gives the full code for everything that changes — reprinting 120 unchanged lines would invite a diff nobody reads.

**Type consistency, checked across tasks:** `custodyWord(need, row)`, `ClaimCard`, `ClaimBand`, `ClaimPersonGroup`, `DeskClaims`, `DeskClaimsInput`, `deriveDeskClaims`, `groupClaimsByPerson`, `CLAIMS_ANCHOR_ID`, `MAX_DAY_LINES` and the four new `RosterLine` fields (`custody`, `needOwner`, `valueText`, `motionText`) are declared once in Task 3's Interfaces block and used with those exact names and types in Tasks 4 and 5. `DeskDayLine.more` is `{ count, anchorId }` in both its declaration (T3) and its consumer (T4 Step 9). The components are `DeskClaimCard` / `DeskLedgerRow` / `DeskClaimsGrid` everywhere, deliberately distinct from the same-named types. The DOM contract — `[data-claim-card]`, `[data-ledger-row]`, `[data-register]`, `[data-ledger-cell]`, `#desk-claims` — is produced in T4 and consumed with identical spellings in T4's tests and T5's specs.
