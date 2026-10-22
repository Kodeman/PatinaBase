'use client';

/**
 * US-49 Phase 2 — the Press band's preview of one edition: its cover (the
 * hero's SOURCE picture, through the studio's own media helpers — never the
 * client page's plate route), the chapter openers with their headlines and
 * standing sentences, the doorstep standing, the notice sentence, and one line
 * saying what moved against the edition the client sees now.
 *
 * The edition is shown with the studio's pending edits laid over it, so the
 * preview is what Approve would publish.
 */

import type {
  ClientEdition,
  ClientEditionImage,
  ClientEditionOverrides,
} from '@patina/supabase';
import { getOptimizedImageUrl } from '@/lib/media-utils';
import { coverCropShown, objectPositionOf, plateCropWindow } from '@/lib/document/plate-crop';

/** The hero asset an edition opens on, the studio's choice first. */
export function editionHeroId(
  edition: ClientEdition,
  overrides?: ClientEditionOverrides | null,
): string | null {
  return (
    overrides?.heroAssetId ??
    edition.overrides?.heroAssetId ??
    edition.composition?.hero?.assetId ??
    edition.images.find((image) => image.plateRole === 'hero')?.assetId ??
    null
  );
}

export interface ChapterWords {
  key: string;
  headline: string;
  standing: string;
}

/** The chapter openers in the composer's order, edits laid over them. */
export function editionChapters(
  edition: ClientEdition,
  overrides?: ClientEditionOverrides | null,
): ChapterWords[] {
  return (edition.composition?.chapters ?? []).map((chapter) => {
    const own = edition.overrides?.chapters?.[chapter.key];
    const edit = overrides?.chapters?.[chapter.key];
    return {
      key: chapter.key,
      headline: edit?.headline ?? own?.headline ?? chapter.headline ?? '',
      standing: edit?.standing ?? own?.standing ?? chapter.standing ?? '',
    };
  });
}

/** The project's maker switch and studio name, as the homeowner reader reads them. */
export interface CaptionPolicy {
  showMakers: boolean;
  studioName: string | null;
}

/** The item-picture kinds, the ones a caption may credit to a maker (story seq 48). */
const MAKER_KINDS: ReadonlySet<string> = new Set(['maker', 'upload']);

/**
 * The caption "whose" the homeowner reader shows (00846, story seq 48): with
 * makers off a maker picture names the studio and no override brings the maker
 * back; otherwise an explicit override wins, then the composed credit while
 * makers show, the studio while they do not.
 */
export function readerWhose(
  image: Pick<ClientEditionImage, 'sourceKind' | 'captionWhose'>,
  override: string | null | undefined,
  { showMakers, studioName }: CaptionPolicy,
): string {
  if (!showMakers && MAKER_KINDS.has(image.sourceKind ?? '')) return studioName ?? '';
  return override ?? (showMakers ? image.captionWhose : studioName) ?? '';
}

/**
 * One image's caption triplet, edits laid over it; with a `policy`, "whose"
 * as the homeowner reader projects it.
 */
export function imageCaption(
  edition: ClientEdition,
  image: ClientEditionImage,
  overrides?: ClientEditionOverrides | null,
  policy?: CaptionPolicy,
): { what: string; whose: string; when: string } {
  const own = edition.overrides?.captions?.[image.assetId];
  const edit = overrides?.captions?.[image.assetId];
  const whose = edit?.whose ?? own?.whose;
  return {
    what: image.captionWhat ?? '',
    whose: policy ? readerWhose(image, whose, policy) : (whose ?? image.captionWhose ?? ''),
    when: edit?.when ?? own?.when ?? image.captionWhen ?? '',
  };
}

/** Each picture's caption triplet by asset id, the first row of an asset kept. */
function captionsById(edition: ClientEdition, overrides?: ClientEditionOverrides | null) {
  const captions = new Map<string, string>();
  for (const image of edition.images) {
    if (!captions.has(image.assetId)) {
      captions.set(image.assetId, JSON.stringify(imageCaption(edition, image, overrides)));
    }
  }
  return captions;
}

function editionWords(edition: ClientEdition, overrides?: ClientEditionOverrides | null): string {
  return JSON.stringify([
    editionChapters(edition, overrides),
    edition.composition?.doorstep?.standing ?? '',
    edition.composition?.notice ?? '',
  ]);
}

/**
 * "Hero changed · 2 captions changed · words unchanged" — what moved between
 * the edition under review and the one the client sees now. Never why.
 */
export function editionDelta(
  next: ClientEdition,
  current: ClientEdition | null,
  overrides?: ClientEditionOverrides | null,
): string {
  if (!current) return 'The first edition';
  const hero = editionHeroId(next, overrides) === editionHeroId(current) ? 'Hero unchanged' : 'Hero changed';
  const before = captionsById(current);
  const after = captionsById(next, overrides);
  // Every caption either edition carries: one dropped counts as changed too.
  let changed = 0;
  for (const assetId of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(assetId) !== after.get(assetId)) changed += 1;
  }
  const captions =
    changed === 0
      ? 'captions unchanged'
      : `${changed} ${changed === 1 ? 'caption' : 'captions'} changed`;
  const words =
    editionWords(next, overrides) === editionWords(current) ? 'words unchanged' : 'words changed';
  return [hero, captions, words].join(' · ');
}

const EYEBROW =
  'font-mono text-[12px] font-medium uppercase leading-normal tracking-[0.12em] text-[var(--text-muted)]';

/**
 * Where the crop the client page's desktop draws sits in the hero's source
 * picture, as the worker cuts it (subject box and focal point); the 3:2
 * thirds when the source's size is unknown, the centre when it cuts none.
 */
export function heroObjectPosition(hero: ClientEditionImage): string {
  const width = hero.width && hero.width > 0 ? hero.width : 1500;
  const height = hero.height && hero.height > 0 ? hero.height : 1000;
  const source = { width, height, focal: hero.focal, subjectBox: hero.subjectBox };
  const shown = coverCropShown(source, 'desktop');
  const window = shown ? plateCropWindow(source, shown) : null;
  return window ? objectPositionOf(window) : '50% 50%';
}

export function PressBandPreview({
  edition,
  current,
  overrides,
  sourceUrls,
  delta = true,
  captionPolicy,
}: {
  edition: ClientEdition;
  /** The approved edition the client sees now; null before the first. */
  current: ClientEdition | null;
  overrides?: ClientEditionOverrides | null;
  /** Viewable source addresses by asset id (useClientEditionSourceUrls). */
  sourceUrls: Record<string, string>;
  /** The what-moved line; the client mirror shows the edition alone. */
  delta?: boolean;
  /** The client mirror's caption projection (readerWhose); the band shows raw words. */
  captionPolicy?: CaptionPolicy;
}) {
  const heroId = editionHeroId(edition, overrides);
  const hero = edition.images.find((image) => image.assetId === heroId) ?? null;
  const heroUrl = heroId ? sourceUrls[heroId] : undefined;
  const chapters = editionChapters(edition, overrides);
  const doorstep = edition.composition?.doorstep?.standing;
  const notice = edition.composition?.notice;

  return (
    <div className="flex flex-col gap-4" data-press-preview={edition.id}>
      {delta && (
        <p className="text-[15px] leading-snug text-[var(--text-muted)]" data-press-delta>
          {editionDelta(edition, current, overrides)}
        </p>
      )}
      <figure className="m-0 flex flex-col gap-2">
        {/* PLAN C2: designer-side photography stays within 120px tall. */}
        {heroUrl ? (
          <img
            src={getOptimizedImageUrl(heroUrl, { width: 400 })}
            alt={hero?.alt ?? ''}
            className="block h-[120px] w-[192px] max-w-full border border-[var(--border-subtle)] object-cover"
            style={hero ? { objectPosition: heroObjectPosition(hero) } : undefined}
            data-press-cover
          />
        ) : (
          <div
            className="flex h-[120px] w-[192px] max-w-full items-center justify-center border border-dashed border-[var(--border-subtle)] px-2 text-center text-[15px] text-[var(--text-muted)]"
            data-press-drawn-cover
          >
            The cover is a drawing
          </div>
        )}
        {hero && (
          <figcaption className="text-[15px] leading-snug">
            {Object.values(imageCaption(edition, hero, overrides, captionPolicy)).filter(Boolean).join(' · ')}
          </figcaption>
        )}
      </figure>
      {doorstep && (
        <div className="flex flex-col gap-1">
          <p className={EYEBROW}>Doorstep</p>
          <p className="text-[15px] leading-snug">{doorstep}</p>
        </div>
      )}
      {chapters.length > 0 && (
        <ol aria-label="Chapters" className="m-0 list-none border-t border-[var(--border-subtle)] p-0">
          {chapters.map((chapter, index) => (
            <li
              key={chapter.key}
              className="grid grid-cols-[3ch_minmax(0,1fr)] gap-x-3 border-b border-[var(--border-subtle)] py-2"
            >
              <span className="font-mono text-[15px] text-[var(--text-muted)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex flex-col">
                <span className="font-display text-[18px] leading-tight">{chapter.headline}</span>
                {chapter.standing && (
                  <span className="text-[15px] leading-snug text-[var(--text-muted)]">
                    {chapter.standing}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {notice && <p className="text-[15px] italic leading-snug">{notice}</p>}
    </div>
  );
}
