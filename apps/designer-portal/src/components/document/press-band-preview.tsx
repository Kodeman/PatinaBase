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

/** One image's caption triplet, edits laid over it. */
export function imageCaption(
  edition: ClientEdition,
  image: ClientEditionImage,
  overrides?: ClientEditionOverrides | null,
): { what: string; whose: string; when: string } {
  const own = edition.overrides?.captions?.[image.assetId];
  const edit = overrides?.captions?.[image.assetId];
  return {
    what: image.captionWhat ?? '',
    whose: edit?.whose ?? own?.whose ?? image.captionWhose ?? '',
    when: edit?.when ?? own?.when ?? image.captionWhen ?? '',
  };
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
  const before = new Map(
    current.images.map((image) => [image.assetId, JSON.stringify(imageCaption(current, image))]),
  );
  const seen = new Set<string>();
  let changed = 0;
  for (const image of next.images) {
    if (seen.has(image.assetId)) continue;
    seen.add(image.assetId);
    if (before.get(image.assetId) !== JSON.stringify(imageCaption(next, image, overrides))) changed += 1;
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

export function PressBandPreview({
  edition,
  current,
  overrides,
  sourceUrls,
}: {
  edition: ClientEdition;
  /** The approved edition the client sees now; null before the first. */
  current: ClientEdition | null;
  overrides?: ClientEditionOverrides | null;
  /** Viewable source addresses by asset id (useClientEditionSourceUrls). */
  sourceUrls: Record<string, string>;
}) {
  const heroId = editionHeroId(edition, overrides);
  const hero = edition.images.find((image) => image.assetId === heroId) ?? null;
  const heroUrl = heroId ? sourceUrls[heroId] : undefined;
  const chapters = editionChapters(edition, overrides);
  const doorstep = edition.composition?.doorstep?.standing;
  const notice = edition.composition?.notice;

  return (
    <div className="flex flex-col gap-4" data-press-preview={edition.id}>
      <p className="text-[15px] leading-snug text-[var(--text-muted)]" data-press-delta>
        {editionDelta(edition, current, overrides)}
      </p>
      <figure className="m-0 flex flex-col gap-2">
        {heroUrl ? (
          <img
            src={getOptimizedImageUrl(heroUrl, { width: 1200 })}
            alt={hero?.alt ?? ''}
            className="block aspect-[16/10] w-full border border-[var(--border-subtle)] object-cover"
            style={
              hero?.focal?.length === 2
                ? { objectPosition: `${hero.focal[0] * 100}% ${hero.focal[1] * 100}%` }
                : undefined
            }
          />
        ) : (
          <div
            className="flex aspect-[16/10] w-full items-center justify-center border border-dashed border-[var(--border-subtle)] text-[15px] text-[var(--text-muted)]"
            data-press-drawn-cover
          >
            The cover is a drawing
          </div>
        )}
        {hero && (
          <figcaption className="text-[15px] leading-snug">
            {Object.values(imageCaption(edition, hero, overrides)).filter(Boolean).join(' · ')}
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
