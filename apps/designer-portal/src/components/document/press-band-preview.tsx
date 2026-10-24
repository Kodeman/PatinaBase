'use client';

/** Gallery arrival and reading words, with the studio’s pending edits laid over them. */

import { useClientEditorialAssets, type ClientEditorialAsset, useProjectPalettes, useProjectV2 } from '@patina/supabase';
import { galleryCropPosition, type GalleryPoint, type GalleryRect } from '@patina/utils';
import type {
  ClientEdition,
  ClientEditionImage,
  ClientEditionOverrides,
} from '@patina/supabase';
import { readerImageContent, type CaptionPolicy } from '@/lib/document/client-editions';
import { getOptimizedImageUrl } from '@/lib/media-utils';
import { arrivalRendition, selectArrival, type PlatePoint, type PlateWindow } from '@/lib/document/plate-crop';

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

/** One image's caption triplet, with the studio's edits laid over it. */
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

export const GALLERY_FRAMES = [
  { key: 'cover_phone', label: 'Phone', width: 390, height: 796 },
  { key: 'wide', label: 'Laptop', width: 1440, height: 852 },
] as const;

/** The same source-space cover crop used by the homeowner's full-source renditions. */
export function gallerySourcePosition(image: ClientEditionImage, aspect: number, focal = image.focal): string | null {
  return galleryCropPosition(image.width ?? 0, image.height ?? 0, aspect,
    image.subjectBox as GalleryRect | null, focal as GalleryPoint | null);
}

/** Pointer coordinates must use the shared crop, not the unadjusted focal percentages. */
export function galleryCropWindow(image: ClientEditionImage, aspect: number, focal = image.focal): PlateWindow {
  const ratio = (image.width ?? 1) / (image.height ?? 1);
  const vx = Math.min(1, aspect / ratio);
  const vy = Math.min(1, ratio / aspect);
  const [x, y] = (gallerySourcePosition(image, aspect, focal) ?? '50% 50%').split(' ').map((value) => parseFloat(value) / 100);
  return { vx, vy, left: (1 - vx) * x, top: (1 - vy) * y };
}

function galleryDimensions(image: ClientEditionImage): boolean {
  const edges = [image.width ?? 0, image.height ?? 0];
  return Math.max(...edges) >= 2000 && Math.min(...edges) >= 1200
    && GALLERY_FRAMES.every((frame) => gallerySourcePosition(image, frame.width / frame.height) !== null);
}

export function galleryHeroEligible(image: ClientEditionImage): boolean {
  const kind = image.attributionKind ?? image.sourceKind ?? '';
  return ['installed', 'upload', 'scan', 'maker'].includes(kind) && image.ground === 'scene' && galleryDimensions(image);
}

function GalleryPaintCard({ palette }: { palette: readonly { hex: string; name: string | null }[] }) {
  const label = palette.length ? 'The house palette: ' + palette.map((swatch) => swatch.name || swatch.hex).join(', ') : 'The paint card; no palette chosen yet';
  return <div className="flex h-full w-full bg-[#E6DCC8]" role="img" aria-label={label} data-gallery-paint>
    {palette.map((swatch, index) => <span key={index} className="h-full flex-1" style={{ backgroundColor: swatch.hex }} />)}
  </div>;
}

function GalleryBackground({ hero, url, palette, frame, asset, mode }: {
  asset: ClientEditorialAsset | null; mode: 'cover' | 'contained' | null;
  hero: ClientEditionImage | null;
  url?: string;
  palette: readonly { hex: string; name: string | null }[];
  frame: (typeof GALLERY_FRAMES)[number];
}) {
  const crop = asset ? arrivalRendition(asset, mode === 'contained' ? null : frame.width / frame.height) : null;
  if (!hero || !url || !asset || !crop) return <GalleryPaintCard palette={palette} />;
  const [x,y,w,h] = crop.rect;
  const aspect = w * asset.width / (h * asset.height);
  const boxWidth = mode === 'contained' ? Math.min(frame.width, crop.width * 1.25, frame.height * aspect) : frame.width;
  const boxHeight = mode === 'contained' ? boxWidth / aspect : frame.height;
  const scale = Math.max(boxWidth / (w * asset.width), boxHeight / (h * asset.height));
  const [px,py] = crop.position.split(' ').map(value => parseFloat(value) / 100);
  const left = (boxWidth - w * asset.width * scale) * px - x * asset.width * scale;
  const top = (boxHeight - h * asset.height * scale) * py - y * asset.height * scale;
  return <div className="flex h-full w-full items-center justify-center" style={{ background: asset.ground === 'white' ? '#fff' : '#FAF7F2' }}>
    <div className="relative overflow-hidden" style={{ width: boxWidth, height: boxHeight }} data-gallery-mode={mode}>
      <img src={getOptimizedImageUrl(url, { width: Math.max(frame.width, crop.width) })} alt={hero.alt || ''} data-press-cover style={{ position: 'absolute', maxWidth: 'none', width: asset.width * scale, height: asset.height * scale, left, top }} />
    </div>
  </div>;
}

function GalleryArrival({ hero, url, headline, palette, frame, asset, mode }: {
  asset: ClientEditorialAsset | null; mode: 'cover' | 'contained' | null;
  hero: ClientEditionImage | null;
  url?: string;
  headline: string;
  palette: readonly { hex: string; name: string | null }[];
  frame: (typeof GALLERY_FRAMES)[number];
}) {
  const scale = 120 / frame.height;
  const wide = frame.key === 'wide';
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <p className="m-0 text-[15px] text-[var(--text-muted)]">{frame.label} · {frame.width} × {frame.height}</p>
      <div className="relative h-[120px] overflow-hidden border border-[var(--border-subtle)]" style={{ width: frame.width * scale, maxWidth: '100%' }} data-gallery-frame={frame.key} aria-hidden={wide ? true : undefined}>
        <div className="absolute left-0 top-0 overflow-hidden" style={{ width: frame.width, height: frame.height, transform: 'scale(' + scale + ')', transformOrigin: 'top left' }}>
          <GalleryBackground hero={hero} url={url} palette={palette} frame={frame} asset={asset} mode={mode} />
          <div className="absolute inset-x-0 bottom-0 bg-[#2E2A26] text-[#F4EFE7]" style={{ display: wide ? 'flex' : 'block', alignItems: 'end', justifyContent: 'space-between', gap: 48, padding: wide ? '28px 52px' : '24px 22px' }} data-gallery-band>
            <p className="m-0 font-normal" style={{ fontFamily: 'var(--font-display, "Playfair Display"), serif', fontSize: wide ? 52 : 34, lineHeight: 1.08 }}>{headline}</p>
            <p className="mb-0 mt-3 text-[#D0C9BE]" style={{ fontFamily: 'Inter, var(--font-inter), sans-serif', fontSize: 16, lineHeight: 1.35 }}>The line about invoices and approvals goes here</p>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function ProjectGalleryPreview({ projectId, ...props }: { projectId: string } & Parameters<typeof PressBandPreview>[0]) {
  const { data: project } = useProjectV2(projectId);
  const { data: assets } = useClientEditorialAssets(projectId);
  const { data: palettes } = useProjectPalettes(projectId);
  // Match get_client_project_editorial's primary-palette order, not the hook's list order.
  const chosen = [...(palettes ?? [])].sort((a, b) =>
    Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order ||
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
  return <PressBandPreview {...props} assets={assets} houseName={project?.name ?? 'Your house'} palette={chosen?.swatches ?? []} />;
}

export function PressBandPreview({ edition, current, overrides, sourceUrls, delta = true, captionPolicy, houseName = 'Your house', palette = [], focal, assets = [] }: {
  assets?: readonly ClientEditorialAsset[];
  edition: ClientEdition;
  current: ClientEdition | null;
  overrides?: ClientEditionOverrides | null;
  sourceUrls: Record<string, string>;
  delta?: boolean;
  captionPolicy?: CaptionPolicy;
  houseName?: string;
  palette?: readonly { hex: string; name: string | null }[];
  focal?: { assetId: string; point: PlatePoint } | null;
}) {
  const heroId = editionHeroId(edition, overrides);
  const arrival = selectArrival({ assets, palette, edition, composition: { hero: heroId ? { assetId: heroId } : null } });
  const asset = arrival.asset;
  const selected = edition.images.find((image) => image.assetId === asset?.id);
  const hero = selected ? { ...selected, focal: focal?.assetId === selected.assetId ? focal.point : selected.focal } : null;
  if (hero && captionPolicy) hero.alt = readerImageContent(hero, { ...edition.overrides?.captions?.[hero.assetId], ...overrides?.captions?.[hero.assetId] }, captionPolicy).alt;
  const chapters = editionChapters(edition, overrides);
  const cover = chapters.find((chapter) => chapter.key === 'cover')?.headline.trim() ?? '';
  const tooLong = cover.length > 40 || cover.split(/\s+/).length > 6;
  const headline = cover && !tooLong ? cover : houseName;
  const colors = palette.filter((swatch) => /^#[0-9a-f]{6}$/i.test(swatch.hex));
  const photos = [...new Map([...edition.images].sort((a, b) => a.rank - b.rank).map((image) => [image.assetId, image])).values()];
  return (
    <div className="flex flex-col gap-4" data-press-preview={edition.id}>
      {delta && <p className="text-[15px] leading-snug text-[var(--text-muted)]" data-press-delta>{editionDelta(edition, current, overrides)}</p>}
      <div className="flex flex-wrap items-start gap-6" aria-label="Arrival previews">
        {GALLERY_FRAMES.map((frame) => <GalleryArrival key={frame.key} frame={frame} hero={hero} asset={asset} mode={arrival.mode} url={hero ? sourceUrls[hero.assetId] : undefined} headline={headline} palette={colors} />)}
      </div>
      {asset && !hero && <p>The page opens on the {asset.ground === 'white' ? 'catalogue photograph' : 'photograph'} of {asset.caption.what || 'the house'}.</p>}
      {tooLong && <p className="text-[15px] text-[var(--text-muted)]">The cover headline is too long for the band, so the house name is shown instead.</p>}
      <p className="text-[15px] text-[var(--text-muted)]">The muted line is a sample; invoices and approvals supply the live words.</p>
      {chapters.some((chapter) => chapter.key !== 'cover') && <div>
        <p className="text-[15px] text-[var(--text-muted)]">Chapter names appear only in Menu.</p>
        <ul aria-label="Chapters" className="m-0 list-none p-0">{chapters.filter((chapter) => chapter.key !== 'cover').map((chapter) => <li key={chapter.key} className="text-[16px] leading-snug">{chapter.headline}</li>)}</ul>
      </div>}
      <ul aria-label="Photographs" className="m-0 list-none p-0">
        {photos.map((image) => {
          const edit = { ...edition.overrides?.captions?.[image.assetId], ...overrides?.captions?.[image.assetId] };
          const caption = captionPolicy ? readerImageContent(image, edit, captionPolicy).caption : imageCaption(edition, image, overrides);
          const sentence = photos.find((photo) => photo.chapterKey === image.chapterKey)?.assetId === image.assetId ? chapters.find((chapter) => chapter.key === image.chapterKey)?.standing : null;
          return <li key={image.assetId} className="border-t border-[var(--border-subtle)] py-2">
            <figure className="m-0"><figcaption className="text-[15px] leading-snug text-[var(--text-muted)]">{Object.values(caption).filter(Boolean).join(' · ')}</figcaption></figure>
            {sentence && <p className="text-[16px] leading-snug">{sentence}</p>}
          </li>;
        })}
      </ul>
    </div>
  );
}
