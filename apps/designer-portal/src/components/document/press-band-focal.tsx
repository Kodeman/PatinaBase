'use client';

/**
 * US-49 Phase 2 — the cover's focal point: one drag, two crops. The hero's
 * source picture stands in the two frames the client page delivers, the
 * desktop cover at 16:10 and the phone cover at 39:34. The point is stored
 * once per photograph, so dragging it in either frame moves it in both; the
 * frames re-centre on it when the drag ends. "Use this crop" saves it with
 * the photograph's subject box (the whole frame when none was found), and
 * the point never leaves that box: both crops keep the whole subject.
 */

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useSetPlateFocal, type ClientEditionImage } from '@patina/supabase';
import { ActFailLine } from '@/components/feedback/act-fail-line';
import { DocumentAction, DocumentActionRow } from './document-action';

type Point = [number, number];
type Box = [number, number, number, number];

const FULL_FRAME: Box = [0, 0, 1, 1];
const KEY_STEP = 0.02;

/** The two delivered cover frames (PLAN floors: wide 16:10, cover_phone 39:34). */
const FRAMES = [
  { key: 'wide', label: '16:10', aspect: 16 / 10, width: 'w-[min(100%,360px)]', note: 'The desktop cover.' },
  { key: 'cover_phone', label: '39:34', aspect: 39 / 34, width: 'w-[min(100%,260px)]', note: 'The phone cover.' },
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function subjectBoxOf(image: ClientEditionImage): Box {
  const box = image.subjectBox;
  return box?.length === 4 && box.every((n) => Number.isFinite(n))
    ? (box.map((n) => clamp(n, 0, 1)) as Box)
    : FULL_FRAME;
}

/** A point held inside the subject box (and so inside 0–1). */
function inBox([x, y]: Point, [bx, by, bw, bh]: Box): Point {
  return [clamp(x, bx, Math.min(1, bx + bw)), clamp(y, by, Math.min(1, by + bh))];
}

/**
 * The part of the source a cover crop of `frameAspect` shows when centred on
 * `focal` (as object-fit: cover with object-position does): its left/top and
 * visible width/height, all as fractions of the source.
 */
export function cropWindow(sourceAspect: number, frameAspect: number, [fx, fy]: Point) {
  const vx = sourceAspect > frameAspect ? frameAspect / sourceAspect : 1;
  const vy = sourceAspect > frameAspect ? 1 : sourceAspect / frameAspect;
  return {
    left: clamp(fx - vx / 2, 0, 1 - vx),
    top: clamp(fy - vy / 2, 0, 1 - vy),
    vx,
    vy,
  };
}

type Window = ReturnType<typeof cropWindow>;

const objectPosition = ({ left, top, vx, vy }: Window) =>
  `${vx < 1 ? (left / (1 - vx)) * 100 : 50}% ${vy < 1 ? (top / (1 - vy)) * 100 : 50}%`;

export function PressBandFocal({
  projectId,
  image,
  sourceUrl,
}: {
  projectId: string;
  image: ClientEditionImage;
  sourceUrl: string;
}) {
  const box = subjectBoxOf(image);
  const initial: Point =
    image.focal?.length === 2
      ? inBox([image.focal[0], image.focal[1]], box)
      : inBox([box[0] + box[2] / 2, box[1] + box[3] / 2], box);
  const [focal, setFocal] = useState<Point>(initial);
  const [moved, setMoved] = useState(false);
  // While a drag runs the frames stand still on the point the drag began at,
  // so the picture never slides under the pointer; the handle moves instead.
  const [dragFrom, setDragFrom] = useState<Point | null>(null);
  const dragFrame = useRef<number | null>(null);
  const setPlateFocal = useSetPlateFocal();
  const sourceAspect =
    image.width && image.height && image.height > 0 ? image.width / image.height : 3 / 2;

  const moveTo = (next: Point) => {
    setFocal(inBox(next, box));
    setMoved(true);
    setPlateFocal.reset();
  };

  const pointFromPointer = (event: PointerEvent<HTMLDivElement>, window: Window): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const u = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
    const v = rect.height > 0 ? clamp((event.clientY - rect.top) / rect.height, 0, 1) : 0.5;
    return [window.left + u * window.vx, window.top + v * window.vy];
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step: Record<string, Point> = {
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
    <div className="flex flex-col gap-3" data-press-focal>
      <p className="font-mono text-[12px] font-medium uppercase leading-normal tracking-[0.12em] text-[var(--text-muted)]">
        Focal point · one drag, two crops
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {FRAMES.map((frame, index) => {
          const window = cropWindow(sourceAspect, frame.aspect, dragFrom ?? focal);
          const handleX = clamp((focal[0] - window.left) / window.vx, 0, 1) * 100;
          const handleY = clamp((focal[1] - window.top) / window.vy, 0, 1) * 100;
          return (
            <div key={frame.key} className={`flex flex-col gap-2 ${frame.width}`}>
              <p className="font-mono text-[12px] text-[var(--text-muted)]">{frame.label}</p>
              <div
                className="relative w-full touch-none select-none overflow-hidden border border-[var(--border-subtle)]"
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
                  style={{ objectPosition: objectPosition(window) }}
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
              subjectBox: [...box],
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
