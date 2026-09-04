'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from '@/components/commercial/journey-stepper';
import {
  countInWords,
  joinClauses,
  moneyInWords,
} from '@/components/making/standing-sentence';
import { TrackingRow } from '@/components/making/tracking-row';
import type { ClientSelection } from '@/lib/commercial-documents';
import { parseSourceDate, type RoomBandModel } from '@/lib/threshold/derive';

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

/** "19 June" — the deck's own date idiom. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

// ── the drawing ──────────────────────────────────────────────────────────────

/* A section, not a picture. Two lines carry the room — the floor everything
   stands on and the wall it stands against — and every other stroke on the
   sheet is a piece the client actually owns. The old drawing ruled a closed
   rectangle, which on a room with one piece read as a large empty box; a
   floor and a wall read as a room whatever is standing in it. */

const DRAW_W = 1000;
/** The drawn room. At the band's measure this lands near 140 rendered px. */
const DRAW_H = 140;
/** A room with nothing on its floor: the outline, and its own name inside. */
const EMPTY_H = 80;
const WALL_L = 42;
const WALL_R = 944;
const WALL_TOP = 14;
const FLOOR_Y = 104;
/** The door opening in the left-hand wall, measured up off the floor line. */
const OPENING_H = 52;
/** How far the opening's head returns from the wall into the paper. */
const JAMB_W = 12;
const FOOT_H = 18;
/** Mono under each footprint, in user units. */
const FOOT_TYPE = 11;
const FOOT_LABEL_DY = 20;
/** Paper either side of a footprint inside its own slot. */
const FOOT_GUTTER = 14;
const MIN_FOOT_W = 26;
/** One mono character at `FOOT_TYPE`, for the label's own budget. */
const FOOT_CHAR_W = 7;

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
function fitFootLabel(name: string, slot: number): string {
  const budget = Math.max(4, Math.floor(slot / FOOT_CHAR_W));
  const trimmed = name.trim();
  return trimmed.length <= budget ? trimmed : `${trimmed.slice(0, budget - 1).trimEnd()}…`;
}

/**
 * One footprint a piece, evenly spaced across the floor, as wide as the
 * quantity it stands for — two of a chair take twice the floor one takes,
 * until the slot runs out.
 */
function footprints(pieces: ClientSelection[]): Footprint[] {
  if (pieces.length === 0) return [];
  const slot = (WALL_R - WALL_L) / pieces.length;
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
      label: fitFootLabel(piece.name, slot),
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
  const feet = footprints(pieces);

  if (feet.length === 0) {
    return (
      <svg
        data-testid="room-band-drawing"
        role="img"
        aria-label={`Section through ${roomName}, with nothing on the floor yet`}
        viewBox={`0 0 ${DRAW_W} ${EMPTY_H}`}
        className="mt-4 block h-auto max-h-[80px] w-full"
        style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
      >
        <g vectorEffect="non-scaling-stroke">
          <rect x={WALL_L} y={12} width={WALL_R - WALL_L} height={EMPTY_H - 24} />
          <text
            data-testid="room-band-drawing-name"
            x={DRAW_W / 2}
            y={EMPTY_H / 2 + 4}
            textAnchor="middle"
            fontSize={FOOT_TYPE}
            className="fill-[var(--text-muted)] stroke-none font-mono tracking-[0.4px]"
          >
            {roomName}
          </text>
        </g>
      </svg>
    );
  }

  return (
    <svg
      data-testid="room-band-drawing"
      role="img"
      aria-label={`Section through ${roomName}, with ${countInWords(feet.length)} ${
        feet.length === 1 ? 'footprint' : 'footprints'
      } on the floor`}
      viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
      className="mt-4 block h-auto max-h-[140px] w-full"
      style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
    >
      <g vectorEffect="non-scaling-stroke">
        {/* the wall the room stands against, stopping at the head of the
            opening — the room is entered from its left-hand side, which is the
            side the plan key strikes its door mark on (plan-key.ts draws every
            mark at `rect.x`), so the two drawings agree about where the door is */}
        <line
          data-testid="room-band-wall"
          x1={WALL_L}
          y1={WALL_TOP}
          x2={WALL_L}
          y2={FLOOR_Y - OPENING_H}
        />
        {/* the head of the opening, returning into the wall's thickness */}
        <line
          data-testid="room-band-door-head"
          x1={WALL_L - JAMB_W}
          y1={FLOOR_Y - OPENING_H}
          x2={WALL_L}
          y2={FLOOR_Y - OPENING_H}
        />
        {/* the floor line the whole room stands on */}
        <line data-testid="room-band-floor" x1={WALL_L} y1={FLOOR_Y} x2={WALL_R} y2={FLOOR_Y} />
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
              y={FLOOR_Y + FOOT_LABEL_DY}
              textAnchor="middle"
              fontSize={FOOT_TYPE}
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
  /** Room-scoped gates — the door and the wall — stand inside the room. */
  children?: ReactNode;
}

export function RoomBand({ band, projectId, children }: RoomBandProps) {
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const ledger = lintelLedger(band);
  const settled = floorLine(band.pieces);
  const headingId = `room-heading-${band.roomId}`;

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
        <RoomDrawing roomName={band.name} pieces={band.pieces} liftedId={liftedId} />

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
