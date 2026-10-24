import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase/client';

import { heroEligible } from '@/lib/editorial/rank';
import type {
  ClientProjectEditorial,
  EditionChapterWords,
  EditionComposition,
  EditionImage,
  EditionMeta,
  EditionReaderFunctions,
  EditorialAsset,
} from '@/lib/editorial/types';

/* The House Issue's plate read: the approved edition (00846
   `get_client_project_edition`) when the project has one, else the Phase 1
   envelope (00842 `get_client_project_editorial`). The server page reads it
   first so the hero preload is in the SSR HTML; this hook carries that answer
   as `initialData` and keeps it fresh after mutations. */

export const clientEditorialKey = (projectId: string) =>
  ['client-project-editorial', projectId] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * The envelope, or null when the answer is not one. A malformed read is the
 * same as no read: the page falls back to today's house, never to an error.
 */
export function parseClientEditorial(data: unknown): ClientProjectEditorial | null {
  if (!isRecord(data) || !isRecord(data.project) || typeof data.project.id !== 'string') return null;
  const lists = ['rooms', 'assets', 'palette', 'boards', 'sheets'] as const;
  if (!lists.every((key) => Array.isArray(data[key]))) return null;
  return data as unknown as ClientProjectEditorial;
}

function parseEditionMeta(value: unknown): EditionMeta | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.seq !== 'number') return null;
  if (typeof value.approvedAt !== 'string') return null;
  return {
    id: value.id,
    seq: value.seq,
    approvedAt: value.approvedAt,
    approvedBy: value.approvedBy === 'auto' ? 'auto' : 'studio',
    notice: text(value.notice),
  };
}

function parseChapterWords(value: unknown): EditionChapterWords[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isRecord(entry) && typeof entry.key === 'string'
      ? [{ key: entry.key, headline: text(entry.headline), standing: text(entry.standing) }]
      : [],
  );
}

function parseComposition(value: unknown): EditionComposition {
  const composition = isRecord(value) ? value : {};
  const hero = isRecord(composition.hero) && typeof composition.hero.assetId === 'string'
    ? { assetId: composition.hero.assetId }
    : null;
  const held = Array.isArray(composition.held)
    ? composition.held.filter((id): id is string => typeof id === 'string')
    : [];
  return { hero, held, chapters: parseChapterWords(composition.chapters) };
}

/** The edition's placed pictures, as 00846 lists them. */
function parseImages(value: unknown): EditionImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    isRecord(entry) && typeof entry.assetId === 'string' && typeof entry.plateRole === 'string'
      ? [{
          assetId: entry.assetId,
          plateRole: entry.plateRole,
          rank: typeof entry.rank === 'number' ? entry.rank : null,
          chapterKey: text(entry.chapterKey),
        }]
      : [],
  );
}

/** The approved edition's envelope, or null: no edition, or not one we can read. */
export function parseClientEdition(data: unknown): ClientProjectEditorial | null {
  const envelope = parseClientEditorial(data);
  const edition = envelope && isRecord(data) ? parseEditionMeta(data.edition) : null;
  if (!envelope || !edition) return null;
  const record = data as Record<string, unknown>;
  return {
    ...envelope,
    edition,
    composition: parseComposition(record.composition),
    images: parseImages(record.images),
  };
}

type ReaderName = keyof EditionReaderFunctions;
export type EditorialRpc = (
  fn: ReaderName,
  args: EditionReaderFunctions[ReaderName]['Args'],
) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * The approved edition first; without one (null, unreadable, or a reader the
 * database does not have yet) the Phase 1 envelope. Throws only when the
 * Phase 1 read itself fails.
 */
export async function readClientEditorial(rpc: EditorialRpc, projectId: string): Promise<ClientProjectEditorial | null> {
  const args = { p_project_id: projectId };
  const edition = await rpc('get_client_project_edition', args);
  const approved = edition.error ? null : parseClientEdition(edition.data);
  if (approved) return approved;
  const editorial = await rpc('get_client_project_editorial', args);
  if (editorial.error) throw editorial.error;
  return parseClientEditorial(editorial.data);
}

/** Bind a Supabase client's `rpc` to the reader's overlay. */
export function editorialRpc(client: unknown): EditorialRpc {
  const supabase = client as { rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: unknown }> };
  return (fn, args) => supabase.rpc(fn, args);
}

/** The plate route's scope: the approved edition when there is one, else the project. */
export function plateScope(editorial: ClientProjectEditorial): string {
  return editorial.edition?.id ?? editorial.project.id;
}

/**
 * Gallery uses only the approved edition's chosen photograph, and only when
 * both full-height crops meet the hero rule. No ranked substitute: absent or
 * ineligible photography leaves the project's paint card.
 */
export function editionHero(editorial: ClientProjectEditorial): EditorialAsset | null {
  if (!editorial.edition) return null;
  const id = editorial.composition?.hero?.assetId;
  const hero = id ? editorial.assets.find((asset) => asset.id === id) : undefined;
  return hero && heroEligible(hero) ? hero : null;
}

export function useClientEditorial(projectId: string, initialData: ClientProjectEditorial | null, enabled = true) {
  return useQuery<ClientProjectEditorial | null>({
    queryKey: clientEditorialKey(projectId),
    // Off with the flag: a flag-off page makes no read it would not have made.
    enabled: enabled && !!projectId,
    initialData,
    // The server answer is fresh at hydration; refetch on the usual triggers.
    staleTime: 30_000,
    // A failed refresh keeps the page on what it already had, never an error.
    queryFn: () => readClientEditorial(editorialRpc(createBrowserClient()), projectId),
  });
}
