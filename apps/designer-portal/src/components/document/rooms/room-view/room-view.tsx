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
import type { RoomGeometryDocument, RoomScanPhoto } from '@patina/supabase';
import {
  useRoomFiles,
  useRoomScan,
  useScanRefineArtifacts,
  useSignedScanModelUrl,
  useSplatUrl,
} from '@patina/supabase';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import type { RoomGeometry } from '@/lib/room-view/geometry';
import type { PhotoProvenance } from '@/lib/room-view/photo-poses';
import { buildRefineReadoutProps } from '@/lib/room-view/refine-readout-props';
import { roomEvents } from '@/lib/analytics';
import { FactsRail } from './facts-rail';
import type { RefineReadoutProps } from './refine-readout';
import { MeasureLayer } from './measure-layer';
import { hasMeshModel, ModelStage } from './model/model-stage';
import type { OrbitPhotoPose } from './orbit/photo-marker-objects';
import { OrbitStage } from './orbit/orbit-stage';
import { buildPhotoMarkers, planBounds, PhotoMarkers } from './photo-markers';
import { PhotoStrip } from './photo-strip';
import { PhotoViewer } from './photo-viewer';
import { planViewBox, PlanStage } from './plan-stage';
import { useDevSplatUrl } from './splat/dev-splat-url';
import { SplatStage } from './splat/splat-stage';
import { useMeasure } from './use-measure';
import { usePhotoViewer } from './use-photo-viewer';

/** The room's live projections. Mesh appears only for a scan that carries a GLB
 *  (`hasMeshModel`); Splat only for a scan whose current Room File registers a
 *  `splat` artifact (`useSplatUrl`); Walk is ruled into the arc but built after
 *  Place. */
type ViewMode = 'plan' | 'orbit' | 'mesh' | 'splat';

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

/** Mode-row button styling. The mode row marks WHERE YOU STAND, not what you can
 *  do, so under I107 it keeps a device of its own and never borrows the button
 *  scoring: a 2px charcoal rule set flush ON the row's hairline (`-mb-px`), where
 *  a scored control's rule is 1px and floats 3px clear of its word. Type and ink
 *  values are the grammar's — mono 12px, aged oak at rest warming to charcoal,
 *  charcoal for the mode you're in. No box: the rounded plate is gone, the 44px
 *  target stays as padding. */
function modeClass(active: boolean, pad: string): string {
  const base = `${pad} min-h-11 -mb-px border-b-2 pb-3 pt-2.5 font-mono text-[12px] uppercase tracking-[0.1em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]`;
  return active
    ? `${base} border-[var(--color-charcoal)] text-[var(--color-charcoal)]`
    : `${base} border-transparent text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]`;
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
  /** Plan-frame provenance (00337, from-rows.ts) — projects photo camera
   *  transforms into the Plan frame for the marker layer (photo-poses.ts).
   *  null until parsed with provenance; the marker layer degrades silently. */
  provenance?: PhotoProvenance | null;
  /** The scan's photo set (useRoomScanPhotos), deduped + signed. `[]` for a
   *  Field scan with no photos — the strip, rail line, and markers all absent. */
  photos?: RoomScanPhoto[];
}

export function RoomView({
  roomId,
  doc,
  geometry,
  thicknessConvention,
  isLoading,
  provenance = null,
  photos = [],
}: RoomViewProps) {
  const docLink = useMemo(() => {
    if (!doc?.engagementId || !doc.activeSection) return null;
    const label = SECTION_LABEL[doc.activeSection] ?? doc.activeSection;
    return {
      href: `/doc/${doc.engagementId}`,
      label: `→ the Document · ${label}`,
    };
  }, [doc?.engagementId, doc?.activeSection]);

  // Both hooks called unconditionally, ahead of the loading/not-ready early
  // returns below (Rules of Hooks) — the measure tool's own state resets
  // naturally whenever RoomView remounts for a different room.
  const measure = useMeasure();
  const viewer = usePhotoViewer(photos.length, roomId);

  // Room File door (Field Capture P1, item 12) — a quiet facts-rail link to
  // this scan's generated drawing set. Resolved here (hooks above the early
  // returns), passed to FactsRail as a plain href. Shown when the `room-file`
  // flag is on AND a generated room_file exists for the scan.
  // R21 dissolve: the old project-nested route also required the scan to be on
  // a project. `/room/[scanId]/file` is scan-keyed, so that requirement is
  // gone — an orphan scan with a finished drawing set now shows its door too.
  // ⚠ The query is NO LONGER flag-gated. It was (`roomFileEnabled ? roomId :
  // undefined`), so a flag-off visit cost zero database. The Splat projection's
  // mode gate needs this scan's current Room File whether or not the door is
  // shown, and one small ordered read per Room View is the honest price. The flag
  // still gates the DOOR's render below — only the query's condition moved.
  const { value: roomFileEnabled } = useFeatureFlag('room-file');
  const { data: roomFiles } = useRoomFiles(roomId);
  const roomFileDoor = useMemo(() => {
    if (!roomFileEnabled) return undefined;
    const hasGenerated = (roomFiles ?? []).some(
      (rf) => rf.status === 'generated',
    );
    if (!hasGenerated) return undefined;
    return { href: `/room/${roomId}/file` };
  }, [roomFileEnabled, roomFiles, roomId]);

  // The scan's CURRENT Room File — `useRoomFiles` orders version-desc and the
  // chain is append-only, so the head row is the newest generation. Splat
  // presence is read from that row and no other: an older version's artifacts
  // describe an older solve. Deliberately not filtered on `status`, which tracks
  // the drawings (True Layer) lifecycle and is independent of whether the Present
  // Layer trained a splat (00376).
  const currentRoomFileId = (roomFiles ?? [])[0]?.id ?? null;

  // ── Refine diagnostic readout (Field Capture P2, Layer 3, ruling R-G) ──
  // A facts-rail line + a <details> disclosure: drift figures and R123's
  // advisory. NO plan polyline, NO orbit geometry — R-G scoped the render out
  // deliberately (§3.6), and `buildCameraPath` is consumed here only for the
  // counts and the refined/captured labelling it is the single authority on.
  //
  // The flag gates the QUERY, not the render, so flag-off costs zero database
  // and zero Storage calls. Every rung below degrades to `undefined` — no
  // error UI, no toast, no console noise. This resolves to `undefined` for
  // every scan in production today: nothing has ever published a refine
  // artifact, so there is no record to find.
  const { value: refinedPathEnabled } = useFeatureFlag('room-view-refined-path');
  const { data: refineArtifacts } = useScanRefineArtifacts(roomId, {
    enabled: refinedPathEnabled,
  });
  // The composition lives in `lib/room-view/refine-readout-props.ts` as a pure
  // function so ONE test can run the whole chain — the exact `present` document
  // `refine_delivery.build_present_patch` writes, through `parseScanRefineRecord`,
  // through this composition, into the rendered readout.
  const refineReadout = useMemo<RefineReadoutProps | undefined>(
    () =>
      refinedPathEnabled
        ? buildRefineReadoutProps(refineArtifacts, provenance)
        : undefined,
    [refinedPathEnabled, refineArtifacts, provenance],
  );

  const viewBox = useMemo(
    () => (geometry ? planViewBox(geometry) : { width: 1, height: 1 }),
    [geometry],
  );

  // The SAME proximity clusters the Plan camera-ticks draw (buildPhotoMarkers is
  // pure + deterministic), projected into the Orbit frustum layer's plain-number
  // pose contract: one wedge per cluster, carrying the representative's height +
  // heading and the photo index its click opens. No `three` here — the shape stays
  // JSON so the dynamic three boundary lives entirely under orbit/. Empty (photos
  // absent / provenance null) → no poses → OrbitCanvas builds no marker group.
  const orbitPhotoPoses = useMemo<OrbitPhotoPose[]>(() => {
    if (!geometry || photos.length === 0 || !provenance) return [];
    return buildPhotoMarkers(photos, provenance, planBounds(geometry)).map(
      (m) => ({
        x: m.x,
        z: m.z,
        y: m.y,
        headingDeg: m.headingDeg,
        count: m.count,
        photoIndex: m.representativeIndex,
      }),
    );
  }, [geometry, photos, provenance]);

  // Plan is the landing mode. Orbit and Mesh stay UNMOUNTED (zero three.js cost) until
  // their first switch — each `*Mounted` latches true then and never resets, so once a
  // lazy chunk has loaded, switching back is a display toggle (all stay mounted →
  // instant).
  const [mode, setMode] = useState<ViewMode>('plan');
  const [orbitMounted, setOrbitMounted] = useState(false);
  const [meshMounted, setMeshMounted] = useState(false);
  const [splatMounted, setSplatMounted] = useState(false);

  const selectMode = (next: ViewMode) => {
    if (next === 'orbit') setOrbitMounted(true);
    if (next === 'mesh') setMeshMounted(true);
    if (next === 'splat') setSplatMounted(true);
    setMode(next);
    roomEvents.modeSwitched({ room_id: roomId, mode: next });
  };

  // ── Mesh projection (Rendered Room v2, P1) ──
  // `roomId` IS the scan id, so the scan row answers the only gating question:
  // does this scan carry a GLB (`model_url_gltf`)? Without one the MESH control is
  // never rendered — `model_url` alone is the iOS USDZ, which GLTFLoader can't read.
  // Signing is deferred to the first MESH switch (`meshMounted`, latched in
  // `selectMode` above): passing `null` leaves `useSignedScanModelUrl` disabled, so a
  // Plan-only visit costs zero Storage calls, matching how Orbit's chunk stays unloaded.
  const { data: scan } = useRoomScan(roomId);
  const meshAvailable = hasMeshModel(scan);
  const {
    data: signedModelUrl,
    isFetching: signingModel,
  } = useSignedScanModelUrl(meshMounted && meshAvailable ? scan : null);

  // ── Splat projection (Rendered Room v2, W2) ──
  // Unlike Mesh, the gating question and the fetching question are the SAME query
  // here — the artifact ref and its (future) resolved URL both come out of
  // `useSplatUrl`, so it runs from first paint rather than on the first switch.
  // It reads two columns of one row; a Plan-only visit costs that and nothing
  // else, and there is no Storage call behind it at all until the W2 read path
  // exists. `useDevSplatUrl` is the dev-only `?splatUrl=` seam, constant-folded to
  // null in production (see splat/dev-splat-url.ts).
  const devSplatUrl = useDevSplatUrl();
  const splat = useSplatUrl(currentRoomFileId, { urlSource: devSplatUrl });
  const splatAvailable = splat.hasArtifact;

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
  const capturing =
    measure.state.phase === 'armed' || measure.state.phase === 'point';

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-20 pt-8 sm:px-8">
      {/* rv-head */}
      <div className="mb-1.5 flex flex-wrap items-baseline gap-4">
        <h1 className="font-heading text-[28px] font-medium text-[var(--color-charcoal)] sm:text-[34px]">
          {clientName ?? 'Untitled room'}
          {roomType && (
            <span className="italic text-[var(--color-mocha)]">
              {' '}
              · {roomType}.
            </span>
          )}
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
        {/* Mesh — the scan's own geometry, not a reconstruction. Present only
            for a scan that carries a GLB; a scan without one never sees the
            control at all (Rendered Room v2 P1, PROPOSAL §4). */}
        {meshAvailable && (
          <button
            type="button"
            onClick={() => selectMode('mesh')}
            className={modeClass(mode === 'mesh', 'px-5')}
          >
            Mesh
          </button>
        )}
        {/* Splat — the room as photographed, not as reconstructed. Present only
            when the scan's current Room File registers a `splat` artifact (or a
            dev `?splatUrl=` override is in play); a scan without one never sees
            the control (Rendered Room v2 W2, PROPOSAL §4). */}
        {splatAvailable && (
          <button
            type="button"
            onClick={() => selectMode('splat')}
            className={modeClass(mode === 'splat', 'px-5')}
          >
            Splat
          </button>
        )}
        <span
          aria-disabled="true"
          className="-mb-px cursor-not-allowed border-b-2 border-transparent px-5 pb-3 pt-2.5 font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-mocha)] opacity-35"
        >
          Walk
          <span className="mt-0.5 block text-[8px] tracking-[0.1em] text-[var(--color-clay)] opacity-100">
            arrives with Place
          </span>
        </span>
      </div>

      {/* rv-body: 230px facts rail + stage, collapsing under ~900px.
          The stage track is minmax(0,1fr), NOT a bare 1fr (= minmax(auto,1fr)):
          the stage children fill their track width via `w-full` (Plan's
          aspect-ratio SVG with h-auto; Orbit's canvas, which carries an
          intrinsic `width` attribute from renderer.setSize). Under a content-
          based `auto` track minimum, either child's min-content inflates the
          track far past the viewport — both projections then render massively
          oversized. Pinning the minimum to 0 lets the flexible track bound the
          content instead of the content sizing the track. */}
      <div className="grid grid-cols-1 items-start gap-9 min-[900px]:grid-cols-[230px_minmax(0,1fr)]">
        <FactsRail
          geometry={geometry}
          thicknessConvention={thicknessConvention}
          scanDate={doc.scannedAt}
          qualityGrade={doc.qualityGrade}
          coveragePercentage={doc.coveragePercentage}
          photos={
            photos.length > 0
              ? {
                  count: photos.length,
                  onOpen: () => viewer.openAtIndex(0, 'rail'),
                }
              : undefined
          }
          measure={{
            armed: capturing,
            hasMeasurement: measure.state.phase === 'complete',
            onArm: measure.arm,
            onClear: measure.clear,
          }}
          roomFile={roomFileDoor}
          refine={refineReadout}
        />
        {/* Both stages hold the same grid cell; the inactive one is display-hidden
            (never unmounted once Orbit is up) so re-switching is instant. */}
        <div>
          <div className={mode === 'plan' ? undefined : 'hidden'}>
            <PlanStage
              geometry={geometry}
              stageCapRight={
                capturing ? 'click two points' : 'hover for dimensions'
              }
              photoLayer={
                <PhotoMarkers
                  geometry={geometry}
                  photos={photos}
                  provenance={provenance}
                  onOpen={(index) => viewer.openAtIndex(index, 'plan')}
                />
              }
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
              <OrbitStage
                geometry={geometry}
                photoPoses={orbitPhotoPoses}
                onPhotoClick={(index) => viewer.openAtIndex(index, 'orbit')}
              />
            </div>
          )}
          {meshMounted && (
            <div className={mode === 'mesh' ? undefined : 'hidden'}>
              <ModelStage
                modelUrl={signedModelUrl ?? null}
                isSigning={signingModel}
              />
            </div>
          )}
          {splatMounted && (
            <div className={mode === 'splat' ? undefined : 'hidden'}>
              <SplatStage
                url={splat.url}
                unavailable={splat.unavailable}
                isLoading={splat.isLoading}
              />
            </div>
          )}
          {/* The contact strip lives under the stage, inside the stage cell. */}
          <PhotoStrip
            photos={photos}
            onOpen={(index) => viewer.openAtIndex(index, 'strip')}
          />
        </div>
      </div>

      {/* Full-bleed photo viewer — mounted over the still-mounted Plan/facts
          rail (D1: the surface beneath never unmounts). */}
      {viewer.openIndex != null && (
        <PhotoViewer
          photos={photos}
          index={viewer.openIndex}
          onIndexChange={viewer.openAtIndex}
          onClose={viewer.close}
        />
      )}
    </div>
  );
}
