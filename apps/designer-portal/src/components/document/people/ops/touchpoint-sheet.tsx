'use client';

/**
 * TouchpointSheet (Track C) — compose a nurture touchpoint, in the People Room's
 * paper idiom. Reuses the existing `useCreateTouchpoint` data path (the same
 * mutation the /portal nurture page uses): pick a kind (check-in / seasonal /
 * anniversary / product match / referral ask), a date, and a reason; it writes
 * a `client_nurture_touchpoints` row and the directory's dormancy ranking eases
 * once the touch lands. Touchpoints are a CLIENT relationship — only client
 * parties carry a `designer_client_id` (the directory `person_id` IS that id).
 *
 * Zero shadows (D4); the Room beneath never unmounts (D1).
 */

import { useState } from 'react';
import { useCreateTouchpoint, type TouchpointType } from '@patina/supabase';
import { RoomSheet } from '../../rooms/room-sheet';
import { todayYmd } from '@/lib/document/format';
import { DateTextInput } from '../../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../../document-action';

const KINDS: Array<[TouchpointType, string]> = [
  ['check_in', 'Personal check-in'],
  ['seasonal', 'Seasonal / holiday'],
  ['anniversary', 'Project anniversary'],
  ['product_match', 'A piece that fits them'],
  ['referral_ask', 'A referral ask'],
];

export function TouchpointSheet({
  open,
  designerClientId,
  clientName,
  defaultReason,
  onClose,
  onScheduled,
}: {
  open: boolean;
  /** The directory `person_id` of a client row = its designer_clients.id. */
  designerClientId: string | null;
  clientName: string;
  /** Seed the reason line from the queue's "why" copy. */
  defaultReason?: string;
  onClose: () => void;
  onScheduled: (message: string) => void;
}) {
  const create = useCreateTouchpoint();
  const [kind, setKind] = useState<TouchpointType>('check_in');
  const [date, setDate] = useState(todayYmd());
  const [reason, setReason] = useState(defaultReason ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!designerClientId) {
      setError(
        'Touchpoints are for clients — open this person to reach them another way.',
      );
      return;
    }
    setError(null);
    create.mutate(
      {
        designerClientId,
        touchpointType: kind,
        suggestedDate: date || undefined,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: () => {
          onScheduled(
            `Touchpoint scheduled for ${clientName.split(/\s+/)[0] || clientName}.`,
          );
          onClose();
        },
        onError: (e) =>
          setError(
            e instanceof Error
              ? e.message
              : 'Could not schedule the touchpoint.',
          ),
      },
    );
  };

  return (
    <RoomSheet
      open={open}
      onClose={onClose}
      title={`Reach out to ${clientName}`}
    >
      <h2 className="font-heading text-[1.4rem] font-medium leading-tight text-[var(--color-charcoal)]">
        Reach out to {clientName}
      </h2>
      <p className="mt-1 text-[0.76rem] text-[var(--color-aged-oak)]">
        A warm touch keeps the relationship alive — pick the occasion and when
        it should go.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-1.5 block font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Occasion
          </label>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map(([key, label]) => {
              const on = kind === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  aria-pressed={on}
                  className={`min-h-11 rounded-[16px] border px-3 py-1.5 text-[0.72rem] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                    on
                      ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.12)] text-[var(--color-charcoal)]'
                      : 'border-[var(--color-pearl)] bg-white text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            When
          </span>
          <DateTextInput
            value={date || null}
            onChange={(value) => setDate(value ?? '')}
            ariaLabel="When"
            className="rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.78rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
        </div>

        <div>
          <label
            htmlFor="touchpoint-reason"
            className="mb-1.5 block font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
          >
            Why now (a note to yourself)
          </label>
          <textarea
            id="touchpoint-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A lake house someday — that someday may be now."
            className="w-full resize-y rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.78rem] leading-relaxed text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
        </div>

        {error && <p className="text-[0.72rem] text-[#C77B6E]">{error}</p>}

        <DocumentActionGroup
          surfaceKey="people"
          regionKey="touchpoint-sheet"
          className="justify-end pt-1"
        >
          <DocumentAction
            actionKey="cancel-touchpoint"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <DocumentAction
            actionKey="schedule-touchpoint"
            variant="primary"
            onClick={submit}
            disabled={create.isPending}
            loading={create.isPending}
            loadingLabel="Scheduling…"
          >
            Schedule the touchpoint
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </RoomSheet>
  );
}
