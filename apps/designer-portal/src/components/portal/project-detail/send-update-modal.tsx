'use client';

import { useState } from 'react';
import { Button, Textarea } from '@/components/ui/controls';

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
        <Textarea
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="Share progress, next steps, or a note for the client…"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={sending || !body.trim()}
            loading={sending}
          >
            {sending ? 'Sending…' : 'Send update'}
          </Button>
        </div>
      </div>
    </div>
  );
}
