import type { EditableMoodBoardItem } from '@patina/types';

/**
 * Image warming for Present entry (VD12/AC2.1 program, W2d part 3). On
 * client-site wifi, Present used to stream item images in as slides appeared
 * — this collects every distinct URL Present will paint and warms the
 * browser cache for them the moment Present is entered, so the mode switch
 * itself never has to wait for a network round trip.
 *
 * URLs here are already-signed (packages/supabase/src/lib/board-storage.ts
 * signs board media before it reaches editable state) — this module only
 * reads them; it never re-signs or mutates a reference.
 */

export interface PresentPrefetchTarget {
  /** Item id, or a synthetic key for the board cover — stable for de-dupe/log only. */
  key: string;
  url: string;
}

function readItemImageUrl(item: EditableMoodBoardItem): string | null {
  if (item.imageUrl) return item.imageUrl;
  const fromData = item.data?.image_url;
  return typeof fromData === 'string' && fromData.length > 0 ? fromData : null;
}

/** Every distinct image the Present surface will paint: item images + the board cover. */
export function collectPresentPrefetchTargets(
  items: readonly EditableMoodBoardItem[],
  coverImageUrl?: string | null,
): PresentPrefetchTarget[] {
  const seen = new Set<string>();
  const targets: PresentPrefetchTarget[] = [];

  const add = (key: string, url: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    targets.push({ key, url });
  };

  for (const item of items) {
    add(item.id, readItemImageUrl(item));
  }
  add('__cover__', coverImageUrl ?? null);

  return targets;
}

export interface PresentPrefetchHandle {
  /** Number of targets actually warmed this call (already-warmed URLs are skipped). */
  total: number;
  cancel: () => void;
}

/** Minimal surface warmPresentImages needs — real `Image()` in the browser, a stub in tests. */
export interface PrefetchImageLike {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

export interface WarmPresentImagesOptions {
  onProgress?: (loaded: number, total: number) => void;
  /** Fires once every pending target has settled (loaded or errored) — including total===0. */
  onSettled?: () => void;
  createImage?: () => PrefetchImageLike;
}

/**
 * Warms every not-yet-warmed target via an off-DOM `Image()` load. Never
 * throws and never blocks the caller — Present must switch immediately
 * regardless of network conditions; this only shortens the window where a
 * pin's image is still a gray box after the switch. A failed load still
 * counts toward progress so the affordance always resolves and degrades to
 * today's stream-in behavior for that one image.
 *
 * `warmed` is caller-owned and persists across calls (one per board-room
 * session) so re-entering Present never re-requests an already-warmed URL.
 */
export function warmPresentImages(
  targets: readonly PresentPrefetchTarget[],
  warmed: Set<string>,
  options: WarmPresentImagesOptions = {},
): PresentPrefetchHandle {
  const pending = targets.filter((target) => !warmed.has(target.url));
  const total = pending.length;

  if (total === 0) {
    options.onSettled?.();
    return { total: 0, cancel: () => {} };
  }

  let cancelled = false;
  let loaded = 0;
  const createImage = options.createImage ?? (() => new Image());

  for (const target of pending) {
    warmed.add(target.url);
    const image = createImage();
    const settle = () => {
      if (cancelled) return;
      loaded += 1;
      options.onProgress?.(loaded, total);
      if (loaded >= total) options.onSettled?.();
    };
    image.onload = settle;
    image.onerror = settle;
    image.src = target.url;
  }

  return {
    total,
    cancel: () => {
      cancelled = true;
    },
  };
}
