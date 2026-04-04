'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useProductEdit } from './product-edit-context';

interface RichTextFieldProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function RichTextField({
  value,
  onSave,
  className = '',
  placeholder = 'Start writing...',
}: RichTextFieldProps) {
  const { mode } = useProductEdit();
  const ref = useRef<HTMLDivElement>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const handleBlur = useCallback(() => {
    const html = ref.current?.innerHTML || '';
    // Convert to plain text for now (storing as plain in DB)
    const text = ref.current?.innerText?.trim() || '';
    if (text !== value) {
      onSave(text);
    }
    setShowToolbar(false);
    void html;
  }, [onSave, value]);

  const handleSelect = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !ref.current?.contains(selection.anchorNode)) {
      setShowToolbar(false);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const parentRect = ref.current.getBoundingClientRect();
    setToolbarPos({
      top: rect.top - parentRect.top - 40,
      left: rect.left - parentRect.left + rect.width / 2 - 60,
    });
    setShowToolbar(true);
  }, []);

  const execFormat = useCallback((command: string) => {
    document.execCommand(command, false);
    ref.current?.focus();
  }, []);

  if (mode === 'present') {
    return (
      <div className={`font-body text-[0.95rem] leading-[1.8] text-[var(--text-body)] ${className}`}>
        {value ? (
          value.split('\n\n').map((para, i) => (
            <p key={i} className={i > 0 ? 'mt-4' : ''}>
              {para}
            </p>
          ))
        ) : (
          <p className="italic text-[var(--text-muted)]">{placeholder}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        className="max-w-[680px] cursor-text border-b border-dashed border-[rgba(196,165,123,0.2)] pb-1 font-body text-[0.95rem] leading-[1.8] text-[var(--text-body)] outline-none focus:border-[var(--accent-primary)]"
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
        onSelect={handleSelect}
        data-placeholder={placeholder}
      >
        {value}
      </div>

      {/* Floating toolbar */}
      {showToolbar && (
        <div
          className="absolute z-20 flex gap-0.5 rounded bg-[var(--text-primary)] px-2 py-1.5"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
        >
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('bold'); }}
            className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 font-body text-[0.65rem] font-bold text-[var(--bg-primary)]"
          >
            B
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('italic'); }}
            className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 font-heading text-[0.65rem] italic text-[var(--bg-primary)]"
          >
            I
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); execFormat('createLink'); }}
            className="cursor-pointer border-none bg-transparent px-1.5 py-0.5 font-body text-[0.65rem] text-[rgba(250,247,242,0.4)]"
          >
            Link
          </button>
        </div>
      )}

      <div className="mt-2 font-mono text-[0.52rem] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Select text for formatting options
      </div>
    </div>
  );
}
