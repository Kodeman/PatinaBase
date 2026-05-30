'use client';

import { useState } from 'react';

interface SendUpdateModalProps {
  open: boolean;
  sending?: boolean;
  onClose: () => void;
  onSend: (body: string) => void;
}

/**
 * Lightweight composer launched from the Edit Mode bar's "Send Update" button.
 * Posts a message to the project's client-visible thread (the page owns the
 * thread-resolve + send via useStartProjectThread + useSendMessage).
 */
export function SendUpdateModal({ open, sending = false, onClose, onSend }: SendUpdateModalProps) {
  const [body, setBody] = useState('');

  if (!open) return null;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onSend(text);
    setBody('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Send Client Update
        </h3>
        <p className="type-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Posts a message to the project thread your client can see.
        </p>
        <textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Share progress, next steps, or a note for the client…"
          className="w-full rounded-[3px] border p-2"
          style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] px-4 py-2 text-[var(--text-muted)]"
            style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || !body.trim()}
            className="rounded-[3px] px-4 py-2 text-white disabled:opacity-50"
            style={{ background: 'var(--color-clay)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 500 }}
          >
            {sending ? 'Sending…' : 'Send update'}
          </button>
        </div>
      </div>
    </div>
  );
}
