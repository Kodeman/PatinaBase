# Designer-Portal Onboarding & Learning Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the onboarding and learning experience ruled on 2026-09-03 so a studio owner and her first hire can learn the designer portal from inside it — the help panel answers, the tour ends in an act, the checklist tracks arrival, shortcuts and vocabulary have a home, and the drip fires on state.

**Architecture:** Every change extends an existing surface (`registry.tsx` blurbs, `MarginNote`, the Desk walkthrough, the setup checklist, `ContextualHelpPanel`, `DocSheet`, the ⌘K palette, Sanity `helpContent`). Three waves: W1 unflagged product fixes + reference content; W2 the flag-gated teammate persona; W3 drip retiming + rulings + video schema. Each wave: parallel lanes in their own worktrees → adversarial review → integration branch → gates → merge to main → deploy chain.

**Tech Stack:** Next.js 15 App Router, React 19, TS, Tailwind, TanStack Query, `@patina/help-system` (vitest), designer-portal (jest), Supabase migrations (hand-numbered), Deno edge functions, Sanity CMS (`kv3qrinl`), PostHog flags, Cloudflare Workers via `infra/deploy-portal.sh`.

**Spec:** `artifacts/designer-onboarding-learning-2026-09-03/synthesis/proposal.md` (the design) + `synthesis/decisions.md` (Kody's 14 rulings, 2026-09-03). Briefing facts: `artifacts/designer-onboarding-learning-2026-09-03/briefing/`.

## Global Constraints

- Copy never contains "AI"; the engine is "Designer-Taught Intelligence"; no exclamation marks; Playfair-italic teaching prose, DM Mono structure (brand voice + typography lock).
- Zero `box-shadow` (D4); no badges, red/green status, progress bars, dashboards, tab bars in Document UI (D8/R15). Strata Mark is the only progress device.
- D1 strict focus: no teaching step enters `/doc/[id]`; a tour may open a Verb sheet **over** `/desk` only (decision 1).
- R94 amended (decision 5): a `MarginNote` appears once per person per key version; version suffix `@N` re-arms exactly once.
- R96 amended (decision 12): ledgers/sheets may page; documents may not.
- One content source: any room/ledger/verb definition renders `registry.tsx` `help.blurb` — never retyped.
- No PostHog flag for any W1 item (R125); exactly one flag, `onboarding-teammate-persona`, for W2 (decision 6).
- Migrations: hand-numbered `NNNNN_slug.sql`, next free number re-checked against `main` tip immediately before merge (head today: `00558`). Never `supabase migration new`.
- Git: each lane in its own worktree `.codex/worktrees/agent-onb-<lane>` on branch `onboarding/<wave>-<lane>`; pathspec-restricted commits; never `git add -A`; never git in the shared main checkout while the peer First Flight session is active (its `agent-ff-w1-*` worktrees are live).
- Commands use absolute paths from the repo root; never chain `cd`. Prefer `pnpm --filter <pkg> <script>`.
- Gates (patina-verification): designer-portal `pnpm --filter @patina/designer-portal type-check && pnpm --filter @patina/designer-portal test`; help-system `pnpm --filter @patina/help-system type-check && pnpm --filter @patina/help-system test`; migrations `supabase db reset` on the local stack (single owner per wave — the integration steward); edge functions `deno check`.
- Prod deploy only from the main checkout on `main`, via `./infra/deploy-portal.sh designer-portal` (exports wrangler vars first — designer `.env.local` points at local Supabase), `supabase db push`, `supabase functions deploy <name>`; verify with `npx wrangler deployments list` (bottom row) + behaviour probes.

---

## Team (Fable orchestrates; never executes)

| Role | Model | Count | Owns |
|---|---|---|---|
| Lane implementers | Sonnet (Opus for L1 registry/panel and L5 overlay) | 1 per lane | Their worktree + pathspec list; TDD; commits |
| Adversarial reviewers | Sonnet | 1 per lane, fresh context | Findings with severity + confidence, no filter; also grep-verify every copy string against constraints |
| Fixers | same tier as implementer | as needed | Address review findings in the lane worktree |
| Integration steward | Sonnet (unsandboxed for db reset/dev server) | 1 per wave | `onboarding/<wave>-integration` worktree; owns local `supabase db reset` and port 3000; merges lanes; runs all gates; Playwright walk |
| Content drafters | Sonnet | 2 in parallel | 20 Wave-1 articles + 8 glossary entries + "The keys" as markdown for Kody's batch approval; loader script |
| Deploy steward | Sonnet (unsandboxed) | 1 | Merge to main (coordinated), migrations push, functions deploy, portal deploy, verification probes |
| Fact checker | Haiku | 1 per wave | Every path/route/event named in the wave's PR description exists |

Worktree bootstrap for every lane: `git worktree add /Users/kody/Code/patina-merged/.codex/worktrees/agent-onb-<lane> -b onboarding/<wave>-<lane> main` then `pnpm install` and `pnpm turbo build --filter=@patina/help-system --filter=@patina/supabase --filter=@patina/types` in that worktree before any type-check.

---

# Wave 1 — unflagged product fixes (lanes L1–L6 in parallel)

### Task L1: The help panel answers on the Desk and in the Document

**Files:**
- Modify: `apps/designer-portal/src/lib/document/registry.tsx` (after `BOARDS_SURFACE`, ~line 404–428; and the `DOCUMENT_SCOPED_SURFACES` block ~429–434 stays unchanged)
- Modify: `apps/designer-portal/src/components/document/help/document-help.tsx:129–146` (introBlurb) and the `footer` prop (~line 150)
- Create: `apps/designer-portal/src/components/document/help/panel-keys-block.tsx`
- Test: `apps/designer-portal/src/components/document/help/document-help.test.tsx` (create), `apps/designer-portal/src/lib/document/registry.test.ts` (create or extend)

**Interfaces:**
- Produces: `export const HOST_SURFACES: StudioSurface[]` in `registry.tsx` — two entries, `kind: 'host'` (add `'host'` to `StudioSurfaceKind`), keys `desk-host` (`help.surfaceKey: 'designer-portal/document/desk'`, blurb "Every live job, one line each — the quiet ones are in motion.") and `doc-host` (`help.surfaceKey: 'designer-portal/document/doc'`, blurb "One client, one paper — Brief through Care. The rail says where it stands."). `scope: 'global'`, `aliases: []`, no `shortcut`, no `weight`. NOT spread into `ALL_STUDIO_SURFACES` (so no Drawer/⌘K doorway is minted) and NOT into `DOCUMENT_SCOPED_SURFACES`.
- Produces: `export function resolveIntroBlurb(surfaceKey: string): string | null` in `registry.tsx` — candidates = `[...ALL_STUDIO_SURFACES.filter(s => s.kind !== 'verb'), ...DOCUMENT_SCOPED_SURFACES, ...HOST_SURFACES]`, ancestor-or-equal match, longest key wins. `document-help.tsx` calls it instead of its inline `useMemo` filter.
- Produces: `export function shortcutsForSurface(surfaceKey: string): { label: string; keys: string[] }[]` in `registry.tsx` — every surface (all three lists) whose `help.surfaceKey` equals or is an ancestor of the given key and has a `shortcut`, mapped to `{label, keys: ['G', s.shortcut[0].toUpperCase()]}`; plus the universal `{label: 'Find anything', keys: ['⌘','K']}` first.
- Produces: `<PanelKeysBlock surfaceKey={key} />` — renders a DM Mono "KEYS" eyebrow, the rows from `shortcutsForSurface`, and two links: "The words" → `/help/topic/concept` and "The keys" → `/help/article/the-keys` (route from L5). Renders nothing but the two links when no shortcuts resolve.

- [ ] **Step 1: Write the failing tests**

```ts
// registry.test.ts
import { resolveIntroBlurb, shortcutsForSurface, HOST_SURFACES, ALL_STUDIO_SURFACES } from './registry';
describe('resolveIntroBlurb', () => {
  it('answers on the Desk', () => {
    expect(resolveIntroBlurb('designer-portal/document/desk')).toMatch(/Every live job/);
  });
  it('answers inside a Document', () => {
    expect(resolveIntroBlurb('designer-portal/document/doc')).toMatch(/One client, one paper/);
  });
  it('still frames a sub-page with its ledger (orders/receiving → Orders)', () => {
    expect(resolveIntroBlurb('designer-portal/document/orders/receiving')).toBe(
      ALL_STUDIO_SURFACES.find((s) => s.key === 'orders')!.help!.blurb,
    );
  });
  it('never mints a doorway for a host surface', () => {
    for (const h of HOST_SURFACES) expect(ALL_STUDIO_SURFACES).not.toContain(h);
  });
});
describe('shortcutsForSurface', () => {
  it('prints ⌘K first and G·O for Orders', () => {
    const rows = shortcutsForSurface('designer-portal/document/orders');
    expect(rows[0]).toEqual({ label: 'Find anything', keys: ['⌘', 'K'] });
    expect(rows).toContainEqual({ label: 'Orders', keys: ['G', 'O'] });
  });
});
```

```tsx
// document-help.test.tsx — render DocumentHelpProvider scoped to the desk key with the panel open;
// assert screen.getByText(/Every live job/) and screen.getByText('KEYS') and getByRole('link', {name: /The keys/}).
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @patina/designer-portal test -- registry.test document-help.test` → FAIL (exports missing).
- [ ] **Step 3: Implement** `HOST_SURFACES`, `resolveIntroBlurb`, `shortcutsForSurface` in `registry.tsx`; replace the `useMemo` body in `document-help.tsx` with `resolveIntroBlurb(key)`; add `<PanelKeysBlock surfaceKey={key} />` above `<BrowseAllHelpLink />` in the panel `footer`. Keep the existing comment block explaining verb exclusion; add one line: "Host surfaces (Desk, Document) exist only to answer the panel — they are not doorways."
- [ ] **Step 4: Run tests → PASS**; `pnpm --filter @patina/designer-portal type-check`.
- [ ] **Step 5: Commit** `feat(help): host surfaces answer the panel on desk and document; keys block in panel footer` with explicit pathspecs.

### Task L2: The walkthrough — anchor fix, "Show me later", and a last step that acts

**Files:**
- Modify: `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx` (STEPS step 1 + step 6; modal handlers; `TourController onComplete`)
- Modify: `apps/designer-portal/src/components/document/help/desk-walkthrough-gate.ts:62–66` and the offer rule
- Modify: `apps/designer-portal/src/app/(document)/desk/page.tsx:335–360` (offer note gating)
- Modify: `packages/help-system/src/proactive/WelcomeModal/WelcomeModal.tsx` (add optional `tertiaryLabel`/`onLater` props) + its vitest
- Test: `desk-walkthrough-gate.test.ts` (extend), `desk-walkthrough.test.tsx` (create)

**Interfaces:**
- Consumes: `openCaptureLead()` from `apps/designer-portal/src/components/document/command-bar.tsx` (already exported); `DeskWalkthroughTourState` `{completed?, abandoned?, atStep?, later?}`.
- Produces: tour state gains `later?: boolean`. `tourResolved(state)` = `completed || abandoned`; **`later` does not resolve**. `shouldOfferDeskWalkthrough` returns true for `later === true` regardless of ship date (one re-offer); after the offer note is dismissed or the tour starts, `later` clears.
- Produces: `WelcomeModal` optional props `onLater?: () => void; laterLabel?: string` rendering a third, quiet text action between primary and skip.

- [ ] **Step 1: Failing tests**

```ts
// desk-walkthrough-gate.test.ts additions
it('a "later" tour is not resolved and offers once', () => {
  expect(shouldAutoOpenDeskWalkthrough({ createdAt: NEW, state: { later: true, atStep: 0 } })).toBe(false);
  expect(shouldOfferDeskWalkthrough({ createdAt: NEW, state: { later: true, atStep: 0 } })).toBe(true);
});
it('a later tour never auto-modals again', () => { /* same input → auto false */ });
```
```tsx
// desk-walkthrough.test.tsx — mock command-bar's openCaptureLead; render with the tour at step 6;
// click the CTA "To work"; expect openCaptureLead toHaveBeenCalledTimes(1) and tour completed.
// Also: step 1 anchor — assert STEPS[0].anchorSelector === '[data-tour-anchor="desk-greeting"]' and desk/page.tsx renders that attribute on the greeting header.
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** (a) In `desk/page.tsx` add `data-tour-anchor="desk-greeting"` to the "Good morning" header element and point STEPS[0] at it with `side: 'bottom'` and `beforeShow: scrollAnchorIntoView`. (b) Modal: `onLater={() => setTourState(DESK_WALKTHROUGH_TOUR_ID, { later: true, atStep: 0 })}` with `laterLabel="Show me later"`; a bare dismiss (`onOpenChange(false)`) now maps to `onLater`, not decline; "Skip for now" stays `abandoned`. (c) Step 6: change `ctaLabel` to "Capture a lead" and in `handleComplete` call `openCaptureLead()` **after** marking completion (and only when the completing step is 6, not on replay-from-help without a CTA). (d) Gate: add `later` handling per Interfaces; offer note in `desk/page.tsx` clears `later` on dismiss/start.
- [ ] **Step 4: Run tests → PASS**; `pnpm --filter @patina/help-system test`; type-check both packages.
- [ ] **Step 5: Commit** `feat(walkthrough): show-me-later state, anchored first step, last step opens the lead sheet`.

### Task L3: The checklist tracks arrival

**Files:**
- Create: `supabase/migrations/00559_first_document_opened.sql` (renumber at merge if `main` moved)
- Modify: `apps/designer-portal/src/lib/document/studio-setup.ts` (+ its test), `apps/designer-portal/src/app/(document)/desk/page.tsx:91`, `apps/designer-portal/src/components/document/account/account-studio-page.tsx:221`, `apps/designer-portal/src/components/document/account/studio-setup-checklist.tsx` (new row copy)
- Modify: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (fire the RPC once)
- Modify: `packages/supabase/src/...` add hook `useMarkFirstDocumentOpened()` next to the existing studio-members hook (find via `grep -rn "organization_members" packages/supabase/src/hooks`)
- Test: `studio-setup.test.ts` (extend); SQL test under `supabase/tests/` if the folder exists (grep `pgtap`).

**Interfaces:**
- Migration: `ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS first_document_opened_at timestamptz;` + `CREATE OR REPLACE FUNCTION public.mark_first_document_opened() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ UPDATE public.organization_members SET first_document_opened_at = now() WHERE user_id = auth.uid() AND status = 'active' AND first_document_opened_at IS NULL; $$;` + `REVOKE ALL ON FUNCTION public.mark_first_document_opened() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.mark_first_document_opened() TO authenticated;` (prod auto-grants anon EXECUTE — the REVOKE is load-bearing).
- `studio-setup.ts` input gains `activeMemberCountBeyondSelf: number` and `hiresWithFirstDocument: number`; rules: `'crew-invited': input.activeMemberCountBeyondSelf > 0` (renamed semantics: filled on acceptance) and new step `'first-hire-opened': input.hiresWithFirstDocument > 0` labelled *"Your first hire opened a document"*, hint *"The mark follows her, not you."*, no SKIP.
- Callers compute both from the members list: `status === 'active' && user_id !== me` and `first_document_opened_at != null && user_id !== me`.
- Doc page: on mount, if the current user is a non-owner member and the hook's cached flag is unset, call the RPC once (fire-and-forget, `useMutation`).

- [ ] **Step 1: Failing tests** — extend `studio-setup.test.ts`: invited-but-not-accepted member → `crew-invited` false; accepted → true; `first-hire-opened` true only when `hiresWithFirstDocument > 0`; total steps = 6.
- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** migration, derivation, callers, hook, doc-page call. **Step 4:** `supabase db reset` (integration steward owns; lane runs `psql`-free unit tests only), jest + type-check PASS. **Step 5: Commit** `feat(studio-setup): crew row fills on acceptance; first-hire-opened row (00559)`.

### Task L4: Margin notes — durable, versioned; dead tour deleted; two copy fixes

**Files:**
- Modify: `apps/designer-portal/src/components/document/margin-note.tsx:30–70` (persistence), `packages/help-system/src/persistence/supabaseAdapter.ts` (+ `marginNotes` sub-key), `packages/help-system/src/index.ts` exports, `apps/designer-portal/src/components/document/help/help-state-provider.tsx`
- Modify: `apps/designer-portal/src/components/document/margin-rail.tsx:589` (existing `doc-first-touch` note — update copy to the synthesis version), `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx:113`, `apps/designer-portal/src/app/(document-help)/help/page.tsx:68–82` (Featured fallback)
- Delete: `apps/designer-portal/src/components/help/first-signin-tour.tsx`; Modify `docs/prds/consolidated/09-help-guidance.md:40,92`; remove the comment in `help-state-provider.tsx` that references it
- Test: `margin-note.test.tsx` (create), `supabaseAdapter.test.ts` (extend, vitest)

**Interfaces:**
- `help_state.marginNotes: Record<string, string /* ISO seen */>`; adapter exports `createSupabaseMarginNoteBackend(client, userId)` with `{ hasSeen(key), markSeen(key), hydrate() }`; `migrateLocalToSupabase` also sweeps `patina:margin-note:*` keys once.
- `margin-note.tsx`: `noteKey` may carry `@N`; `hasSeen('doc-first-touch@2')` is false even if `doc-first-touch` (or `@1`) was seen — exact-key match, documented in one comment citing decision 5. Backend order: Supabase when hydrated, localStorage fallback before hydration and for signed-out.
- `doc-first-touch` copy → *"— One client, one paper. The rail on the left says where this stands; the margin here is where decisions, messages, and money gather. Nothing is a form — it fills as the work happens."* (key stays `doc-first-touch`; no version bump — same surface).
- Library shelf copy → *"Nothing captured yet. Bring a piece in from a vendor's page with Capture, or drop a photo here — it lands raw, and you tidy it later."*
- Help Center: replace the `:has()` hide with a JS branch: when `RelatedArticles` yields nothing, render the eyebrow + one line *"Featured guides arrive as they're written — browse by topic below."*

- [ ] **Step 1: Failing tests** — adapter round-trip (`markSeen` then `hasSeen` true; `@2` unseen); `MarginNote` renders when unseen, hides after action, exact-key semantics; `grep -rn first-signin-tour apps/designer-portal/src` returns nothing after delete (assert in a tiny jest test using `fs` — or as a reviewer gate).
- [ ] **Step 2 → 5:** FAIL → implement → PASS (jest + vitest + type-check) → commit `feat(margin-notes): cross-device seen-state with versioned keys; retire FirstSigninTour; copy fixes`.

### Task L5: "The keys" and "The words" — reference page, `?` overlay, ⌘K rows

**Files:**
- Create: `apps/designer-portal/src/lib/help-system/keys-reference.ts` (data), `apps/designer-portal/src/components/document/overlays/keys-sheet.tsx`, `apps/designer-portal/src/components/document/keys-shortcut.tsx` (global `?` listener), `apps/designer-portal/src/app/(document-help)/help/article/the-keys/page.tsx`
- Modify: `apps/designer-portal/src/components/document/command-bar.tsx` (~line 546 `allUtilityRows`: two rows), `apps/designer-portal/src/app/(document)/layout.tsx` (mount `KeysShortcut` + `KeysSheet` once)
- Test: `keys-reference.test.ts`, `keys-shortcut.test.tsx`, `command-bar.test.tsx` (extend if exists)

**Interfaces:**
- `keys-reference.ts` exports `buildKeysReference(): KeysSection[]` where `KeysSection = { heading: string; rows: { keys: string[]; label: string; where: string }[] }`. Sections: "Anywhere" (⌘K, Esc), "Rooms and books" (the seven chords generated from `ALL_STUDIO_SURFACES[].shortcut` — never hand-typed), "While writing" (⌘/Ctrl+Enter saves — six sites), "The Board Room" (the bound keys listed in `board-room-controller.tsx` handleKeyDown, copied once into data with a comment naming the source file), "The walkthrough" (Enter / Esc). Tester Notes ⌘⇧F excluded.
- `KeysSheet` is a `DocSheet` (`title="The keys"`, `pageLabel="Reference"`, `helpKey="designer-portal/document/guide/the-keys"`, `kind="keys"`) rendering `buildKeysReference()`; opened by `window.dispatchEvent(new CustomEvent('document:open-keys'))`; exports `openKeys()` from `command-bar.tsx` pattern (put it in `keys-sheet.tsx`, import into command-bar).
- `KeysShortcut`: `keydown` on window; fires `openKeys()` when `e.key === '?'` and `!isEditableTarget(e.target)` and `!anOverlayIsOpen()` and no ⌘/Ctrl/Alt (reuse the two guard functions — export them from `registry-shortcuts.tsx`). Documented collision check: Board Room binds `p`, `1`, `Shift+T` — none is `?`; verified 2026-09-03.
- `/help/article/the-keys` page renders the same `buildKeysReference()` (one source, two doorways — decision 8).
- ⌘K rows in `allUtilityRows`: `{kind:'help', key:'the-keys', label:'The keys', sub:'shortcuts, one page', run: openKeys, match:'keys shortcuts keyboard hotkeys'}` and `{kind:'help', key:'the-words', label:'The words', sub:'what Patina calls things', run: () => router.push('/help/topic/concept'), match:'words glossary vocabulary terms'}`.
- Analytics: `openKeys()` emits `help.shortcuts.opened {source: 'key'|'palette'|'panel'}`; "The words" emits `help.glossary.opened {source}` (add both to `HELP_EVENTS` in `packages/help-system/src/analytics.ts`).

- [ ] **Step 1: Failing tests** — `buildKeysReference()` contains a row `keys: ['G','O'] label 'Orders'` derived from the registry; pressing `?` on `document.body` calls `openKeys`; pressing `?` inside an `<input>` does not; `allUtilityRows` contains keys `the-keys` and `the-words`.
- [ ] **Step 2 → 5:** FAIL → implement → PASS → commit `feat(help): "The keys" reference (sheet + page + ? shortcut) and "The words" doorway`.

### Task L6: Analytics — new events, consolidation, empty-state firing

**Files:**
- Modify: `packages/help-system/src/analytics.ts` (`HELP_EVENTS` + `GLOSSARY_OPENED`, `SHORTCUTS_OPENED`), `apps/designer-portal/src/lib/analytics/document-events.ts` (+ `firstAuthored()`, `zoneFlight()`), `apps/designer-portal/src/components/document/guided-empty-state.tsx` (fire `HELP_EVENTS.EMPTY_STATE_SHOWN` once per mount via `safeCapture`), and every `window.posthog.capture(` call site under `apps/designer-portal/src` that emits a `help.*` string — replace with `safeCapture(HELP_EVENTS.X)` (grep first; list all N in the commit body)
- Modify: `apps/designer-portal/src/components/document/margin-rail.tsx` (first authored write → `documentEvents.firstAuthored()` guarded by `help_state.firstAuthoredAt` — reuse L4's adapter, sub-key `firstAuthoredAt`), `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` (zone flight)
- Test: `document-events.test.ts` (extend), `guided-empty-state.test.tsx`

**Interfaces:**
- `document_first_authored {doc_id}` — once per person, ever (guard in help_state).
- `document_zone_flight {doc_id, held_ms}` — **definition (new, flagged for Kody's confirmation in the wave report):** fired when a document is put down (or navigated away from) within 10 seconds of being picked up with no write in between; this operationalises the CS "pick-up/put-down thrash" stuck signal.
- `help.empty_state.shown {surface_key, region_key}` fires from `GuidedEmptyState` on mount.

- [ ] Steps: failing tests for each event name and guard → implement → PASS → commit `feat(analytics): first-authored, zone-flight, glossary/shortcuts events; help.* through HELP_EVENTS`.

### Task C1: Wave-1 content for batch approval (parallel with L1–L6; no code)

**Files:**
- Create: `artifacts/designer-onboarding-learning-2026-09-03/content/wave-1/NN-<slug>.md` × 20 (from synthesis §8 list, in order), `content/glossary/<term>.md` × 8 (synthesis §6), `content/the-keys.md` (generated table, matches L5 data)
- Create: `studios/help-system/scripts/load-onboarding-content.ts` + `run-onboarding-content-load.mjs` (modelled on `run-decisions-help-seed.mjs`; reads the markdown front-matter `surfaceKey`, `persona: designer`, `contentType: helpArticle`, title, body → `helpContent` docs; `--dry-run` default, `--commit` writes, `--publish` publishes)
- Each article front-matter: `surfaceKey` under the shelf prefix (`designer-portal/document/guide/<slug>`, `concept/<slug>`, `how-to/<slug>`, or a real surface key so the contextual panel picks it up — e.g. the Desk article keyed `designer-portal/document/desk`).

- [ ] Drafter A: articles 1–10 + glossary; Drafter B: articles 11–20 + "The keys" + loader script. Voice: brand-voice skill; every claim checked against the tree; no "AI".
- [ ] Kody gate: batch approval in `content/APPROVALS.md` (one line per file: approved / edit / reject). Only approved files are loaded with `--commit --publish` by the deploy steward (needs `SANITY_AUTH_TOKEN` — **owed by Kody**).

### Task W1-INT: Integration, gates, walk

Steward worktree `agent-onb-w1-integration`, branch `onboarding/w1-integration` from `main`.
- [ ] Merge L1..L6 (`git merge --no-ff onboarding/w1-l<N>`), resolve conflicts (expected: `registry.tsx` L1/L5, `command-bar.tsx` L2/L5, `help-state-provider.tsx` L4/L6, `analytics.ts` L5/L6).
- [ ] Renumber `00559` if `main` tip moved; `supabase db reset` (steward owns the stack; message peer sessions first per the shared-stack rule); `pnpm --filter @patina/help-system type-check test`; `pnpm --filter @patina/designer-portal type-check test lint`; `deno check` none needed this wave.
- [ ] Boot `pnpm --filter @patina/designer-portal dev` on :3000; Playwright walk (reuse `artifacts/.../briefing/screens/shoot.mjs` pattern): panel on `/desk` and `/doc/[id]` shows the blurb + KEYS; `?` opens the sheet; ⌘K shows "The keys"/"The words"; walkthrough replay step 6 CTA opens the lead sheet; Help Center Featured fallback line; checklist shows six rows. Save screens to `artifacts/designer-onboarding-learning-2026-09-03/verification/w1/`.
- [ ] Haiku fact-check of the wave report; Fable review; push `onboarding/w1-integration`.

### Task W1-SHIP

- [ ] Coordinate with the peer session (SendMessage `patina-merged-0f`) before touching the main checkout; in the main checkout: `git merge --no-ff onboarding/w1-integration` (only after `git status` shows no tracked changes in files the merge touches), push `main`.
- [ ] `supabase db push` (00559) → verify in `supabase migration list`.
- [ ] Export wrangler vars, `./infra/deploy-portal.sh designer-portal`; `npx wrangler deployments list --name patina-designer-portal` bottom row; probes: signed-in fetch of `/help/article/the-keys` 200; served chunk contains "Every live job, one line each" (grep the deployed JS via the site); `?` overlay smoke via Chrome on app.patina.cloud with tester@patina.cloud.
- [ ] Load approved Sanity content (`--commit --publish`); confirm `/help` Featured populated in prod.
- [ ] Retire lane worktrees + branches (`git worktree remove`, `git branch -d` after `merge-base --is-ancestor`); record Worker id + rollback command in memory.

---

# Wave 2 — the first hire's own arrival (flag `onboarding-teammate-persona`)

### Task L7: Teammate persona through the help system

**Files:** `packages/help-system/src/contentTypes.ts:9` (`Persona` union + `'teammate'`), every `switch`/map over `Persona` in `packages/help-system/src` (grep `'consumer'` to find them), `studios/help-system/schemas/helpContent.ts:33–45` (options list), `apps/designer-portal/src/components/document/help/desk-walkthrough.tsx` (persona from membership role: owner → `'designer'`, otherwise `'teammate'`; read via the studio-members hook + `useFeatureFlag('onboarding-teammate-persona')`; flag off → `'designer'` as today), tests in both packages.
- Fallback copy for the six coachmarks when `persona === 'teammate'` and no CMS doc: from `proposals/customer-success-lead.md` §3 table (quote verbatim into `STEPS_TEAMMATE`), modal title *"You're in — {studio name}."*, body *"From here, her desk and yours are the same desk. Six stops, about a minute."*
- [ ] TDD: `Persona` accepts `'teammate'`; walkthrough picks `STEPS_TEAMMATE` for a member; flag off → unchanged. Commit `feat(help): teammate persona (flag onboarding-teammate-persona)`.

### Task L8: Accept-invite names the studio; the owner's handoff note

**Files:** `supabase/migrations/0056N_invite_handoff_note.sql` (`ALTER TABLE organization_members ADD COLUMN handoff_note text CHECK (char_length(handoff_note) <= 280)`), `supabase/functions/workspace-member-invite/index.ts` (accept `handoff_note` in `InviteBody`, write it on the upsert), `apps/designer-portal/src/components/document/account/studio-invite-modal.tsx` (optional textarea "A line for her first day", 280 chars), `packages/supabase` invite hook types, `apps/designer-portal/src/app/auth/accept-invite/page.tsx` (heading shows `organization_name` from `accept_workspace_invitation`), `apps/designer-portal/src/app/(document)/desk/page.tsx` (new `MarginNote noteKey="hire-handoff"` rendering *"— From {owner first name}: {handoff_note}"* for a member whose row has a note; behind the same flag), tests + `deno check` for the function.
- [ ] TDD → commit `feat(invite): handoff note on the invitation; accept-invite names the studio (0056N)`.

### Task W2-INT / W2-SHIP — same steward pattern as W1; plus `supabase functions deploy workspace-member-invite`; **Kody owes** the PostHog flag `onboarding-teammate-persona` (create at 0%, then 100% for Leah's studio, then all).

---

# Wave 3 — the drip fires on state; rulings; video schema

### Task L9: Drip retiming E2–E9

**Files:** `supabase/migrations/0056N_onboarding_drip_state_triggers.sql` — updates `automated_sequences.steps_json` for the 'Designer Onboarding' row: before each of E2–E9 insert a `condition` step `{type:'condition', condition:{type:'event_occurred', event:'<activation event the email teaches>', negate:true}, on_false:'skip'}` and cap cadence with `delay_days` ≥ 7 between emails; `supabase/functions/automation-processor/index.ts` — add `negate` support to `evaluateCondition` for `event_occurred` (skip the email when the event HAS occurred) and honour `on_false:'skip'` to advance without sending; Deno test file next to it. Map E2–E9 → events from `00291_activation_event_bridge.sql` (read it; list the mapping in the migration header comment).
- [ ] TDD (Deno test for `evaluateCondition` negate; SQL assertion that the updated `steps_json` parses and has 8 condition steps) → `deno check` → commit `feat(drip): E2–E9 fire on state, weekly cap (0056N)`.
- [ ] Also: record in the migration comment who/when flipped the sequences to `active` (Kody to answer; else "unknown, observed active 2026-09-03").

### Task L10: Rulings + video schema + PRD

**Files:** `docs/design/the-document/DECISIONS.md` (append R129–R134: acting tour step; "later" state; versioned margin notes; `?` overlay; CS calls as doctrine; R96 amended), `docs/prds/consolidated/09-help-guidance.md` (status table: what shipped in W1/W2; FirstSigninTour removed; videos: 2–3 on Cloudflare Stream after Wave 1), `studios/help-system/schemas/videoContent.ts` (new type: `title`, `streamUid` (Cloudflare Stream id), `surfaceKey`, `persona`, `durationSeconds`) registered in the schema index, `packages/help-system/src/reference/VideoPlayer` accepts `streamUid` and renders the Stream iframe (`https://iframe.videodelivery.net/<uid>`) — only wired, no videos yet.
- [ ] Commit `docs(rulings): R129–R134; chore(help): videoContent schema for Cloudflare Stream`. **Kody owes:** Cloudflare Stream enablement; the two or three recordings.

### Task W3-INT / W3-SHIP — steward; `supabase db push`, `supabase functions deploy automation-processor`, portal deploy only if `packages/help-system` changed (VideoPlayer) — yes → deploy designer portal.

---

## Verification (end-to-end, per wave)

1. Gates green in the integration worktree (commands above, output pasted in the wave report).
2. Local Playwright walk with screenshots in `artifacts/designer-onboarding-learning-2026-09-03/verification/w<N>/`.
3. Prod: `wrangler deployments list` bottom row = new id; served-chunk grep for a new copy string; signed-in Chrome walk on app.patina.cloud (tester@patina.cloud / 000000): panel answers on Desk + Document, `?` opens The keys, ⌘K rows present, walkthrough replay ends in the lead sheet, checklist six rows; W2: invite with a note as owner → accept as member → member sees teammate modal + handoff note (needs a second test account); W3: `job_runs` for automation-processor clean for 24h, one enrolment's `step_history` shows a skipped condition.
4. Memory + `decisions.md` updated with Worker ids, rollback commands, migration numbers as applied.

## Owed by Kody (cannot be done by agents)

- `SANITY_AUTH_TOKEN` for loading approved content; batch approvals in `content/APPROVALS.md`.
- PostHog flag `onboarding-teammate-persona` (W2).
- Cloudflare Stream enablement + recordings (W3, non-blocking).
- Confirmation of the `document_zone_flight` definition (L6) and who flipped the drip sequences active (L9).
- The two CS calls become part of the pilot runbook (decision 11) — outside code.
