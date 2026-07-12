'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AgentTask } from '@patina/agent-queue';
import { ActionButton } from '@/components/portal/action-button';

// Edit-then-approve drawer. The reviewer edits the task payload as JSON; on
// submit the parsed object is sent as p_payload_patch alongside an "approved"
// decision (review_agent_task merges payload || patch). Invalid JSON blocks
// submit. While open, the inbox keyboard hook is suspended.

interface EditPayloadDrawerProps {
  open: boolean;
  task: AgentTask | null;
  submitting?: boolean;
  onSubmit: (payloadPatch: Record<string, unknown>) => void;
  onClose: () => void;
}

export function EditPayloadDrawer({
  open,
  task,
  submitting = false,
  onSubmit,
  onClose,
}: EditPayloadDrawerProps) {
  const initial = useMemo(
    () => (task ? JSON.stringify(task.payload ?? {}, null, 2) : '{}'),
    [task],
  );
  const [text, setText] = useState(initial);

  useEffect(() => {
    if (open) setText(initial);
  }, [open, initial]);

  const parsed = useMemo<{ ok: boolean; value?: Record<string, unknown>; error?: string }>(() => {
    try {
      const value = JSON.parse(text);
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'Payload must be a JSON object' };
      }
      return { ok: true, value: value as Record<string, unknown> };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [text]);

  if (!open || !task) return null;

  const canSubmit = parsed.ok && !submitting;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="Edit payload">
      <div
        className="absolute inset-0 bg-[rgba(44,41,38,0.28)]"
        onClick={onClose}
        aria-hidden
      />
      <div
        data-testid="edit-payload-drawer"
        className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_0_40px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between border-b border-[var(--border-default)] px-6 py-4">
          <div>
            <div className="type-meta-small mb-1">Edit &amp; approve</div>
            <h2 className="type-item-name">{task.summary || task.task_type}</h2>
          </div>
          <ActionButton variant="muted" onClick={onClose} disabled={submitting}>
            Close
          </ActionButton>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          <label className="type-meta-small mb-2 block">Payload (JSON)</label>
          <textarea
            data-testid="edit-payload-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                e.preventDefault();
                onSubmit(parsed.value!);
              }
            }}
            spellCheck={false}
            className="h-[60vh] w-full resize-none border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 py-2 text-[0.8rem] leading-relaxed text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            style={{ fontFamily: 'var(--font-meta)' }}
          />
          {!parsed.ok && (
            <p className="type-body-small mt-2 text-[var(--color-error)]">{parsed.error}</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-default)] px-6 py-4">
          <span className="type-meta-small text-[var(--text-subtle)]">⌘↵ to approve</span>
          <ActionButton
            variant="success"
            data-testid="edit-payload-submit"
            onClick={() => canSubmit && onSubmit(parsed.value!)}
            disabled={!canSubmit}
          >
            Approve with edits
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
