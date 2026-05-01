'use client';

import { useState } from 'react';

import { useRoomScanAssociations, useRevokeScanAccess } from '@patina/supabase';
import type { RoomScanAssociationWithDetails } from '@patina/shared';

interface RoomScanShareStatusProps {
  scanId: string;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function RoomScanShareStatus({ scanId }: RoomScanShareStatusProps) {
  const { data: associations = [], isLoading } = useRoomScanAssociations({ scanId });
  const revoke = useRevokeScanAccess();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const active = associations.filter(
    (a: RoomScanAssociationWithDetails) => a.status === 'active',
  );

  if (isLoading) {
    return (
      <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
        <h3 className="font-heading text-base text-[var(--text-primary)]">Sharing</h3>
        <p className="mt-3 type-body-small text-[var(--text-muted)]">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border-default)] bg-white p-5">
      <h3 className="font-heading text-base text-[var(--text-primary)]">Sharing</h3>
      {active.length === 0 ? (
        <p className="mt-3 type-body-small text-[var(--text-muted)]">
          This room is private. Share it with a designer to get help.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {active.map((assoc: RoomScanAssociationWithDetails) => {
            const designerName =
              assoc.designer?.fullName ?? assoc.designer?.businessName ?? 'Designer';
            const isRevoking = revoke.isPending && revokingId === assoc.id;
            return (
              <li
                key={assoc.id}
                className="flex items-start justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {designerName}
                  </p>
                  <p className="type-meta-small text-[var(--text-muted)]">
                    Shared {formatDate(assoc.sharedAt)}
                    {assoc.expiresAt ? ` · expires ${formatDate(assoc.expiresAt)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => {
                    setRevokingId(assoc.id);
                    revoke.mutate({ associationId: assoc.id });
                  }}
                  className="shrink-0 rounded-[3px] border border-[var(--border-default)] px-2.5 py-1 type-meta-small text-[var(--text-muted)] transition hover:border-patina-terracotta hover:text-patina-terracotta disabled:opacity-60"
                  data-testid={`revoke-share-${assoc.id}`}
                >
                  {isRevoking ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {revoke.isError ? (
        <p className="mt-3 type-meta-small text-patina-terracotta" role="alert">
          Couldn&rsquo;t revoke. Please try again.
        </p>
      ) : null}
    </section>
  );
}
