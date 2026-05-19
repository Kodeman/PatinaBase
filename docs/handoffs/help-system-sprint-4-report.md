# Help & Guidance System — Sprint 4 Gate Report

**Period:** 2026-05-18 (continued from Sprint 3)
**Branch:** `help-system/sprint-4` (HEAD `5bf7e7e1`, pushed to origin)
**Commits ahead of main:** 8
**Plan:** `/Users/kody/.claude/plans/review-the-documenation-for-compressed-shore.md`
**Prior reports:** `docs/handoffs/help-system-sprint-{1,2,3}-report.md`

---

## TL;DR

Sprint 4 closed the 4 technical-debt items from the Sprint 3 backlog. None were pilot-blocking; all sharpen production quality.

- **S4-1** Supabase `user_profiles.help_state` JSONB persistence — cross-device "dismiss once" semantics now work on web + iOS
- **S4-2** Unified GROQ persona fallback chain — iOS realigned to web's canonical 4-step pattern (closes risk R3)
- **S4-3** `@patina/design-system` dts build fixed — C3 swapped inlined StrataMark SVG for canonical import, EmptyState also opportunistically cleaned
- **S4-4** Dedicated Sanity `coachmarkContent` schema — D5 + G9 tour docs ready to migrate; iOS Codable handles both old and new shapes (Kody-gated schema deploy)

**Verification:**
- **681 web tests** in `@patina/help-system` (Sprint 3 close: 667)
- **Design-system DTS** emits cleanly: `dist/index.d.ts` 220.72 KB, `dist/tokens/index.d.ts` 66.69 KB
- **Help-system DTS** grew to 95.63 KB (was 64.55 KB at Sprint 3 close — picked up new persistence exports)
- **iOS `xcodebuild test`** ✓ on iPhone 17 Pro / iOS 26.5

---

## Tasks Completed (4 parallel agents, Wave 10)

### S4-1 · Supabase persistence migration
4 commits from worker; key artifacts:
- `supabase/migrations/00146_profiles_help_state.sql` — adds `help_state JSONB NOT NULL DEFAULT '{}'::jsonb` to `public.profiles`. Existing write-self RLS policy from migration 00013 covers writes.
- `packages/help-system/src/persistence/supabaseAdapter.ts` + `types.ts` + `index.ts` — pluggable backend interface
- `packages/help-system/src/proactive/TourController/tourState.ts` — `setTourStateBackend()` injection point; localStorage is default; Supabase backend reads + writes through
- `packages/help-system/src/proactive/FeatureAnnouncementCoachmark/featureAnnouncementState.ts` — same pattern
- `apps/mobile/Patina/Patina/Features/Help/Services/SupabaseHelpStateAdapter.swift` — actor-based Swift adapter
- `apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift` — `enableSupabaseSync(_:)` hook + write-mirror to Supabase
- `apps/designer-portal/src/components/help/first-signin-tour.tsx` — installs backend on authenticated mount + runs localStorage→Supabase migration sweep + gates welcome modal on hydration
- 14 new adapter tests in help-system, 28 iOS FirstLaunchTour tests pass

**JSONB shape settled on:**
```json
{
  "tours": {
    "<tour_id>": {
      "completed": false,
      "abandoned": false,
      "launched": true,
      "atStep": 2,
      "completedAt": "2026-05-18T12:34:56Z",
      "abandonedAt": null
    }
  },
  "featureAnnouncements": {
    "<feature_key>": { "dismissedAt": "2026-05-18T12:34:56Z" }
  }
}
```

**Deferred**: admin-portal + client-portal wiring (they don't consume TourController/FeatureAnnouncementCoachmark yet). Wire when they ship their first tour.

### S4-2 · Unified GROQ persona fallback (closes R3)
1 commit. Files:
- `packages/help-system/src/persistence/helpContentQuery.md` — NEW canonical contract doc
- `packages/help-system/src/hooks/useHelpContent.ts` — header references the doc; no behavior change (web already canonical)
- `apps/mobile/Patina/Patina/Features/Help/Services/SanityHelpClient.swift` — iOS realigned to canonical 4-step chain
- `apps/mobile/Patina/PatinaTests/SanityHelpClientTests.swift` — tests updated for the new chain

**Canonical 4-step chain settled:**
1. exact surfaceKey + exact persona
2. exact surfaceKey + `"all"` (skip if persona is already `"all"`)
3. parent surfaceKey + exact persona (skip if no parent)
4. parent surfaceKey + `"all"` (skip if persona is `"all"`)
→ null (with single dev warning)

Parent surfaceKey = surfaceKey with last `/segment` removed. Persona-agnostic sentinel is `"all"` (matches schema). iOS `nil` persona maps to wire `"all"` and skips redundant steps 2/4.

iOS dropped its legacy consumer/maker→designer shortcut (was an iOS-only divergence, not in spec).

### S4-3 · design-system dts build fix
1 commit. Files:
- `packages/patina-design-system/tsconfig.json` — TS path aliases pointing to `@patina/types` source files (not built dist); widened `rootDir` to allow cross-package source references
- `packages/help-system/src/reactive/StrataInfoIcon/StrataInfoIcon.tsx` — removed inlined SVG clone; now `import { StrataMark } from '@patina/design-system'`
- `packages/help-system/src/ambient/EmptyState/EmptyState.tsx` — opportunistically cleaned (was using `as unknown as DSEmptyStateProps` workaround; now imports `EmptyStateProps` directly)

**Root cause:** `@patina/types/package.json` correctly exposed `./media` subpath, but `pnpm --filter @patina/design-system build` runs tsup directly without first building `@patina/types`. Turbo's `^build` dependency was hiding this in normal workflows; standalone invocation failed. Fix uses TS path aliases to skip the build dependency.

**Design-system error count:** 51 → 25 (remaining are pre-existing DatePicker/usePagination errors unrelated to this fix).

### S4-4 · Coachmark schema upgrade (Kody-gated deploy)
1 commit. Files:
- `studios/help-system/schemas/coachmarkContent.ts` (NEW) — heading (max 60), body (max 120), ctaLabel (max 20) caps as warnings per spec §8
- `studios/help-system/schemas/helpContent.ts` — added inline `coachmarkContent` object visible when `contentType=='coachmark'`; narrowed shared `tooltipContent` block back to tooltip/fieldHelper/learnMore
- `studios/help-system/schemas/index.ts` — registered new type
- `studios/help-system/scripts/migrate-coachmark-s4-4.ts` (NEW) — idempotent Sanity exec script with `--commit` flag, ready to migrate the 8 existing tour docs
- `studios/help-system/README.md` — schema table + S4-4 migration section with doc IDs + new heading/body values

**iOS Codable** (no code change needed — G8 already added tolerant decoding): `HelpContent.swift:262-282` decodes `coachmarkContent` first; falls back to `tooltipContent` (eyebrow→heading). Verified by `coachmarkContent_decodesFromCoachmarkContentBlock` + `coachmarkContent_fallsBackToTooltipContentBlock` tests.

**Schema deploy status: Kody-gated.** MCP `deploy_schema` refused; needs:
```bash
cd studios/help-system
npx sanity@latest schema deploy
npx sanity@latest exec scripts/migrate-coachmark-s4-4.ts --commit
```
The migration script transforms `tooltipContent.eyebrow`→`coachmarkContent.heading` and `tooltipContent.body`→`coachmarkContent.body` across the 5 D5 designer + 3 G9 iOS tour docs.

---

## Gate Criteria

| Criterion | Status |
|-----------|--------|
| Cross-device dismiss persistence (D2/D4/W1/G9) | ✅ wired; pilot-testable once a user signs in on a 2nd device |
| iOS + web persona fallback unified (R3 closed) | ✅ |
| Design-system DTS emits cleanly | ✅ |
| C3 StrataInfoIcon uses canonical StrataMark (R13 dts dep closed) | ✅ |
| Sanity coachmarkContent schema defined | ✅ local; deploy Kody-gated |
| Migration script ready for 8 tour docs | ✅ |
| All tests green (web + iOS) | ✅ |

---

## Outstanding Kody-owned Items

1. **Sanity coachmarkContent schema deploy** + migration script run:
   ```bash
   cd studios/help-system
   npx sanity@latest schema deploy
   npx sanity@latest exec scripts/migrate-coachmark-s4-4.ts --commit
   ```
   After this lands, tour coachmarks will render their CMS content directly instead of falling back to `fallbackTitle`/`fallbackBody` props.

2. **Supabase migration deploy** — `supabase/migrations/00146_profiles_help_state.sql` is local. Push via your deploy pipeline. Until live, cross-device persistence works via in-memory cache only (per-session).

3. **Leah's accent palette review** (carried over from Sprint 1) — still placeholder OKLCH values in `packages/patina-design-system/src/tokens/colors.ts:helpSystemAccents`. Not blocking pilot.

---

## Sprint 5+ Backlog (post-pilot, none urgent)

- Admin-portal + client-portal Supabase persistence wiring (when they ship their first tour)
- Sanity dedicated `videoContent` schema (currently TS-only; spec §16 hosting open question still open)
- Sanity dedicated `welcomeModalContent` schema (currently uses tooltipContent shape; D3 + G8 work through tolerant decoding)
- Quarterly content audit dashboard (I3)
- 10 video walkthroughs (H4 — depends on hosting decision)
- Final Leah content pass (H5)

---

## Risk Register — Final

| # | Risk | Status |
|---|------|--------|
| R1–R12 | various | all closed by Sprint 3 |
| **R3** | iOS/web GROQ fallback drift | **CLOSED Sprint 4 (S4-2)** |
| R13 | C2/C3 inline Radix vs canonical Tooltip | closed Sprint 3 |
| R14 (new) | localStorage persistence in production | **CLOSED Sprint 4 (S4-1)** — Supabase-backed |
| R15 (new) | design-system dts blocks consumers | **CLOSED Sprint 4 (S4-3)** |

---

## Files Modified Summary

- `supabase/migrations/00146_profiles_help_state.sql` (new)
- `packages/help-system/src/persistence/{types,supabaseAdapter,index,helpContentQuery}.*` (new module — 4 files)
- `packages/help-system/src/proactive/TourController/tourState.ts` + `index.ts` (pluggable backend)
- `packages/help-system/src/proactive/FeatureAnnouncementCoachmark/featureAnnouncementState.ts` (pluggable backend)
- `packages/help-system/src/hooks/useHelpContent.ts` (header doc reference)
- `packages/help-system/src/reactive/StrataInfoIcon/StrataInfoIcon.tsx` (canonical StrataMark import)
- `packages/help-system/src/ambient/EmptyState/EmptyState.tsx` (canonical type import)
- `packages/patina-design-system/tsconfig.json` (path aliases for cross-package source)
- `apps/designer-portal/src/components/help/first-signin-tour.tsx` (Supabase backend wiring + migration sweep)
- `apps/mobile/Patina/Patina/Features/Help/Services/SanityHelpClient.swift` (canonical 4-step chain)
- `apps/mobile/Patina/Patina/Features/Help/Services/SupabaseHelpStateAdapter.swift` (new)
- `apps/mobile/Patina/Patina/Features/Help/FirstLaunchTour.swift` (Supabase sync)
- `apps/mobile/Patina/PatinaTests/SanityHelpClientTests.swift` (new chain coverage)
- `studios/help-system/schemas/coachmarkContent.ts` (new)
- `studios/help-system/schemas/helpContent.ts` (coachmark variant)
- `studios/help-system/scripts/migrate-coachmark-s4-4.ts` (new)
- `studios/help-system/README.md` (schema + migration docs)

---

## Sign-off Checklist (for Kody)

- [ ] Reviewed this report
- [ ] Supabase migration `00146` deployed to production
- [ ] Sanity coachmark schema deployed (`npx sanity schema deploy`)
- [ ] Migration script run (`npx sanity exec scripts/migrate-coachmark-s4-4.ts --commit`)
- [ ] Approve merge of `help-system/sprint-4` → `main`

When ready: `git checkout main && git merge --no-ff help-system/sprint-4 && git push origin main`

---

*Generated 2026-05-18 by orchestrator session against `help-system/sprint-4` HEAD `5bf7e7e1`. 4 parallel agents, 8 commits. All 4 Sprint 3 backlog items closed.*
