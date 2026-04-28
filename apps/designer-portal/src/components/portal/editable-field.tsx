'use client';

import { useEffect, useRef, useState } from 'react';

interface EditableFieldBaseProps {
  editing: boolean;
  onCommit: (next: string) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

interface EditableTextFieldProps extends EditableFieldBaseProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
}

/**
 * Edit Mode field primitive.
 *
 * Renders read-only text by default. When the surrounding `editing` flag is on,
 * shows an inline input that commits on blur or Enter and reverts on Escape.
 * Use across Project Detail zones to unlock per-field inline editing.
 */
export function EditableText({
  value,
  editing,
  onCommit,
  onCancel,
  placeholder = '—',
  multiline = false,
  className = '',
}: EditableTextFieldProps) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span className={`type-body ${className}`}>
        {value || <span className="text-[var(--text-muted)]">{placeholder}</span>}
      </span>
    );
  }

  const commit = async () => {
    if (draft === value) return;
    setSaving(true);
    try {
      await onCommit(draft);
    } finally {
      setSaving(false);
    }
  };

  const sharedClass = `w-full rounded-[3px] border bg-white px-2 py-1 font-body text-[0.85rem] outline-none ${className}`;

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value);
            onCancel?.();
          }
        }}
        rows={3}
        className={sharedClass}
        style={{ borderColor: saving ? 'var(--color-golden-hour, #E8C547)' : 'var(--border-default)' }}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          onCancel?.();
        }
      }}
      className={sharedClass}
      style={{ borderColor: saving ? 'var(--color-golden-hour, #E8C547)' : 'var(--border-default)' }}
    />
  );
}

interface EditableCurrencyProps extends EditableFieldBaseProps {
  cents: number;
}

export function EditableCurrency({
  cents,
  editing,
  onCommit,
  onCancel,
  className = '',
}: EditableCurrencyProps) {
  return (
    <EditableText
      value={cents > 0 ? String(cents / 100) : ''}
      editing={editing}
      onCommit={(v) => onCommit(String(Math.round((Number(v) || 0) * 100)))}
      onCancel={onCancel}
      placeholder="$0"
      className={className}
    />
  );
}
