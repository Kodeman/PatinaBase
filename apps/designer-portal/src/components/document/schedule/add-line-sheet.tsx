'use client';

import { useRef, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useCreateNamedProjectNeed } from '@patina/supabase';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useAddComFabricLine } from '../buying/com-piece';

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)]';

const LABEL_CLASS =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

export function AddLineSheet({
  open,
  projectId,
  roomId,
  roomName,
  onClose,
}: {
  open: boolean;
  projectId: string;
  roomId: string | null;
  roomName: string;
  onClose: () => void;
}) {
  const addLine = useCreateNamedProjectNeed();
  const addFabric = useAddComFabricLine();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [takesCom, setTakesCom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);

  const trimmedName = name.trim();
  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const pending = addLine.isPending || addFabric.isPending;
  const canSave = trimmedName.length > 0 && !pending;

  const reset = () => {
    setName('');
    setQuantity('1');
    setTakesCom(false);
    setError(null);
    requestKey.current = null;
  };

  const save = async () => {
    if (!canSave) return;
    setError(null);
    try {
      const request = {
        projectId,
        name: trimmedName,
        quantity: parsedQuantity,
        itemType: 'tbd' as const,
        assignmentScope: roomId
          ? ('room' as const)
          : roomName === 'Unsorted'
            ? ('unassigned' as const)
            : ('throughout' as const),
        roomId,
        disposition: 'candidate' as const,
        source: 'named-need' as const,
      };
      const fingerprint = JSON.stringify(request);
      if (requestKey.current?.fingerprint !== fingerprint) {
        requestKey.current = {
          fingerprint,
          key: globalThis.crypto?.randomUUID?.() ?? `need-${projectId}-${Date.now()}`,
        };
      }
      const created = await addLine.mutateAsync({
        ...request,
        idempotencyKey: requestKey.current.key,
      });
      // C-24: the piece's COM fabric is its own line, linked to the piece.
      if (takesCom && created.selectionId) {
        await addFabric.add(projectId, {
          id: created.selectionId,
          name: trimmedName,
          project_room_id: roomId,
          assignment_scope: request.assignmentScope,
        });
      }
      reset();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The line could not be added.',
      );
    }
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      icon={PlusCircle}
      title="Add a line"
      pageLabel={roomName}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={LABEL_CLASS}>Line</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Walnut bed, king"
            aria-label="Line name"
            className={FIELD_CLASS}
          />
        </label>
        <label>
          <span className={LABEL_CLASS}>How many</span>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-label="Quantity"
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={takesCom}
            onChange={(event) => setTakesCom(event.target.checked)}
          />
          <span className="text-[13px] text-[var(--color-charcoal)]">This piece takes COM</span>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        {takesCom
          ? `This adds two lines to ${roomName} as candidates: the piece, and its COM fabric linked to it. Nothing is released until you say so.`
          : `It lands in ${roomName} as a candidate — nothing is released until you say so.`}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}

      <DocumentActionGroup
        surfaceKey="project"
        regionKey="add-schedule-line"
        aria-label="Add line acts"
        className="mt-4"
      >
        <DocumentAction
          actionKey="add-schedule-line"
          variant="primary"
          disabled={!canSave}
          loading={pending}
          loadingLabel="Adding…"
          onClick={save}
        >
          {takesCom ? 'Add the pair' : 'Add the line'}
        </DocumentAction>
      </DocumentActionGroup>
    </DocSheet>
  );
}
