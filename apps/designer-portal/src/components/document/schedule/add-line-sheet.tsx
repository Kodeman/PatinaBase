'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { PlusCircle } from 'lucide-react';
import { useCreateNamedProjectNeed } from '@patina/supabase';
import type { FfeAssignmentScope } from '@patina/types';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useAddComFabricLine } from '../buying/com-piece';

const FIELD_CLASS =
  'min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2.5 text-[13px] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)]';

const LABEL_CLASS =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

/**
 * Rough $ is an internal ballpark (Q7), never an allowance — it writes
 * `roughCents` and never touches `budgetMaxCents` or `itemType`. Parses a
 * dollar string typed in the field; returns null when it's empty or not a
 * usable, non-negative number.
 */
function parseRoughDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function formatRoughCents(cents: number): string {
  return `~$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/**
 * Enter in the Line field adds the line and starts the next one; the sheet
 * stays open until Esc or `Done adding`. The caller names where lines land:
 * `assignmentScope` is sent as given (`room` carries `roomId`; `throughout`
 * and `unassigned` carry none). The room's display name is never compared.
 */
export function AddLineSheet({
  open,
  projectId,
  roomId,
  roomName,
  assignmentScope,
  onClose,
}: {
  open: boolean;
  projectId: string;
  roomId: string | null;
  roomName: string;
  assignmentScope: FfeAssignmentScope;
  onClose: () => void;
}) {
  const addLine = useCreateNamedProjectNeed();
  const addFabric = useAddComFabricLine();
  const lineRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [roughDollars, setRoughDollars] = useState('');
  const [takesCom, setTakesCom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);

  const trimmedName = name.trim();
  const parsedQuantity = Math.max(1, Math.round(Number(quantity) || 1));
  const roughCents = parseRoughDollarsToCents(roughDollars);
  const pending = addLine.isPending || addFabric.isPending;
  const canSave = trimmedName.length > 0 && !pending;

  const save = async () => {
    if (!canSave) return;
    setError(null);
    const submittedName = name;
    try {
      const request = {
        projectId,
        name: trimmedName,
        quantity: parsedQuantity,
        itemType: 'tbd' as const,
        assignmentScope,
        roomId: assignmentScope === 'room' ? roomId : null,
        disposition: 'candidate' as const,
        source: 'named-need' as const,
        ...(roughCents !== null ? { roughCents } : {}),
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
          project_room_id: request.roomId,
          assignment_scope: request.assignmentScope,
        });
      }
      // The next line starts here. A name typed while this one saved is kept.
      setName((current) => (current === submittedName ? '' : current));
      setQuantity('1');
      setRoughDollars('');
      setTakesCom(false);
      requestKey.current = null;
      lineRef.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The line could not be added.',
      );
    }
  };

  const onLineKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  };

  return (
    <DocSheet
      open={open}
      onClose={onClose}
      icon={PlusCircle}
      title="Add a line"
      pageLabel={roomName}
      initialFocusRef={lineRef}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={LABEL_CLASS}>Line</span>
          <input
            ref={lineRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onLineKeyDown}
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
          <span className={LABEL_CLASS}>Rough $</span>
          <input
            type="number"
            min={0}
            value={roughDollars}
            onChange={(event) => setRoughDollars(event.target.value)}
            placeholder="4800"
            aria-label="Rough $"
            className={FIELD_CLASS}
          />
          {roughCents !== null && (
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
              {formatRoughCents(roughCents)}
            </span>
          )}
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
        <DocumentAction
          actionKey="close-add-schedule-line"
          variant="secondary"
          onClick={onClose}
        >
          Done adding
        </DocumentAction>
      </DocumentActionGroup>
    </DocSheet>
  );
}
