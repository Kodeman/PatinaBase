'use client';

import Link from 'next/link';
import Image from 'next/image';

import { useRoomScans } from '@patina/supabase';
import type { RoomScan } from '@patina/supabase';

import { useConsumerSharedScans } from '@patina/supabase';
// F3 — Rooms list empty state migrated to ambient help-system per spec §9.2.
// Consumer voice: explain that capture happens on the phone (iOS app), warm
// and second-person. EmptyState is CMS-backed; the local fallback ships
// until Sanity content for `client-portal/scans/empty/no-scans` lands.
import { EmptyState, SurfaceKeys, useHelpContent } from '@patina/help-system';
import { Box } from 'lucide-react';

interface RoomScanListProps {
  userId: string;
}

function formatDimensions(dimensions: RoomScan['dimensions']): string | null {
  if (!dimensions) return null;
  const { length, width, unit } = dimensions;
  if (!length || !width) return null;
  return `${length.toFixed(1)} × ${width.toFixed(1)} ${unit}`;
}

function formatRelative(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function RoomScanList({ userId }: RoomScanListProps) {
  const { data: scans = [], isLoading, error } = useRoomScans({ userId });
  const { data: shares = [] } = useConsumerSharedScans();

  // Build a fast lookup: scanId → number of active shares
  const sharesByScan = new Map<string, number>();
  for (const s of shares) {
    if (s.status !== 'active') continue;
    sharesByScan.set(s.scanId, (sharesByScan.get(s.scanId) ?? 0) + 1);
  }

  if (isLoading) {
    return (
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-[var(--border-default)] bg-white p-4"
          >
            <div className="h-32 w-full rounded bg-[var(--bg-surface)]" />
            <div className="mt-3 h-4 w-2/3 rounded bg-[var(--bg-surface)]" />
            <div className="mt-2 h-3 w-1/2 rounded bg-[var(--bg-surface)]" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="mt-8 type-body-small text-patina-terracotta">
        Couldn&rsquo;t load your rooms. Please refresh.
      </p>
    );
  }

  if (scans.length === 0) {
    return <RoomScansEmptyState />;
  }

  return (
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {scans.map((scan) => {
        const shareCount = sharesByScan.get(scan.id) ?? 0;
        const dimensions = formatDimensions(scan.dimensions);
        const captured = formatRelative(scan.scanned_at ?? scan.created_at);
        return (
          <Link
            key={scan.id}
            href={`/scans/${scan.id}`}
            className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-white transition hover:border-[var(--accent-primary)]"
            data-testid="scan-card"
          >
            <div className="relative aspect-video w-full bg-[var(--bg-surface)]">
              {scan.thumbnail_url ? (
                <Image
                  src={scan.thumbnail_url}
                  alt={scan.name}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                  <span className="type-meta">No preview</span>
                </div>
              )}
              {scan.status !== 'ready' ? (
                <span className="absolute right-2 top-2 rounded-sm bg-amber-50 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-amber-800">
                  {scan.status}
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col p-4">
              <h2 className="type-item-name truncate group-hover:text-[var(--accent-primary)]">
                {scan.name}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                {dimensions ? <span className="type-meta">{dimensions}</span> : null}
                {captured ? <span className="type-meta-small text-[var(--text-muted)]">· {captured}</span> : null}
              </div>
              <div className="mt-3">
                {shareCount > 0 ? (
                  <span className="inline-block rounded-sm bg-blue-50 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-blue-800">
                    Shared with {shareCount} {shareCount === 1 ? 'designer' : 'designers'}
                  </span>
                ) : (
                  <span className="inline-block rounded-sm bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
                    Private
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </section>
  );
}

/**
 * RoomScansEmptyState — consumer-voice empty state for the homeowner's rooms
 * list (F3). Same probe pattern as F1.2/F1.6 designer migrations: CMS hit
 * defers to the canonical EmptyState wrapper, CMS miss renders local
 * hospitality-voiced fallback so newly invited homeowners aren't stranded.
 */
function RoomScansEmptyState() {
  const { data, isLoading } = useHelpContent(
    SurfaceKeys.ClientPortal.Scans.Empty.NoScans,
    'emptyState',
    'consumer',
  );

  if (isLoading) {
    return (
      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
        <p className="type-body-small italic text-[var(--text-muted)]">…</p>
      </section>
    );
  }

  if (data) {
    return (
      <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8">
        <EmptyState
          surfaceKey={SurfaceKeys.ClientPortal.Scans.Empty.NoScans}
          persona="consumer"
          icon={<Box className="h-10 w-10" />}
        />
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-[var(--border-default)] bg-white p-8 text-center">
      <Box className="mx-auto h-10 w-10 text-[var(--text-muted)]" aria-hidden />
      <h2 className="mt-4 font-heading text-lg text-[var(--text-primary)]">
        No rooms captured yet
      </h2>
      <p className="type-body-small mt-2 mx-auto max-w-md text-[var(--text-muted)]">
        Open the Patina app on your phone to capture your first room — it takes
        a minute and unlocks 3D collaboration with your designer.
      </p>
    </section>
  );
}
