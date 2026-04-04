'use client';

import { useRouter } from 'next/navigation';
import { useRooms } from '@patina/supabase';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRoom = any;

export default function RoomsPage() {
  const router = useRouter();
  const { data: rawRooms, isLoading } = useRooms();
  const rooms = (Array.isArray(rawRooms) ? rawRooms : []) as AnyRoom[];

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Room Scans</h1>

      {isLoading ? (
        <LoadingStrata />
      ) : rooms.length > 0 ? (
        <div>
          {rooms.map((room: AnyRoom) => (
            <div
              key={room.id}
              className="cursor-pointer border-b border-[var(--border-subtle)] py-5 transition-colors hover:bg-[var(--bg-hover)]"
              onClick={() => router.push(`/portal/rooms/${room.id}`)}
            >
              <div className="flex items-baseline justify-between">
                <span className="type-label">{room.name || 'Unnamed Room'}</span>
                <span className="type-meta">
                  {room.created_at
                    ? new Date(room.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : ''}
                </span>
              </div>
              <div className="type-label-secondary mt-1">
                {[
                  room.type,
                  room.dimensions
                    ? `${room.dimensions.length || ''}' × ${room.dimensions.width || ''}' — ${room.floor_area || ''} sq ft`
                    : room.floor_area
                      ? `${room.floor_area} sq ft`
                      : null,
                  room.scan_count !== undefined ? `${room.scan_count} scans` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No room scans yet. They&apos;ll appear here when clients share their scans.
        </p>
      )}
    </div>
  );
}
