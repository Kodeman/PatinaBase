'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';

import {
  useProjectTeamMembers,
  useRevokeScanAccess,
  useRoomScanAssociations,
  useRoomScans,
  useShareRoomScan,
  type RoomScan,
} from '@patina/supabase';
import type { RoomScanAssociationWithDetails } from '@patina/shared';

import { ScoredAction } from '@/components/making/scored-action';
import { ViewerErrorBoundary } from '@/components/scans/ViewerErrorBoundary';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── THE ROOM AS CAPTURED ────────────────────────────────────────────────────
   The band draws the room as a section in hairline ink. This is the other
   reading of the same room: the one the client walked with her phone. The act
   turns the sheet over — the drawing stands aside and the capture takes its
   place on a plate — and turns it back.

   A capture is matched to its band BY NAME, the way a plan line is matched to
   a room on this page: `room_scans` carries a project and a name and no
   `project_rooms` id, so the name is the only join there is. A room nobody has
   captured says nothing at all — no act, no plate, no empty frame.

   The 3D view is loaded only when the plate opens, and only in the browser:
   @react-three/fiber 8 reads a React internal that React 19 removed, so the
   canvas can throw on mount. `ViewerErrorBoundary` keeps that inside the plate
   and the still stands in its place. ─────────────────────────────────────── */

const CapturedRoomCanvas = dynamic(
  () => import('@/components/scans/ClientViewerCanvas').then((m) => m.ClientViewerCanvas),
  { ssr: false, loading: () => null },
);

/** The plate's ground: a hatch, as the drawing set hatches a cut. */
const PLATE_HATCH =
  'repeating-linear-gradient(45deg, rgba(22,32,43,.13) 0 1px, transparent 1px 9px)';

/** "19 June" — the house's date idiom. */
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });

const CAPTION_CLASS =
  'inline-block bg-[var(--bg-primary)] px-[7px] py-[4px] font-mono text-[11px] uppercase leading-[1.5] tracking-[0.1em] text-[var(--text-muted)]';

function sameRoom(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface RoomCaptureProps {
  projectId: string;
  roomName: string;
}

export function RoomCapture({ projectId, roomName }: RoomCaptureProps) {
  const { data: scans } = useRoomScans({ projectId });
  const [open, setOpen] = useState(false);

  const scan = (scans ?? []).find((row) => sameRoom(row.name, roomName)) ?? null;
  if (!scan) return null;

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
        {open ? 'The room as drawn' : 'The room as captured'}
      </ScoredAction>

      {open && <CapturedRoom scan={scan} projectId={projectId} />}
    </div>
  );
}

function CapturedRoom({ scan, projectId }: { scan: RoomScan; projectId: string }) {
  const { data: associations } = useRoomScanAssociations({ scanId: scan.id });
  const { data: team } = useProjectTeamMembers(projectId);
  const share = useShareRoomScan();
  const revoke = useRevokeScanAccess();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const modelUrl = scan.model_url_gltf ?? scan.model_url ?? null;
  // `useRoomScanAssociations` resolves to `any[]` (its row mapper is untyped),
  // so the shape is named here rather than inferred.
  const active: RoomScanAssociationWithDetails[] = (associations ?? []).filter(
    (association: RoomScanAssociationWithDetails) => association.status === 'active',
  );
  const shownTo = new Set(active.map((association) => association.designerId));
  const candidates = (team ?? [])
    .filter((member) => member.role !== 'client' && !!member.user)
    .filter((member) => !shownTo.has(member.user_id));

  return (
    <>
      <div
        data-testid="room-capture-plate"
        className="relative mt-4 flex min-h-[210px] flex-col justify-end border border-[var(--border-default)] p-3.5"
        style={{ backgroundImage: PLATE_HATCH }}
      >
        {modelUrl ? (
          <div className="relative aspect-video w-full" data-testid="room-capture-model">
            <ViewerErrorBoundary
              fallback={<CaptureStill scan={scan} />}
            >
              <Suspense fallback={null}>
                <CapturedRoomCanvas modelUrl={modelUrl} mode="orbit" />
              </Suspense>
            </ViewerErrorBoundary>
          </div>
        ) : (
          <CaptureStill scan={scan} />
        )}
        <span className={CAPTION_CLASS} data-testid="room-capture-caption">
          {`Captured room · ${scan.name}`}
        </span>
      </div>

      <div data-testid="room-capture-sharing" className="mt-3">
        {active.map((association) => {
          const designer =
            association.designer?.fullName ??
            association.designer?.businessName ??
            'the studio';
          const since = parseSourceDate(association.sharedAt);
          const busy = revoke.isPending && pendingId === association.id;
          return (
            <p
              key={association.id}
              data-testid="room-capture-share"
              className="flex flex-wrap items-baseline gap-x-4 text-[15px] leading-relaxed text-[var(--text-body)]"
            >
              <span>
                {`Shown to ${designer}${since ? ` since ${DAY_MONTH.format(since)}` : ''}.`}
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

        {candidates.map((member) => {
          const name = member.user?.full_name ?? 'the studio';
          const busy = share.isPending && pendingId === member.user_id;
          return (
            <ScoredAction
              key={member.user_id}
              actionKey="room_capture_share"
              regionKey="room"
              surfaceKey="the_threshold"
              variant="tertiary"
              loading={busy}
              loadingLabel="Showing"
              aria-label={`Show this room to ${name}`}
              onClick={() => {
                setPendingId(member.user_id);
                share.mutate({
                  scanId: scan.id,
                  designerId: member.user_id,
                  accessLevel: 'full',
                  projectId,
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

/**
 * The capture with no model behind it — the still the phone kept, or, when
 * there is not even that, the empty plate and its caption alone.
 */
function CaptureStill({ scan }: { scan: RoomScan }) {
  if (!scan.thumbnail_url) return null;
  return (
    // A scan still is an arbitrary remote URL from the capture pipeline, not a
    // configured image host — the same reading `ScanStillFallback` takes.
    <img
      data-testid="room-capture-still"
      src={scan.thumbnail_url}
      alt={`${scan.name}, as captured`}
      className="mb-3 max-h-[320px] w-full object-contain"
    />
  );
}
