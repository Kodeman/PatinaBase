'use client';

import { use } from 'react';
import { useRoom, useRoomScans } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { RoomScanViewer } from '@/components/rooms/viewer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function RoomViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { data: room, isLoading } = useRoom(id) as { data: Any; isLoading: boolean };
  const { data: scans } = useRoomScans() as { data: Any };
  const roomScans = Array.isArray(scans) ? scans.filter((s: Any) => s.room_id === id) : [];

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!room) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Room not found.</p>;

  return (
    <div className="pt-8">
      {/* The global SubNav breadcrumb carries Rooms → {room.name}, so this page
          renders no breadcrumb and no h1. There are no header actions, so the
          content (3D viewer + details) starts directly. */}

      {/* 3D Viewer Area */}
      {roomScans.length > 0 ? (
        <div className="mb-8 h-[560px] overflow-hidden rounded-lg">
          <RoomScanViewer scan={roomScans[0]} />
        </div>
      ) : (
        <div className="mb-8 flex h-[400px] items-center justify-center rounded-lg bg-patina-pearl">
          <span className="type-body text-[var(--text-muted)]">No room scan uploaded yet</span>
        </div>
      )}

      <StrataMark variant="mini" />

      <div className="grid gap-12 md:grid-cols-2">
        <FieldGroup label="Room Details">
          {room.type && <DetailRow label="Type" value={room.type} />}
          {room.floor_area && <DetailRow label="Area" value={`${room.floor_area} sq ft`} />}
          {room.dimensions && (
            <DetailRow label="Dimensions" value={`${room.dimensions.length || '—'}' × ${room.dimensions.width || '—'}' × ${room.dimensions.height || '—'}'`} />
          )}
          {room.volume && <DetailRow label="Volume" value={`${room.volume} cu ft`} />}
          {room.created_at && <DetailRow label="Created" value={new Date(room.created_at).toLocaleDateString()} />}
        </FieldGroup>

        {roomScans.length > 0 && (
          <FieldGroup label={`Scans (${roomScans.length})`}>
            {roomScans.map((scan: Any) => (
              <div key={scan.id} className="border-b border-[var(--border-subtle)] py-3">
                <span className="type-label">{scan.scan_type || 'Scan'}</span>
                <div className="type-label-secondary mt-1">
                  {scan.created_at ? new Date(scan.created_at).toLocaleDateString() : ''}
                  {scan.quality_score ? ` · Quality: ${scan.quality_score}` : ''}
                </div>
              </div>
            ))}
          </FieldGroup>
        )}

        {room.style_signals && Object.keys(room.style_signals).length > 0 && (
          <FieldGroup label="Style Signals">
            {Object.entries(room.style_signals).map(([key, value]) => (
              <DetailRow key={key} label={key} value={String(value)} />
            ))}
          </FieldGroup>
        )}
      </div>
    </div>
  );
}
