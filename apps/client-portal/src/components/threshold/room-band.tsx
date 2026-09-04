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
   only two things this band knows: the room's name and its pieces. A ruled
   rectangle, a floor line, and one footprint per piece — dashed while the
   piece is unsigned, drawn once it has been signed for or has arrived. The
   name seeds the proportions so a room draws the same way on every render.

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

const DRAW_W = 1000;
const DRAW_H = 232;
const WALL_L = 42;
const WALL_R = 944;
const CEIL_Y = 16;
const FLOOR_Y = 206;
const FOOT_H = 14;

/** A stable small integer from a string, so a room draws identically twice. */
function seed(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 99991;
  }
  return value;
}

interface Footprint {
  id: string;
  x: number;
  w: number;
  drawn: boolean;
}

/** True once the piece is signed for, or once it has reached the house. */
function isDrawn(piece: ClientSelection): boolean {
  return (
    !!piece.instrument?.executedAt ||
    journeyStageIndexForStatus(piece.logisticsStatus) >= DELIVERED_STOP
  );
}

function footprints(roomName: string, pieces: ClientSelection[]): Footprint[] {
  if (pieces.length === 0) return [];
  const span = (WALL_R - WALL_L) / pieces.length;
  const jitter = seed(roomName);
  return pieces.map((piece, index) => {
    const share = 0.44 + (((jitter + seed(piece.name)) % 26) / 100);
    const w = Math.round(span * share);
    return {
      id: piece.id,
      x: Math.round(WALL_L + span * index + (span - w) / 2),
      w,
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
  const feet = footprints(roomName, pieces);

  return (
    <svg
      data-testid="room-band-drawing"
      role="img"
      aria-label={`Section through ${roomName}, with ${
        feet.length === 0 ? 'nothing' : countInWords(feet.length)
      } drawn on the floor`}
      viewBox={`0 0 ${DRAW_W} ${DRAW_H}`}
      className="mt-4 block h-auto w-full"
      style={{ stroke: 'currentColor', fill: 'none', strokeWidth: 1, color: 'inherit' }}
    >
      <g vectorEffect="non-scaling-stroke">
        <line x1={WALL_L} y1={CEIL_Y} x2={WALL_R} y2={CEIL_Y} />
        <line x1={WALL_L - 14} y1={CEIL_Y} x2={WALL_L - 14} y2={FLOOR_Y} />
        <line x1={WALL_L} y1={CEIL_Y} x2={WALL_L} y2={FLOOR_Y} />
        <line x1={WALL_R} y1={CEIL_Y} x2={WALL_R} y2={FLOOR_Y} />
        <line x1={WALL_R + 14} y1={CEIL_Y} x2={WALL_R + 14} y2={FLOOR_Y} />
        {/* the floor line the whole room stands on */}
        <line x1={WALL_L} y1={FLOOR_Y} x2={WALL_R} y2={FLOOR_Y} />
        {feet.map((foot) => (
          <rect
            key={foot.id}
            data-footprint={foot.id}
            data-footprint-state={foot.drawn ? 'drawn' : 'dashed'}
            data-lifted={liftedId === foot.id ? 'true' : undefined}
            x={foot.x}
            y={FLOOR_Y - FOOT_H - (liftedId === foot.id ? 2 : 0)}
            width={foot.w}
            height={FOOT_H}
            strokeDasharray={foot.drawn ? undefined : '4 4'}
          />
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
  if (band.totalCents > 0) parts.push(`${moneyInWords(band.totalCents)} agreed`);
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
      data-project-id={projectId}
      aria-labelledby={headingId}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <div
        data-testid="room-band-lintel"
        className="sticky top-0 z-[4] flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--border-default)] bg-[var(--color-off-white)] pb-2.5 pt-2.5 max-[600px]:static"
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
                  <button
                    type="button"
                    aria-expanded={lifted}
                    aria-controls={`record-${piece.id}`}
                    onClick={() => setLiftedId(lifted ? null : piece.id)}
                    className={`w-full text-left ${
                      lifted ? 'border-b border-current' : ''
                    }`}
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
                  </button>
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
