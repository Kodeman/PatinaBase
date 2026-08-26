'use client';

import { useRef, useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useCreateNamedProjectNeed } from '@patina/supabase';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)]';

const LABEL_CLASS =
  'mb-1 block font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

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

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);

  const trimmedName = name.trim();
  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const canSave = trimmedName.length > 0 && !addLine.isPending;

  const reset = () => {
    setName('');
    setQuantity('1');
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
      await addLine.mutateAsync({ ...request, idempotencyKey: requestKey.current.key });
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
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        It lands in {roomName} as a candidate — nothing is released until you say so.
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
          loading={addLine.isPending}
          loadingLabel="Adding…"
          onClick={save}
        >
          Add the line
        </DocumentAction>
      </DocumentActionGroup>
    </DocSheet>
  );
}
