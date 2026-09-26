'use client';

/**
 * What changed (system-architecture §5, "Changes page"). A pull: it lists
 * every published note filtered to her role and flags, dismissed ones
 * included. It reads teaching state nowhere and writes nothing, so opening
 * the page marks nothing and moves no cursor.
 */

import { useMemo } from 'react';
import { TEACHING_RELEASES } from '@/content/teaching-releases';
import { labelFor } from '@/lib/teaching/select';
import type { TeachingNoteView, TeachingSizeClass } from '@/lib/teaching/types';
import { useFeatureFlags, type FeatureFlagStates } from './use-feature-flags';
import {
  useTeachingNotes,
  useTeachingReleases,
  useTeachingSignals,
  type TeachingNoteDoc,
} from './use-teaching-data';

/** A published release in this bundle, with the release notes that teach it. */
export interface TeachingReleaseEntry {
  id: string;
  headline: string;
  prose?: string;
  /** `YYYY-MM-DD`. */
  shippedOn: string;
  sizeClass: TeachingSizeClass;
  notes: TeachingNoteView[];
}

const TOKEN = /\{[A-Za-z][A-Za-z0-9_]*\}/;

/** Fail closed: a loading flag counts as off. */
const flagOn = (flags: FeatureFlagStates, name: string | undefined): boolean =>
  !name || (flags[name]?.value === true && !flags[name]?.isLoading);

/**
 * The page has no job in hand, so bindings cannot resolve. A note whose
 * sentence needs one is left out; an act that needs one is dropped and the
 * sentence stays. Neither ever prints a hole.
 */
function viewOf(note: TeachingNoteDoc): TeachingNoteView | null {
  if (TOKEN.test(note.body)) return null;
  const act =
    note.act && !TOKEN.test(note.act.label) && !TOKEN.test(note.act.hrefTemplate)
      ? { label: note.act.label, href: note.act.hrefTemplate }
      : null;
  return {
    noteKey: note.noteKey,
    kind: note.kind,
    body: note.body,
    label: labelFor(note, TEACHING_RELEASES),
    act,
    recedeOn: note.recedeOn ?? [],
  };
}

const views = (notes: TeachingNoteDoc[]): TeachingNoteView[] =>
  notes.flatMap((note) => {
    const view = viewOf(note);
    return view ? [view] : [];
  });

export function useChangesList(): {
  releases: TeachingReleaseEntry[];
  also: TeachingNoteView[];
  isLoading: boolean;
} {
  const notesQuery = useTeachingNotes();
  const releasesQuery = useTeachingReleases();
  const signalsQuery = useTeachingSignals();

  const flagNames = useMemo(() => {
    const names = new Set<string>();
    for (const note of notesQuery.data ?? []) if (note.flag) names.add(note.flag);
    for (const entry of TEACHING_RELEASES as readonly { flag?: string }[]) {
      if (entry.flag) names.add(entry.flag);
    }
    return [...names].sort();
  }, [notesQuery.data]);
  const flags = useFeatureFlags(flagNames);
  const flagsLoading = flagNames.some((name) => flags[name]?.isLoading);

  const role = signalsQuery.data?.role;

  const list = useMemo(() => {
    // Unknown role (signals unavailable): only notes meant for everyone.
    const reaches = (note: TeachingNoteDoc) =>
      (note.audience === 'all' || note.audience === role) && flagOn(flags, note.flag);
    const notes = (notesQuery.data ?? []).filter(reaches);
    const manifestFlag = new Map(
      (TEACHING_RELEASES as readonly { id: string; flag?: string }[]).map((r) => [r.id, r.flag]),
    );

    // useTeachingReleases returns manifest (oldest-first) order.
    const releases: TeachingReleaseEntry[] = [...(releasesQuery.data ?? [])]
      .reverse()
      .filter((release) => flagOn(flags, manifestFlag.get(release.id)))
      .map((release) => ({
        id: release.id,
        headline: release.headline,
        prose: release.prose,
        shippedOn: release.shippedOn,
        sizeClass: release.sizeClass,
        notes: views(notes.filter((n) => n.kind === 'release' && n.releaseId === release.id)),
      }));

    // Release notes live only under their release, so a release that is
    // flagged off or unpublished never leaks through "Also".
    const also = views(
      notes
        .filter((n) => n.kind !== 'release')
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
    );
    return { releases, also };
  }, [notesQuery.data, releasesQuery.data, flags, role]);

  return {
    ...list,
    isLoading:
      notesQuery.isLoading || releasesQuery.isLoading || signalsQuery.isLoading || flagsLoading,
  };
}
