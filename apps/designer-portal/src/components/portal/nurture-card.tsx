'use client';

import { useState } from 'react';
import { PortalButton } from './button';

interface NurtureCardProps {
  clientName: string;
  projectContext: string;
  lastContact: string;
  suggestedTiming: string;
  reason: string;
  isPriority?: boolean;
  onSendNote: () => void;
  onSchedule?: () => void;
  onDismiss?: () => void;
}

export function NurtureCard({
  clientName,
  projectContext,
  lastContact,
  suggestedTiming,
  reason,
  isPriority = false,
  onSendNote,
  onSchedule,
  onDismiss,
}: NurtureCardProps) {
  return (
    <div
      className="mb-4 rounded-lg p-5"
      style={{
        border: isPriority
          ? '1.5px solid var(--accent-primary)'
          : '1px solid var(--color-pearl)',
        background: isPriority ? 'rgba(196, 165, 123, 0.02)' : 'transparent',
      }}
    >
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="type-label" style={{ fontSize: '0.88rem' }}>
            {clientName}
          </div>
          <div className="type-label-secondary">
            {projectContext} {'\u00B7'} Last contact: {lastContact}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.52rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: isPriority ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}
        >
          Suggested: {suggestedTiming}
        </span>
      </div>

      <p
        className="my-3"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-body)',
        }}
      >
        {reason}
      </p>

      <div className="flex gap-2">
        <PortalButton variant={isPriority ? 'primary' : 'secondary'} onClick={onSendNote}>
          Send Personalized Note
        </PortalButton>
        {onSchedule && (
          <PortalButton variant="secondary" onClick={onSchedule}>
            Schedule for Later
          </PortalButton>
        )}
        {onDismiss && (
          <PortalButton variant="ghost" onClick={onDismiss}>
            Dismiss
          </PortalButton>
        )}
      </div>
    </div>
  );
}

interface NurtureComposeModalProps {
  clientName: string;
  defaultContent?: string;
  onClose: () => void;
  onSent: () => void;
  // Persists + best-effort dispatches the note; throws on failure.
  onSend: (content: string) => Promise<void>;
}

// CLI-08: compose modal for a personalized nurture note. The textarea body is
// POSTed by the page to /api/clients/[id]/nurture-send, which writes
// content + email_sent_at + status='sent' and best-effort dispatches the email.
export function NurtureComposeModal({
  clientName,
  defaultContent = '',
  onClose,
  onSent,
  onSend,
}: NurtureComposeModalProps) {
  const [content, setContent] = useState(defaultContent);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = content.trim().length >= 10 && !sending;

  const submit = async () => {
    if (!canSend) return;
    setError(null);
    setSending(true);
    try {
      await onSend(content.trim());
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send note');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            Send a note to {clientName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[1.1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p
          className="mb-4 type-body"
          style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}
        >
          A personal check-in. We&apos;ll email this to the client and mark the
          touchpoint sent.
        </p>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Write a warm, personal note…"
          className="w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
          style={{ borderColor: 'var(--border-default)' }}
        />
        <p className="mt-1 text-[0.7rem] text-[var(--text-muted)]">
          Minimum 10 characters
          {content.trim().length > 0 && content.trim().length < 10
            ? ` (${content.trim().length}/10)`
            : ''}
        </p>

        {error && (
          <p
            className="mt-3 rounded-md border-2 p-2 type-body text-[0.8rem]"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
            style={{ background: canSend ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {sending ? 'Sending…' : 'Send Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
