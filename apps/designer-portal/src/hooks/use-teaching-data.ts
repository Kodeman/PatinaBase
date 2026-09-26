'use client';

/**
 * Return teaching data layer (system-architecture §2 Inputs). Four React Query
 * reads the selector consumes, each disabled until a user is signed in:
 *   · notes    — Sanity `teachingNote` (published perspective, CDN)
 *   · releases — the committed manifest ∩ published Sanity `teachingRelease`
 *   · state    — own `teaching_note_state` row, patched via the teaching backend
 *   · signals  — the `teaching_signals()` RPC
 * Teaching is background context: its failures are logged, never toasted.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createBrowserClient, useSession } from '@patina/supabase';
import {
  createSupabaseTeachingNoteBackend,
  getSanityClient,
  type TeachingNote,
  type TeachingNoteState,
  type TeachingRelease,
} from '@patina/help-system';
import { TEACHING_RELEASES } from '@/content/teaching-releases';

export const TEACHING_NOTES_KEY = ['teaching-notes'] as const;
export const TEACHING_RELEASES_KEY = ['teaching-releases'] as const;
export const TEACHING_NOTE_STATE_KEY = ['teaching-note-state'] as const;
export const TEACHING_SIGNALS_KEY = ['teaching-signals'] as const;

const THIRTY_MINUTES = 30 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;
const SILENT = { errorSurface: 'silent' } as const;

/** A published note, with its help-article link resolved to a slug. */
export type TeachingNoteDoc = TeachingNote & { learnMoreSlug?: string | null };

/** `teaching_signals()` payload (US-13 contract, migration 00673). */
export interface TeachingSignals {
  role: 'owner' | 'hand';
  used: Record<string, boolean>;
  lastAt: Record<string, string | null>;
  createdAt: string;
}

const TEACHING_NOTES_QUERY = `*[_type == "teachingNote"]{
  noteKey, kind, audience, trigger, surfaceKey, anchor, releaseId, flag, featureKey,
  boundary, body, act, bindings, successSignal, successEvent, priority, publishedAt,
  expiresAt, recedeOn, maxDisplays, prerequisite, supersedes, provenance,
  "learnMoreSlug": learnMore->slug.current
}`;

const TEACHING_RELEASES_QUERY = `*[_type == "teachingRelease"]{
  id, headline, prose, sizeClass, shippedOn, featureKeys
}`;

type RawBinding = { token?: string; source?: string };

/** Studio authors `bindings` as `{token, source}[]`; the wire type is a map. */
function toBindingMap(raw: unknown): TeachingNote['bindings'] {
  if (!Array.isArray(raw)) return (raw ?? undefined) as TeachingNote['bindings'];
  const map: Record<string, string> = {};
  for (const entry of raw as RawBinding[]) {
    if (entry?.token && entry.source) map[entry.token] = entry.source;
  }
  return map as TeachingNote['bindings'];
}

function useSignedInUserId(): string | null {
  const { session } = useSession();
  return session?.user?.id ?? null;
}

export function useTeachingNotes() {
  const userId = useSignedInUserId();
  return useQuery({
    queryKey: TEACHING_NOTES_KEY,
    queryFn: async (): Promise<TeachingNoteDoc[]> => {
      const docs = await getSanityClient().fetch<TeachingNoteDoc[] | null>(TEACHING_NOTES_QUERY);
      return (docs ?? []).map((doc) => ({ ...doc, bindings: toBindingMap(doc.bindings) }));
    },
    enabled: !!userId,
    staleTime: THIRTY_MINUTES,
    meta: SILENT,
  });
}

/** Published releases that this bundle ships, in manifest (release) order. */
export function useTeachingReleases() {
  const userId = useSignedInUserId();
  return useQuery({
    queryKey: TEACHING_RELEASES_KEY,
    queryFn: async (): Promise<TeachingRelease[]> => {
      const docs = await getSanityClient().fetch<TeachingRelease[] | null>(TEACHING_RELEASES_QUERY);
      const published = new Map((docs ?? []).map((doc) => [doc.id, doc]));
      return TEACHING_RELEASES.flatMap((entry) => {
        const doc = published.get(entry.id);
        return doc ? [doc] : [];
      });
    },
    enabled: !!userId,
    staleTime: THIRTY_MINUTES,
    meta: SILENT,
  });
}

function teachingBackend() {
  return createSupabaseTeachingNoteBackend(createBrowserClient());
}

export function useTeachingNoteState() {
  const userId = useSignedInUserId();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: TEACHING_NOTE_STATE_KEY,
    queryFn: () => teachingBackend().load(),
    enabled: !!userId,
    meta: SILENT,
  });
  const mutation = useMutation({
    mutationFn: ({ path, value }: { path: string[]; value: unknown }) =>
      teachingBackend().patch(path, value),
    // The RPC returns the resulting state; adopt it rather than guess.
    onSuccess: (state: TeachingNoteState) => {
      queryClient.setQueryData(TEACHING_NOTE_STATE_KEY, state);
    },
    // No toast: a failed teaching write must not interrupt the studio.
    meta: { errorSurface: 'inline' },
  });
  const { mutateAsync } = mutation;
  const patch = useCallback(
    (path: string[], value: unknown) => mutateAsync({ path, value }),
    [mutateAsync],
  );
  return { state: query.data, patch, isLoading: query.isLoading };
}

let signalsErrorLogged = false;

export function useTeachingSignals() {
  const userId = useSignedInUserId();
  return useQuery({
    queryKey: TEACHING_SIGNALS_KEY,
    queryFn: async (): Promise<TeachingSignals | null> => {
      // `any`: the RPC is not in the generated types until 00673 lands.
      const { data, error } = await (createBrowserClient() as any).rpc('teaching_signals');
      if (error) {
        // Tolerated until 00673 lands: no signals means nothing signal-gated is eligible.
        if (!signalsErrorLogged) {
          signalsErrorLogged = true;
          console.warn('[teaching] teaching_signals() unavailable', error);
        }
        return null;
      }
      return (data ?? null) as TeachingSignals | null;
    },
    enabled: !!userId,
    staleTime: FIVE_MINUTES,
  });
}

/** Called by the tagged-boundary subscriber after a completion act. */
export function invalidateTeachingSignals(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: TEACHING_SIGNALS_KEY });
}
