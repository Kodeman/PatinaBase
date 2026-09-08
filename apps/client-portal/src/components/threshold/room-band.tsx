'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { ROOM_RENDERS_BUCKET, createBrowserClient } from '@patina/supabase';

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from '@/components/commercial/journey-stepper';
import {
  countInWords,
  joinClauses,
  moneyInWords,
} from '@/components/threshold/instruments/standing-sentence';
import { TrackingRow } from '@/components/threshold/instruments/tracking-row';
import {
  PLAN_PHONE_TYPE,
  planPhoneViewBox,
  usePhoneDrawing,
} from '@/components/threshold/plan-key';
import type { ClientSelection } from '@/lib/commercial-documents';
import {
  DAY_MONTH,
  parseSourceDate,
  type RoomBandModel,
  type RoomConceptRender,
} from '@/lib/threshold/derive';

/* ── THE ROOM BAND ───────────────────────────────────────────────────────────
   One room of the house, read as a sheet from a drawing set: a lintel that
   stays with you as you read (the room's name and its ledger line), the room
   itself drawn in hairline ink, the floor line of what has settled here, and
   then the pieces — each one a tracking row that can be lifted off the page to
   show its record.

   THE DRAWING IS GENERATED, NOT ILLUSTRATED. Nothing about the room's real
   geometry reaches the client portal, so the schematic is composed from the
   only two things this band knows: the room's name and its pieces. A floor
   line, a wall line, and one footprint per piece — dashed while the piece is
   still on its way, drawn once it stands in the room, lettered with the
   piece's own name, and as wide as the quantity it stands for.

   THE STAMP TELLS ONLY WHAT THE ROW KNOWS. `TrackingRow` presses the status
   stamp; the deck's second stamp line is maker · city · date, and a
   `ClientSelection` carries no maker and no city column. So the line beside
   the stamp prints the paper the piece stands in and the date it was agreed —
   the two facts that exist — and nothing at all when neither does. ───────── */

/** A piece has reached the house at this stop; before it, it is still coming. */
const DELIVERED_STOP = journeyStageIndexForStatus('delivered');

// ── the drawing ──────────────────────────────────────────────────────────────

/* A section, not a picture. Four strokes carry the room — the floor everything
   stands on, the two faces of the wall it stands against, and the head of the
   door opening cut through them — plus the floor carried out through that
   opening, dashed, because what lies beyond the door is not this room. Every
   other stroke on the sheet is a piece the client actually owns. The old
   drawing ruled a closed rectangle, which on a room with one piece read as a
   large empty box; a floor and a wall read as a room whatever is standing in
   it. */

const DRAW_W = 1000;
/** The drawn room. At the band's measure this lands near 140 rendered px. */
const DRAW_H = 140;
const WALL_L = 42;
/** The wall's outer face, at the mock's own thickness (28→42). The opening cut
 *  through it is this surface's departure from the section: the mock rules the
 *  wall full height and cuts nothing through it. */
const WALL_L_OUTER = 28;
const WALL_R = 944;
const WALL_TOP = 14;
const FLOOR_Y = 104;
/** The door opening in the left-hand wall, measured up off the floor line. */
const OPENING_H = 52;
const FOOT_H = 18;
/** Mono under each footprint, in user units. */
const FOOT_TYPE = 11;
const FOOT_LABEL_DY = 20;
/** Paper either side of a footprint inside its own slot. */
const FOOT_GUTTER = 14;
const MIN_FOOT_W = 26;
/** One mono character at `FOOT_TYPE`, for the label's own budget. */
const FOOT_CHAR_W = 7;
/** The wall's own right-hand margin, held constant as the drawing narrows. */
const WALL_R_MARGIN = DRAW_W - WALL_R;

/* ── THE ELEVEN-PIXEL FLOOR ──────────────────────────────────────────────────
   SVG type is in USER UNITS, so a footprint label's rendered size is
   `fontSize × width / vbW`. At `FOOT_TYPE` over a 1000-unit viewBox that lands
   at the floor on a desk and at 3.9px on a 390 phone. The plan key already
   solved this once — bump the type and CROP the viewBox so the divisor can
   never grow past what the bumped type carries — so the constants and the
   crop come from `plan-key.tsx` rather than being derived a second time here.
   The band keeps its wall margins and compresses the floor between them, so
   the phone's drawing loses no piece: it is the same room, read closer. ──── */
const PHONE_DRAW_W = Number(planPhoneViewBox(`0 0 ${DRAW_W} ${DRAW_H}`).split(' ')[2]);
/** The label's baseline, held the same distance clear of its own type. */
const FOOT_LABEL_CLEARANCE = FOOT_LABEL_DY - FOOT_TYPE;

interface Footprint {
  id: string;
  x: number;
  w: number;
  label: string;
  /** Drawn solid once the piece is standing in the room; dashed until then. */
  drawn: boolean;
}

/** True once the piece has reached the house — delivered, or installed. */
function isDrawn(piece: ClientSelection): boolean {
  return journeyStageIndexForStatus(piece.logisticsStatus) >= DELIVERED_STOP;
}

/** A name cut to the slot it stands under, with the cut marked. */
function fitFootLabel(name: string, slot: number, charWidth: number): string {
  const budget = Math.max(4, Math.floor(slot / charWidth));
  const trimmed = name.trim();
  return trimmed.length <= budget ? trimmed : `${trimmed.slice(0, budget - 1).trimEnd()}…`;
}

/**
 * One footprint a piece, evenly spaced across the floor, as wide as the
 * quantity it stands for — two of a chair take twice the floor one takes,
 * until the slot runs out.
 */
function footprints(
  pieces: ClientSelection[],
  wallR: number,
  charWidth: number,
): Footprint[] {
  if (pieces.length === 0) return [];
  const slot = (wallR - WALL_L) / pieces.length;
  const unit = (slot - FOOT_GUTTER) / 3;
  return pieces.map((piece, index) => {
    const quantity = Number.isFinite(piece.quantity) ? Math.max(1, Math.trunc(piece.quantity)) : 1;
    const w = Math.round(
      Math.min(slot - FOOT_GUTTER, Math.max(MIN_FOOT_W, unit * Math.min(quantity, 3))),
    );
    return {
      id: piece.id,
      x: Math.round(WALL_L + slot * index + (slot - w) / 2),
      w,
      label: fitFootLabel(piece.name, slot, charWidth),
      drawn: isDrawn(piece),
    };
  });
}

function RoomDrawing({
  roomName,
  pieces,
  liftedId,
}: {
  roomName: string;
  pieces: ClientSelection[];
  liftedId: string | null;
}) {
  const phone = usePhoneDrawing();
  const drawW = phone ? PHONE_DRAW_W : DRAW_W;
  const footType = phone ? PLAN_PHONE_TYPE : FOOT_TYPE;
  const wallR = drawW - WALL_R_MARGIN;
  const feet = footprints(
    pieces,
    wallR,
    Math.round((FOOT_CHAR_W * footType) / FOOT_TYPE),
  );

  return (
    <svg
      data-testid="room-band-drawing"
      role="img"
      aria-label={`Section through ${roomName}, with ${countInWords(feet.length)} ${
        feet.length === 1 ? 'footprint' : 'footprints'
      } on the floor`}
      viewBox={`0 0 ${drawW} ${DRAW_H}`}
      className="mt-4 block h-auto max-h-[140px] w-full"
      style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
    >
      <g vectorEffect="non-scaling-stroke">
        {/* the wall the room stands against, cut through by the door opening:
            both faces stop at the head and the head closes between them, so the
            wall reads as a wall with a way through it rather than a stub. The
            room is entered from its left-hand side, which is the side the plan
            key strikes its door mark on (plan-key.ts draws every mark at
            `rect.x`), so the two drawings agree about where the door is */}
        <line
          data-testid="room-band-wall"
          x1={WALL_L}
          y1={WALL_TOP}
          x2={WALL_L}
          y2={FLOOR_Y - OPENING_H}
        />
        <line
          data-testid="room-band-wall-outer"
          x1={WALL_L_OUTER}
          y1={WALL_TOP}
          x2={WALL_L_OUTER}
          y2={FLOOR_Y - OPENING_H}
        />
        {/* the head of the opening, closing the two faces across the wall */}
        <line
          data-testid="room-band-door-head"
          x1={WALL_L_OUTER}
          y1={FLOOR_Y - OPENING_H}
          x2={WALL_L}
          y2={FLOOR_Y - OPENING_H}
        />
        {/* the floor line the whole room stands on */}
        <line data-testid="room-band-floor" x1={WALL_L} y1={FLOOR_Y} x2={wallR} y2={FLOOR_Y} />
        {/* and the floor carried out through the opening, dashed: what is
            beyond the door is not this room and is not drawn as if it were */}
        <line
          data-testid="room-band-threshold"
          x1={0}
          y1={FLOOR_Y}
          x2={WALL_L}
          y2={FLOOR_Y}
          strokeDasharray="2 4"
        />
        {feet.map((foot) => (
          <g key={foot.id}>
            <rect
              data-footprint={foot.id}
              data-footprint-state={foot.drawn ? 'drawn' : 'dashed'}
              data-lifted={liftedId === foot.id ? 'true' : undefined}
              x={foot.x}
              y={FLOOR_Y - FOOT_H - (liftedId === foot.id ? 2 : 0)}
              width={foot.w}
              height={FOOT_H}
              strokeDasharray={foot.drawn ? undefined : '4 4'}
            />
            <text
              data-footprint-label={foot.id}
              x={foot.x + foot.w / 2}
              y={FLOOR_Y + footType + FOOT_LABEL_CLEARANCE}
              textAnchor="middle"
              fontSize={footType}
              className="fill-current stroke-none font-mono tracking-[0.4px]"
            >
              {foot.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ── the room with nothing on its floor ───────────────────────────────────────

/**
 * R142 / house sheet A10: a room with nothing in it is a floor line and a
 * sentence, never an outlined rectangle standing in for furniture that does
 * not exist and never a zero. Where the house knows which room the work starts
 * in, the sentence says so; where it does not, it stops after the first clause
 * rather than inventing a second.
 */
function EmptyRoom({ leadRoomName }: { leadRoomName: string | null }) {
  return (
    <div data-testid="room-band-empty" className="pb-6">
      <div
        data-testid="room-band-empty-floor"
        aria-hidden="true"
        className="my-3 h-px w-full bg-[var(--rail)]"
      />
      <p className="t-body max-w-[56ch] text-[var(--ink-subtle)]">
        {leadRoomName
          ? `Nothing stands here yet. The ${leadRoomName} comes first.`
          : 'Nothing stands here yet.'}
      </p>
    </div>
  );
}

// ── the studio's concept render ──────────────────────────────────────────────

/** "11 September 2026". H6 folds this into `lib/threshold/dates.ts`. */
const LEGAL_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const CONCEPT_URL_TTL_S = 3600;

/**
 * `conceptRender.url` is an OBJECT PATH in the private `room-renders` bucket
 * (00580), so it has to be signed before it can be drawn. A path that will not
 * sign renders nothing at all: an empty frame captioned "Concept" is a claim
 * with nothing behind it, and a broken-image glyph is the one mark on this
 * page nobody chose to put there.
 */
function useSignedConceptRender(path: string): string | null {
  // Held WITH the path it was signed for, so a band repointed at a new render
  // draws nothing rather than the old image, without the effect having to
  // clear state synchronously on its way in.
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const supabase = createBrowserClient() as unknown as {
          storage: {
            from: (bucket: string) => {
              createSignedUrl: (
                path: string,
                ttl: number,
              ) => Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
            };
          };
        };
        const { data, error } = await supabase.storage
          .from(ROOM_RENDERS_BUCKET)
          .createSignedUrl(path, CONCEPT_URL_TTL_S);
        if (live && !error && typeof data?.signedUrl === 'string') {
          setSigned({ path, url: data.signedUrl });
        }
      } catch {
        // A render that will not sign is a render the page does not print.
      }
    })();
    return () => {
      live = false;
    };
  }, [path]);

  return signed?.path === path ? signed.url : null;
}

/** "{caption} · uploaded by {studio} · {legalDate}", minus whatever is absent. */
export function conceptCaption(
  render: RoomConceptRender,
  studioName: string | null | undefined,
): string | null {
  const uploaded = parseSourceDate(render.uploadedAt);
  const parts = [
    render.caption,
    studioName?.trim() ? `uploaded by ${studioName.trim()}` : null,
    uploaded ? LEGAL_DATE.format(uploaded) : null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * PP-7: the one image source this page has. A 3:2 plate at the band's full
 * measure, above the drawing, labelled ON the image — a label that can be
 * cropped off is not a label — and captioned beneath. The drawing stays.
 */
function ConceptRenderPlate({
  render,
  roomName,
  studioName,
}: {
  render: RoomConceptRender;
  roomName: string;
  studioName: string | null | undefined;
}) {
  const src = useSignedConceptRender(render.url);
  // A URL that signed but will not load — an hour-old TTL, an object replaced
  // under it — must not fall through to the browser's broken-image glyph.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (!src || brokenSrc === src) return null;
  const caption = conceptCaption(render, studioName);

  return (
    <figure data-testid="room-band-concept" className="mt-6">
      <div className="relative">
        <img
          src={src}
          alt={`Concept render of ${roomName}`}
          onError={() => setBrokenSrc(src)}
          data-testid="room-band-concept-image"
          className="block aspect-[3/2] w-full rounded-[3px] border border-[var(--border-default)] object-cover"
        />
        <span
          data-testid="room-band-concept-label"
          className="t-body-sm absolute left-0 top-0 bg-[var(--paper-doc)] px-3 py-1.5 text-[var(--ink)]"
        >
          Concept &middot; not installed
        </span>
      </div>
      {caption && (
        <figcaption
          data-testid="room-band-concept-caption"
          className="t-meta mt-3 text-[var(--ink-subtle)]"
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ── the sentences ────────────────────────────────────────────────────────────

/**
 * The lintel's ledger line, composed only from what the band carries. The
 * working budget's per-room target does not reach this model, so the line
 * states what was agreed here and what still waits — never a planned figure it
 * would have to guess.
 */
function lintelLedger(band: RoomBandModel): string | null {
  const parts: string[] = [];
  if (band.agreedCents > 0 && band.targetCents !== null) {
    parts.push(
      `${moneyInWords(band.agreedCents)} agreed against ${moneyInWords(
        band.targetCents,
      )} planned${band.varianceLine ? ` — ${band.varianceLine}` : ''}`,
    );
  } else if (band.agreedCents > 0) {
    parts.push(`${moneyInWords(band.agreedCents)} agreed`);
  }
  if (band.pieces.length > 0) {
    parts.push(
      `${countInWords(band.pieces.length)} ${band.pieces.length === 1 ? 'piece' : 'pieces'}`,
    );
  }
  const doors = band.marks.filter((mark) => mark.kind === 'door').length;
  if (doors === 1) parts.push('one door waits on your name');
  if (doors > 1) parts.push(`${countInWords(doors)} doors wait on your name`);
  if (band.marks.some((mark) => mark.kind === 'wall')) {
    parts.push('finished work waits for your acceptance');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function floorLine(pieces: ClientSelection[]): string | null {
  const agreed = pieces.filter((piece) => !!piece.instrument?.executedAt).length;
  const home = pieces.filter(
    (piece) => journeyStageIndexForStatus(piece.logisticsStatus) >= DELIVERED_STOP,
  ).length;

  const clauses: string[] = [];
  if (agreed > 0) {
    clauses.push(`${countInWords(agreed)} ${agreed === 1 ? 'piece' : 'pieces'} agreed`);
  }
  if (home > 0) {
    clauses.push(`${countInWords(home)} standing in the room`);
  }
  return clauses.length > 0 ? `Settled here — ${joinClauses(clauses)}.` : null;
}

function stampDetail(piece: ClientSelection): string | null {
  const executed = parseSourceDate(piece.instrument?.executedAt);
  const parts = [
    piece.instrument?.name ?? null,
    executed ? `agreed ${DAY_MONTH.format(executed)}` : null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ── the record behind a lifted piece ─────────────────────────────────────────

export function ThresholdJourney({ stopIndex }: { stopIndex: number }) {
  return (
    <ol
      data-testid="threshold-journey"
      className="mt-3 grid max-w-[660px] grid-cols-3 border-t border-[var(--border-default)] pt-2.5 sm:grid-cols-6"
    >
      {GOODS_JOURNEY_STAGES.map((stop, index) => {
        const current = index === stopIndex;
        const passed = index < stopIndex;
        return (
          <li
            key={stop}
            data-stop={stop}
            data-stop-state={current ? 'current' : passed ? 'passed' : 'ahead'}
            aria-current={current ? 'step' : undefined}
            className="relative pt-3 font-mono text-[11px] leading-snug"
            style={{
              color: current ? 'var(--color-mocha)' : 'var(--text-muted)',
              fontWeight: current ? 600 : 400,
            }}
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 h-[7px] w-px"
              style={{
                backgroundColor: current
                  ? 'var(--color-mocha)'
                  : 'var(--border-default)',
              }}
            />
            {stop}
          </li>
        );
      })}
    </ol>
  );
}

function PieceRecord({ piece }: { piece: ClientSelection }) {
  const detail = stampDetail(piece);
  return (
    <div
      data-testid="room-band-record"
      className="border-b border-[var(--border-subtle)] pb-4 pt-3 text-[15px] leading-relaxed text-[var(--text-body)]"
    >
      <p>
        {piece.name}
        {piece.clientLineTotalCents > 0
          ? ` · ${moneyInWords(piece.clientLineTotalCents)}`
          : ''}
        {piece.quantity > 1 ? ` · ${countInWords(piece.quantity)} of them` : ''}
      </p>
      {detail && <p className="mt-0.5">{detail}</p>}
      {piece.docCode && (
        <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {piece.docCode}
        </p>
      )}
      <ThresholdJourney stopIndex={journeyStageIndexForStatus(piece.logisticsStatus)} />
    </div>
  );
}

// ── the band ─────────────────────────────────────────────────────────────────

export interface RoomBandProps {
  band: RoomBandModel;
  projectId: string;
  /** Who prepared the drawings — printed in the plate captions, never guessed. */
  studioName?: string | null;
  /** The room the house's work actually starts in, for a band with an empty floor. */
  leadRoomName?: string | null;
  /** Room-scoped gates — the door and the wall — stand inside the room. */
  children?: ReactNode;
}

export function RoomBand({
  band,
  projectId,
  studioName,
  leadRoomName,
  children,
}: RoomBandProps) {
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const ledger = lintelLedger(band);
  const settled = floorLine(band.pieces);
  const headingId = `room-heading-${band.roomId}`;
  const empty = band.pieces.length === 0;

  return (
    <section
      id={band.anchor}
      data-threshold-unit={band.anchor}
      data-dimmable=""
      data-project-id={projectId}
      aria-labelledby={headingId}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <div
        data-testid="room-band-lintel"
        className="sticky top-0 z-[4] flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--bg-primary)] pb-2.5 pt-2.5 max-[600px]:static"
      >
        <h2
          id={headingId}
          className="font-heading text-[1.35rem] font-medium tracking-[-0.012em]"
        >
          {band.name}
        </h2>
        {ledger && (
          <p
            data-testid="room-band-ledger"
            className="max-w-[34ch] text-[15px] leading-normal text-[var(--text-body)] sm:text-right"
          >
            {ledger}
          </p>
        )}
      </div>

      <div className="pt-1.5">
        {band.conceptRender && (
          <ConceptRenderPlate
            render={band.conceptRender}
            roomName={band.name}
            studioName={studioName}
          />
        )}

        {empty ? (
          <EmptyRoom leadRoomName={leadRoomName ?? null} />
        ) : (
          <RoomDrawing roomName={band.name} pieces={band.pieces} liftedId={liftedId} />
        )}

        {children}

        {settled && (
          <p
            data-testid="room-band-floorline"
            className="mt-2.5 max-w-[64ch] text-[15px] leading-relaxed text-[var(--text-body)]"
          >
            {settled}
          </p>
        )}

        {band.pieces.length > 0 && (
          <ul data-testid="room-band-pieces" className="mt-4 list-none">
            {band.pieces.map((piece) => {
              const lifted = liftedId === piece.id;
              const detail = stampDetail(piece);
              return (
                <li
                  key={piece.id}
                  data-threshold-piece={piece.id}
                  data-lifted={lifted ? 'true' : undefined}
                  className={
                    lifted
                      ? 'transition-transform duration-200 -translate-y-[2px] motion-reduce:transform-none motion-reduce:transition-none'
                      : 'transition-transform duration-200 motion-reduce:transition-none'
                  }
                >
                  {/* The control is a sibling of the row, not its parent: a
                      <button> takes phrasing content, and TrackingRow draws
                      divs and paragraphs. Overlaying it keeps the whole row
                      clickable while the accessible name stays one phrase
                      instead of the row's every word. */}
                  <div
                    className={`relative ${lifted ? 'border-b border-current' : ''}`}
                  >
                    <TrackingRow
                      name={piece.name}
                      imageUrl={piece.imageUrl}
                      priceCents={
                        piece.clientLineTotalCents > 0 ? piece.clientLineTotalCents : null
                      }
                      status={piece.logisticsStatus}
                      itemType={piece.itemType}
                      studioName={studioName}
                    />
                    {detail && (
                      <span
                        data-testid="room-band-piece-stamp-detail"
                        className="block pb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
                      >
                        {detail}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-expanded={lifted}
                      aria-controls={`record-${piece.id}`}
                      aria-label={`${piece.name} — ${lifted ? 'close' : 'open'} its record`}
                      onClick={() => setLiftedId(lifted ? null : piece.id)}
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                  <div id={`record-${piece.id}`}>{lifted && <PieceRecord piece={piece} />}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
