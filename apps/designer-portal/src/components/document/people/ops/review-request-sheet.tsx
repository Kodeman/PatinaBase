'use client';

/**
 * ReviewRequestSheet (Track C) — request a review for a completed project, in
 * the People Room's paper idiom. Reuses the existing `useCreateReviewRequest`
 * data path (the same mutation the /portal reviews page uses): an optional
 * personal message + an optional send date; with no date it sends now (status
 * `sent`), with a date it queues (status `queued`). Writes a `client_reviews`
 * row keyed to the client's `designer_client_id`.
 *
 * Zero shadows (D4); the Room beneath never unmounts (D1).
 */

import { useState } from 'react';
import { useCreateReviewRequest } from '@patina/supabase';
import { RoomSheet } from '../../rooms/room-sheet';
import { DateTextInput } from '../../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../../document-action';

export function ReviewRequestSheet({
  open,
  designerClientId,
  projectId,
  clientName,
  projectName,
  onClose,
  onRequested,
}: {
  open: boolean;
  designerClientId: string | null;
  projectId: string | null;
  clientName: string;
  projectName?: string;
  onClose: () => void;
  onRequested: (message: string) => void;
}) {
  const create = useCreateReviewRequest();
  const [message, setMessage] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!designerClientId) {
      setError('This project has no linked client record to request from.');
      return;
    }
    setError(null);
    create.mutate(
      {
        designerClientId,
        projectId: projectId ?? undefined,
        customMessage: message.trim() || undefined,
        scheduledFor: scheduledFor || undefined,
      },
      {
        onSuccess: () => {
          const first = clientName.split(/\s+/)[0] || clientName;
          onRequested(
            scheduledFor
              ? `Review request queued for ${first}.`
              : `Review request sent to ${first}.`,
          );
          onClose();
        },
        onError: (e) =>
          setError(
            e instanceof Error ? e.message : 'Could not send the request.',
          ),
      },
    );
  };

  return (
    <RoomSheet
      open={open}
      onClose={onClose}
      title={`Request a review from ${clientName}`}
    >
      <h2 className="font-heading text-[1.4rem] font-medium leading-tight text-[var(--color-charcoal)]">
        Request a review from {clientName}
      </h2>
      <p className="mt-1 text-[0.76rem] text-[var(--color-aged-oak)]">
        {projectName ? `For ${projectName}. ` : ''}
        The words a happy client writes are what bring the next one.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="review-message"
            className="mb-1.5 block font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]"
          >
            A personal note (optional)
          </label>
          <textarea
            id="review-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="It was such a joy bringing your space to life — if you have a moment, I'd be grateful for a few words."
            className="w-full resize-y rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.78rem] leading-relaxed text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
        </div>

        <div>
          <span className="mb-1.5 block font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
            Send when (leave blank to send now)
          </span>
          <DateTextInput
            value={scheduledFor || null}
            onChange={(value) => setScheduledFor(value ?? '')}
            ariaLabel="Send when (leave blank to send now)"
            className="rounded-[6px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.78rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
          />
        </div>

        {error && <p className="text-[0.72rem] text-[#C77B6E]">{error}</p>}

        <DocumentActionGroup
          surfaceKey="people"
          regionKey="review-request-sheet"
          className="justify-end pt-1"
        >
          <DocumentAction
            actionKey="cancel-review-request"
            variant="tertiary"
            onClick={onClose}
          >
            Cancel
          </DocumentAction>
          <DocumentAction
            actionKey={
              scheduledFor ? 'queue-review-request' : 'send-review-request'
            }
            variant="primary"
            onClick={submit}
            disabled={create.isPending}
            loading={create.isPending}
            loadingLabel="Sending…"
          >
            {scheduledFor ? 'Queue the request' : 'Send the request'}
          </DocumentAction>
        </DocumentActionGroup>
      </div>
    </RoomSheet>
  );
}
