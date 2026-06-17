'use client';

/**
 * Threads (R52 / Track C) — the unified inbox over `use-comms` (the shared
 * thread model that also renders on the document margin, R27). Wave-0 stub.
 */

import { ViewHeader, ViewPlaceholder } from '../view-shell';
import type { ThreadsViewProps } from '../types';

export function ThreadsView(_props: ThreadsViewProps) {
  return (
    <>
      <ViewHeader
        title="Threads"
        sub="Every conversation in one inbox — client, project, and vendor threads, scope-filtered."
      />
      <ViewPlaceholder track="Track C — threads (use-comms shared model)" />
    </>
  );
}
