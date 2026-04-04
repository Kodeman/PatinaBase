'use client';

import { useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { useProductEdit } from './product-edit-context';

interface InlineEditableProps {
  value: string;
  onSave: (value: string) => void;
  tag?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}

export function InlineEditable({
  value,
  onSave,
  tag: Tag = 'span',
  className = '',
  placeholder = 'Click to edit...',
  multiline = false,
}: InlineEditableProps) {
  const { mode } = useProductEdit();
  const ref = useRef<HTMLElement>(null);
  const originalValue = useRef(value);

  // Sync external value changes
  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value || '';
    }
    originalValue.current = value;
  }, [value]);

  const handleBlur = useCallback(() => {
    const text = ref.current?.innerText?.trim() || '';
    if (text !== originalValue.current) {
      onSave(text);
      originalValue.current = text;
    }
  }, [onSave]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Revert
        if (ref.current) {
          ref.current.innerText = originalValue.current || '';
        }
        ref.current?.blur();
      }
      if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        ref.current?.blur();
      }
    },
    [multiline]
  );

  // Present mode: just render text
  if (mode === 'present') {
    return (
      <Tag className={className}>
        {value || <span className="italic text-[var(--text-muted)]">{placeholder}</span>}
      </Tag>
    );
  }

  // Edit mode: contentEditable
  return (
    <Tag
      ref={ref as React.RefObject<HTMLElement & HTMLDivElement>}
      className={`${className} cursor-text border-b border-dashed border-transparent transition-colors hover:border-[rgba(196,165,123,0.4)] focus:border-[var(--accent-primary)] focus:outline-none`}
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
    >
      {value}
    </Tag>
  );
}
