import type { EditableMoodBoardItem } from '@patina/types';

/**
 * DV13 (mood-board-ux-audit-2026-08-31) — template asset hygiene. The tested
 * Patina starter ships one broken image placeholder by default (report.md
 * F6); the risk that a studio-authored template bakes in a similarly broken
 * or missing image and then propagates it to every materialization was
 * unconfirmed. This is a non-blocking, save-time check: it never prevents
 * "Save as template", it only names what will carry over as-is.
 */

const VISUAL_ITEM_TYPES = new Set<EditableMoodBoardItem['type']>([
  'image',
  'room_scan',
  'product',
  'capture',
]);

function itemImageUrl(item: EditableMoodBoardItem): string | null {
  if (item.imageUrl) return item.imageUrl;
  const fromData = item.data?.image_url;
  return typeof fromData === 'string' && fromData.length > 0 ? fromData : null;
}

function itemLabel(item: EditableMoodBoardItem): string {
  const name = item.data?.name;
  if (typeof name === 'string' && name.trim()) return name;
  const content = item.content?.trim();
  if (content) return content;
  return `${item.type} pin`;
}

export interface TemplateAssetIssue {
  itemId: string;
  label: string;
  reason: 'missing' | 'broken';
}

/**
 * Visual item types (image/room_scan/product/capture) carrying no image
 * reference at all — synchronous, no network. A template that materializes
 * one of these shows "No image" everywhere it's reused.
 */
export function findMissingTemplateAssets(
  items: readonly EditableMoodBoardItem[],
): TemplateAssetIssue[] {
  return items
    .filter((item) => VISUAL_ITEM_TYPES.has(item.type) && !itemImageUrl(item))
    .map((item) => ({ itemId: item.id, label: itemLabel(item), reason: 'missing' as const }));
}

/** Minimal surface the probe needs — real `Image()` in the browser, a stub in tests. */
export interface ProbeImageLike {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}

/**
 * Best-effort broken-image probe for items that DO carry a URL — an off-DOM
 * `Image()` load per item, mirroring present-prefetch.ts's warm pattern.
 * Never throws; a probe that never settles resolves after `timeoutMs` (a
 * dropped connection must not hang the dialog open forever).
 */
export function probeTemplateAssetImages(
  items: readonly EditableMoodBoardItem[],
  options: { createImage?: () => ProbeImageLike; timeoutMs?: number } = {},
): Promise<TemplateAssetIssue[]> {
  const targets = items
    .filter((item) => VISUAL_ITEM_TYPES.has(item.type))
    .map((item) => ({ item, url: itemImageUrl(item) }))
    .filter((entry): entry is { item: EditableMoodBoardItem; url: string } => Boolean(entry.url));

  if (targets.length === 0) return Promise.resolve([]);

  const createImage = options.createImage ?? (() => new Image());
  const timeoutMs = options.timeoutMs ?? 8000;

  return new Promise((resolve) => {
    const broken: TemplateAssetIssue[] = [];
    let settledCount = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(broken);
    };
    const timer = setTimeout(finish, timeoutMs);
    for (const { item, url } of targets) {
      const image = createImage();
      const settle = (ok: boolean) => {
        settledCount += 1;
        if (!ok) broken.push({ itemId: item.id, label: itemLabel(item), reason: 'broken' });
        if (settledCount >= targets.length) {
          clearTimeout(timer);
          finish();
        }
      };
      image.onload = () => settle(true);
      image.onerror = () => settle(false);
      image.src = url;
    }
  });
}
