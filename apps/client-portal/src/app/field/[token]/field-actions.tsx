'use client';

/**
 * Interactive rows for the field guest page (Field Coordination Wave 4).
 * The page shell stays a server component; only the tap targets that need
 * local state (Done / Problem / Confirm) are client components, kept light —
 * no client-side Supabase, just calling the server actions in ./actions.ts.
 */

import { useState, useTransition } from 'react';
import { Badge, Button, Textarea } from '@patina/design-system';
import { completeItem, confirmDelivery, reportProblem } from './actions';
import { downscalePhoto } from './downscale-photo';
import {
  formatShortDate,
  getCoordinationKindLabel,
  type FieldEffectTarget,
  type FieldLinkDelivery,
  type FieldLinkItem,
  type FieldLinkPunchItem,
  type FieldLinkTask,
} from './types';

type RowStatus = 'pending' | 'done' | 'problem';

interface FieldTaskRowProps {
  token: string;
  target: FieldEffectTarget;
  title: string;
  dueDate: string | null;
  kindLabel?: string;
  blocked?: boolean;
}

export function FieldTaskRow({ token, target, title, dueDate, kindLabel, blocked }: FieldTaskRowProps) {
  const [status, setStatus] = useState<RowStatus>('pending');
  const [summary, setSummary] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handlePhotoChange(file: File | null) {
    if (!file) {
      setPhoto(null);
      return;
    }
    setPhoto(await downscalePhoto(file));
  }

  function handleDone() {
    setError(null);
    startTransition(async () => {
      const result = await completeItem(token, target);
      if (!result.ok) {
        setError(result.error ?? 'Could not update — try again.');
        return;
      }
      setStatus('done');
      setSummary(result.summaryText ?? 'Done.');
      setRemaining(result.remainingCount ?? null);
    });
  }

  function handleProblemSubmit() {
    if (!note.trim() && !photo) {
      setError('Add a note or a photo so your designer knows what happened.');
      return;
    }
    setError(null);
    startTransition(async () => {
      let formData: FormData | undefined;
      if (photo) {
        formData = new FormData();
        formData.set('photo', photo);
      }
      const result = await reportProblem(token, target, note, formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not send — try again.');
        return;
      }
      setStatus('problem');
      setSummary(result.summaryText ?? 'Sent to your designer.');
      setRemaining(result.remainingCount ?? null);
      setWarning(result.warning ?? null);
      setShowProblemForm(false);
    });
  }

  if (status !== 'pending') {
    return (
      <li className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-4">
        <p className="type-body-small text-[var(--text-muted)] line-through">{title}</p>
        <p className="type-body-small mt-1 text-[var(--accent-primary)]">
          {status === 'done' ? '✓ ' : '→ '}
          {summary}
          {typeof remaining === 'number' ? ` · ${remaining} left` : ''}
        </p>
        {warning && <p className="type-body-small mt-1 text-[var(--color-terracotta)]">{warning}</p>}
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-4">
      <p className="type-item-name" style={{ fontSize: '1.05rem' }}>
        {title}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {dueDate && <span className="type-body-small text-[var(--text-muted)]">Due {formatShortDate(dueDate)}</span>}
        {kindLabel && (
          <Badge variant="subtle" color="neutral" size="sm">
            {kindLabel}
          </Badge>
        )}
        {blocked && (
          <Badge variant="subtle" color="warning" size="sm">
            Blocked
          </Badge>
        )}
      </div>

      {!showProblemForm ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button type="button" size="lg" className="min-h-[44px] w-full" disabled={isPending} onClick={handleDone}>
            {isPending ? 'Saving…' : 'Done'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-[44px] w-full"
            disabled={isPending}
            onClick={() => setShowProblemForm(true)}
          >
            Problem
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's going on?"
            rows={3}
            className="text-base"
          />
          <label className="type-body-small block text-[var(--text-muted)]">
            <span className="mb-1 block">Photo (optional)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              size="lg"
              className="min-h-[44px] w-full"
              disabled={isPending}
              onClick={handleProblemSubmit}
            >
              {isPending ? 'Sending…' : 'Send'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-h-[44px] w-full"
              disabled={isPending}
              onClick={() => {
                setShowProblemForm(false);
                setNote('');
                setPhoto(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && <p className="type-body-small mt-2 text-[var(--color-terracotta)]">{error}</p>}
    </li>
  );
}

interface DeliveryRowProps {
  token: string;
  vendorName: string | null;
  eventDate: string | null;
  poStatus: string | null;
  ffeItemCount: number | null;
}

export function DeliveryRow({ token, vendorName, eventDate, poStatus, ffeItemCount }: DeliveryRowProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = vendorName ?? 'Delivery';

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmDelivery(token, label);
      if (!result.ok) {
        setError(result.error ?? 'Could not confirm — try again.');
        return;
      }
      setConfirmed(true);
      setSummary(result.summaryText ?? 'Confirmed.');
    });
  }

  if (confirmed) {
    return (
      <li className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-4">
        <p className="type-body-small text-[var(--text-muted)] line-through">{label}</p>
        <p className="type-body-small mt-1 text-[var(--accent-primary)]">✓ {summary}</p>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-4">
      <p className="type-item-name" style={{ fontSize: '1.05rem' }}>
        {label}
      </p>
      <div className="type-body-small mt-1 flex flex-wrap items-center gap-x-2 text-[var(--text-muted)]">
        {eventDate && <span>Expected {formatShortDate(eventDate)}</span>}
        {typeof ffeItemCount === 'number' && ffeItemCount > 0 && (
          <span>
            · {ffeItemCount} item{ffeItemCount === 1 ? '' : 's'}
          </span>
        )}
        {poStatus && <span>· {poStatus.replace(/_/g, ' ')}</span>}
      </div>
      <Button
        type="button"
        size="lg"
        className="mt-3 min-h-[44px] w-full"
        disabled={isPending}
        onClick={handleConfirm}
      >
        {isPending ? 'Confirming…' : 'Confirm'}
      </Button>
      {error && <p className="type-body-small mt-2 text-[var(--color-terracotta)]">{error}</p>}
    </li>
  );
}

interface FieldWorkBodyProps {
  token: string;
  tasks: FieldLinkTask[];
  items: FieldLinkItem[];
  punch: FieldLinkPunchItem[];
  deliveries: FieldLinkDelivery[];
}

/**
 * Owns "On you" / punch / deliveries — everything below the header. Seeded
 * ONCE from the server-resolved DTO at first paint via a lazy useState
 * initializer, and never re-derives from fresh props afterward.
 *
 * Why: every Done / Problem / Confirm server action calls revalidatePath() on
 * this route, which makes Next.js re-render the page's server-component tree
 * with fresh props — and resolve_field_link() naturally excludes whatever was
 * just applied (a done task, a resolved item). If this component re-derived
 * its row list from props on every render, that automatic refresh would rip
 * a row (and its whole section, once it was the last one in it) out from
 * under its own "done"/"sent" confirmation instead of letting it transition
 * in place. Freezing the initial list here means the rows present at first
 * paint are the ones that stay mounted; each FieldTaskRow/DeliveryRow still
 * owns its own pending/done/problem state locally exactly as before — this
 * only freezes *which rows exist* and *which sections render*.
 */
export function FieldWorkBody({ token, tasks, items, punch, deliveries }: FieldWorkBodyProps) {
  const [initial] = useState({ tasks, items, punch, deliveries });

  const onYou = [...initial.tasks, ...initial.items];
  const nothingOpen = onYou.length === 0 && initial.punch.length === 0 && initial.deliveries.length === 0;

  return (
    <>
      {nothingOpen && (
        <p className="type-body rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-8 text-center">
          You&rsquo;re all caught up. Nothing open right now.
        </p>
      )}

      {onYou.length > 0 && (
        <section className="mb-8">
          <h2 className="type-section-head mb-3" style={{ fontSize: '1.15rem' }}>
            On you
          </h2>
          <ul className="space-y-3">
            {initial.tasks.map((task) => (
              <FieldTaskRow
                key={`task-${task.id}`}
                token={token}
                target={{ kind: 'task', id: task.id }}
                title={task.title}
                dueDate={task.due_date}
                blocked={task.status === 'blocked'}
              />
            ))}
            {initial.items.map((item) => (
              <FieldTaskRow
                key={`item-${item.id}`}
                token={token}
                target={{ kind: 'coordination', id: item.id }}
                title={item.title}
                dueDate={item.due_date}
                kindLabel={getCoordinationKindLabel(item.coordination_kind)}
              />
            ))}
          </ul>
        </section>
      )}

      {initial.punch.length > 0 && (
        <section className="mb-8">
          <h2 className="type-section-head mb-3" style={{ fontSize: '1.15rem' }}>
            Punch list
          </h2>
          <ul className="space-y-3">
            {initial.punch.map((punchItem) => (
              <FieldTaskRow
                key={`punch-${punchItem.id}`}
                token={token}
                target={{ kind: 'coordination', id: punchItem.id }}
                title={punchItem.title}
                dueDate={punchItem.due_date}
                kindLabel="Punch"
              />
            ))}
          </ul>
        </section>
      )}

      {initial.deliveries.length > 0 && (
        <section className="mb-8">
          <h2 className="type-section-head mb-3" style={{ fontSize: '1.15rem' }}>
            Deliveries
          </h2>
          <ul className="space-y-3">
            {initial.deliveries.map((delivery) => (
              <DeliveryRow
                key={`delivery-${delivery.id}`}
                token={token}
                vendorName={delivery.vendor_name}
                eventDate={delivery.event_date}
                poStatus={delivery.po_status}
                ffeItemCount={delivery.ffe_item_count}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
