import { cn } from '@/lib/utils';

interface BoardCoverArtProps {
  name: string;
  coverUrl?: string | null;
  fallbackUrls?: readonly string[] | null;
  className?: string;
  imageClassName?: string;
}

function mosaicCellClass(index: number, count: number) {
  if (count === 3 && index === 0) return 'row-span-2';
  return '';
}

/** Shared cover precedence: generated cover → first-four pin mosaic → monogram. */
export function BoardCoverArt({
  name,
  coverUrl,
  fallbackUrls,
  className,
  imageClassName,
}: BoardCoverArtProps) {
  const mosaicUrls = (fallbackUrls ?? []).filter((url) => url.trim()).slice(0, 4);

  if (coverUrl) {
    return (
      <div className={cn('h-full w-full overflow-hidden bg-[var(--bg-muted)]', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverUrl} alt="" className={cn('h-full w-full object-cover', imageClassName)} />
      </div>
    );
  }

  if (mosaicUrls.length > 0) {
    return (
      <div
        className={cn(
          'grid h-full w-full overflow-hidden bg-[var(--bg-muted)]',
          mosaicUrls.length === 1 && 'grid-cols-1 grid-rows-1',
          mosaicUrls.length === 2 && 'grid-cols-2 grid-rows-1',
          mosaicUrls.length >= 3 && 'grid-cols-2 grid-rows-2',
          className,
        )}
        data-board-cover="mosaic"
      >
        {mosaicUrls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className={cn(
              'min-h-0 min-w-0 overflow-hidden',
              mosaicCellClass(index, mosaicUrls.length),
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className={cn('h-full w-full object-cover', imageClassName)} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center overflow-hidden bg-[var(--bg-muted)]',
        className,
      )}
      data-board-cover="monogram"
    >
      <span aria-hidden className="font-heading text-[32px] italic text-[var(--text-muted)]">
        {name.trim().charAt(0).toUpperCase() || 'B'}
      </span>
    </div>
  );
}
