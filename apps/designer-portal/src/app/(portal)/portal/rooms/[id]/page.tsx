'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRoom, useRoomScans } from '@patina/supabase';
import { FieldGroup } from '@/components/portal/field-group';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function RoomViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: room, isLoading } = useRoom(id) as { data: Any; isLoading: boolean };
  const { data: scans } = useRoomScans() as { data: Any };
  const roomScans = Array.isArray(scans) ? scans.filter((s: Any) => s.room_id === id) : [];

  if (isLoading) return <LoadingStrata />;
  if (!room) return <p className="type-body py-16 text-center text-[var(--text-muted)]">Room not found.</p>;

  return (
    <div className="pt-8">
      <div className="type-meta mb-6">
        <Link href="/portal/rooms" className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]">Rooms</Link>
        <span className="mx-2">&rarr;</span><span>{room.name || 'Room'}</span>
      </div>

      <h1 className="type-page-title mb-4">{room.name || 'Room Viewer'}</h1>

      {/* 3D Viewer Area */}
      <div
        className="mb-8 flex h-[400px] items-center justify-center rounded-lg bg-patina-pearl"
        style={{
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(196,165,123,0.05) 10px, rgba(196,165,123,0.05) 20px)',
        }}
      >
        <span className="type-body text-[var(--text-muted)]">
          {roomScans.length > 0 ? '3D Room Viewer' : 'No scans available for this room'}
        </span>
      </div>

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
