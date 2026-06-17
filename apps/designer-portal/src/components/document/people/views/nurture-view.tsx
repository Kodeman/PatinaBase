'use client';

/**
 * Nurture (R52 / Track C) — the touchpoint queue, ranked by dormancy + trust
 * via deriveNurtureQueue (the derivation is implemented; Track C adds the
 * banding + compose flow). Wave-0 stub.
 */

import { ViewHeader, ViewPlaceholder } from '../view-shell';
import type { PeopleViewProps } from '../types';

export function NurtureView(_props: PeopleViewProps) {
  return (
    <>
      <ViewHeader
        title="Nurture"
        sub="The relationships that need tending — surfaced by the Engine, so no one drifts away unnoticed."
      />
      <ViewPlaceholder track="Track C — nurture (deriveNurtureQueue)" />
    </>
  );
}
