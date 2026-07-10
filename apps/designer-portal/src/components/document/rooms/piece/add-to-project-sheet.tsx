'use client';

/**
 * Add a piece to a project — a paper sheet over the Piece Room that lists the
 * designer's active projects and places the piece into one's FF&E schedule via
 * the same `usePlaceInDocument` path the Engine uses (added_via='engine',
 * item_type 'tbd', client/trade prices carried through). Zero shadows (D4).
 */

import { useState } from 'react';
import { useProjects } from '@patina/supabase';
import { RoomSheet } from '../room-sheet';
import { usePlaceInDocument, type PlaceablePiece } from '@/hooks/use-place-in-document';
import { productEvents } from '@/lib/analytics/events';

export function AddToProjectSheet({
  open,
  onClose,
  piece,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  piece: PlaceablePiece;
  onAdded: (projectName: string) => void;
}) {
  const { data: projects, isLoading } = useProjects();
  const place = usePlaceInDocument();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const targets = ((projects ?? []) as Array<{ id: string; name: string | null; status: string | null }>).filter(
    (p) => p.status !== 'completed' && p.status !== 'archived' && p.status !== 'cancelled',
  );

  const add = async (projectId: string, projectName: string) => {
    setBusy(projectId);
    setErr(null);
    try {
      await place.mutateAsync({ projectId, piece });
      productEvents.addToProject(piece.id);
      onAdded(projectName);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add to that project.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <RoomSheet open={open} onClose={onClose} title={`Add “${piece.name}” to a project`}>
      <p className="mb-4 text-[0.8rem] text-[var(--color-aged-oak)]">
        The piece lands in the project’s schedule as a TBD line — refine the room, quantity, and price there.
      </p>
      {isLoading ? (
        <p className="text-[0.8rem] italic text-[var(--color-aged-oak)]">Reading your projects…</p>
      ) : targets.length === 0 ? (
        <p className="text-[0.8rem] italic text-[var(--color-aged-oak)]">No open projects to add to yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {targets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void add(p.id, p.name ?? 'the project')}
                disabled={busy !== null}
                className="flex w-full items-center justify-between rounded-[7px] border border-[var(--color-pearl)] bg-white px-4 py-3 text-left transition-colors hover:border-[var(--color-clay)] disabled:opacity-50"
              >
                <span className="text-[0.86rem] text-[var(--color-charcoal)]">{p.name ?? 'Untitled project'}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay)]">
                  {busy === p.id ? 'adding…' : 'add →'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-3 text-[0.74rem] text-[var(--color-terracotta)]">{err}</p>}
    </RoomSheet>
  );
}
