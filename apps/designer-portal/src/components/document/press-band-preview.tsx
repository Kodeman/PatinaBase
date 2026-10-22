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
import {
  coverCropShown,
  plateCrop,
  plateCropWindow,
  type PlateRect,
  type PlateWindow,
} from '@/lib/document/plate-crop';

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
 * The kind the homeowner reader attributes a picture to: its frozen
 * attribution kind; the request's source kind only for a list without one.
 */
function attributionKindOf(image: Pick<ClientEditionImage, 'attributionKind' | 'sourceKind'>) {
  return image.attributionKind ?? image.sourceKind ?? null;
}

/**
 * The caption "whose" the homeowner reader shows (00846, story seq 48): with
 * makers off a maker picture names the studio and no override brings the maker
 * back; otherwise an explicit override wins, then the composed credit while
 * makers show, the studio while they do not.
 */
export function readerWhose(
  image: Pick<ClientEditionImage, 'attributionKind' | 'sourceKind' | 'captionWhose'>,
  override: string | null | undefined,
  { showMakers, studioName }: CaptionPolicy,
): string {
  if (!showMakers && MAKER_KINDS.has(attributionKindOf(image) ?? '')) return studioName ?? '';
  return override ?? (showMakers ? image.captionWhose : studioName) ?? '';
}

/** 00845 _client_plate_alt: what kind of picture, in the alt's last words. */
const ALT_KIND_WORDS: Readonly<Record<string, string>> = {
  maker: 'product photograph',
  upload: 'studio photograph',
  installed: 'installed photograph',
  scan: 'room scan',
  board: 'studio board',
  sheet: 'drawing',
  concept: 'concept render, not installed',
};

/**
 * The image's alt as the homeowner reader gives it (00846): while makers are
 * off it is rebuilt from the caption shown (what · whose · kind, 00845
 * _client_plate_alt), so it names no maker the caption does not; while they
 * show, the edition's own alt.
 */
export function readerAlt(
  image: ClientEditionImage,
  caption: { what: string; whose: string },
  { showMakers }: CaptionPolicy,
): string {
  if (showMakers) return image.alt ?? '';
  const kind = attributionKindOf(image);
  const kindWords = kind ? ALT_KIND_WORDS[kind] : undefined;
  return [caption.what, caption.whose, kindWords].filter(Boolean).join(' · ');
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

/** PLAN C2: designer-side photography stays within 120px tall. */
const COVER_HEIGHT = 120;

/**
 * The crop the client page's desktop draws from the hero's source picture,
 * as the worker cuts it (ground, floors, subject box and focal point): its
 * rect in source pixels and the window it shows. Null when the source's size
 * is unknown or the worker cuts no cover from it.
 */
export function heroCoverCrop(
  hero: ClientEditionImage,
): { rect: PlateRect; window: PlateWindow } | null {
  if (!(hero.width && hero.width > 0 && hero.height && hero.height > 0)) return null;
  const source = {
    width: hero.width,
    height: hero.height,
    focal: hero.focal,
    subjectBox: hero.subjectBox,
    ground: hero.ground,
  };
  const shown = coverCropShown(source, 'desktop');
  const rect = shown ? plateCrop(source, shown) : null;
  const window = shown ? plateCropWindow(source, shown) : null;
  return rect && window ? { rect, window } : null;
}

/**
 * The cover thumbnail: the crop's own window of the source, clipped to the
 * crop's aspect and at most 120px tall — the picture scaled so the window
 * fills the frame and moved so the window's corner meets the frame's.
 */
function CoverThumbnail({ src, alt, hero }: { src: string; alt: string; hero: ClientEditionImage | null }) {
  const crop = hero ? heroCoverCrop(hero) : null;
  if (!crop) {
    return (
      <img
        src={src}
        alt={alt}
        className="block h-[120px] w-[192px] max-w-full border border-[var(--border-subtle)] object-cover"
        data-press-cover
      />
    );
  }
  const [, , cropWidth, cropHeight] = crop.rect;
  const { left, top, vx, vy } = crop.window;
  return (
    <div
      className="relative max-h-[120px] max-w-full overflow-hidden border border-[var(--border-subtle)]"
      style={{
        // max-w-full may narrow it; the aspect ratio then keeps the window exact.
        width: `${(COVER_HEIGHT * cropWidth) / cropHeight}px`,
        aspectRatio: `${cropWidth} / ${cropHeight}`,
      }}
      data-press-cover-window={crop.rect.join(' ')}
    >
      <img
        src={src}
        alt={alt}
        className="absolute block max-w-none"
        style={{
          width: `${100 / vx}%`,
          height: `${100 / vy}%`,
          left: `${(-left / vx) * 100}%`,
          top: `${(-top / vy) * 100}%`,
        }}
        data-press-cover
      />
    </div>
  );
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
  const heroCaption = hero ? imageCaption(edition, hero, overrides, captionPolicy) : null;
  const heroAlt =
    hero && heroCaption && captionPolicy ? readerAlt(hero, heroCaption, captionPolicy) : (hero?.alt ?? '');
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
        {heroUrl ? (
          <CoverThumbnail src={getOptimizedImageUrl(heroUrl, { width: 400 })} alt={heroAlt} hero={hero} />
        ) : (
          <div
            className="flex h-[120px] w-[192px] max-w-full items-center justify-center border border-dashed border-[var(--border-subtle)] px-2 text-center text-[15px] text-[var(--text-muted)]"
            data-press-drawn-cover
          >
            The cover is a drawing
          </div>
        )}
        {heroCaption && (
          <figcaption className="text-[15px] leading-snug">
            {Object.values(heroCaption).filter(Boolean).join(' · ')}
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
