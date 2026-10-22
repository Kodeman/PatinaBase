'use client';

/**
 * US-49 Phase 2 — a photograph's focal point: one drag, two crops. Closed it
 * is one act; opened, the source picture stands in the two frames the client
 * page delivers, the desktop cover at 16:10 and the phone cover at 39:34, each
 * cut as the worker cuts it (lib/document/plate-crop: the point, held inside
 * the subject box). The point is stored once per photograph, so dragging it
 * in either frame moves it in both; the frames re-centre on it when the drag
 * ends. "Use this crop" saves it with the photograph's subject box, or with
 * none when the photograph has none — a box is a hard constraint on every
 * crop, so the studio never invents one.
 *
 * The two frames are the one exception to the 120px cap on designer
 * photography (orchestrator ruling R10): at most 240px tall, and only while
 * the editor is open.
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useSetPlateFocal, type ClientEditionImage } from '@patina/supabase';
import { ActFailLine } from '@/components/feedback/act-fail-line';
import {
  COVER_ASPECT,
  DEFAULT_CENTRE,
  objectPositionOf,
  plateCropWindow,
  type PlateBox,
  type PlatePoint,
  type PlateWindow,
} from '@/lib/document/plate-crop';
import { DocumentAction, DocumentActionRow } from './document-action';

const FULL_FRAME: PlateBox = [0, 0, 1, 1];
const KEY_STEP = 0.02;

/** The two delivered cover frames; widths keep each under 240px tall. */
const FRAMES = [
  { key: 'wide', label: '16:10', aspect: COVER_ASPECT.wide, width: 'w-[min(100%,360px)]', note: 'The desktop cover.' },
  {
    key: 'cover_phone',
    label: '39:34',
    aspect: COVER_ASPECT.cover_phone,
    width: 'w-[min(100%,260px)]',
    note: 'The phone cover.',
  },
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** The photograph's own subject box, or null when it has none. */
function subjectBoxOf(image: ClientEditionImage): PlateBox | null {
  const box = image.subjectBox;
  return box?.length === 4 && box.every((n) => Number.isFinite(n))
    ? (box.map((n) => clamp(n, 0, 1)) as PlateBox)
    : null;
}

/** A point held inside the subject box (and so inside 0–1). */
function inBox([x, y]: PlatePoint, [bx, by, bw, bh]: PlateBox): PlatePoint {
  return [clamp(x, bx, Math.min(1, bx + bw)), clamp(y, by, Math.min(1, by + bh))];
}

export function PressBandFocal({
  projectId,
  image,
  sourceUrl,
}: {
  projectId: string;
  image: ClientEditionImage;
  sourceUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const label = image.captionWhat || image.alt || 'the photograph';
  return (
    <div className="flex flex-col gap-3" data-press-focal={image.assetId}>
      <DocumentActionRow surfaceKey="open-document" regionKey="press-band-focal" aria-label="Focal point">
        <DocumentAction
          actionKey="press-focal-open"
          variant="tertiary"
          aria-expanded={open}
          aria-label={`Set the focal point of ${label}`}
          onClick={() => setOpen((was) => !was)}
        >
          Set the focal point
        </DocumentAction>
      </DocumentActionRow>
      {open && <FocalEditor projectId={projectId} image={image} sourceUrl={sourceUrl} />}
    </div>
  );
}

function FocalEditor({
  projectId,
  image,
  sourceUrl,
}: {
  projectId: string;
  image: ClientEditionImage;
  sourceUrl: string;
}) {
  const box = subjectBoxOf(image);
  const hold = box ?? FULL_FRAME;
  const initial: PlatePoint =
    image.focal?.length === 2
      ? inBox([image.focal[0], image.focal[1]], hold)
      : box
        ? [box[0] + box[2] / 2, box[1] + box[3] / 2]
        : DEFAULT_CENTRE;
  const [focal, setFocal] = useState<PlatePoint>(initial);
  const [moved, setMoved] = useState(false);
  // While a drag runs the frames stand still on the point the drag began at,
  // so the picture never slides under the pointer; the handle moves instead.
  const [dragFrom, setDragFrom] = useState<PlatePoint | null>(null);
  const dragFrame = useRef<number | null>(null);
  const setPlateFocal = useSetPlateFocal();
  const source = {
    width: image.width && image.width > 0 ? image.width : 1500,
    height: image.height && image.height > 0 ? image.height : 1000,
    subjectBox: box,
  };

  const moveTo = (next: PlatePoint) => {
    setFocal(inBox(next, hold));
    setMoved(true);
    setPlateFocal.reset();
  };

  const pointFromPointer = (event: PointerEvent<HTMLDivElement>, window: PlateWindow): PlatePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const u = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
    const v = rect.height > 0 ? clamp((event.clientY - rect.top) / rect.height, 0, 1) : 0.5;
    return [window.left + u * window.vx, window.top + v * window.vy];
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step: Record<string, PlatePoint> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    moveTo([focal[0] + delta[0], focal[1] + delta[1]]);
  };

  const across = Math.round(focal[0] * 100);
  const down = Math.round(focal[1] * 100);

  return (
    <div className="flex flex-col gap-3" data-press-focal-editor>
      <p className="font-mono text-[12px] font-medium uppercase leading-normal tracking-[0.12em] text-[var(--text-muted)]">
        Focal point · one drag, two crops
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {FRAMES.map((frame, index) => {
          const window = plateCropWindow({ ...source, focal: dragFrom ?? focal }, frame.aspect);
          const handleX = clamp((focal[0] - window.left) / window.vx, 0, 1) * 100;
          const handleY = clamp((focal[1] - window.top) / window.vy, 0, 1) * 100;
          return (
            <div key={frame.key} className={`flex flex-col gap-2 ${frame.width}`}>
              <p className="font-mono text-[12px] text-[var(--text-muted)]">{frame.label}</p>
              <div
                className="relative max-h-[240px] w-full touch-none select-none overflow-hidden border border-[var(--border-subtle)]"
                style={{ aspectRatio: `${frame.aspect}` }}
                data-focal-frame={frame.key}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  dragFrame.current = index;
                  setDragFrom(focal);
                  moveTo(pointFromPointer(event, window));
                }}
                onPointerMove={(event) => {
                  if (dragFrame.current !== index) return;
                  moveTo(pointFromPointer(event, window));
                }}
                onPointerUp={() => {
                  dragFrame.current = null;
                  setDragFrom(null);
                }}
                onPointerCancel={() => {
                  dragFrame.current = null;
                  setDragFrom(null);
                }}
              >
                <img
                  src={sourceUrl}
                  alt={`${image.alt ?? 'The cover'}, cropped ${frame.label}`}
                  draggable={false}
                  className="pointer-events-none block h-full w-full object-cover"
                  style={{ objectPosition: objectPositionOf(window) }}
                />
                <button
                  type="button"
                  aria-label={`Focal point at ${across} across, ${down} down. Drag, or use the arrow keys`}
                  className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-[var(--paper)] bg-transparent outline outline-1 outline-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  style={{ left: `${handleX}%`, top: `${handleY}%` }}
                  onKeyDown={onKeyDown}
                />
              </div>
              <p className="text-[15px] leading-snug text-[var(--text-muted)]">{frame.note}</p>
            </div>
          );
        })}
      </div>
      <DocumentActionRow surfaceKey="open-document" regionKey="press-band-focal" aria-label="Crop actions">
        <DocumentAction
          actionKey="press-use-crop"
          variant="secondary"
          disabled={!moved}
          loading={setPlateFocal.isPending}
          loadingLabel="Saving…"
          onClick={() =>
            setPlateFocal.mutate({
              projectId,
              assetId: image.assetId,
              subjectBox: box ? [...box] : null,
              focal: [...focal],
            })
          }
        >
          Use this crop
        </DocumentAction>
      </DocumentActionRow>
      {setPlateFocal.isSuccess && (
        <p className="text-[15px] text-[var(--text-muted)]" role="status">
          Crop saved. The covers are cut again from this point.
        </p>
      )}
      <ActFailLine error={setPlateFocal.error} />
    </div>
  );
}
