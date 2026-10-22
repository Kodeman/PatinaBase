/**
 * US-49 Phase 2 — reading a job's editions (list_client_editions, 00845) the
 * way the server acts on them. The Press band and the client mirror share
 * these, so both name the same pending, current and published editions.
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type ClientEdition, type ClientEditionImage } from '@patina/supabase';

/** The edition waiting on the studio's Approve, if any. */
export const pendingEdition = (editions: readonly ClientEdition[]) =>
  editions.find((edition) => edition.status === 'awaiting_review') ?? null;

/** The approved edition the client sees now, if any. */
export const currentEdition = (editions: readonly ClientEdition[]) =>
  editions.find((edition) => edition.status === 'approved') ?? null;

/**
 * Published = it reached the client page: studio-approved (approvedAt) or
 * auto-published. A superseded edition that was never approved (a draft a
 * newer draft replaced) was never published.
 */
export const wasPublished = (edition: ClientEdition) =>
  (edition.status === 'approved' || edition.status === 'superseded') &&
  (edition.approvedAt != null || edition.autoPublished);

/**
 * The edition Undo brings back (undo_client_edition, 00845): the approved
 * edition this one superseded, latest approval first. Null → the page goes
 * back to what it showed before any edition.
 */
export function editionUndoRestores(
  editions: readonly ClientEdition[],
  undone: ClientEdition,
): ClientEdition | null {
  return (
    editions
      .filter(
        (edition) =>
          edition.supersededBy === undone.id &&
          edition.status === 'superseded' &&
          edition.approvedAt != null,
      )
      .sort(
        (a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '') || b.seq - a.seq,
      )[0] ?? null
  );
}

/** The project is closed: its current edition is frozen (00847), so nothing
 *  on the client page may change from here. */
export const editionsFrozen = (editions: readonly ClientEdition[]) =>
  editions.some((edition) => edition.status === 'approved' && edition.frozenAt != null);

/** Project maker spellings, matching 00846's trimmed, case-insensitive substring policy. */
export function projectMakerNames(names: readonly (string | null | undefined)[]): ReadonlySet<string> {
  return new Set(names.map((name) => name?.trim().toLowerCase() ?? '').filter((name) => name.length >= 3));
}

/** Unlike the live FF&E list, the reader masks names from removed items too. */
export function useProjectMakerNames(projectId: string) {
  return useQuery({
    queryKey: ['project-ffe-items', projectId, 'mirror-maker-names'],
    enabled: !!projectId,
    queryFn: async () => {
      const supabase = createBrowserClient();
      const names: (string | null)[] = [];
      const vendorIds = new Set<string>();
      // Stay below the API's row cap; no removed_at filter belongs on this read.
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('project_ffe_items')
          .select('vendor_name, vendor_id')
          .eq('project_id', projectId)
          .order('id')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const items = data ?? [];
        for (const item of items) {
          names.push(item.vendor_name);
          if (item.vendor_id) vendorIds.add(item.vendor_id);
        }
        if (items.length < pageSize) break;
      }
      // vendor_id has no FK: resolve it explicitly rather than embedding vendors.
      const ids = [...vendorIds];
      for (let from = 0; from < ids.length; from += pageSize) {
        const { data, error } = await supabase
          .from('vendors')
          .select('id, name')
          .in('id', ids.slice(from, from + pageSize));
        if (error) throw error;
        names.push(...(data ?? []).map((vendor) => vendor.name));
      }
      return projectMakerNames(names);
    },
  });
}

export interface CaptionPolicy {
  showMakers: boolean;
  studioName: string | null;
  makerNames: ReadonlySet<string>;
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  maker: 'product photograph',
  upload: 'studio photograph',
  installed: 'installed photograph',
  scan: 'room scan',
  board: 'studio board',
  sheet: 'drawing',
  concept: 'concept render, not installed',
};

/** The mirror's caption and alt under the live reader consent policy (seq 53/59). */
export function readerImageContent(
  image: ClientEditionImage,
  override: { whose?: string; when?: string } | undefined,
  { showMakers, studioName, makerNames }: CaptionPolicy,
): { caption: { what: string; whose: string; when: string | null }; alt: string } {
  const kind = image.attributionKind ?? image.sourceKind ?? '';
  const kindWords = KIND_WORDS[kind] ?? '';
  const caption = {
    what: image.captionWhat ?? '',
    whose: override?.whose ?? image.captionWhose ?? '',
    when: override?.when ?? image.captionWhen,
  };
  const alt = image.alt ?? '';
  if (showMakers) return { caption, alt };

  const namesMaker = (text: string | null) =>
    text != null && [...makerNames].some((name) => text.toLowerCase().includes(name));
  const makerKind = kind === 'maker' || kind === 'upload';
  if (namesMaker(caption.what)) {
    for (const name of [...makerNames].sort((a, b) => b.length - a.length || a.localeCompare(b))) {
      let at = caption.what.toLowerCase().indexOf(name);
      while (at !== -1) {
        caption.what = caption.what.slice(0, at) + caption.what.slice(at + name.length);
        at = caption.what.toLowerCase().indexOf(name);
      }
    }
    caption.what = caption.what.replace(/^[\s·,;:–—-]+|[\s·,;:–—-]+$/g, '') || kindWords;
  }
  caption.whose = makerKind || namesMaker(override?.whose ?? null)
    ? studioName ?? ''
    : override?.whose ?? studioName ?? '';
  // list_client_editions has no frozen fact date: safe-null rather than the
  // reader's fact-date fallback (SQ-1690 ruling); never reuse maker-bearing text.
  if (namesMaker(caption.when)) caption.when = null;
  // Studio identity and fixed kind words are trusted; the rebuilt alt is final.
  return {
    caption,
    alt: makerKind || namesMaker(alt)
      ? [caption.what, caption.whose, kindWords].filter(Boolean).join(' · ')
      : alt,
  };
}
