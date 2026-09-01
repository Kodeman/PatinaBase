'use client';

import { Suspense } from 'react';
import { StudioBoardsView } from '@/components/document/boards/studio-boards-view';

// StudioBoardsView reads `useSearchParams()` (the `?status=` filter) — the
// ONLY page among this app's routes that does, per the review that caught
// `next build` failing without this boundary (C1, board-paths review
// 2026-09-01). Next requires a Suspense boundary around any component that
// calls useSearchParams so it can render a static shell during prerender and
// hydrate the real params on the client.
export default function StudioBoardsPage() {
  return (
    <Suspense fallback={null}>
      <StudioBoardsView />
    </Suspense>
  );
}
