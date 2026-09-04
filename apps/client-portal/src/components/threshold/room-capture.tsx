'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';

import {
  useRevokeScanAccess,
  useRoomScanAssociations,
  useRoomScans,
  useShareRoomScan,
  type RoomScan,
} from '@patina/supabase';
import type { RoomScanAssociationWithDetails } from '@patina/shared';

import { ScoredAction } from '@/components/making/scored-action';
import { ScanStillFallback, ViewerErrorBoundary } from '@/components/scans/ViewerErrorBoundary';
import { useMyDesigners } from '@/hooks/use-my-designers';
import { DAY_MONTH, parseSourceDate } from '@/lib/threshold/derive';

/* ── THE ROOM AS CAPTURED ────────────────────────────────────────────────────
   The band draws the room as a section in hairline ink. This is the other
   reading of the same room: the one somebody walked with a phone. The act
   lays the capture on a plate below the drawing, and puts it away again.

   A capture is matched to its band by its `project_room_id` (00265) where the
   capture carries one, and by NAME where it does not — `room_scans` predates
   that column and the iOS app still files captures with a name alone. A
   capture that matches neither is not lost: `StrayCaptures` stands every one
   of the client's own captures that no band claimed after the last room, which
   is the register /scans carried and the only one it had.

   The 3D view is loaded only when the plate opens, and only in the browser:
   @react-three/fiber 8 reads a React internal that React 19 removed, so the
   canvas can throw on mount — the EXPECTED path, not an edge case.
   `ViewerErrorBoundary` keeps that inside the plate and `ScanStillFallback`,
   the degrade the /scans viewer shipped, stands in its place with its own
   line so the client is told the room is fine and the viewer is not. ────── */

const CapturedRoomCanvas = dynamic(
  () => import('@/components/scans/ClientViewerCanvas').then((m) => m.ClientViewerCanvas),
  { ssr: false, loading: () => null },
);

/** The plate's ground: a hatch in the page's own ink, as a drawing hatches a cut. */
const PLATE_HATCH =
  'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 9px)';

const CAPTION_CLASS =
  'relative inline-block bg-[var(--bg-primary)] px-[7px] py-[4px] font-mono text-[11px] uppercase leading-[1.5] tracking-[0.1em] text-[var(--text-muted)]';
const PLATE_LINE_CLASS =
  'relative mb-2 text-[15px] leading-relaxed text-[var(--text-body)]';

/** 00265 added `room_scans.project_room_id`; the hook's row type predates it. */
type Capture = RoomScan & { project_room_id?: string | null };

/** "4.2 × 3.1 m", as /scans printed it, or nothing when the room has no figures. */
function measure(dimensions: RoomScan['dimensions']): string | null {
  if (!dimensions) return null;
  const { length, width, unit } = dimensions;
  if (!length || !width) return null;
  return `${length.toFixed(1)} × ${width.toFixed(1)} ${unit}`;
}

/** The caption under the plate: the room, its measure, and the day it was walked. */
function plateCaption(scan: Capture): string {
  const captured = parseSourceDate(scan.scanned_at ?? scan.created_at);
  return [
    'Captured room',
    scan.name,
    measure(scan.dimensions),
    captured ? DAY_MONTH.format(captured) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function sameRoom(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The band this capture belongs to: its scope room where it has one, else its name. */
function claims(scan: Capture, roomId: string, roomName: string): boolean {
  return scan.project_room_id
    ? scan.project_room_id === roomId
    : sameRoom(scan.name, roomName);
}

export interface RoomCaptureProps {
  projectId: string;
  roomId: string;
  roomName: string;
}

export function RoomCapture({ projectId, roomId, roomName }: RoomCaptureProps) {
  const { data: scans } = useRoomScans({ projectId });

  const captures = (scans ?? []) as Capture[];
  const scan =
    captures.find((row) => row.project_room_id === roomId) ??
    captures.find((row) => !row.project_room_id && sameRoom(row.name, roomName)) ??
    null;
  if (!scan) return null;

  return <CaptureToggle scan={scan} />;
}

export interface StrayCapturesProps {
  projectId: string;
  /** The signed-in client; their own captures are the register /scans listed. */
  userId: string;
  rooms: Array<{ roomId: string; name: string }>;
}

/**
 * Every capture the client owns that no room band claimed — a capture filed
 * before the project had rooms, one whose name never matched a band, one the
 * phone filed with no project at all. /scans listed all of them; without this
 * they would have no surface anywhere once it is retired.
 */
export function StrayCaptures({ projectId, userId, rooms }: StrayCapturesProps) {
  const { data: scans } = useRoomScans({ userId });

  const stray = ((scans ?? []) as Capture[]).filter(
    (scan) =>
      // A capture filed against ANOTHER house belongs to that house's page.
      (!scan.project_id || scan.project_id === projectId) &&
      !rooms.some((room) => claims(scan, room.roomId, room.name)),
  );
  if (stray.length === 0) return null;

  return (
    <section data-testid="stray-captures" className="mt-8 border-t border-[var(--border-subtle)] pt-4">
      <h2 className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        Rooms you captured
      </h2>
      {stray.map((scan) => (
        <div key={scan.id} className="mt-3">
          <p className="text-[15px] leading-[1.5] text-[var(--text-body)]">{scan.name}</p>
          <CaptureToggle scan={scan} />
        </div>
      ))}
    </section>
  );
}

/**
 * The act and the plate. The drawing stays where it is: hiding it would have
 * to lift this open state into the page and add a prop to `RoomBand`, so the
 * label says what actually happens instead of naming a state the page is
 * not in.
 */
function CaptureToggle({ scan }: { scan: Capture }) {
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="room-capture" data-room-capture={scan.id}>
      <ScoredAction
        actionKey="room_as_captured"
        regionKey="room"
        surfaceKey="the_threshold"
        variant="tertiary"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? 'Put the capture away' : 'The room as captured'}
      </ScoredAction>

      {open && <CapturedRoom scan={scan} />}
    </div>
  );
}

function CapturedRoom({ scan }: { scan: Capture }) {
  const { data: associations } = useRoomScanAssociations({ scanId: scan.id });
  const { data: designers } = useMyDesigners();
  const share = useShareRoomScan();
  const revoke = useRevokeScanAccess();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mode, setMode] = useState<'orbit' | 'floorplan'>('orbit');

  const modelUrl = scan.model_url_gltf ?? scan.model_url ?? null;
  // `useRoomScanAssociations` resolves to `any[]` (its row mapper is untyped),
  // so the shape is named here rather than inferred.
  const active: RoomScanAssociationWithDetails[] = (associations ?? []).filter(
    (association: RoomScanAssociationWithDetails) => association.status === 'active',
  );
  const shownTo = new Set(active.map((association) => association.designerId));
  const candidates = (designers ?? []).filter((designer) => !shownTo.has(designer.id));

  return (
    <>
      <div
        data-testid="room-capture-plate"
        className="relative mt-4 flex min-h-[210px] flex-col justify-end border border-[var(--border-default)] p-3.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.13]"
          style={{ backgroundImage: PLATE_HATCH }}
        />
        {modelUrl ? (
          <div className="relative aspect-video w-full" data-testid="room-capture-model">
            <ViewerErrorBoundary
              fallback={
                <ScanStillFallback thumbnailUrl={scan.thumbnail_url} roomName={scan.name} />
              }
            >
              <Suspense fallback={null}>
                <CapturedRoomCanvas modelUrl={modelUrl} mode={mode} />
              </Suspense>
            </ViewerErrorBoundary>
          </div>
        ) : (
          <>
            {scan.thumbnail_url && (
              // A scan still is an arbitrary remote URL from the capture
              // pipeline, not a configured image host — the same reading
              // `ScanStillFallback` takes.
              <img
                data-testid="room-capture-still"
                src={scan.thumbnail_url}
                alt={`${scan.name}, as captured`}
                className="relative mb-3 max-h-[320px] w-full object-contain"
              />
            )}
            <p className={PLATE_LINE_CLASS} data-testid="room-capture-pending">
              3D model not yet available.
            </p>
            <p className={PLATE_LINE_CLASS}>
              Your scan may still be processing. Check back shortly.
            </p>
          </>
        )}
        <div className="relative flex flex-wrap items-baseline justify-between gap-x-4">
          <span className={CAPTION_CLASS} data-testid="room-capture-caption">
            {plateCaption(scan)}
          </span>
          {modelUrl && (
            <ScoredAction
              actionKey="room_capture_mode"
              regionKey="room"
              surfaceKey="the_threshold"
              variant="tertiary"
              onClick={() => setMode((was) => (was === 'orbit' ? 'floorplan' : 'orbit'))}
            >
              {mode === 'orbit' ? 'Seen from above' : 'Seen from the room'}
            </ScoredAction>
          )}
        </div>
      </div>

      <div data-testid="room-capture-sharing" className="mt-3">
        {active.map((association) => {
          const designer =
            association.designer?.fullName?.trim() ||
            association.designer?.businessName?.trim() ||
            'the studio';
          const since = parseSourceDate(association.sharedAt);
          const until = parseSourceDate(association.expiresAt);
          const busy = revoke.isPending && pendingId === association.id;
          return (
            <p
              key={association.id}
              data-testid="room-capture-share"
              className="flex flex-wrap items-baseline gap-x-4 text-[15px] leading-relaxed text-[var(--text-body)]"
            >
              <span>
                {`Shown to ${designer}${since ? ` since ${DAY_MONTH.format(since)}` : ''}${
                  until ? ` · until ${DAY_MONTH.format(until)}` : ''
                }.`}
              </span>
              <ScoredAction
                actionKey="room_capture_revoke"
                regionKey="room"
                surfaceKey="the_threshold"
                variant="tertiary"
                loading={busy}
                loadingLabel="Stopping"
                aria-label={`Stop showing this room to ${designer}`}
                onClick={() => {
                  setPendingId(association.id);
                  revoke.mutate({ associationId: association.id });
                }}
              >
                Stop showing it
              </ScoredAction>
            </p>
          );
        })}

        {candidates.map((designer) => {
          const name =
            designer.fullName?.trim() || designer.businessName?.trim() || 'the studio';
          const busy = share.isPending && pendingId === designer.id;
          return (
            <ScoredAction
              key={designer.id}
              actionKey="room_capture_share"
              regionKey="room"
              surfaceKey="the_threshold"
              variant="tertiary"
              loading={busy}
              loadingLabel="Showing"
              aria-label={`Show this room to ${name}`}
              onClick={() => {
                setPendingId(designer.id);
                share.mutate({
                  scanId: scan.id,
                  designerId: designer.id,
                  accessLevel: 'full',
                });
              }}
            >
              {`Show it to ${name}`}
            </ScoredAction>
          );
        })}

        {revoke.isError && (
          <p role="alert" className="text-[15px] leading-relaxed text-[var(--text-body)]">
            Couldn&rsquo;t revoke. Please try again.
          </p>
        )}
        {share.isError && (
          <p role="alert" className="text-[15px] leading-relaxed text-[var(--text-body)]">
            Couldn&rsquo;t share. Please try again.
          </p>
        )}
      </div>
    </>
  );
}
