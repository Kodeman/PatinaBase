'use client';

/**
 * FieldNoteMedia — the recording and the photographs that came with a field
 * note (§11.4). One batched signing call covers both lanes, the way
 * letterhead-instruments.tsx:123 batches a page of scan heroes rather than
 * signing per row.
 *
 * The `capture-media` bucket is private, so every path here is worthless
 * without a signed URL and a path that fails to sign is stated rather than
 * dropped (§3.3). Native <audio controls> is the player: a bespoke transport
 * would be a second seek/scrub implementation for a one-minute note.
 */
import { useCaptureMediaUrls } from '@patina/supabase';
import { formatNoteDuration } from '@/lib/document/field-note-payload';

export function FieldNoteMedia({
  audioPaths,
  photoPaths,
  durationSeconds,
}: {
  audioPaths: string[];
  photoPaths: string[];
  durationSeconds: number | null;
}) {
  const paths = [...audioPaths, ...photoPaths];
  const { data: signed, isLoading } = useCaptureMediaUrls(paths);

  if (paths.length === 0) return null;

  const urls = signed ?? {};
  const audio = audioPaths.map((p) => urls[p] ?? null);
  const photos = photoPaths.map((p) => urls[p] ?? null);
  const unsignedPhotos = photos.filter((u) => u === null).length;
  const duration = formatNoteDuration(durationSeconds);

  return (
    <div className="mb-2.5">
      {isLoading && audioPaths.length > 0 ? (
        <p className="py-1 text-[10.5px] italic text-[var(--text-muted)]">
          Fetching the recording…
        </p>
      ) : null}

      {audio.map((url, i) =>
        url ? (
          <div key={audioPaths[i]} className="mb-1.5 flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              data-testid={`field-note-audio-${i}`}
              src={url}
              controls
              preload="none"
              className="h-7 w-full max-w-[240px]"
            />
            {i === 0 && duration ? (
              <span className="font-mono text-[9.5px] tracking-[0.1em] text-[var(--text-muted)]">
                {duration}
              </span>
            ) : null}
          </div>
        ) : null,
      )}

      {photos.some(Boolean) ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {photos.map((url, i) =>
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={photoPaths[i]}
                src={url}
                alt=""
                className="h-14 w-14 rounded-[3px] object-cover"
              />
            ) : null,
          )}
        </div>
      ) : null}

      {unsignedPhotos > 0 ? (
        <p className="py-1 text-[10.5px] italic text-[var(--text-muted)]">
          {unsignedPhotos} photo{unsignedPhotos === 1 ? '' : 's'} need
          {unsignedPhotos === 1 ? 's' : ''} signal.
        </p>
      ) : null}
    </div>
  );
}
