'use client';

import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { useCreateNamedProjectNeed } from '@patina/supabase';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

type LineKind = 'goods' | 'allowance';

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

  const [kind, setKind] = useState<LineKind>('goods');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const canSave = trimmedName.length > 0 && !addLine.isPending;

  const reset = () => {
    setKind('goods');
    setName('');
    setQuantity('1');
    setError(null);
  };

  const save = async () => {
    if (!canSave) return;
    setError(null);
    try {
      await addLine.mutateAsync({
        projectId,
        name: trimmedName,
        quantity: parsedQuantity,
        assignmentScope: roomId ? 'room' : roomName === 'Unsorted' ? 'unassigned' : 'throughout',
        projectRoomId: roomId,
        designDisposition: 'candidate',
        needKind: kind === 'allowance' ? 'allowance' : 'manual_product',
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `need-${projectId}-${Date.now()}`,
      });
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
      <div className="mb-3 flex items-center gap-1.5">
        {(['goods', 'allowance'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            className={`min-h-11 rounded-[3px] border px-3 font-mono text-[11px] capitalize ${
              kind === option
                ? 'border-[var(--color-clay)] text-[var(--color-charcoal)]'
                : 'border-[var(--color-pearl)] text-[var(--text-muted)]'
            }`}
          >
            {option === 'goods' ? 'Goods' : 'Allowance'}
          </button>
        ))}
      </div>

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
        {kind === 'allowance'
          ? 'The allowance is a named need. Set its client-facing amount when preparing a review or authorization.'
          : `It lands in ${roomName} as a candidate — nothing is released until you say so.`}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[11px] text-[#C4836F]">
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
