'use client';

import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/portal/action-button';

// Reject-with-note popover. A note is REQUIRED (the review_agent_task RPC also
// enforces it and merges it into payload.feedback for the re-run). Cmd/Ctrl+Enter
// submits; Escape closes. While open, the inbox keyboard hook is suspended so
// typing never triggers a row action.

interface RejectNotePopoverProps {
  open: boolean;
  submitting?: boolean;
  onSubmit: (note: string) => void;
  onClose: () => void;
}

export function RejectNotePopover({
  open,
  submitting = false,
  onSubmit,
  onClose,
}: RejectNotePopoverProps) {
  const [note, setNote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      // focus after paint
      const id = requestAnimationFrame(() => textareaRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open) return null;

  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  return (
    <div
      data-testid="reject-note-popover"
      className="absolute right-0 top-full z-30 mt-2 w-80 border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Rejection note"
    >
      <div className="type-meta-small mb-2">Rejection note — required</div>
      <textarea
        ref={textareaRef}
        data-testid="reject-note-textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        rows={3}
        placeholder="Why is this rejected? Feeds back into the re-run."
        className="type-body-small w-full resize-none border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="type-meta-small text-[var(--text-subtle)]">⌘↵ to submit</span>
        <div className="flex items-center gap-3">
          <ActionButton variant="muted" onClick={onClose} disabled={submitting}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="danger"
            data-testid="reject-note-submit"
            onClick={submit}
            disabled={!canSubmit}
          >
            Reject
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
