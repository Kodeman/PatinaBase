'use client';

/**
 * Add a line to a room (Authorized Schedule deck, slide 9).
 *
 * "Add a line sits per room, tertiary. Nothing about authorization changes how
 * a piece gets onto the schedule." So this sheet is the plainest possible
 * capture: a name, how many, what the client pays, and — optionally — who
 * makes it. The room is already chosen, because the act was reached from it.
 *
 * Goods carry a price. An allowance carries a ceiling, which is why an
 * allowance can be signed and a blank line cannot.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { useAddProjectFFEItem } from '@/hooks/use-projects';
import { commercialDocumentKeys } from '@/hooks/use-commercial-documents';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

type LineKind = 'goods' | 'allowance';

/** Dollars typed by hand → cents. Anything unparseable is zero. */
export function dollarsToCents(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

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
  /** The room the act was reached from; null is "Throughout". */
  roomId: string | null;
  roomName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const addLine = useAddProjectFFEItem();

  const [kind, setKind] = useState<LineKind>('goods');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [vendor, setVendor] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const cents = dollarsToCents(price);
  const canSave = trimmedName.length > 0 && !addLine.isPending;

  const reset = () => {
    setKind('goods');
    setName('');
    setQuantity('1');
    setPrice('');
    setVendor('');
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
        // An allowance's ceiling is its price: the client is being asked to
        // agree to "up to" this number, so that is what the schedule carries.
        unitPriceCents: cents,
        vendorName: vendor.trim() || null,
        itemType: kind === 'allowance' ? 'allowance' : 'fixed',
        projectRoomId: roomId,
        budgetMaxCents: kind === 'allowance' ? cents : null,
      });
      // The Scheduled column is derived from these lines — refresh the budget
      // alongside the schedule the add hook already invalidates.
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.budget(projectId),
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
        <label>
          <span className={LABEL_CLASS}>
            {kind === 'allowance' ? 'Up to' : 'Client price'}
          </span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={kind === 'allowance' ? 'ceiling $' : 'each $'}
            aria-label={
              kind === 'allowance' ? 'Allowance ceiling' : 'Client unit price'
            }
            className={FIELD_CLASS}
          />
        </label>
        <label className="sm:col-span-2">
          <span className={LABEL_CLASS}>Maker · optional</span>
          <input
            value={vendor}
            onChange={(event) => setVendor(event.target.value)}
            placeholder="Hollowell Woodshop"
            aria-label="Vendor"
            className={FIELD_CLASS}
          />
        </label>
      </div>

      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
        {kind === 'allowance'
          ? 'An allowance has a ceiling, so it can be signed before the piece is chosen.'
          : `It lands in ${roomName} as specified — nothing is released until you say so.`}
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
