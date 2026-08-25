# Field Companion — Wave 1P Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the field material that is *already in production* visible in the designer portal — signed `capture-media` URLs, the Room-files block on the project spread, the designer's own scans attachable to her own document, a Field provenance chip on Library cards, and an honest surface for receiving-inspection photos — without a Field build, without a migration, and without a new flag.

**Architecture:** Six independent portal/data slices on one branch, plus a baseline task. One new shared Supabase read hook (`useCaptureMediaUrls`) in `packages/supabase/src/hooks/`, following the batched-`createSignedUrls` precedent already in the repo twice. Everything else is a mount, a query-column widening, or a render — all of them reads of columns that only carry data when a Field build wrote them, so a project with no field data renders byte-identically to today. No new NestJS code, no DDL, no flag.

**Tech Stack:** TypeScript · Next.js 15 App Router (React 19) · TanStack Query v5 · `@patina/supabase` (Vitest, node env) · `apps/designer-portal` (Jest via `next/jest`, jsdom) · Tailwind + the document's CSS-variable palette.

**Spec:** `docs/design/field-companion/field-companion-package.md` §11 (portal surfaces: §11.1 sign `capture-media`, §11.2 mount what exists + the designer-scan union, §11.5 receiving photos, §11.6 flags, §11.7 Wave 1P) and `docs/design/field-companion/field-companion-plan.md` §1.4 (Wave 1P) with the work-package detail in §4 rows 4-1, 4-5, 4-11 (render half), 4-12.
**Rulings:** `docs/design/field-companion/field-companion-rulings.md`, "Ratified by Kody — 2026-08-24". Load-bearing here: **FC-R10** (portal changes ship UNFLAGGED; "renders nothing on a field-less project" is a verified acceptance criterion, not a footnote), **FC-R8** (per-designer in v1), **FC-R15** (a punch photo back-references the `field_captures` row; the portal signs `capture-media` via `useCaptureMediaUrls`; no new media table).

⚠ **These three source documents are untracked working-tree files** — `git ls-files docs/design/field-companion/` is empty. They are present in this worktree for reading but are NOT committed from this lane; another session owns them in the shared checkout.

---

## Global Constraints

Every task's requirements implicitly include this section. Copied from `AGENTS.md`, the spec, and the Wave 1P brief.

- **Auth is Supabase Auth (GoTrue) only — never NextAuth.**
- **Types come from `@patina/types`** — never redefine a domain type. (Row-shaped read types local to a `@patina/supabase` hook module are the existing house convention and stay where they are; see `LayerProductRow`, `ReceivingInspection`.)
- **Data access:** `@patina/supabase` hooks for Supabase data; `@patina/api-routes` proxy routes for NestJS-service data. **No ad-hoc `fetch` to a service.**
- **No new NestJS code.** The retained services are orders, media, projects and nothing is added to them in this wave. If a task appears to need a new service route, STOP that task and report — it is out of the Wave 1P lane.
- **No new PostHog feature flag (FC-R10).** The portal changes ship unflagged. *But* "renders nothing on a field-less project" is a **verified** acceptance criterion of this wave, not an assertion — see the ruling under Task 3 for exactly what evidence this wave produces and what is escalated.
- **No migrations in this wave.** Nothing under `supabase/migrations/` is created or edited. If a task truly needs DDL, **STOP that task and report** — the migration band (00530–00535, FC-R17) is orchestrator-owned and its numbers are drawn at landing.
- **Placement convention (spec §11.1):** `useCaptureMediaUrls` goes in `packages/supabase/src/hooks/` (a shared Supabase read). Escalation hooks and portal-only hooks stay portal-local under `apps/designer-portal/src/hooks/`.
- **Components:** `@patina/design-system` plus the portal-local `ui/controls`. Inside `(document)` surfaces, follow the document's paper grammar already in the file being edited (`doc-type-*` classes, CSS variables, zero shadows).
- **Gates** (all must pass before a task is called done):
  - `pnpm type-check`
  - `pnpm build --filter @patina/designer-portal`
  - `pnpm lint --filter @patina/designer-portal` — ⚠ **this gate is RED at baseline and exits 1.** Measured on this branch before any wave code landed: **2 errors, 200 warnings**, both errors pre-existing and in unrelated test files:
    - `apps/designer-portal/src/components/document/rooms/piece/__tests__/piece-room-save-gate.test.tsx:159` — `Definition for rule 'import/first' was not found`
    - `.../use-commercial-documents.test.ts:930` — `react-hooks/rules-of-hooks` false positive on `mutationFnOf`
    The gate is therefore **"no NEW errors beyond those two, and no new warnings"**, not "exit 0". Fixing them is out of this lane.
  - the jest/vitest suites each task names below.
  - ⚠ Turbo filters match the package `name` field. The designer portal's name is **`@patina/designer-portal`**. `pnpm build --filter designer-portal` fails with `No package found with name 'designer-portal' in workspace` (verified). Plan §1.4 writes the short form; use the scoped form.
  - ⚠ `apps/designer-portal/next.config` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` — **the build does NOT type-check or lint.** `pnpm type-check` and `pnpm lint --filter @patina/designer-portal` are the real gates; the build only proves it compiles and bundles.
- **Jest mock trap (patina-testing, Trap 1):** `apps/designer-portal/jest.config.js` `moduleNameMapper` mirrors only `@patina/design-system`, `@patina/types`, `@patina/api-client`, `@patina/utils` (plus `@/*`). **`@patina/supabase` is NOT aliased in `tsconfig.json` paths**, so `jest.mock('@patina/supabase', …)` resolves through ordinary workspace resolution and works. Do not add a tsconfig path alias for it.
  - ⚠ **Corollary that bites this wave:** every existing designer-portal suite mocks `@patina/supabase` with a **closed object literal**. Adding a new `@patina/supabase` import to a component those suites render makes them throw `TypeError: … is not a function`. Task 3 has an explicit step for this; check for it whenever you add such an import.
- **Runner split (patina-testing):** `packages/supabase` runs **Vitest** (`vitest.config.ts`, `environment: 'node'`, `globals: true`, include `src/**/__tests__/**/*.test.ts` and `src/**/*.test.ts` — `.ts` only, never `.tsx`). `apps/designer-portal` runs **Jest** via `next/jest` in jsdom, with `@testing-library/jest-dom` loaded at `jest.setup.js:2`. Plan §1.4 calls the `use-capture-media` gate "jest"; it is **vitest**. Do not write a React-rendering test in `packages/supabase` — there is no jsdom and no testing-library there. Mock `@tanstack/react-query`'s `useQuery` to return the config and invoke `queryFn` directly (the house pattern: `packages/supabase/src/hooks/__tests__/use-splat-url.test.ts`).
- **Selecting an `<img alt="">` in jest:** use `container.querySelector('img')` — the house pattern in this very directory (`room-file/__tests__/render-gallery-section.test.tsx:118,141`). **`getByRole('presentation')` does NOT work**: the installed `aria-query@5.1.3` maps `img[alt]` → role `img`, and that selector matches `alt=""`, so `presentation` matches nothing and a `queryByRole('presentation') → toBeNull()` assertion passes vacuously.
- **Never run `next build` while a `next dev` is live** (recover with `rm -rf apps/designer-portal/.next`).
- **Git:** worktree `.claude/worktrees/field-companion-w1p`, branch `feat/field-companion-w1p`. **Pathspec-only** staging — never `git add -A` / `git add .`. Conventional Commits; never a `merge:` subject. Push the branch to `origin` at each task completion. Never merge or push to `main`. The parenthesised/bracketed route path needs ordinary shell quoting only: `git add "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx"` (verified — no `:(literal)` magic required).
- **Forbidden from this lane:** `supabase db push`, any file under `supabase/migrations/`, `infra/deploy-portal.sh`, `wrangler`, secrets, PostHog flag creation, merging or pushing to `main`.
- ⚠ `apps/*/.env.local` may point at Strata **prod**. No task here needs a database beyond mocked tests. Do not run a destructive local DB action.

---

## Prerequisites owned outside this lane (do not attempt)

Recorded here because §1.4 names them as Wave 1P prerequisites and they are **decisions, not code**:

1. **Enable the existing `room-file` PostHog flag for the pilot cohort** (FC-R10). Every `RoomFilesSection` row links to `/room/${scan.id}/file`, which is `useFeatureFlag("room-file")` and fail-closed (`apps/designer-portal/src/components/room-file/room-file-view.tsx` — import `:29`, call `:63`). **Kody / orchestrator owns this. PostHog flag mutation is forbidden from this lane.**

   ⚠ **Correction to spec §11.2, verified in review.** The spec says the rows' *"every destination is dark"*, and this plan said the same. It is overstated. `room-file-view.tsx` fail-closes to a real, styled page reading **"Room File isn't available yet."** (`:96-102`) — not a blank screen, not a 404, not an error. So mounting with the flag OFF gives a designed "not yet" landing, not a broken link. The flag decision is therefore about **payoff, not safety**: without it the Room-files rows are inert but harmless.
2. **Brand-voice pass on `apps/designer-portal/src/components/room-file/room-file-copy.ts`**, whose own header (`:1-10`) calls every string in it ESCALATE-class provisional. Task 3 puts `C.sectionTitle` (`:14`, `"Room Files"`) on the project spread. **Design-owned; not changed by this plan.**

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| — (no file) | Record the pre-change test baseline so a later regression cannot be mislabelled pre-existing. | 0 |
| `packages/supabase/src/hooks/use-capture-media.ts` (**new**) | Batched signed URLs for the private `capture-media` bucket. The one shared read the rest of the field surface depends on. | 1 |
| `packages/supabase/src/hooks/__tests__/use-capture-media.test.ts` (**new**) | Vitest cover for the hook's query key, enablement, bucket, TTL, and partial-failure handling. | 1 |
| `packages/supabase/src/hooks/index.ts` | Barrel export for the new hook + its constants. | 1, 4, 5 |
| `apps/designer-portal/src/components/room-file/capture-context-section.tsx` | Renders a signed thumbnail from `primary_photo_path` instead of only an already-usable `thumbnail_url`. | 2 |
| `apps/designer-portal/src/components/room-file/__tests__/capture-context-section.test.tsx` (**new**) | Jest cover: signed path wins, `thumbnail_url` fallback, neither → placeholder. | 2 |
| `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` | Mounts `RoomFilesSection` on the project spread between `ScheduleSpine` and `FFESection`. | 3 |
| 7 existing suites under `apps/designer-portal/src/app/(document)/doc/[id]/` | Their closed `@patina/supabase` mocks must learn the two hooks the new mount calls. | 3 |
| `apps/designer-portal/src/components/room-file/__tests__/room-files-section.test.tsx` (**new**) | The FC-R10 acceptance criterion: a field-less project renders **nothing**. | 3 |
| `packages/supabase/src/hooks/use-room-scans.ts` | `useClientRoomScans` unions the signed-in designer's own scans and stamps `owner_kind`. | 4 |
| `packages/supabase/src/hooks/__tests__/use-client-room-scans-union.test.ts` (**new**) | Vitest cover for the union, the dedupe, and the provenance stamp. | 4 |
| `apps/designer-portal/src/components/document/discovery/discovery-section.tsx` | Scan-picker options carry the provenance in their label. | 4 |
| `apps/designer-portal/src/components/document/letterhead-instruments.tsx` | `useClientScans` unions designer-owned scans; the door prefers the client's scan; the label says whose it is. | 4 |
| `apps/designer-portal/src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx` | Extended: both legs, the client-leg preference, the label. | 4 |
| `packages/supabase/src/hooks/use-layer-products.ts` | Selects `capture_source` + `captured_at` + `field_capture_id`; `LayerProductRow` carries them. | 5 |
| `packages/supabase/src/hooks/use-capture-venues.ts` (**new**) | `useCaptureVenueLabels` — an isolated, failure-tolerant read of `field_captures.venue_label`. | 5 |
| `packages/supabase/src/hooks/__tests__/use-capture-venues.test.ts` (**new**) | Vitest cover. | 5 |
| `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx` | Passes the three new fields through to the card (it builds `item` field-by-field). | 5 |
| `apps/designer-portal/src/components/document/rooms/library/library-card.tsx` | Renders the Field provenance chip. | 5 |
| `apps/designer-portal/src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx` (**new**) | Jest cover: the label function AND the rendered chip. | 5 |
| `packages/supabase/src/hooks/use-procurement.ts` | The `useDamageClaims` inspection embed learns `photo_asset_ids`. | 6 |
| `apps/designer-portal/src/components/document/orders-book-receiving.tsx` | Receiving surfaces stop silently dropping `photo_asset_ids`. | 6 |
| `apps/designer-portal/src/components/document/__tests__/receiving-photo-line.test.ts` (**new**) | Jest cover for the photo line. | 6 |

---

## Task 0: Record the test baseline

Nothing in this wave may be excused as "pre-existing" without evidence. Establish the evidence before the first line changes.

**Files:** none created or modified. Output goes in the SDD ledger.

**Interfaces:** Consumes nothing; produces the baseline counts every later task compares against.

- [ ] **Step 1: Run the full designer-portal jest suite on the untouched branch**

Run:
```bash
pnpm --filter @patina/designer-portal test 2>&1 | tail -20
```
Expected: a summary line of the form `Tests: N passed, M total` (with any pre-existing failures listed). **Record the exact numbers and the name of every already-failing suite** in the ledger.

- [ ] **Step 2: Run the full `@patina/supabase` vitest suite on the untouched branch**

Run:
```bash
pnpm --filter @patina/supabase test 2>&1 | tail -20
```
Expected: `Test Files  N passed`, `Tests  M passed`. Record both numbers.

- [ ] **Step 3: Record the baseline**

Append both summaries verbatim to `.superpowers/sdd/wave-1p-plan/progress.md` under a `## Baseline (pre-Task-1)` heading. No commit — `.superpowers/` is gitignored.

---

## Task 1: `useCaptureMediaUrls` — sign the `capture-media` bucket

Spec §11.1 (the hard prerequisite: `grep -rn "capture-media" apps/ packages/` returns nothing outside `apps/mobile/Capture`, so every field photo and every second of field audio is unreadable by web code today). Plan §4 row 4-1. FC-R15 names this hook by name.

Bucket facts, verified against `supabase/migrations/00234_capture_media_bucket.sql`: `capture-media` is **private**, layout `capture-media/<auth.uid()>/<client_capture_id>/<artifact>`, and all four object policies (`:39`, `:47`, `:55`, `:63`) gate on `(storage.foldername(name))[1] = auth.uid()::text` — so a designer signs only her own objects. That is exactly FC-R8's per-designer posture; no extra scoping is needed in the hook.

**Files:**
- Create: `packages/supabase/src/hooks/use-capture-media.ts`
- Create: `packages/supabase/src/hooks/__tests__/use-capture-media.test.ts`
- Modify: `packages/supabase/src/hooks/index.ts`

**Interfaces:**
- Consumes: `createBrowserClient` from `packages/supabase/src/client.ts`; `useQuery`/`UseQueryResult` from `@tanstack/react-query`.
- Produces, relied on by Task 2:
  ```ts
  export const CAPTURE_MEDIA_BUCKET = 'capture-media';
  export const CAPTURE_MEDIA_TTL_SECONDS = 3600;
  export function captureMediaUrlsKey(
    paths: readonly string[],
    ttlSeconds: number,
  ): readonly ['capture-media-urls', string, number];
  export function useCaptureMediaUrls(
    paths: readonly (string | null | undefined)[] | null | undefined,
    ttlSeconds?: number,
  ): UseQueryResult<Record<string, string>>;
  ```
  `data` is a `path → signedUrl` map. A path that failed to sign is **absent from the map**, never a broken string. `data` is `undefined` while disabled (no paths) or in flight.

- [ ] **Step 1: Write the failing test**

Create `packages/supabase/src/hooks/__tests__/use-capture-media.test.ts`:

```ts
/**
 * `useCaptureMediaUrls` — the portal's only read path into the private
 * `capture-media` bucket (spec §11.1, FC-R15).
 *
 * Mocked at the same two boundaries every other hook suite here uses
 * (`@supabase/ssr` for the client, `@tanstack/react-query` for `useQuery`),
 * so `queryFn` can be invoked directly without a React tree or a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SignedEntry = {
  path: string | null;
  signedUrl: string;
  error: string | null;
};

let signedResult: { data: SignedEntry[] | null; error: unknown } = {
  data: [],
  error: null,
};

const createSignedUrls = vi.fn(async (_paths: string[], _ttl: number) => signedResult);
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrls }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: storageFrom } }),
}));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: () => Promise<Record<string, string>>;
}

let issued: QueryConfig[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
}));

// Import AFTER the mocks are wired up.
import {
  useCaptureMediaUrls,
  captureMediaUrlsKey,
  CAPTURE_MEDIA_BUCKET,
  CAPTURE_MEDIA_TTL_SECONDS,
} from '../use-capture-media';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useCaptureMediaUrls issued no query');
  return found;
}

beforeEach(() => {
  signedResult = { data: [], error: null };
  issued = [];
  createSignedUrls.mockClear();
  storageFrom.mockClear();
});

describe('useCaptureMediaUrls — the query it issues', () => {
  it('names the private bucket the Field app writes to (00234)', () => {
    expect(CAPTURE_MEDIA_BUCKET).toBe('capture-media');
    expect(CAPTURE_MEDIA_TTL_SECONDS).toBe(3600);
  });

  it('is order- and duplicate-insensitive in its query key', () => {
    expect(captureMediaUrlsKey(['b/2.jpg', 'a/1.jpg'], 3600)).toEqual(
      captureMediaUrlsKey(['a/1.jpg', 'b/2.jpg'], 3600),
    );
    useCaptureMediaUrls(['b/2.jpg', 'a/1.jpg', 'a/1.jpg']);
    expect(query().queryKey).toEqual(['capture-media-urls', 'a/1.jpg|b/2.jpg', 3600]);
  });

  it('stays disabled — and never signs — with nothing to sign', () => {
    for (const input of [null, undefined, [], [null, undefined, '', '   ']]) {
      issued = [];
      useCaptureMediaUrls(input as string[] | null | undefined);
      expect(query().enabled).toBe(false);
    }
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('goes stale a minute before the URLs expire', () => {
    useCaptureMediaUrls(['a/1.jpg'], 300);
    expect(query().staleTime).toBe(240_000);
    // A TTL shorter than the safety margin must not produce a negative staleTime.
    useCaptureMediaUrls(['a/1.jpg'], 10);
    expect(query().staleTime).toBe(0);
  });
});

describe('useCaptureMediaUrls — what it resolves', () => {
  it('signs every distinct path in ONE call and returns a path→url map', async () => {
    signedResult = {
      data: [
        { path: 'uid/cap-1/photo.jpg', signedUrl: 'https://s/1?sig=a', error: null },
        { path: 'uid/cap-2/note.m4a', signedUrl: 'https://s/2?sig=b', error: null },
      ],
      error: null,
    };

    useCaptureMediaUrls(['uid/cap-1/photo.jpg', 'uid/cap-2/note.m4a', 'uid/cap-1/photo.jpg']);

    await expect(query().queryFn()).resolves.toEqual({
      'uid/cap-1/photo.jpg': 'https://s/1?sig=a',
      'uid/cap-2/note.m4a': 'https://s/2?sig=b',
    });

    expect(storageFrom).toHaveBeenCalledWith('capture-media');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['uid/cap-1/photo.jpg', 'uid/cap-2/note.m4a'],
      3600,
    );
  });

  it('omits an entry that failed to sign rather than handing back a broken URL', async () => {
    signedResult = {
      data: [
        { path: 'uid/cap-1/photo.jpg', signedUrl: 'https://s/1?sig=a', error: null },
        { path: 'uid/cap-2/gone.jpg', signedUrl: '', error: 'Object not found' },
        { path: null, signedUrl: 'https://s/3?sig=c', error: null },
      ],
      error: null,
    };

    useCaptureMediaUrls(['uid/cap-1/photo.jpg', 'uid/cap-2/gone.jpg', 'uid/cap-3/x.jpg']);

    await expect(query().queryFn()).resolves.toEqual({
      'uid/cap-1/photo.jpg': 'https://s/1?sig=a',
    });
  });

  it('propagates a signing error rather than reporting "no media"', async () => {
    signedResult = { data: null, error: new Error('storage down') };
    useCaptureMediaUrls(['uid/cap-1/photo.jpg']);
    await expect(query().queryFn()).rejects.toThrow('storage down');
  });

  it('honours a caller-supplied TTL', async () => {
    useCaptureMediaUrls(['uid/cap-1/photo.jpg'], 120);
    await query().queryFn();
    expect(createSignedUrls).toHaveBeenCalledWith(['uid/cap-1/photo.jpg'], 120);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-capture-media.test.ts
```
Expected: FAIL — `Failed to resolve import "../use-capture-media"` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/supabase/src/hooks/use-capture-media.ts`:

```ts
'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE MEDIA — the portal's read path into the PRIVATE `capture-media`
// bucket (migration 00234).
//
// Layout, enforced by storage RLS: capture-media/<auth.uid()>/<client_capture_id>/<artifact>
// All four object policies gate on (storage.foldername(name))[1] = auth.uid()::text,
// so a designer can only ever sign her own field media. That IS the per-designer
// scope FC-R8 asks for — there is no extra filter to add here.
//
// Batched on purpose: one createSignedUrls call for every distinct path a
// surface needs, mirroring `useClientScans` in letterhead-instruments.tsx,
// rather than one round-trip per thumbnail.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

/** The private Field-media bucket (00234). */
export const CAPTURE_MEDIA_BUCKET = 'capture-media';

/** Default signed-URL lifetime, matching `useFieldMediaUrl` (use-party-sms.ts:19). */
export const CAPTURE_MEDIA_TTL_SECONDS = 3600;

/** Refetch a minute before the URLs go dead (use-party-sms.ts:168's margin). */
const STALE_MARGIN_SECONDS = 60;

/** Order- and duplicate-insensitive, so two callers asking for the same set
 *  in a different order share one cache entry. */
export function captureMediaUrlsKey(paths: readonly string[], ttlSeconds: number) {
  return ['capture-media-urls', [...paths].sort().join('|'), ttlSeconds] as const;
}

function normalise(
  paths: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of paths ?? []) {
    if (typeof raw !== 'string') continue;
    const path = raw.trim();
    if (path.length > 0) seen.add(path);
  }
  return Array.from(seen).sort();
}

/**
 * Short-lived signed URLs for a set of `capture-media` object paths.
 *
 * Returns a `path → signedUrl` map. A path that could not be signed is ABSENT
 * from the map — never a broken URL — so a caller writes
 * `data?.[path] ?? fallback` and gets an honest "no image" rather than a 400.
 * `data` is `undefined` while the query is disabled (nothing to sign) or in flight.
 */
export function useCaptureMediaUrls(
  paths: readonly (string | null | undefined)[] | null | undefined,
  ttlSeconds: number = CAPTURE_MEDIA_TTL_SECONDS,
): UseQueryResult<Record<string, string>> {
  const wanted = normalise(paths);

  return useQuery<Record<string, string>>({
    queryKey: captureMediaUrlsKey(wanted, ttlSeconds),
    enabled: wanted.length > 0,
    staleTime: Math.max(0, (ttlSeconds - STALE_MARGIN_SECONDS) * 1000),
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from(CAPTURE_MEDIA_BUCKET)
        .createSignedUrls(wanted, ttlSeconds);
      if (error) throw error;

      const byPath: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (entry.path && !entry.error && entry.signedUrl) {
          byPath[entry.path] = entry.signedUrl;
        }
      }
      return byPath;
    },
  });
}
```

- [ ] **Step 4: Export it from the hooks barrel**

In `packages/supabase/src/hooks/index.ts`, append at the end of the file:

```ts
export {
  useCaptureMediaUrls,
  captureMediaUrlsKey,
  CAPTURE_MEDIA_BUCKET,
  CAPTURE_MEDIA_TTL_SECONDS,
} from "./use-capture-media";
```

(`packages/supabase/src/index.ts` does `export * from "./hooks"`, so this reaches `@patina/supabase`.)

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-capture-media.test.ts
```
Expected: PASS — `Test Files  1 passed (1)`, `Tests  8 passed (8)`.

- [ ] **Step 6: Run the gates**

Run:
```bash
pnpm type-check
```
Expected: no errors; every workspace with a `type-check` script reports success.

- [ ] **Step 7: Commit**

```bash
git add packages/supabase/src/hooks/use-capture-media.ts packages/supabase/src/hooks/__tests__/use-capture-media.test.ts packages/supabase/src/hooks/index.ts
git commit -m "feat(supabase): useCaptureMediaUrls — batched signed URLs for capture-media

Spec 11.1 / FC-R15. The portal had no read path into the private
capture-media bucket (00234), so every field photo and every second of
field audio was unreadable by web code. Batched createSignedUrls,
per-designer by the bucket's own storage RLS. A path that fails to sign
is absent from the map rather than a broken URL." -- packages/supabase/src/hooks/use-capture-media.ts packages/supabase/src/hooks/__tests__/use-capture-media.test.ts packages/supabase/src/hooks/index.ts
git push origin feat/field-companion-w1p
```

---

## Task 2: Room File capture context renders real thumbnails

Spec §11.1's named free side effect: `capture-context-section.tsx`'s own docstring (`:3-10`) says *"a thumbnail renders only when the row already carries a usable http(s) URL (the capture media bucket's own signing is out of this slice's scope)"*. `ScanContextCapture` already carries `primary_photo_path` — a `capture-media` object path (`packages/supabase/src/hooks/use-room-files.ts:250`) — and nothing has ever signed it.

**Files:**
- Modify: `apps/designer-portal/src/components/room-file/capture-context-section.tsx`
- Create: `apps/designer-portal/src/components/room-file/__tests__/capture-context-section.test.tsx`

**Interfaces:**
- Consumes: `useCaptureMediaUrls` from Task 1 (via `@patina/supabase`); `ScanContextCapture` from `@patina/supabase` (declared `use-room-files.ts:242-258`).
- Produces: nothing new. `CaptureContextSectionProps` is unchanged (`{ captures: ScanContextCapture[] }`) — the parent `room-file-view.tsx` needs no edit.

⚠ Mocking `@patina/supabase` wholesale in this suite is safe: the component's siblings (`drawings-section.tsx:21`) only *type*-import from it, and `room-file-download.ts:22`'s value imports are used lazily inside functions.

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/room-file/__tests__/capture-context-section.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { CaptureContextSection } from '../capture-context-section';
import type { ScanContextCapture } from '@patina/supabase';

const signed: Record<string, string> = {
  'uid/cap-1/photo.jpg': 'https://signed.example/1?sig=a',
};

let seenPaths: unknown[] = [];

jest.mock('@patina/supabase', () => ({
  useCaptureMediaUrls: (paths: (string | null | undefined)[]) => {
    seenPaths = paths;
    return { data: signed };
  },
}));

function capture(over: Partial<ScanContextCapture> = {}): ScanContextCapture {
  return {
    id: 'cap-1',
    title: 'Baseboard',
    notes: null,
    category: null,
    destination: null,
    status: null,
    photos: [{}],
    primary_photo_path: null,
    thumbnail_url: null,
    voice_transcript: null,
    captured_lat: null,
    captured_lng: null,
    provenance: null,
    committed_at: '2026-08-24T10:00:00Z',
    created_at: '2026-08-24T10:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  seenPaths = [];
});

describe('CaptureContextSection thumbnails', () => {
  it('renders the SIGNED capture-media URL when the row carries a storage path', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ primary_photo_path: 'uid/cap-1/photo.jpg' })]}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://signed.example/1?sig=a');
  });

  it('batches every storage path on the page into one signing call', () => {
    render(
      <CaptureContextSection
        captures={[
          capture({ id: 'a', primary_photo_path: 'uid/cap-1/photo.jpg' }),
          capture({ id: 'b', primary_photo_path: 'uid/cap-2/photo.jpg' }),
          capture({ id: 'c', primary_photo_path: null }),
        ]}
      />,
    );
    expect(seenPaths).toEqual(['uid/cap-1/photo.jpg', 'uid/cap-2/photo.jpg']);
  });

  it('falls back to an already-usable thumbnail_url when there is no storage path', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ thumbnail_url: 'https://cdn.example/legacy.jpg' })]}
      />,
    );
    expect(container.querySelector('img')!.getAttribute('src')).toBe(
      'https://cdn.example/legacy.jpg',
    );
  });

  it('shows the count placeholder — never a broken image — when the path did not sign', () => {
    const { container } = render(
      <CaptureContextSection
        captures={[capture({ id: 'cap-9', primary_photo_path: 'uid/cap-9/missing.jpg' })]}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('1◻')).toBeInTheDocument();
  });

  it('renders nothing but the empty line for a scan with no captures', () => {
    const { container } = render(<CaptureContextSection captures={[]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(
      screen.getByText('No photos or notes were pinned to this scan.'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/room-file/__tests__/capture-context-section.test.tsx
```
Expected: FAIL — the first test fails (`expect(img).not.toBeNull()` receives `null`), because the component reads only `cap.thumbnail_url`, so no `<img>` renders for a row whose only image is a storage path.

- [ ] **Step 3: Write the implementation**

In `apps/designer-portal/src/components/room-file/capture-context-section.tsx`, replace the docstring (`:1-10`) and the import block (`:12-14`) with:

```tsx
/**
 * CaptureContextSection — the field-capture items pinned to this scan during
 * capture (photos, voice notes, typed notes), resolved via provenance
 * (useScanContextCaptures — the flat `siteScanContext.scanId` key the Field app
 * writes). Each row lists its timestamp and content summary; the thumbnail is
 * the row's `primary_photo_path` signed against the private capture-media
 * bucket (spec §11.1, `useCaptureMediaUrls`), falling back to an already-usable
 * `thumbnail_url` for rows that carry one. Typography-first.
 */

import { useMemo } from 'react';
import { useCaptureMediaUrls, type ScanContextCapture } from '@patina/supabase';
import { SectionHeading, EmptyLine } from './drawings-section';
import { ROOM_FILE_COPY as C } from './room-file-copy';
```

Then replace the component's opening line (`export function CaptureContextSection({ captures }: CaptureContextSectionProps) {` followed directly by `return (`) with:

```tsx
export function CaptureContextSection({ captures }: CaptureContextSectionProps) {
  // One signing call for every path on the page, not one per row.
  const paths = useMemo(
    () =>
      captures
        .map((c) => c.primary_photo_path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0),
    [captures],
  );
  const { data: signedByPath } = useCaptureMediaUrls(paths);

  return (
```

and replace the single per-row line `const thumb = usableImage(cap.thumbnail_url);` with:

```tsx
            const signedThumb = cap.primary_photo_path
              ? (signedByPath?.[cap.primary_photo_path] ?? null)
              : null;
            const thumb = signedThumb ?? usableImage(cap.thumbnail_url);
```

Leave `usableImage`, `photoCount`, `fmtStamp`, `CaptureContextSectionProps` and every line of JSX otherwise exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/room-file/__tests__/capture-context-section.test.tsx
```
Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 5: Run the sibling suites and the gates**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/room-file
pnpm type-check && pnpm lint --filter @patina/designer-portal
```
Expected: the three pre-existing room-file suites (`drawings-section`, `render-gallery-section`, `room-file-present-line`) stay green alongside the new one; no type errors; ESLint reports no errors for `apps/designer-portal`.

- [ ] **Step 6: Commit**

```bash
git add apps/designer-portal/src/components/room-file/capture-context-section.tsx apps/designer-portal/src/components/room-file/__tests__/capture-context-section.test.tsx
git commit -m "feat(room-file): sign capture-context thumbnails via useCaptureMediaUrls

Spec 11.1's named side effect. The section's own docstring said signing
was out of its slice's scope; primary_photo_path has been carrying a
capture-media object path all along. A path that fails to sign falls
through to the count placeholder, never a broken image." -- apps/designer-portal/src/components/room-file/capture-context-section.tsx apps/designer-portal/src/components/room-file/__tests__/capture-context-section.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 3: Mount `RoomFilesSection` on the project spread

Spec §11.2 and plan §4 row 4-5 (first half). `RoomFilesSection` is complete, its docstring calls it *"the project detail page's Room Files zone"*, and **it is referenced by nothing but its own file**. Mount it between `<ScheduleSpine … />` and `<FFESection` on the project spread.

**Ruling 3-A (record it in the ledger and report it).** FC-R10 as ratified (`field-companion-rulings.md:41`) and plan §1.4 both say *"verified **in the browser**"*. This wave produces **jest** evidence: the suite below pins all four null paths plus the positive path. A browser walk additionally requires a running dev server, a signed-in session against a real database, and the `room-file` flag enabled for the walker — all outside this lane. **The browser walk is escalated to the orchestrator as an owed item, not silently substituted.** Cost of the substitution being wrong: a render-time failure that jsdom does not reproduce; low, because the mount is a single unconditional element whose component self-nulls.

**Ruling 3-B.** `RoomFilesSection` calls `useProjectRoomScans` and `useGeneratedRoomFilesByScan` **unconditionally at the top of the component** (`room-files-section.tsx:33,35`), *before* its `isReal` guard. Seven existing suites under `apps/designer-portal/src/app/(document)/doc/[id]/` mock `@patina/supabase` with a closed object literal that provides neither hook, and six of them render the project spread. **Mounting without patching those mocks throws `TypeError: (0, _supabase.useProjectRoomScans) is not a function` in six suites.** Step 4 below is not optional.

**Files:**
- Create: `apps/designer-portal/src/components/room-file/__tests__/room-files-section.test.tsx`
- Modify: `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx` — import beside `ScheduleSpine` (`:62`); mount between `<ScheduleSpine … />` (`:1354-1359`, self-closing) and `<FFESection` (`:1360`). Do **not** touch the other two `<FFESection` mounts at `:1400` and `:1430`.
- Modify (mocks only): `apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx`, `worktable.test.tsx`, `worktable-delivery.test.tsx`, `worktable-finalize.test.tsx`, `worktable-finalize-once.test.tsx`, `worktable-speccing.test.tsx`, `paper-order.test.tsx`

**Interfaces:**
- Consumes: `RoomFilesSection` from `@/components/room-file/room-files-section`, props `{ projectId: string }` (`RoomFilesSectionProps`).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Write the characterisation test**

This test pins behaviour that already exists — it is expected to pass on its first run. It exists so the mount in Step 3 cannot silently regress FC-R10 later.

Create `apps/designer-portal/src/components/room-file/__tests__/room-files-section.test.tsx`:

```tsx
/**
 * FC-R10's acceptance criterion, pinned: mounting this section unflagged on
 * the project spread must be invisible on a project with no field data.
 * The section has two null paths — nothing loaded yet, and nothing to show —
 * and both must produce an empty render, not empty chrome.
 */

import { render } from '@testing-library/react';
import { RoomFilesSection } from '../room-files-section';

type Scan = { id: string; name: string | null; scanned_at: string | null; created_at: string };
type RoomFile = { unverified?: boolean; drawings?: { sheet_count?: number } };

let scans: Scan[] | undefined;
let byScan: Map<string, RoomFile> | undefined;

jest.mock('@patina/supabase', () => ({
  useProjectRoomScans: () => ({ data: scans }),
  useGeneratedRoomFilesByScan: () => ({ data: byScan }),
}));

const PROJECT = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  scans = undefined;
  byScan = undefined;
});

describe('RoomFilesSection — the unflagged-mount safety property (FC-R10)', () => {
  it('renders NOTHING for a project whose scans carry no Room File', () => {
    scans = [{ id: 'scan-1', name: 'Living', scanned_at: null, created_at: '2026-08-01T00:00:00Z' }];
    byScan = new Map();
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING for a project with no scans at all', () => {
    scans = [];
    byScan = new Map();
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING while the queries are still in flight', () => {
    const { container } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING for a non-UUID project id (the pre-project document)', () => {
    scans = [{ id: 'scan-1', name: 'Living', scanned_at: null, created_at: '2026-08-01T00:00:00Z' }];
    byScan = new Map([['scan-1', { drawings: { sheet_count: 4 } }]]);
    const { container } = render(<RoomFilesSection projectId="not-a-uuid" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per Room-File-bearing scan, each a door into /room/<id>/file', () => {
    scans = [
      { id: 'scan-1', name: 'Living', scanned_at: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:00:00Z' },
      { id: 'scan-2', name: 'Dining', scanned_at: null, created_at: '2026-08-02T00:00:00Z' },
    ];
    byScan = new Map([['scan-1', { drawings: { sheet_count: 4 } }]]);

    const { container, getByText } = render(<RoomFilesSection projectId={PROJECT} />);
    expect(container).not.toBeEmptyDOMElement();
    expect(getByText('Living')).toBeInTheDocument();
    expect(container.querySelectorAll('a[href="/room/scan-1/file"]')).toHaveLength(1);
    // scan-2 has no generated Room File — it is not a row.
    expect(container.querySelectorAll('a[href="/room/scan-2/file"]')).toHaveLength(0);
    expect(getByText('1 room')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect PASS, and record that**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/room-file/__tests__/room-files-section.test.tsx
```
Expected: PASS — `Tests: 5 passed, 5 total`. The component is pre-existing and correct; this is a characterisation test, so a first-run pass is the expected outcome. Record the counts.

- [ ] **Step 3: Mount the section on the project spread**

In `apps/designer-portal/src/app/(document)/doc/[id]/page.tsx`, add the import immediately after the `ScheduleSpine` import at `:62`:

```tsx
import { RoomFilesSection } from '@/components/room-file/room-files-section';
```

Then insert the mount between the self-closing `<ScheduleSpine … />` (ends `:1359`) and `<FFESection` (`:1360`):

```tsx
                  <ScheduleSpine
                    projectId={row.project_id}
                    clientUserId={row.client_profile_id}
                    clientName={row.client_name}
                    projectStatus={project?.status}
                  />
                  {/* Wave 1P (spec §11.2) — the Room-files zone the component's
                    own docstring was written for and nothing ever mounted.
                    Unflagged by FC-R10: it returns null for a project with no
                    Room-File-bearing scans, so a field-less project renders
                    exactly as it did before this line existed. */}
                  <RoomFilesSection projectId={row.project_id} />
                  <FFESection
```

- [ ] **Step 4: Teach the seven existing route suites the two new hooks**

Each of these files contains a `jest.mock('@patina/supabase', () => ({ … }))` with a closed object literal. Add these two entries to **every one** of the seven object literals (order within the object does not matter):

```ts
  useProjectRoomScans: () => ({ data: [] }),
  useGeneratedRoomFilesByScan: () => ({ data: new Map() }),
```

Files (all under `apps/designer-portal/src/app/(document)/doc/[id]/`):
- `page.test.tsx` (mock at `:89-108`)
- `worktable.test.tsx` (mock at `:29-49`)
- `worktable-delivery.test.tsx`
- `worktable-finalize.test.tsx`
- `worktable-finalize-once.test.tsx`
- `worktable-speccing.test.tsx`
- `paper-order.test.tsx`

Confirm you found all seven before editing:
```bash
grep -rln "jest.mock('@patina/supabase'" "apps/designer-portal/src/app/(document)/doc/[id]/"
```
Expected: exactly those seven paths. If the count differs, patch every file the grep returns.

- [ ] **Step 5: Run the route suites**

Run:
```bash
pnpm --filter @patina/designer-portal test -- "src/app/\(document\)/doc"
```
Expected: all seven suites pass, with counts matching Task 0's baseline for those files. Any `useProjectRoomScans is not a function` here means a mock was missed — fix it, do not proceed.

- [ ] **Step 6: Run the gates**

Run:
```bash
pnpm type-check && pnpm build --filter @patina/designer-portal
```
Expected: no type errors; the Next build completes with `Compiled successfully`.
⚠ Kill any running `next dev` first. If the build fails with a missing-vendor-chunk error, `rm -rf apps/designer-portal/.next` and re-run.

- [ ] **Step 7: Commit**

```bash
git add "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-delivery.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-finalize.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-finalize-once.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-speccing.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/paper-order.test.tsx" apps/designer-portal/src/components/room-file/__tests__/room-files-section.test.tsx
git commit -m "feat(document): mount RoomFilesSection on the project spread

Spec 11.2 / plan 4-5. The component has been complete and referenced by
nothing but its own file since Field Capture P1. Mounted unflagged per
FC-R10, between ScheduleSpine and FFESection; the accompanying test pins
all four of its null paths so a field-less project renders identically
to before.

The section calls useProjectRoomScans/useGeneratedRoomFilesByScan
unconditionally, above its own isReal guard, so the seven route suites'
closed @patina/supabase mocks learn both hooks in the same commit.

Prerequisite outside this lane: enable the existing room-file flag for
the pilot cohort, or every row's destination stays dark." -- "apps/designer-portal/src/app/(document)/doc/[id]/page.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/page.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-delivery.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-finalize.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-finalize-once.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/worktable-speccing.test.tsx" "apps/designer-portal/src/app/(document)/doc/[id]/paper-order.test.tsx" apps/designer-portal/src/components/room-file/__tests__/room-files-section.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 4: Union designer-owned scans into both client-only attach points

Spec §11.2's second bullet and plan §4 row 4-5 (second half — the row reads *"Mount `RoomFilesSection` **+ the designer-scan union**"*, so this is in scope, not creep): *"A designer literally cannot attach her own site scan to her own project's document today."* Both attach points filter to **client**-owned scans:
- `useClientScans` — `letterhead-instruments.tsx:84`, `room_scans.user_id = clientProfileId`
- `useClientRoomScans` — `packages/supabase/src/hooks/use-room-scans.ts:185-221`, `user_id = designer_clients.client_id`, feeding Discovery's `SiteScanEditor` through `discovery-section.tsx:146` → `:255` `scanOptions` → `:348`.

The union changes what a client-provenance instrument *means*, so **provenance stays visible in the row** (FC-R10's named line): *yours* vs *from your client*.

**Ruling 4-A.** `letterhead-instruments.tsx:87`'s `enabled: Boolean(clientProfileId)` **stays**. Dropping it would fire a `room_scans` read plus up to five `createSignedUrls` on every lead, proposal and relationship-only document that issues none today. A project document carries a `clientProfileId`, which is the surface the spec's complaint is about. Cost of being wrong: a designer on a client-less document still cannot open her own scan from the letterhead — she can from Discovery, where the picker is unconditional.

**Ruling 4-B.** The "The scan" door **prefers the client's scan**. `letterhead-instruments.tsx:235-238` picks `scans.find(s => s.image_url)` over what is now up to ten rows sorted newest-first, so without a preference the door's target could silently flip from the client's scan to a newer designer-owned one on an existing document. The picker takes the client leg first and falls back to the designer's. Cost of being wrong: none — a designer-only document has no client row to prefer.

**Files:**
- Modify: `packages/supabase/src/hooks/use-room-scans.ts` — replace `:181-221` (the docstring at `:181-184` plus the whole `useClientRoomScans` body at `:185-221`)
- Modify: `packages/supabase/src/hooks/index.ts`
- Create: `packages/supabase/src/hooks/__tests__/use-client-room-scans-union.test.ts`
- Modify: `apps/designer-portal/src/components/document/discovery/discovery-section.tsx` (`:146-150`, `:255-258`)
- Modify: `apps/designer-portal/src/components/document/letterhead-instruments.tsx` — `ScanArtifact` `:65-72`; the `useClientScans` head **`:84-105`** (through and including the `const scans = (data ?? []) as Array<{ … }>;` declaration that ends at `:105`); the returned object at `:131-145`; the `scan` useMemo `:235-238`; the instrument `:287-299`
- Modify: `apps/designer-portal/src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  // packages/supabase/src/hooks/use-room-scans.ts
  export type RoomScanOwnerKind = 'designer' | 'client';
  export interface RoomScanWithProvenance extends RoomScan {
    /** 'designer' = the signed-in designer's own scan; 'client' = the client's. */
    owner_kind: RoomScanOwnerKind;
  }
  // useClientRoomScans keeps its inferred UseQueryResult<RoomScanWithProvenance[]>
  // return type — no explicit annotation, no new import.
  ```
  `owner_kind` is derived at read time from the row's `user_id`; nothing is written. `RoomScan.created_at: string` (non-nullable, `use-room-scans.ts:69`) is what the merged list sorts on.

- [ ] **Step 1: Write the failing test**

Create `packages/supabase/src/hooks/__tests__/use-client-room-scans-union.test.ts`:

```ts
/**
 * `useClientRoomScans` after the Wave 1P union (spec §11.2): the designer's own
 * ready scans join her client's, each row stamped with WHOSE it is so the
 * client-provenance instrument does not silently start meaning something else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };

const results: Record<string, BuilderResult[]> = {};
const defaults: Record<string, BuilderResult> = {};
const calls: Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }> = [];

function makeBuilder(table: string) {
  const chain: Array<{ method: string; args: unknown[] }> = [];
  calls.push({ table, chain });
  const take = (): BuilderResult =>
    results[table]?.shift() ?? defaults[table] ?? { data: null, error: null };
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      chain.push({ method, args });
      return builder;
    });
  const builder = {
    select: record('select'),
    eq: record('eq'),
    order: record('order'),
    maybeSingle: vi.fn(async () => take()),
    then: (resolve: (v: BuilderResult) => unknown) => Promise.resolve(take()).then(resolve),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return builder;
}

const from = vi.fn((table: string) => makeBuilder(table));
let user: { id: string } | null = { id: 'designer-uid' };
const getUser = vi.fn(async () => ({ data: { user }, error: null }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, auth: { getUser } }),
}));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<unknown>;
}
let issued: QueryConfig[] = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useClientRoomScans } from '../use-room-scans';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useClientRoomScans issued no query');
  return found;
}

function scan(id: string, userId: string, createdAt = '2026-08-01T00:00:00Z') {
  return { id, user_id: userId, name: id, status: 'ready', created_at: createdAt };
}

beforeEach(() => {
  for (const key of Object.keys(results)) delete results[key];
  for (const key of Object.keys(defaults)) delete defaults[key];
  calls.length = 0;
  issued = [];
  user = { id: 'designer-uid' };
  from.mockClear();
  getUser.mockClear();
});

describe('useClientRoomScans — the designer-scan union', () => {
  it("returns the client's scans AND the designer's own, each stamped with whose it is", async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [
      { data: [scan('client-scan', 'client-uid')], error: null },
      { data: [scan('my-scan', 'designer-uid')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows.map((r) => [r.id, r.owner_kind])).toEqual(
      expect.arrayContaining([
        ['client-scan', 'client'],
        ['my-scan', 'designer'],
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it('sorts the merged list newest-first', async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [
      { data: [scan('older-client', 'client-uid', '2026-01-01T00:00:00Z')], error: null },
      { data: [scan('newer-mine', 'designer-uid', '2026-08-01T00:00:00Z')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(['newer-mine', 'older-client']);
  });

  it('never lists the same scan twice when the designer IS the client', async () => {
    defaults.designer_clients = { data: { client_id: 'designer-uid' }, error: null };
    results.room_scans = [
      { data: [scan('one', 'designer-uid')], error: null },
      { data: [scan('one', 'designer-uid')], error: null },
    ];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].owner_kind).toBe('designer');
  });

  it("still returns the designer's own scans when the relationship row is missing", async () => {
    // Before this change the hook returned [] here — the exact reason a designer
    // could not attach her own scan to her own document.
    defaults.designer_clients = { data: null, error: null };
    results.room_scans = [{ data: [scan('my-scan', 'designer-uid')], error: null }];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string; owner_kind: string }>;

    expect(rows.map((r) => r.id)).toEqual(['my-scan']);
    expect(rows[0].owner_kind).toBe('designer');
  });

  it('returns only the client leg when nobody is signed in', async () => {
    user = null;
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    results.room_scans = [{ data: [scan('client-scan', 'client-uid')], error: null }];

    useClientRoomScans('dc-1');
    const rows = (await query().queryFn()) as Array<{ id: string }>;

    expect(rows.map((r) => r.id)).toEqual(['client-scan']);
  });

  it('reads only ready scans on both legs', async () => {
    defaults.designer_clients = { data: { client_id: 'client-uid' }, error: null };
    defaults.room_scans = { data: [], error: null };

    useClientRoomScans('dc-1');
    await query().queryFn();

    const scanCalls = calls.filter((c) => c.table === 'room_scans');
    expect(scanCalls).toHaveLength(2);
    for (const c of scanCalls) {
      expect(c.chain).toContainEqual({ method: 'eq', args: ['status', 'ready'] });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-client-room-scans-union.test.ts
```
Expected: FAIL — the first test fails with the received array containing `[ 'client-scan', undefined ]`, because the hook returns only the client leg and stamps nothing.

- [ ] **Step 3: Rewrite `useClientRoomScans`**

In `packages/supabase/src/hooks/use-room-scans.ts`, replace lines `181-221` (the `/** Fetch room scans for a specific client (for designers) … */` docstring through the closing `}` of `useClientRoomScans`) with:

```ts
/** Whose scan a row is, resolved at read time — never a stored column. */
export type RoomScanOwnerKind = 'designer' | 'client';

export interface RoomScanWithProvenance extends RoomScan {
  /** 'designer' = the signed-in designer's own scan; 'client' = the client's. */
  owner_kind: RoomScanOwnerKind;
}

const CLIENT_SCAN_SELECT = `
          *,
          project:projects!project_id(
            id,
            name
          )
        `;

/**
 * Ready room scans a designer can attach to this client's document: the
 * client's own scans UNIONED with the designer's own (spec §11.2, Wave 1P).
 *
 * Before this union the hook read only `user_id = designer_clients.client_id`,
 * so a designer could not attach a scan SHE captured to her own project's
 * document. RLS already permits both legs; the filter was the whole obstacle.
 *
 * Every row carries `owner_kind` so the surfaces above keep saying whose scan
 * it is — a client-provenance instrument must not quietly start meaning
 * "anyone's" (FC-R10).
 */
export function useClientRoomScans(clientId: string) {
  return useQuery({
    queryKey: ['client-room-scans', clientId],
    queryFn: async (): Promise<RoomScanWithProvenance[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: auth } = await supabase.auth.getUser();
      const designerId: string | null = auth?.user?.id ?? null;

      const { data: designerClient, error: dcError } = await supabase
        .from('designer_clients')
        .select('client_id')
        .eq('id', clientId)
        .maybeSingle();
      if (dcError) throw dcError;

      const clientUserId: string | null = designerClient?.client_id ?? null;

      const readScansFor = async (ownerId: string): Promise<RoomScan[]> => {
        const { data, error } = await supabase
          .from('room_scans')
          .select(CLIENT_SCAN_SELECT)
          .eq('user_id', ownerId)
          .eq('status', 'ready')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as RoomScan[];
      };

      // Both legs in flight together — this sits on the document's render path.
      const [clientRows, designerRows] = await Promise.all([
        clientUserId ? readScansFor(clientUserId) : Promise.resolve<RoomScan[]>([]),
        designerId ? readScansFor(designerId) : Promise.resolve<RoomScan[]>([]),
      ]);

      // The designer's own reading wins when she IS the client on this
      // relationship, so a self-scan is listed once and reads as hers.
      const byId = new Map<string, RoomScanWithProvenance>();
      for (const row of clientRows) byId.set(row.id, { ...row, owner_kind: 'client' });
      for (const row of designerRows) byId.set(row.id, { ...row, owner_kind: 'designer' });

      return Array.from(byId.values()).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
    },
    enabled: !!clientId,
  });
}
```

Then, in `packages/supabase/src/hooks/index.ts`, add beside the existing `use-room-scans` type exports (the `export type { … } from "./use-room-scans"` block near `:600-614`):

```ts
export type { RoomScanOwnerKind, RoomScanWithProvenance } from "./use-room-scans";
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-client-room-scans-union.test.ts
```
Expected: PASS — `Tests  6 passed (6)`.

⚠ The `Promise.all` above means the two `room_scans` builders are created concurrently; the test's per-table result queue is FIFO, so the client leg's result is consumed first. The tests are written to that order.

- [ ] **Step 5: Show the provenance in the Discovery scan picker**

In `apps/designer-portal/src/components/document/discovery/discovery-section.tsx`, replace `:146-150`:

```tsx
  const { data: scans } = useClientRoomScans(clientProfileId ?? '') as {
    data:
      | {
          id: string;
          name?: string | null;
          created_at?: string;
          owner_kind?: 'designer' | 'client';
        }[]
      | undefined;
  };
```

and replace `:255-258`:

```tsx
  const scanOptions: Option[] = (scans ?? []).map((s) => ({
    value: s.id,
    // Wave 1P (spec §11.2): the designer's own scans now appear here too, so
    // the row has to keep saying whose scan it is.
    label: `${s.name || `Scan ${s.created_at?.slice(0, 10) ?? ''}`.trim()} · ${
      s.owner_kind === 'designer' ? 'yours' : 'from your client'
    }`,
  }));
```

(`Option` is `{ value: string; label: string }`, `discovery/field-kit.tsx:111-114` — the template literal is a valid `string`. `SiteScanEditor` just forwards `scanOptions` to `<Select>` and needs no edit.)

- [ ] **Step 6: Union the letterhead instrument**

In `apps/designer-portal/src/components/document/letterhead-instruments.tsx`:

**(a)** Replace `ScanArtifact` (`:65-72`):

```tsx
interface ScanArtifact {
  id: string;
  name: string | null;
  created_at: string;
  /** The resolved cover photo's SIGNED url (I79/I81) — null when the scan
   *  has no photos, or (defensively) when signing a resolved photo failed. */
  image_url: string | null;
  /** Whose scan this is (Wave 1P, spec §11.2). The instrument says so. */
  owner_kind: 'designer' | 'client';
}
```

**(b)** Replace lines `84-105` — from `function useClientScans(clientProfileId: string | null) {` through and including the closing `}>;` of the `const scans = (data ?? []) as Array<{ … }>;` declaration — with:

```tsx
/** The client's ready scans AND the designer's own (spec §11.2, Wave 1P).
 *  Before the union a designer could not open her own site scan from her own
 *  project's document. Provenance rides each row so the instrument's label
 *  still says whose scan it is.
 *
 *  `enabled` deliberately still gates on `clientProfileId` (Ruling 4-A): a
 *  lead / proposal / relationship-only document must not start issuing a
 *  room_scans read plus signing calls it never issued before. */
function useClientScans(clientProfileId: string | null) {
  return useQuery<ScanArtifact[]>({
    queryKey: ['document-client-scans', clientProfileId],
    enabled: Boolean(clientProfileId),
    queryFn: async () => {
      const supabase = getSupabase();
      const select =
        'id, name, created_at, images:room_scan_images(image_url, is_primary, quality_score, display_order)';

      const { data: auth } = await supabase.auth.getUser();
      const designerId: string | null = auth?.user?.id ?? null;

      type ScanRow = {
        id: string;
        name: string | null;
        created_at: string;
        images: HeroCandidate[] | null;
      };

      const readScansFor = async (ownerId: string): Promise<ScanRow[]> => {
        const { data, error } = await supabase
          .from('room_scans')
          .select(select)
          .eq('user_id', ownerId)
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        return (data ?? []) as ScanRow[];
      };

      const [clientRows, designerRows] = await Promise.all([
        clientProfileId ? readScansFor(clientProfileId) : Promise.resolve<ScanRow[]>([]),
        designerId ? readScansFor(designerId) : Promise.resolve<ScanRow[]>([]),
      ]);

      const byId = new Map<string, ScanRow & { owner_kind: 'designer' | 'client' }>();
      for (const row of clientRows) byId.set(row.id, { ...row, owner_kind: 'client' });
      // The designer leg lands last, so a self-scan reads as hers.
      for (const row of designerRows) byId.set(row.id, { ...row, owner_kind: 'designer' });

      const scans = Array.from(byId.values()).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
```

Everything from the `// Resolve one cover photo per scan (I81's …)` comment (`:107`) through the batched `createSignedUrls` block is left byte-identical.

**(c)** Replace the returned object at `:131-145`'s tail so the stamp survives — the mapped return becomes:

```tsx
        return {
          id: s.id,
          name: s.name,
          created_at: s.created_at,
          image_url,
          owner_kind: s.owner_kind,
        };
```

**(d)** Replace the `scan` useMemo (`:235-238`) so the door keeps its current target (Ruling 4-B):

```tsx
  // Ruling 4-B: the client's scan stays the door's first choice, so unioning
  // the designer's own scans never silently retargets an existing document.
  const scan = useMemo(() => {
    const withImage = (scans ?? []).filter((s) => s.image_url);
    return (
      withImage.find((s) => s.owner_kind === 'client') ?? withImage[0] ?? null
    );
  }, [scans]);
```

**(e)** Replace the instrument's label (`:287-299`):

```tsx
        {scan && (
          <DocumentAction
            actionKey="open-client-scan"
            variant="tertiary"
            onClick={() =>
              router.push(
                `/room/${scan.id}?from=document${engagementId ? `&docId=${engagementId}` : ''}`,
              )
            }
          >
            {scan.owner_kind === 'designer' ? 'Your scan' : 'The scan'}
          </DocumentAction>
        )}
```

- [ ] **Step 7: Extend the scan-door test**

`apps/designer-portal/src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx` already mocks `createBrowserClient` with a `from().select().eq().order().limit()` chain and `auth: { getUser: () => Promise.resolve({ data: { user: null } }) }` (`:43`) — so its existing cases keep exercising the client-only leg and stay green. Append this `describe` block at the end of the file:

```tsx
describe('LetterheadInstruments — "The scan" door provenance (Wave 1P)', () => {
  it('labels the door "The scan" while the client leg supplies it', async () => {
    renderInstruments(null);
    expect(await screen.findByText('The scan')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the touched suites**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/discovery
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx src/components/document/__tests__/call-sheet-doorways.test.tsx
```
Expected: both `discovery-section.test.tsx` files stay green (each already mocks `useClientRoomScans: () => ({ data: [] })`, at `:59` and `:28`), and both letterhead suites pass. Record the counts against Task 0's baseline.

- [ ] **Step 9: Run the gates**

Run:
```bash
pnpm type-check && pnpm lint --filter @patina/designer-portal && pnpm build --filter @patina/designer-portal
```
Expected: no type errors, no lint errors, `Compiled successfully`.

- [ ] **Step 10: Commit**

```bash
git add packages/supabase/src/hooks/use-room-scans.ts packages/supabase/src/hooks/index.ts packages/supabase/src/hooks/__tests__/use-client-room-scans-union.test.ts apps/designer-portal/src/components/document/discovery/discovery-section.tsx apps/designer-portal/src/components/document/letterhead-instruments.tsx apps/designer-portal/src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx
git commit -m "feat(document): union designer-owned scans into both client-only attach points

Spec 11.2 / plan 4-5. useClientScans and useClientRoomScans both read
only the CLIENT's room_scans, so a designer could not attach a scan she
captured to her own project's document. Both now union her own ready
scans and stamp owner_kind, and both surfaces keep saying whose scan a
row is — 'yours' vs 'from your client' (FC-R10).

Two deliberate restraints: the letterhead query still gates on
clientProfileId, so client-less documents issue no new reads; and the
door prefers the client's scan, so unioning cannot retarget an existing
document's 'The scan' link. Both legs run under Promise.all." -- packages/supabase/src/hooks/use-room-scans.ts packages/supabase/src/hooks/index.ts packages/supabase/src/hooks/__tests__/use-client-room-scans-union.test.ts apps/designer-portal/src/components/document/discovery/discovery-section.tsx apps/designer-portal/src/components/document/letterhead-instruments.tsx apps/designer-portal/src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 5: Library provenance chip — `products.capture_source`

Spec §6 Flow 6 (*"Provenance becomes legible. `products.capture_source` is never read by the portal. One chip on the Library card — 'Field · High Point, Mar 2026'."*) and plan §4 row 4-12.

Verified: `capture_source` exists on `products` since `00232_products_field_capture_origin.sql:21`, constrained to `web_extension | portal | field_capture | manual | import` (`:28-31`). `commit_field_capture` stamps `'field_capture'`, `captured_at` and `field_capture_id` on every minted piece (`00235_commit_field_capture_rpc.sql:234-245`). Outside `apps/extension`, no portal code reads any of them.

**The venue half is available.** `field_captures.venue_label` exists (`00233_field_captures_inbox.sql:86`) and `commit_field_capture` populates it from the phone's `venue` object (`00235:98`). `products.field_capture_id` has an FK to it (`products_field_capture_id_fkey`, `00233:144`). So `Field · High Point, Mar 2026` is one join away.

**Ruling 5-A.** The venue is read by a **separate, additive hook**, not by widening `useLayerProducts`'s embed. `useLayerProducts` powers all three Library shelves; an embed that errors (relationship naming, RLS, PostgREST) would darken the whole Library. An isolated query that fails only costs the chip its place name, degrading to `Field · Mar 2026`. Cost of being wrong: one extra round-trip per shelf that has field-captured pieces.

**Files:**
- Modify: `packages/supabase/src/hooks/use-layer-products.ts` — `LayerProductRow` (`:38-55`), the `.select(...)` (`:85-87`)
- Create: `packages/supabase/src/hooks/use-capture-venues.ts`
- Create: `packages/supabase/src/hooks/__tests__/use-capture-venues.test.ts`
- Modify: `packages/supabase/src/hooks/index.ts`
- Modify: `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx` (the `item={{ … }}` object literal at `:114-125`)
- Modify: `apps/designer-portal/src/components/document/rooms/library/library-card.tsx` — `LibraryItem` (`:31-42`), the derivation beside `configurationLabels` (`:86`), the render after the `{sub}` block (`:146-148`), the helper beside `hostOf` at the file's tail
- Create: `apps/designer-portal/src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  // packages/supabase/src/hooks/use-layer-products.ts — LayerProductRow gains:
  capture_source: string | null;
  captured_at: string | null;
  field_capture_id: string | null;

  // packages/supabase/src/hooks/use-capture-venues.ts
  export function useCaptureVenueLabels(
    fieldCaptureIds: readonly (string | null | undefined)[] | null | undefined,
  ): UseQueryResult<Record<string, string>>; // captureId → venue_label

  // library-card.tsx — LibraryItem gains capture_source / captured_at /
  // venue_label (all optional), and:
  export function fieldProvenanceLabel(
    item: Pick<LibraryItem, 'capture_source' | 'captured_at' | 'venue_label'>,
  ): string | null;
  ```

- [ ] **Step 1: Write the failing venue-hook test**

Create `packages/supabase/src/hooks/__tests__/use-capture-venues.test.ts`:

```ts
/**
 * `useCaptureVenueLabels` — the place-name half of the Library provenance chip
 * (spec §6 Flow 6). Deliberately its OWN query rather than an embed on
 * `useLayerProducts`, so a failure here costs the chip a place name instead of
 * darkening every Library shelf (plan Ruling 5-A).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };
let tableResult: BuilderResult = { data: [], error: null };
const chain: Array<{ method: string; args: unknown[] }> = [];

function makeBuilder() {
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      chain.push({ method, args });
      return builder;
    });
  const builder = {
    select: record('select'),
    in: record('in'),
    then: (resolve: (v: BuilderResult) => unknown) => Promise.resolve(tableResult).then(resolve),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return builder;
}

const from = vi.fn((_table: string) => makeBuilder());
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ from }) }));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<Record<string, string>>;
}
let issued: QueryConfig[] = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
}));

import { useCaptureVenueLabels } from '../use-capture-venues';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useCaptureVenueLabels issued no query');
  return found;
}

beforeEach(() => {
  tableResult = { data: [], error: null };
  chain.length = 0;
  issued = [];
  from.mockClear();
});

describe('useCaptureVenueLabels', () => {
  it('stays disabled with nothing to look up', () => {
    for (const input of [null, undefined, [], [null, undefined, '']]) {
      issued = [];
      useCaptureVenueLabels(input as string[] | null | undefined);
      expect(query().enabled).toBe(false);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('reads only id + venue_label for the ids it was given', async () => {
    tableResult = {
      data: [
        { id: 'cap-1', venue_label: 'High Point' },
        { id: 'cap-2', venue_label: null },
      ],
      error: null,
    };

    useCaptureVenueLabels(['cap-2', 'cap-1', 'cap-1']);
    expect(query().queryKey).toEqual(['capture-venue-labels', 'cap-1|cap-2']);

    await expect(query().queryFn()).resolves.toEqual({ 'cap-1': 'High Point' });
    expect(from).toHaveBeenCalledWith('field_captures');
    expect(chain).toContainEqual({ method: 'select', args: ['id, venue_label'] });
    expect(chain).toContainEqual({ method: 'in', args: ['id', ['cap-1', 'cap-2']] });
  });

  it('resolves to an empty map rather than throwing when the read fails', async () => {
    // Ruling 5-A: a failure here must cost the chip its place name, never the shelf.
    tableResult = { data: null, error: new Error('RLS') };
    useCaptureVenueLabels(['cap-1']);
    await expect(query().queryFn()).resolves.toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-capture-venues.test.ts
```
Expected: FAIL — `Failed to resolve import "../use-capture-venues"`.

- [ ] **Step 3: Write the venue hook**

Create `packages/supabase/src/hooks/use-capture-venues.ts`:

```ts
'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CAPTURE VENUES — the place name behind the Library provenance chip.
//
// `field_captures.venue_label` (00233:86) is written by commit_field_capture
// from the phone's venue object (00235:98), and `products.field_capture_id`
// points at that row (products_field_capture_id_fkey, 00233:144).
//
// Deliberately a SEPARATE query rather than an embed on useLayerProducts:
// that hook powers all three Library shelves, and an embed that errors would
// darken the whole Library. This one resolves to {} on failure, so the chip
// simply loses its place name.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

function normalise(
  ids: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (id.length > 0) seen.add(id);
  }
  return Array.from(seen).sort();
}

/** `field_captures.id → venue_label`, for capture ids that have one. */
export function useCaptureVenueLabels(
  fieldCaptureIds: readonly (string | null | undefined)[] | null | undefined,
): UseQueryResult<Record<string, string>> {
  const wanted = normalise(fieldCaptureIds);

  return useQuery<Record<string, string>>({
    queryKey: ['capture-venue-labels', wanted.join('|')],
    enabled: wanted.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_captures')
        .select('id, venue_label')
        .in('id', wanted);

      // Never throw: a missing place name is a cosmetic loss, and this query
      // sits beside a shelf that must render regardless (Ruling 5-A).
      if (error) return {};

      const byId: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ id: string; venue_label: string | null }>) {
        if (row.id && row.venue_label) byId[row.id] = row.venue_label;
      }
      return byId;
    },
  });
}
```

Then add to `packages/supabase/src/hooks/index.ts`:

```ts
export { useCaptureVenueLabels } from "./use-capture-venues";
```

- [ ] **Step 4: Run it to verify it passes**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-capture-venues.test.ts
```
Expected: PASS — `Tests  3 passed (3)`.

- [ ] **Step 5: Widen `useLayerProducts`**

In `packages/supabase/src/hooks/use-layer-products.ts`, add to `LayerProductRow` immediately after `created_at: string;`:

```ts
  /** Origin surface of this row (00232): web_extension | portal | field_capture |
   *  manual | import. NULL for legacy/unattributed rows. */
  capture_source: string | null;
  /** When the piece was captured — the date the Field provenance chip shows. */
  captured_at: string | null;
  /** Back-reference to the field_captures row this piece was minted from
   *  (00233), used to look up the capture's venue label. */
  field_capture_id: string | null;
```

and replace the `.select(...)` at `:85-87`:

```ts
        .select(
          "id, name, brand, price_retail, price_trade, images, source_url, status, category, configuration_mode, configuration_summary, layer, owner_user_id, studio_id, created_at, capture_source, captured_at, field_capture_id",
        )
```

- [ ] **Step 6: Write the failing card test**

Create `apps/designer-portal/src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { fieldProvenanceLabel, LibraryCard } from '../library-card';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@patina/supabase', () => ({
  useStyleArchetypes: () => ({ data: [], isLoading: false }),
  useAssignStyle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductStyles: () => ({ data: [], isLoading: false }),
  useSubmitValidation: () => ({ mutateAsync: jest.fn(), isPending: false, variables: undefined }),
}));

describe('fieldProvenanceLabel', () => {
  it('names Field, the place and the month for a piece minted from a field capture', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        venue_label: 'High Point',
      }),
    ).toBe('Field · High Point, Mar 2026');
  });

  it('drops the place when the capture carried no venue', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        venue_label: null,
      }),
    ).toBe('Field · Mar 2026');
  });

  it('still says Field when the capture date is missing', () => {
    expect(
      fieldProvenanceLabel({ capture_source: 'field_capture', captured_at: null, venue_label: null }),
    ).toBe('Field');
  });

  it('falls back to bare Field for an unparseable stamp', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: 'not-a-date',
        venue_label: null,
      }),
    ).toBe('Field');
  });

  it('says nothing for every other origin', () => {
    for (const source of ['web_extension', 'portal', 'manual', 'import', null, undefined, '']) {
      expect(
        fieldProvenanceLabel({
          capture_source: source as string | null,
          captured_at: '2026-03-14T09:00:00Z',
          venue_label: 'High Point',
        }),
      ).toBeNull();
    }
  });
});

describe('LibraryCard — the chip actually renders', () => {
  const base = {
    id: 'p-1',
    name: 'Bouclé lounge',
    brand: null,
    images: null,
    source_url: null,
    category: 'seating',
    layer: 'personal' as const,
  };

  it('shows the chip on a field-captured piece', () => {
    const { getByText } = render(
      <LibraryCard
        item={{
          ...base,
          capture_source: 'field_capture',
          captured_at: '2026-03-14T09:00:00Z',
          venue_label: 'High Point',
        }}
        needsTeaching={false}
        onDeep={jest.fn()}
      />,
    );
    expect(getByText('Field · High Point, Mar 2026')).toBeInTheDocument();
  });

  it('shows no chip on an extension-captured piece', () => {
    const { queryByText } = render(
      <LibraryCard
        item={{ ...base, capture_source: 'web_extension', captured_at: '2026-03-14T09:00:00Z' }}
        needsTeaching={false}
        onDeep={jest.fn()}
      />,
    );
    expect(queryByText(/^Field/)).toBeNull();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx
```
Expected: FAIL — `library-card.tsx` does not export `fieldProvenanceLabel`.

- [ ] **Step 8: Render the chip**

In `apps/designer-portal/src/components/document/rooms/library/library-card.tsx`:

**(a)** Add to `LibraryItem` (`:31-42`), after `configuration_summary?: unknown;`:

```ts
  /** 00232 — where this piece came from. 'field_capture' earns the chip. */
  capture_source?: string | null;
  captured_at?: string | null;
  /** `field_captures.venue_label` for this piece's originating capture (00233),
   *  resolved by the shelf via `useCaptureVenueLabels`. */
  venue_label?: string | null;
```

**(b)** Add the helper immediately above `function hostOf(url: string)` at the file's tail:

```tsx
/** The Field provenance chip's text (spec §6 Flow 6, plan 4-12).
 *  "Field · High Point, Mar 2026" when the capture carried a venue,
 *  "Field · Mar 2026" when it did not, "Field" when even the date is missing. */
export function fieldProvenanceLabel(
  item: Pick<LibraryItem, 'capture_source' | 'captured_at' | 'venue_label'>,
): string | null {
  if (item.capture_source !== 'field_capture') return null;

  const place = item.venue_label?.trim() || null;
  const when = item.captured_at ? new Date(item.captured_at) : null;
  const month =
    when && !Number.isNaN(when.getTime())
      ? when.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : null;

  const tail = [place, month].filter(Boolean).join(', ');
  return tail ? `Field · ${tail}` : 'Field';
}
```

**(c)** Derive it beside `configurationLabels` (`:86`):

```tsx
  const fieldProvenance = fieldProvenanceLabel(item);
```

**(d)** Render it immediately after the `{sub}` div (`:146-148`):

```tsx
        {fieldProvenance && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-body)]">
            {fieldProvenance}
          </div>
        )}
```

- [ ] **Step 9: Pass the fields through the shelf**

`library-shelf.tsx` builds the card's `item` prop **field by field** (`:114-125`) — widening the row type alone delivers nothing. In `apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx`:

**(a)** Add the venue lookup beside the existing `useLayerProducts` call at `:46`:

```tsx
  const { data, isLoading, isError } = useLayerProducts({ layer });
  // Wave 1P (spec §6 Flow 6) — the place name behind the Field chip.
  const captureIds = useMemo(
    () => (data ?? []).map((p) => p.field_capture_id),
    [data],
  );
  const { data: venueByCapture } = useCaptureVenueLabels(captureIds);
```

`library-shelf.tsx` has **no React import today** (verified — its first import is `@patina/supabase` at `:10`). Add one above it, and widen the `@patina/supabase` import:

```tsx
import { useMemo } from "react";
import {
  useLayerProducts,
  useCaptureVenueLabels,
  type LayerProductLayer,
} from "@patina/supabase";
```

**(b)** Replace the `item={{ … }}` literal at `:114-125` with:

```tsx
                item={{
                  id: it.id,
                  name: it.name,
                  brand: it.brand,
                  images: it.images,
                  source_url: it.source_url,
                  category: it.category,
                  layer: it.layer,
                  price_retail: it.price_retail,
                  configuration_mode: configured.configuration_mode,
                  configuration_summary: configured.configuration_summary,
                  capture_source: it.capture_source,
                  captured_at: it.captured_at,
                  venue_label: it.field_capture_id
                    ? (venueByCapture?.[it.field_capture_id] ?? null)
                    : null,
                }}
```

- [ ] **Step 10: Run the test to verify it passes**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx
```
Expected: PASS — `Tests: 7 passed, 7 total`.

- [ ] **Step 11: Run the library suites and the gates**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/library
pnpm type-check && pnpm lint --filter @patina/designer-portal && pnpm build --filter @patina/designer-portal
```
Expected: the pre-existing library suites (`library-entrances.test.tsx`, `capture-extension-prompt.test.tsx`, `library-capture-events.test.ts`, `import-parse.test.ts`, `library-configuration-summary.test.ts`) stay green alongside the new one; no type or lint errors; `Compiled successfully`.

- [ ] **Step 12: Commit**

```bash
git add packages/supabase/src/hooks/use-layer-products.ts packages/supabase/src/hooks/use-capture-venues.ts packages/supabase/src/hooks/__tests__/use-capture-venues.test.ts packages/supabase/src/hooks/index.ts apps/designer-portal/src/components/document/rooms/library/library-card.tsx apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx apps/designer-portal/src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx
git commit -m "feat(library): Field provenance chip on the shelf card

Spec 6 Flow 6 / plan 4-12. products.capture_source has carried
'field_capture' since 00235 and no portal surface read it. The chip
reads 'Field . High Point, Mar 2026' — the place from
field_captures.venue_label (00233:86, populated by 00235:98) via
products.field_capture_id, the month from captured_at.

The venue is a separate useCaptureVenueLabels query rather than an
embed on useLayerProducts: that hook powers all three shelves, and a
failing embed would darken the Library. This one resolves to {} on
failure, so the chip degrades to 'Field . Mar 2026'." -- packages/supabase/src/hooks/use-layer-products.ts packages/supabase/src/hooks/use-capture-venues.ts packages/supabase/src/hooks/__tests__/use-capture-venues.test.ts packages/supabase/src/hooks/index.ts apps/designer-portal/src/components/document/rooms/library/library-card.tsx apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx apps/designer-portal/src/components/document/rooms/library/__tests__/library-card-provenance.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 6: Receiving inspections stop silently dropping their photos

Plan §4 row 4-11 (render half) and spec §11.5: *"a live defect, not a feature — iOS has been writing the column (`SupabaseReceivingService.swift:115`) into rows `log-inspection-drawer.tsx:151` hardcodes `[]` for."*

**Read both rulings before writing code. They change the shape of this task, and both are spec deviations that have been escalated to the orchestrator.**

**Ruling 6-A — `log-inspection-drawer.tsx:151` is the WRITE path, not the render half.**
Line 151 is `const photoAssetIds: string[] = [];` inside `handleSubmit`, feeding `createInspection.mutateAsync({ … photoAssetIds … })` at `:152-157`. Un-hardcoding it means letting the *desktop* attach photos — that is 4-11's "live camera in G2", which plan §4 explicitly leaves in wave 4 (*"the **render** half needs no Field build and runs in Wave 1P; the G2 live camera stays in wave 4"*). The render half is making already-written photos **visible**, which happens where inspections are displayed: `orders-book-receiving.tsx`. Line 151 is **not touched**, and the drawer's "Photos: upload via mobile" placeholder (`:456-467`) stays honest.
⚠ **Deviation:** spec §11.5:1609-1610 states the ask more literally as *"render … in `log-inspection-drawer.tsx` and the receiving surfaces, and stop hardcoding `[]` at `:151`."* Plan §4's own render/camera split is the authority used here. Escalated.

**Ruling 6-B — the image bytes are BLOCKED; only the presence line ships in Wave 1P.**
`receiving_inspections.photo_asset_ids` does **not** hold `capture-media` paths. It holds **media-service `MediaAsset` UUIDs**: iOS uploads through `ReceivingMediaUploadClient` (intent → PAR PUT → confirm → `return session.assetId` at `:65`) and stores that id (`SupabaseReceivingService.swift:115`). `00493_svc_shape_resolving_function_bodies.sql:50-51` calls the column *"a soft reference with no FK"* and `:172-194` validates it against `svc_media."MediaAsset"`. So `useCaptureMediaUrls` cannot render them — the spec's assumption that it could is wrong.

The media service exposes **no route returning a readable URL**:
- `media.controller.ts:273` `GET /v1/media/:id/download` → `media.service.ts:197` returns `downloadUrl: asset.rawKey`, a bare storage key.
- `assets.controller.ts:52` renditions returns rows keyed by `key`.
- `assets.controller.ts:45` `GET assets/:id` returns the raw Prisma row, and `MediaAsset` (`services/media/prisma/schema.prisma:18-62`) has no `cdnUrl`/`publicUrl` — only `rawKey`/`lqipKey`.
- `getSignedUrl` exists only in `storage/cdn/*.provider.ts` and `oci-storage.service.ts`, reachable from no controller.

Serving the bytes therefore requires **new NestJS code**, which the Global Constraints forbid. **Do not attempt it.**
⚠ **Deviation:** plan §1.4's acceptance says *"a receiving inspection with photos finally **shows them**."* This wave cannot meet that clause. It is escalated to the orchestrator as an **unmet ratified acceptance criterion**, not absorbed as a parked nicety.

**Files:**
- Modify: `packages/supabase/src/hooks/use-procurement.ts` — `DamageClaim['inspection']` (`:986-995`), the `useDamageClaims` embed (`:1178-1185`)
- Modify: `apps/designer-portal/src/components/document/orders-book-receiving.tsx` — the helper goes beside `isoOffsetDays` near `:30` (⚠ `fmtDay` is *imported* at `:25`, not defined here); `OpenClaimRow`'s meta line `:129-139`; the Settled fold's row `:455-465`
- Create: `apps/designer-portal/src/components/document/__tests__/receiving-photo-line.test.ts`

**Interfaces:**
- Consumes: `ReceivingInspection` (`use-procurement.ts:955-974`, `photo_asset_ids: string[]`), fetched with `select('*')` by `useReceivingInspections` (`:1126-1136`) at `orders-book-receiving.tsx:265`.
- Produces:
  ```tsx
  // orders-book-receiving.tsx
  export function inspectionPhotoLine(photoAssetIds: unknown): string | null;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/designer-portal/src/components/document/__tests__/receiving-photo-line.test.ts`:

```ts
import { inspectionPhotoLine } from '../orders-book-receiving';

describe('inspectionPhotoLine', () => {
  it('counts the photos iOS logged against the inspection', () => {
    expect(inspectionPhotoLine(['a', 'b', 'c'])).toBe('3 photos logged on the phone');
  });

  it('reads singular for one', () => {
    expect(inspectionPhotoLine(['a'])).toBe('1 photo logged on the phone');
  });

  it('says nothing for an inspection logged without photos', () => {
    expect(inspectionPhotoLine([])).toBeNull();
  });

  it('is total against a column with no client-side shape guarantee', () => {
    for (const value of [null, undefined, 'a', 42, {}]) {
      expect(inspectionPhotoLine(value)).toBeNull();
    }
  });

  it('ignores blank ids rather than counting them', () => {
    expect(inspectionPhotoLine(['a', '', '   ', null])).toBe('1 photo logged on the phone');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/receiving-photo-line.test.ts
```
Expected: FAIL — `orders-book-receiving.tsx` does not export `inspectionPhotoLine`.

- [ ] **Step 3: Widen the damage-claim embed**

In `packages/supabase/src/hooks/use-procurement.ts`, add `photo_asset_ids` to `DamageClaim['inspection']` (`:986-995`):

```ts
  inspection?: {
    id: string;
    purchase_order_id: string;
    outcome: ReceivingInspectionOutcome;
    /** Wave 1P — media-service asset ids iOS logged against the inspection. */
    photo_asset_ids?: string[];
    purchase_order?: {
      id: string;
      vendor?: { id: string; name: string };
      project?: { id: string; name: string };
    };
  };
```

and to the embedded column list inside `useDamageClaims`'s `.select(...)` (`:1178-1185`) — the line currently reading `id, purchase_order_id, outcome,` becomes:

```
            id, purchase_order_id, outcome, photo_asset_ids,
```

- [ ] **Step 4: Write the helper**

In `apps/designer-portal/src/components/document/orders-book-receiving.tsx`, add immediately after the `isoOffsetDays` const near `:30`:

```tsx
/**
 * `receiving_inspections.photo_asset_ids` (00445/00447) — media-service
 * MediaAsset UUIDs written by iOS (`SupabaseReceivingService.swift:115`), into
 * rows no web surface has ever acknowledged. Wave 1P makes their EXISTENCE
 * visible; the bytes stay unreachable until the media service exposes a route
 * that returns a readable URL (today `GET /v1/media/:id/download` returns the
 * raw storage key, `media.service.ts:197`). See the Wave 1P plan, Ruling 6-B.
 */
export function inspectionPhotoLine(photoAssetIds: unknown): string | null {
  if (!Array.isArray(photoAssetIds)) return null;
  const n = photoAssetIds.filter(
    (id) => typeof id === 'string' && id.trim().length > 0,
  ).length;
  if (n === 0) return null;
  return `${n} photo${n === 1 ? '' : 's'} logged on the phone`;
}
```

- [ ] **Step 5: Render it on the open-claim row**

In `OpenClaimRow`, replace the meta paragraph at `:129-139`:

```tsx
          <p className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
            {[
              `drafted ${fmtDay(claim.created_at)}`,
              claim.vendor_notified_at
                ? `vendor notified ${fmtDay(claim.vendor_notified_at)}`
                : null,
              claim.inspection?.outcome ?? null,
              inspectionPhotoLine(claim.inspection?.photo_asset_ids),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
```

- [ ] **Step 6: Render it in the Settled fold**

Replace the cleared-inspection row's body at `:455-465`:

```tsx
                    <li
                      key={i.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-dashed border-[var(--color-pearl)] px-1 py-2"
                    >
                      <span className="doc-type-body min-w-[12rem] flex-1 text-[var(--color-charcoal)]">
                        {i.purchase_order?.vendor?.name ?? 'Vendor'} ·{' '}
                        {i.purchase_order?.project?.name ?? 'Project'}
                      </span>
                      <span className="doc-type-meta uppercase tracking-[0.05em] text-[var(--color-sage)]">
                        {['clean', fmtDay(i.inspected_at), inspectionPhotoLine(i.photo_asset_ids)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </li>
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/receiving-photo-line.test.ts
```
Expected: PASS — `Tests: 5 passed, 5 total`.

- [ ] **Step 8: Run the procurement suites and the gates**

Run:
```bash
pnpm --filter @patina/supabase test -- src/hooks/__tests__/use-procurement.test.ts
pnpm type-check && pnpm lint --filter @patina/designer-portal && pnpm build --filter @patina/designer-portal
```
Expected: the procurement vitest suite stays green (its fixtures already carry `photo_asset_ids: []`, 8 occurrences); no type or lint errors; `Compiled successfully`.

- [ ] **Step 9: Commit**

```bash
git add apps/designer-portal/src/components/document/orders-book-receiving.tsx apps/designer-portal/src/components/document/__tests__/receiving-photo-line.test.ts packages/supabase/src/hooks/use-procurement.ts
git commit -m "feat(receiving): surface inspection photos logged from the phone

Plan 4-11 (render half), spec 11.5. iOS has written
receiving_inspections.photo_asset_ids since Wave G and no web surface
acknowledged the rows. The receiving book now says how many photos an
inspection carries, on both the open-claim row and the Settled fold.

The bytes stay unreachable: photo_asset_ids holds media-service
MediaAsset UUIDs, and GET /v1/media/:id/download returns the raw storage
key rather than a URL (media.service.ts:197). Serving them needs new
NestJS code, which Wave 1P excludes.

log-inspection-drawer.tsx:151 is the WRITE path (the wave-4 G2 camera)
and is untouched. Both deviations are recorded as Rulings 6-A/6-B in
docs/design/field-companion/plans/wave-1p-plan.md and escalated." -- apps/designer-portal/src/components/document/orders-book-receiving.tsx apps/designer-portal/src/components/document/__tests__/receiving-photo-line.test.ts packages/supabase/src/hooks/use-procurement.ts
git push origin feat/field-companion-w1p
```

---

## Task 4b: Cover the letterhead's own union (plan defect, found in Task 4 review)

**Why this exists.** Task 4's reviewer found that `letterhead-instruments.tsx` carries a
*second*, independently written implementation of the same merge / dedupe / sort logic as
`useClientRoomScans` — and it has **zero coverage of that logic**. Every test touching the file
mocks `auth.getUser()` to return `{ user: null }`, so `designerId` is always `null` and the
designer leg always short-circuits to `Promise.resolve([])`. The test Task 4 Step 7 added only
exercises the client leg. In the reviewer's words: *"If this file's union were silently reverted,
broken, or had its overwrite order flipped, every currently-passing test would still pass."*

The logic was manually verified correct. This task makes that verifiable. **This is a defect in
the plan (Step 7 was too weak), not in Task 4's implementation** — no production code changes.

**Files:**
- Create: `apps/designer-portal/src/components/document/__tests__/letterhead-scan-union.test.tsx`

A NEW file rather than an edit to `letterhead-instruments-scan-door.test.tsx`: that suite's
`@patina/supabase` mock returns one fixed row regardless of `.eq()` arguments, which is exactly
what makes it blind here. This suite needs a per-leg mock, and the existing suite's four passing
cases should not be disturbed.

**Interfaces:** Consumes `LetterheadInstruments`. Produces nothing.

- [ ] **Step 1: Write the test**

```tsx
/**
 * `useClientScans` (letterhead-instruments.tsx) — the designer-scan union, Wave 1P.
 *
 * The sibling suite (letterhead-instruments-scan-door.test.tsx) mocks auth.getUser() to
 * `{ user: null }` in every case, so the designer leg there never runs. This suite exists to
 * exercise it: a per-leg mock keyed on the `.eq('user_id', …)` argument, so the client leg and
 * the designer leg can return different rows.
 *
 * Pins Ruling 4-B (the door prefers the CLIENT's scan) and the dedupe precedence
 * (the designer's stamp wins a shared id, so a self-scan reads as hers).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LetterheadInstruments } from '../letterhead-instruments';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

interface ScanRow {
  id: string;
  name: string;
  created_at: string;
  images: unknown[];
}

/** Rows per `room_scans.user_id`, so the two legs can differ. */
const scansByUser: Record<string, ScanRow[]> = {};
/** The signed-in designer, or null for a signed-out read. */
let designerId: string | null = 'designer-uid';

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_column: string, userId: string) => ({
          order: () => ({
            limit: () =>
              Promise.resolve({ data: scansByUser[userId] ?? [], error: null }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    auth: () => undefined,
    useProjectV2: () => ({ data: undefined }),
  }),
  useProjectV2: () => ({ data: undefined }),
  useProjectRoster: () => ({ data: [] }),
  // Every scan resolves a hero with a ready-to-use URL, so the door's
  // `withImage` filter keeps them all and nothing needs signing.
  resolveCoverPhoto: () => ({ image_url: 'https://example.com/hero.jpg' }),
  publicUrlToPath: () => null,
}));

jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));

function scan(id: string, createdAt: string): ScanRow {
  return { id, name: id, created_at: createdAt, images: [] };
}

function renderInstruments() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <LetterheadInstruments
        projectId="proj-1"
        clientProfileId="client-1"
        clientName="The Ellsworths"
        engagementId={null}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const key of Object.keys(scansByUser)) delete scansByUser[key];
  designerId = 'designer-uid';
  mockPush.mockClear();
});

describe('LetterheadInstruments — the designer-scan union (Wave 1P)', () => {
  it("opens the CLIENT's scan even when the designer has a newer one (Ruling 4-B)", async () => {
    scansByUser['client-1'] = [scan('client-scan', '2026-01-01T00:00:00Z')];
    scansByUser['designer-uid'] = [scan('my-newer-scan', '2026-08-01T00:00:00Z')];

    renderInstruments();

    const door = await screen.findByText('The scan');
    fireEvent.click(door);
    expect(mockPush).toHaveBeenCalledWith('/room/client-scan?from=document');
  });

  it("surfaces the designer's OWN scan, labelled 'Your scan', when the client has none", async () => {
    // The whole point of spec §11.2: before the union this door did not exist here at all.
    scansByUser['client-1'] = [];
    scansByUser['designer-uid'] = [scan('my-scan', '2026-08-01T00:00:00Z')];

    renderInstruments();

    const door = await screen.findByText('Your scan');
    fireEvent.click(door);
    expect(mockPush).toHaveBeenCalledWith('/room/my-scan?from=document');
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it("reads a self-scan as hers when the designer IS the client (dedupe precedence)", async () => {
    const shared = scan('shared-scan', '2026-05-01T00:00:00Z');
    scansByUser['client-1'] = [shared];
    scansByUser['designer-uid'] = [shared];

    renderInstruments();

    // The designer leg lands last, so its stamp wins the shared id.
    expect(await screen.findByText('Your scan')).toBeInTheDocument();
    expect(screen.queryByText('The scan')).toBeNull();
  });

  it('falls back to the client leg alone when nobody is signed in', async () => {
    designerId = null;
    scansByUser['client-1'] = [scan('client-scan', '2026-01-01T00:00:00Z')];
    scansByUser['designer-uid'] = [scan('never-read', '2026-08-01T00:00:00Z')];

    renderInstruments();

    expect(await screen.findByText('The scan')).toBeInTheDocument();
    expect(screen.queryByText('Your scan')).toBeNull();
  });
});
```

⚠ The `auth` entry in the mock above is a placeholder — `useClientScans` calls
`supabase.auth.getUser()`. Replace it with:

```tsx
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: designerId ? { id: designerId } : null } }),
    },
```

and delete the stray `useProjectV2` key nested inside `createBrowserClient`'s return. Write the
mock with that correction applied; the block above is otherwise literal.

- [ ] **Step 2: Run it**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/letterhead-scan-union.test.tsx
```
Expected: PASS, 4 tests. These characterise code that already exists and was manually verified —
a first-run pass is the expected outcome.

**If any case FAILS, stop and report it.** A failure here means Task 4's letterhead union is
genuinely wrong in a way review missed, which is exactly what this task was written to detect.
Do not adjust the assertions to match the behaviour.

- [ ] **Step 3: Confirm the suite is not vacuous**

Temporarily edit `letterhead-instruments.tsx`'s picker (`:266-271`) to drop the client
preference — `const scan = useMemo(() => (scans ?? []).find((s) => s.image_url) ?? null, [scans])`
— re-run the suite, and confirm the first case now FAILS. **Then revert the edit with
`git checkout -- apps/designer-portal/src/components/document/letterhead-instruments.tsx`** and
re-run to confirm 4/4 green again. Report both results. Do not commit the temporary edit.

- [ ] **Step 4: Run the sibling suites**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/letterhead-instruments-scan-door.test.tsx src/components/document/__tests__/call-sheet-doorways.test.tsx src/components/document/__tests__/letterhead-scan-union.test.tsx
```
Expected: 3 suites pass; the two pre-existing ones keep their counts (21 tests between them).

- [ ] **Step 5: Gate and commit**

Run:
```bash
pnpm type-check
```
Expected: 30 successful, 30 total.

```bash
git add apps/designer-portal/src/components/document/__tests__/letterhead-scan-union.test.tsx
git commit -m "test(document): cover the letterhead's own designer-scan union

Task 4's review found that letterhead-instruments.tsx carries a second,
independently written copy of the merge/dedupe/sort logic with no
coverage of it: every existing test mocks auth.getUser() to a null user,
so the designer leg never runs and the union could be reverted with
every test still green.

A per-leg mock keyed on the .eq('user_id', ...) argument, pinning
Ruling 4-B (the door prefers the client's scan), the 'Your scan' label,
the dedupe precedence on a shared id, and the signed-out fallback.
Verified non-vacuous by removing the client preference and watching the
first case fail. No production code changed." -- apps/designer-portal/src/components/document/__tests__/letterhead-scan-union.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 5b: Cover the Library shelf's pass-through (plan defect, found in Task 5 review)

**Why this exists.** Task 5's reviewer found the same class of gap as Task 4b, in the one place
Task 5 was written to protect. `library-card-provenance.test.tsx` renders `LibraryCard` directly
with a **hand-built `item` object**; `grep -rl "LibraryShelf"` over the test tree returns nothing
— no test in the repo renders `LibraryShelf` at all. So the Step-9 pass-through, which the
commit message calls *"the whole point of this task"*, has no regression protection: **revert the
shelf wiring entirely and the suite still passes 100%.**

The shipped wiring was verified correct by direct read. This task makes it verifiable. **No
production code changes.**

**Files:**
- Create: `apps/designer-portal/src/components/document/rooms/library/__tests__/library-shelf-provenance.test.tsx`

**Interfaces:** Consumes `LibraryShelf`. Produces nothing.

- [ ] **Step 1: Write the test**

`LibraryShelf`'s props, read from `library-shelf.tsx:25-50`: `{ layer, name, meta?, id,
labelledBy, teachingIds, validationIds?, onDeep, onPromote?, onNominate?, capability? }`.

```tsx
/**
 * The Library shelf's Field-provenance pass-through (Wave 1P, Task 5 Step 9).
 *
 * `library-shelf.tsx` builds the card's `item` prop FIELD BY FIELD, so widening
 * LayerProductRow and LibraryItem delivers nothing on its own — the shelf has to pass
 * capture_source / captured_at / venue_label through explicitly. The sibling suite
 * (library-card-provenance.test.tsx) renders LibraryCard with a hand-built item and
 * cannot see that wiring at all.
 *
 * This suite renders the SHELF, so the chip has to survive the real prop hand-off.
 */
import { render, screen } from '@testing-library/react';
import { LibraryShelf } from '../library-shelf';

interface Row {
  id: string;
  name: string;
  brand: string | null;
  images: string[] | null;
  source_url: string | null;
  category: string | null;
  layer: 'personal' | 'studio' | 'catalog';
  price_retail: number | null;
  configuration_mode: string | null;
  configuration_summary: unknown;
  capture_source: string | null;
  captured_at: string | null;
  field_capture_id: string | null;
}

let rows: Row[] = [];
let venueByCapture: Record<string, string> = {};
let capturedIdsArg: unknown = null;

jest.mock('@patina/supabase', () => ({
  useLayerProducts: () => ({ data: rows, isLoading: false, isError: false }),
  useCaptureVenueLabels: (ids: unknown) => {
    capturedIdsArg = ids;
    return { data: venueByCapture };
  },
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'p-1',
    name: 'Bouclé lounge',
    brand: null,
    images: null,
    source_url: null,
    category: 'seating',
    layer: 'personal',
    price_retail: null,
    configuration_mode: null,
    configuration_summary: null,
    capture_source: null,
    captured_at: null,
    field_capture_id: null,
    ...over,
  };
}

function renderShelf() {
  return render(
    <LibraryShelf
      layer="personal"
      name="My Library"
      id="shelf-personal"
      labelledBy="shelf-personal-heading"
      teachingIds={new Set<string>()}
      onDeep={jest.fn()}
    />,
  );
}

beforeEach(() => {
  rows = [];
  venueByCapture = {};
  capturedIdsArg = null;
});

describe('LibraryShelf — the Field provenance pass-through', () => {
  it('carries capture_source, captured_at AND the resolved venue through to the card', () => {
    rows = [
      row({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: 'cap-1',
      }),
    ];
    venueByCapture = { 'cap-1': 'High Point' };

    renderShelf();

    expect(screen.getByText('Field · High Point, Mar 2026')).toBeInTheDocument();
  });

  it('degrades to the month alone when the venue query has not resolved that capture', () => {
    rows = [
      row({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: 'cap-1',
      }),
    ];
    venueByCapture = {};

    renderShelf();

    expect(screen.getByText('Field · Mar 2026')).toBeInTheDocument();
  });

  it('asks the venue hook for exactly the capture ids on the shelf', () => {
    rows = [
      row({ id: 'p-1', capture_source: 'field_capture', field_capture_id: 'cap-1' }),
      row({ id: 'p-2', capture_source: 'web_extension', field_capture_id: null }),
    ];

    renderShelf();

    expect(capturedIdsArg).toEqual(['cap-1', null]);
  });

  it('shows no chip for a piece that did not come from Field', () => {
    rows = [
      row({
        capture_source: 'web_extension',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: null,
      }),
    ];

    renderShelf();

    expect(screen.queryByText(/^Field/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/library/__tests__/library-shelf-provenance.test.tsx
```
Expected: PASS, 4 tests. This characterises shipped, manually verified code.

If a case fails because the shelf renders extra chrome the mock does not satisfy (a `StrataSweep`
loading state, a capability filter, an empty-state branch), fix the **test setup** — never the
component. If it fails because the chip is genuinely absent, **STOP and report**: that would mean
the Step-9 wiring is broken, which is exactly what this task was written to detect.

- [ ] **Step 3: Confirm the suite is not vacuous**

Temporarily delete the three pass-through lines from `library-shelf.tsx`'s `item={{ … }}` literal
(`capture_source`, `captured_at`, `venue_label`), re-run, and confirm cases 1, 2 and 4's chip
assertions now fail. **Then revert with
`git checkout -- apps/designer-portal/src/components/document/rooms/library/library-shelf.tsx`**
and re-run to confirm 4/4 green. Report both results. Never commit the temporary edit.

- [ ] **Step 4: Run the full library directory and gate**

```bash
pnpm --filter @patina/designer-portal test -- src/components/document/rooms/library
pnpm type-check
```
Expected: 7 suites now (6 pre-existing + the new one), all green; type-check 30/30.

- [ ] **Step 5: Commit**

```bash
git add apps/designer-portal/src/components/document/rooms/library/__tests__/library-shelf-provenance.test.tsx
git commit -m "test(library): cover the shelf's Field-provenance pass-through

Task 5's review found the chip's only render tests build the card's item
prop by hand and render LibraryCard directly — nothing in the repo
renders LibraryShelf, so the field-by-field pass-through the task exists
to deliver could be reverted with every test still green.

This renders the shelf, so the chip has to survive the real prop
hand-off. Verified non-vacuous by deleting the three pass-through lines
and watching the chip assertions fail. No production code changed." -- apps/designer-portal/src/components/document/rooms/library/__tests__/library-shelf-provenance.test.tsx
git push origin feat/field-companion-w1p
```

---

## Task 6b: Cover the receiving photo line at its call sites (plan defect, found in Task 6 review)

**Why this exists.** Task 6's reviewer found the **third instance of the same gap** as Tasks 4b
and 5b: `inspectionPhotoLine` is tested purely as a function, and neither call site is rendered by
any test. `orders-ledger.test.tsx` stubs `ReceivingBookPage` as `<div>Receiving page</div>`, and no
other suite renders the real component. A regression at either site — dropping
`inspectionPhotoLine(...)` from an array, reading the wrong field, or a future edit reverting the
`useDamageClaims` `.select()` embed — would be caught by nothing.

The embed edit is the fragile one: it is a string inside a PostgREST select, invisible to the
type system.

Also fixes one code-comment inaccuracy the reviewer found: the new JSDoc cites
*"(00445/00447)"* for `receiving_inspections.photo_asset_ids`, but the **column is created in
`00150_receiving_and_damage_claims.sql:43`** (`UUID[] NOT NULL DEFAULT '{}'`); 00445/00447 only
add RPCs with a `p_photo_asset_ids` parameter that write into the pre-existing column.

**Files:**
- Create: `apps/designer-portal/src/components/document/__tests__/receiving-photo-line-render.test.tsx`
- Modify: `apps/designer-portal/src/components/document/orders-book-receiving.tsx` (the JSDoc citation only — one line, no behaviour change)

**Interfaces:** Consumes `ReceivingBookPage`. Produces nothing.

- [ ] **Step 1: Fix the migration citation**

In `apps/designer-portal/src/components/document/orders-book-receiving.tsx`, in the
`inspectionPhotoLine` JSDoc, replace:

```
 * `receiving_inspections.photo_asset_ids` (00445/00447) — media-service
```

with:

```
 * `receiving_inspections.photo_asset_ids` (created 00150:43; 00445/00447 add
 * the RPCs that write it) — media-service
```

Change nothing else in that file.

- [ ] **Step 2: Write the render test**

`ReceivingBookPage` takes `{ onOpenDocument }` and calls `usePurchaseOrders`,
`useReceivingInspections`, `useDamageClaims` (twice) and `useUpdateDamageClaim` from
`@patina/supabase`, plus `useQueryClient` from `@tanstack/react-query`. The Settled fold is
collapsed until its toggle is clicked.

Create `apps/designer-portal/src/components/document/__tests__/receiving-photo-line-render.test.tsx`:

```tsx
/**
 * The receiving photo line, at both call sites (Wave 1P, Task 6).
 *
 * The sibling suite tests `inspectionPhotoLine` as a pure function. This one renders
 * ReceivingBookPage, so a regression at either call site — the open-claim row or the
 * Settled fold — is actually caught, including a silent revert of the useDamageClaims
 * embed that makes `photo_asset_ids` stop arriving.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReceivingBookPage } from '../orders-book-receiving';

/* eslint-disable @typescript-eslint/no-explicit-any */
let orders: any[] = [];
let inspections: any[] = [];
let draftedClaims: any[] = [];
let notifiedClaims: any[] = [];

jest.mock('@patina/supabase', () => ({
  usePurchaseOrders: () => ({ data: orders, isLoading: false }),
  useReceivingInspections: () => ({ data: inspections, isLoading: false }),
  useDamageClaims: ({ state }: { state: string }) => ({
    data: state === 'drafted' ? draftedClaims : notifiedClaims,
  }),
  useUpdateDamageClaim: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('@/components/portal/procurement/log-inspection-drawer', () => ({
  LogInspectionDrawer: () => null,
}));
jest.mock('@/lib/document/ledger-summary', () => ({
  receivingFrontMatter: () => [],
}));

function inspection(over: Record<string, unknown> = {}) {
  return {
    id: 'insp-1',
    purchase_order_id: 'po-1',
    inspected_at: '2026-08-20T00:00:00Z',
    outcome: 'clean',
    photo_asset_ids: [],
    purchase_order: {
      id: 'po-1',
      vendor: { id: 'v-1', name: 'Ellsworth Mill' },
      project: { id: 'proj-1', name: 'Maple St' },
    },
    ...over,
  };
}

function claim(over: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    state: 'drafted',
    description: 'Chip on the canopy.',
    created_at: '2026-08-20T00:00:00Z',
    vendor_notified_at: null,
    inspection: {
      id: 'insp-2',
      purchase_order_id: 'po-2',
      outcome: 'damaged',
      photo_asset_ids: ['a', 'b', 'c'],
      purchase_order: {
        id: 'po-2',
        vendor: { id: 'v-1', name: 'Ellsworth Mill' },
        project: { id: 'proj-1', name: 'Maple St' },
      },
    },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReceivingBookPage onOpenDocument={jest.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  orders = [];
  inspections = [];
  draftedClaims = [];
  notifiedClaims = [];
});

describe('the receiving photo line, rendered', () => {
  it('shows the count on an open claim whose inspection carries photos', () => {
    draftedClaims = [claim()];
    renderPage();
    expect(screen.getByText(/3 photos logged on the phone/)).toBeInTheDocument();
  });

  it('says nothing on an open claim whose inspection carries none', () => {
    draftedClaims = [claim({ inspection: { ...claim().inspection, photo_asset_ids: [] } })];
    renderPage();
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
  });

  it('shows the count in the Settled fold once it is opened', () => {
    inspections = [inspection({ photo_asset_ids: ['x', 'y'] })];
    renderPage();

    // The fold is collapsed by default — nothing is asserted until it is opened.
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.getByText(/2 photos logged on the phone/)).toBeInTheDocument();
  });

  it('leaves a cleared inspection with no photos unannotated in the fold', () => {
    inspections = [inspection({ photo_asset_ids: [] })];
    renderPage();
    fireEvent.click(screen.getByText(/Settled ·/));
    expect(screen.queryByText(/logged on the phone/)).toBeNull();
  });
});
```

- [ ] **Step 3: Run it**

Run:
```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__/receiving-photo-line-render.test.tsx
```
Expected: PASS, 4 tests.

If a case fails because the page renders chrome the mocks do not satisfy, fix the **test setup** —
never the component. The `Settled ·` toggle text is built as
`` `Settled · ${cleared.length} cleared · 30 days` ``, and `cleared` is the inspections whose
`outcome === 'clean'`; if the toggle is not found, check that the fixture's outcome is `'clean'`.
If a case fails because the line is genuinely absent, **STOP and report** — that is the regression
this task exists to detect.

- [ ] **Step 4: Confirm the suite is not vacuous**

Temporarily delete `inspectionPhotoLine(claim.inspection?.photo_asset_ids),` from `OpenClaimRow`'s
meta array, re-run, and confirm case 1 fails. Restore it, then temporarily delete
`inspectionPhotoLine(i.photo_asset_ids)` from the Settled fold's array, re-run, and confirm case 3
fails. **Then revert with
`git checkout -- apps/designer-portal/src/components/document/orders-book-receiving.tsx`** — note
this also reverts Step 1, so **re-apply the Step-1 citation fix afterwards** — and re-run to
confirm 4/4 green. Report every result. Never commit a temporary edit.

- [ ] **Step 5: Gate and commit**

```bash
pnpm --filter @patina/designer-portal test -- src/components/document/__tests__
pnpm type-check
```
Expected: the document `__tests__` directory green (including `receiving-photo-line.test.ts`,
`letterhead-scan-union.test.tsx` and the two letterhead/call-sheet suites); type-check 30/30.

```bash
git add apps/designer-portal/src/components/document/__tests__/receiving-photo-line-render.test.tsx apps/designer-portal/src/components/document/orders-book-receiving.tsx
git commit -m "test(receiving): cover the photo line at both call sites

Task 6's review found the third instance of this wave's recurring gap:
inspectionPhotoLine was tested only as a pure function, and neither call
site is rendered by any suite (orders-ledger.test.tsx stubs the whole
page). The useDamageClaims embed edit is the fragile part — a string
inside a PostgREST select, invisible to the type system.

This renders ReceivingBookPage and pins both sites, including the
collapsed Settled fold. Verified non-vacuous by removing each call in
turn and watching the matching case fail.

Also corrects the JSDoc's migration citation: photo_asset_ids is created
in 00150:43; 00445/00447 only add the RPCs that write it." -- apps/designer-portal/src/components/document/__tests__/receiving-photo-line-render.test.tsx apps/designer-portal/src/components/document/orders-book-receiving.tsx
```

Do **not** push — the remote is unreachable (SSH proxy-auth failure); the orchestrator pushes
everything once it recovers.

---

## Wave acceptance (run after Task 6)

Plan §1.4's acceptance, measured honestly.

- [ ] **A1 — a field-less project renders identically to today.** Evidence: `pnpm --filter @patina/designer-portal test -- src/components/room-file/__tests__/room-files-section.test.tsx` — four of five cases assert `toBeEmptyDOMElement()` across every path a field-less project can take. Plus the seven route suites under `(document)/doc/[id]/`, which render the real project spread with the mount in place. ⚠ **Ruling 3-A applies: FC-R10 as ratified says "browser-verified"; this wave delivers jest evidence and escalates the browser walk.**
- [ ] **A2 — a project with an existing scan shows the Room-files block, whose rows reach `/room/<id>/file`.** Evidence: the fifth case of the same suite.
- [ ] **A3 — a receiving inspection with photos shows them.** ⚠ **NOT MET.** Ruling 6-B: BLOCKED on a media-service read route. What ships is the presence line. Escalated to the orchestrator as an unmet ratified criterion.
- [ ] **A4 — the whole branch's gates.**
  ```bash
  pnpm type-check
  pnpm build --filter @patina/designer-portal
  pnpm lint --filter @patina/designer-portal
  pnpm --filter @patina/supabase test
  pnpm --filter @patina/designer-portal test
  ```
  ⚠ **Plus the checks CI will actually run on this branch.** The pre-push hook printed the
  affected-plan for these commits: 15 checks, wider than the list above because this wave edits
  the shared `@patina/supabase` package. Run at least these, which the list above does NOT cover:
  ```bash
  pnpm --filter @patina/admin-portal build     # admin's build ENFORCES types (designer's does not)
  pnpm --filter @patina/admin-portal test
  pnpm --filter @patina/client-portal test
  pnpm --filter @patina/client-portal type-check
  pnpm --filter @patina/extension test
  pnpm --filter @patina/manufacturer-portal type-check
  ```
  A shared-package type change can pass the designer build and fail admin's — that is the whole
  reason admin is listed separately in `patina-portal-features`. Record each result.
  Paste the real output tail of each, and **diff the two full-suite counts against Task 0's recorded baseline.** A failure absent from the baseline is this wave's, not pre-existing.
- [ ] **A5 — record the parked and escalated items:**
  - `room-file` flag enablement for the pilot cohort — outside this lane (FC-R10, §1.4 prerequisite 1). **PARKED.**
  - Brand-voice pass on `room-file-copy.ts` — design-owned (§1.4 prerequisite 2). **PARKED.**
  - Browser walk of the field-less project — Ruling 3-A. **ESCALATED.**
  - Receiving photo **bytes** — Ruling 6-B. **ESCALATED (unmet §1.4 acceptance clause).**
  - `log-inspection-drawer.tsx:151` untouched — Ruling 6-A, a deviation from spec §11.5's literal wording. **ESCALATED.**
  - Deploy (`./infra/deploy-portal.sh designer-portal`) — orchestrator-owned, forbidden from this lane. **PARKED.**
