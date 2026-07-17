'use client';

/**
 * RoomView — the Room View shell (Room View program, W2-T3; R107, package
 * accept line 2.2). Mounts inside `RoomShell` at `/room/[id]`. Owns the
 * rv-head (client + room type, the Document doc-link), the Plan · Orbit ·
 * Walk mode row (a Strata rule per the prototype's R§3 note — NOT tabs, D1),
 * and the facts-rail + Plan stage body. Orbit and Walk are inert in v1
 * (R107 §3: "V1 is Plan + Orbit, one toggle apart" — Orbit itself lands in
 * W3-T6; Walk is ruled into the arc but built last, after Place).
 *
 * A room whose scan hasn't parsed (or errored) renders a quiet placeholder
 * rather than a broken Plan — geometry only ever comes from a `parsed`
 * `room_scan_geometry` row.
 *
 * Look/feel authority: docs/design/the-document/room-view-prototype.html
 * scene 02 (`#scene-room`). Ported as intent (Playfair rv-head, mono
 * doc-link/mode-row/stagecap, 230px facts rail + stage grid collapsing under
 * ~900px), never as markup.
 *
 * Design judgment call (flagged for review — see task report): the
 * prototype's doc-link and stagecap use a gendered possessive ("→ her
 * Document", "drawn from her scan") that reads as prototype voice, not a
 * house convention — no pronoun field exists anywhere in the schema, and
 * the shipped app copy elsewhere always says "the document" (neutral, no
 * possessive). This shell follows the app's existing neutral voice:
 * "→ the Document · <phase>" / "drawn from the scan".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { RoomGeometryDocument } from '@patina/supabase';
import type { RoomGeometry } from '@/lib/room-view/geometry';
import { roomEvents } from '@/lib/analytics';
import { FactsRail } from './facts-rail';
import { MeasureLayer } from './measure-layer';
import { OrbitStage } from './orbit/orbit-stage';
import { planViewBox, PlanStage } from './plan-stage';
import { useMeasure } from './use-measure';

/** The room's two live projections. Walk is ruled into the arc but built after Place. */
type ViewMode = 'plan' | 'orbit';

/** Mirrors folder-card.tsx's SECTION_LABEL (module-private there) — the
 *  Room View doc-link needs the same human phase label as the Desk folio. */
const SECTION_LABEL: Record<string, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

function prettyRoomType(roomType: string): string {
  return roomType.replace(/_/g, ' ').trim();
}

/** Mode-row button styling — active carries the clay underline + charcoal ink; inactive
 *  is quiet mocha that warms to charcoal on hover (matches the prototype's mode toggle). */
function modeClass(active: boolean, pad: string): string {
  const base = `${pad} pb-3 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors`;
  return active
    ? `${base} border-b-2 border-[var(--color-clay)] text-[var(--color-charcoal)]`
    : `${base} text-[var(--color-mocha)] hover:text-[var(--color-charcoal)]`;
}

export interface RoomViewProps {
  /** The room's id — the telemetry family's carrier (I74c); the page's
   *  route param, passed straight through unmodified. */
  roomId: string;
  /** null while loading, or when the scan doesn't resolve at all. */
  doc: RoomGeometryDocument | null;
  /** null until parsed (from-rows.ts only ever runs against a parsed header). */
  geometry: RoomGeometry | null;
  thicknessConvention: boolean;
  isLoading: boolean;
}

export function RoomView({ roomId, doc, geometry, thicknessConvention, isLoading }: RoomViewProps) {
  const docLink = useMemo(() => {
    if (!doc?.engagementId || !doc.activeSection) return null;
    const label = SECTION_LABEL[doc.activeSection] ?? doc.activeSection;
    return { href: `/doc/${doc.engagementId}`, label: `→ the Document · ${label}` };
  }, [doc?.engagementId, doc?.activeSection]);

  // Both hooks called unconditionally, ahead of the loading/not-ready early
  // returns below (Rules of Hooks) — the measure tool's own state resets
  // naturally whenever RoomView remounts for a different room.
  const measure = useMeasure();
  const viewBox = useMemo(
    () => (geometry ? planViewBox(geometry) : { width: 1, height: 1 }),
    [geometry],
  );

  // Plan is the landing mode. Orbit stays UNMOUNTED (zero three.js cost) until the first
  // Orbit switch — `orbitMounted` latches true then and never resets, so once its lazy
  // chunk has loaded, Plan ↔ Orbit is a display toggle (both stay mounted → instant).
  const [mode, setMode] = useState<ViewMode>('plan');
  const [orbitMounted, setOrbitMounted] = useState(false);

  const selectMode = (next: ViewMode) => {
    if (next === 'orbit') setOrbitMounted(true);
    setMode(next);
    roomEvents.modeSwitched({ room_id: roomId, mode: next });
  };

  // measure_used — fires once per completed measurement (the SECOND point,
  // armed/point → complete in use-measure's reducer), not on every re-render
  // while the phase stays 'complete'. Re-arming (any phase → armed) resets
  // the guard, so completing a second measurement fires again.
  const prevMeasurePhaseRef = useRef(measure.state.phase);
  useEffect(() => {
    const prevPhase = prevMeasurePhaseRef.current;
    prevMeasurePhaseRef.current = measure.state.phase;
    if (measure.state.phase === 'complete' && prevPhase !== 'complete') {
      roomEvents.measureUsed({ room_id: roomId });
    }
  }, [measure.state.phase, roomId]);

  if (isLoading) return null;

  const ready = doc != null && doc.parseStatus === 'parsed' && geometry != null;
  if (!ready || doc == null || geometry == null) {
    return (
      <div className="mx-auto max-w-[520px] px-6 pt-24 text-center">
        <p className="font-heading text-[1.3rem] italic text-[var(--color-charcoal)]">
          This room is still being drawn.
        </p>
      </div>
    );
  }

  const clientName = doc.documentClientName ?? doc.ownerClientName;
  const roomType = doc.roomType ? prettyRoomType(doc.roomType) : null;

  // "armed" broadly = the tool is capturing clicks (armed or first-point
  // placed) — both the stagecap copy and the toolrow's button treatment key
  // off this; only 'complete' shows the Clear button.
  const capturing = measure.state.phase === 'armed' || measure.state.phase === 'point';

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-20 pt-8 sm:px-8">
      {/* rv-head */}
      <div className="mb-1.5 flex flex-wrap items-baseline gap-4">
        <h1 className="font-heading text-[28px] font-medium text-[var(--color-charcoal)] sm:text-[34px]">
          {clientName ?? 'Untitled room'}
          {roomType && <span className="italic text-[var(--color-mocha)]"> · {roomType}.</span>}
        </h1>
        {docLink && (
          <Link
            href={docLink.href}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            {docLink.label}
          </Link>
        )}
      </div>

      {/* mode row — Plan · Orbit · Walk. A text row under a hairline, not
          tabs (D1) — the prototype's R§3 note: "No tabs in the product; a
          Strata rule carries the toggle." Plan + Orbit are live (V1 is one
          toggle apart, R107 §3); Walk arrives after Place. */}
      <div className="my-5 flex border-b border-[var(--doc-ink-border)]">
        <button
          type="button"
          onClick={() => selectMode('plan')}
          className={modeClass(mode === 'plan', 'pr-5')}
        >
          Plan
        </button>
        <button
          type="button"
          onClick={() => selectMode('orbit')}
          className={modeClass(mode === 'orbit', 'px-5')}
        >
          Orbit
        </button>
        <span
          aria-disabled="true"
          className="cursor-not-allowed px-5 pb-3 pt-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-mocha)] opacity-35"
        >
          Walk
          <span className="mt-0.5 block text-[8px] tracking-[0.1em] text-[var(--color-clay)] opacity-100">
            arrives with Place
          </span>
        </span>
      </div>

      {/* rv-body: 230px facts rail + stage, collapsing under ~900px */}
      <div className="grid grid-cols-1 items-start gap-9 min-[900px]:grid-cols-[230px_1fr]">
        <FactsRail
          geometry={geometry}
          thicknessConvention={thicknessConvention}
          scanDate={doc.scannedAt}
          qualityGrade={doc.qualityGrade}
          coveragePercentage={doc.coveragePercentage}
          measure={{
            armed: capturing,
            hasMeasurement: measure.state.phase === 'complete',
            onArm: measure.arm,
            onClear: measure.clear,
          }}
        />
        {/* Both stages hold the same grid cell; the inactive one is display-hidden
            (never unmounted once Orbit is up) so re-switching is instant. */}
        <div>
          <div className={mode === 'plan' ? undefined : 'hidden'}>
            <PlanStage
              geometry={geometry}
              stageCapRight={capturing ? 'click two points' : 'hover for dimensions'}
              measureLayer={
                <MeasureLayer
                  state={measure.state}
                  viewBoxWidth={viewBox.width}
                  viewBoxHeight={viewBox.height}
                  onPoint={measure.addPoint}
                />
              }
            />
          </div>
          {orbitMounted && (
            <div className={mode === 'orbit' ? undefined : 'hidden'}>
              <OrbitStage geometry={geometry} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
