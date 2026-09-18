'use client';

/**
 * Field-triage card (Field Coordination Wave 5) — one needs_review inbound text
 * as a Desk stack card. It states what came in ("'can't get the valve till
 * Tues' — Sal (Plumbing) · Maple St") and the proposed effect in words ("Move
 * 'Rough-in plumbing' to Tue Jul 14"), then offers [Apply] / [Dismiss]. A delay
 * carries a small date editor so the designer can adjust before applying — the
 * edited effect goes straight through review_sms_message → apply_field_effect.
 *
 * Paper face + status tab, matching the Desk FolderCard idiom; zero shadows (D4).
 */

import { useState } from 'react';
import { useReviewSmsMessage, useTakeSmsThread, useHandBackSmsThread, useExtendSmsPause, useUser, smsThreadActionError, smsResultWords, type SmsReviewMessage } from '@patina/supabase';
import { getFieldTradeLabel } from '@patina/types';
import { describeFieldEffect, isDelayEffect } from '@/lib/document/field-sms';
import { DateTextInput } from '../date-text-input';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export function SmsReviewCard({ message }: { message: SmsReviewMessage }) {
  const review = useReviewSmsMessage();
  const take = useTakeSmsThread();
  const handBack = useHandBackSmsThread();
  const extend = useExtendSmsPause();
  const { user } = useUser();
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = take.isPending || handBack.isPending || extend.isPending;
  const act = async (mutation: typeof take) => {
    setActionError(null);
    try { await mutation.mutateAsync(message.id); }
    catch (error) { setActionError(smsThreadActionError(error)); }
  };
  const parsed = message.parsed_intent;
  const [editedDate, setEditedDate] = useState<string>(
    (parsed?.new_date as string | undefined) ?? '',
  );

  const trade = getFieldTradeLabel(message.party?.trade ?? undefined);
  const who = [message.party?.display_name ?? 'A field party', trade || null]
    .filter(Boolean)
    .join(' · ');
  const effectLine = describeFieldEffect(parsed, message.target_title);
  // Review-only handoffs carry routing facts, not an effect to replay.
  const reviewOnly = parsed?.type === 'report_condition' || parsed?.intent === 'report_condition' ||
    parsed?.target?.kind === undefined || parsed?.reason === 'delivery_expected';
  const canApply = !!parsed && !!message.party_id && !reviewOnly;
  const delay = isDelayEffect(parsed);

  const apply = () => {
    // A delay with an edited date carries the adjusted effect; otherwise apply
    // exactly what was parsed.
    const effect =
      delay && editedDate
        ? { ...(parsed ?? {}), new_date: editedDate }
        : undefined;
    review.mutate({
      messageId: message.id,
      action: 'apply',
      effect,
      projectId: message.project_id,
    });
  };

  const dismiss = () => {
    review.mutate({
      messageId: message.id,
      action: 'dismiss',
      projectId: message.project_id,
    });
  };

  return (
    <div className="relative mt-[26px]">
      {/* Status tab — the field-triage accent (golden-hour). */}
      <div
        className="absolute -top-[26px] left-0 flex h-[26px] items-center rounded-t-[7px] px-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white"
        style={{ background: 'var(--color-golden-hour)' }}
      >
        Field text · needs a person
      </div>

      <div className="rounded-[0_8px_8px_8px] border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 outline outline-[1.5px] outline-offset-[-1.5px] outline-[rgba(232,197,71,0.5)]">
        <p className="font-heading text-[1.15rem] italic leading-snug text-[var(--text-primary)]">
          “{message.body?.trim() || 'A field photo'}”
        </p>
        <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
          {who}
          {message.project?.name ? ` · ${message.project.name}` : ''}
        </p>

        <div className="mt-3 space-y-1 text-[12px] text-[var(--text-muted)]">
          <p>{message.owner_user_id ? (message.owner_name ?? 'A studio member') : 'Unowned'}</p>
          <p>{message.applied_effect ? (message.applied_effect.applied === false ? 'Reviewed — no change needed' : 'Changes saved') : 'Saved for a closer look'}</p>
          {message.twilio_status && ['sent', 'queued', 'deferred'].includes(message.twilio_status) && <p>{smsResultWords({ status: message.twilio_status as 'sent' | 'queued' | 'deferred' })}</p>}
          {message.twilio_status === 'failed' && <p>{smsResultWords({ status: 'failed', provider_code: message.error_code ?? undefined })}</p>}
          <p>{message.notified_name ? 'Told ' + message.notified_name : "Nobody’s been told yet"}</p>
          <p>{message.paused_until && new Date(message.paused_until).getTime() > Date.now()
            ? 'Automatic replies paused until ' + new Date(message.paused_until).toLocaleString()
            : 'Automatic replies are not paused'}</p>
        </div>
        <DocumentActionGroup surfaceKey="desk" regionKey="field-sms-owner" aria-label="Who is following up" className="mt-3">
          <DocumentAction actionKey="take-field-text" onClick={() => void act(take)} disabled={busy}>Take it</DocumentAction>
          <DocumentAction actionKey="hand-back-field-text" onClick={() => void act(handBack)} disabled={busy || !user || message.owner_user_id !== user.id}>Hand back</DocumentAction>
          <DocumentAction actionKey="extend-field-pause" onClick={() => void act(extend)} disabled={busy || !user || message.owner_user_id !== user.id}>Extend</DocumentAction>
          {actionError && <p role="alert">{actionError}</p>}
        </DocumentActionGroup>

        {!reviewOnly && effectLine && (
          <div className="mt-4 border-t border-[var(--border-default)] pt-3.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
              Proposed
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-body)]">
              {effectLine}
            </p>

            {/* Minimal edit: a delay lets the designer adjust the date. */}
            {delay && (
              <label className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                Move to
                <DateTextInput
                  value={editedDate || null}
                  onChange={(value) => setEditedDate(value ?? '')}
                  ariaLabel="Adjust the new date"
                  className="rounded-[4px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-primary)] focus:border-[var(--color-clay)] focus:outline-none"
                />
              </label>
            )}
          </div>
        )}

        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="field-sms-review"
          className="mt-4"
          aria-label="Field text review actions"
        >
          <DocumentAction
            actionKey="apply-field-text"
            variant="primary"
            onClick={apply}
            disabled={!canApply || review.isPending}
            loading={review.isPending && review.variables?.action === 'apply'}
            loadingLabel="Applying…"
          >
            Apply
          </DocumentAction>
          <DocumentAction
            actionKey="dismiss-field-text"
            variant="tertiary"
            onClick={dismiss}
            disabled={review.isPending}
          >
            Dismiss
          </DocumentAction>
          {!canApply && (
            <span className="text-[11px] text-[var(--text-muted)]">
              No effect to apply — dismiss, or reply by text.
            </span>
          )}
          {review.isError && (
            <span className="text-[11px] text-[var(--color-terracotta-ink)]">
              Couldn’t save — try again.
            </span>
          )}
        </DocumentActionGroup>
      </div>
    </div>
  );
}
