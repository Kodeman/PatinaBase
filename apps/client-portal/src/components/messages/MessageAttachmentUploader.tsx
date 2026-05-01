'use client';

import { useId, useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';

import {
  useUploadCommsAttachment,
  type CommsMessageAttachment,
} from '@patina/supabase';

const MAX_FILES = 4;
const MAX_BYTES = 25 * 1024 * 1024;

interface MessageAttachmentUploaderProps {
  threadId: string;
  attachments: CommsMessageAttachment[];
  onChange: (next: CommsMessageAttachment[]) => void;
  disabled?: boolean;
}

export function MessageAttachmentUploader({
  threadId,
  attachments,
  onChange,
  disabled = false,
}: MessageAttachmentUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = useUploadCommsAttachment();
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    setError(null);

    const incoming = Array.from(files);
    const slotsLeft = MAX_FILES - attachments.length;
    if (incoming.length > slotsLeft) {
      setError(`You can attach up to ${MAX_FILES} files per message.`);
      return;
    }

    for (const file of incoming) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds 25MB.`);
        return;
      }
    }

    const uploaded: CommsMessageAttachment[] = [];
    for (const file of incoming) {
      try {
        const result = await upload.mutateAsync({ threadId, file });
        uploaded.push(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
        break;
      }
    }
    if (uploaded.length > 0) {
      onChange([...attachments, ...uploaded]);
    }
  }

  function removeAttachment(index: number) {
    const next = attachments.filter((_, i) => i !== index);
    onChange(next);
  }

  const slotsRemaining = MAX_FILES - attachments.length;
  const canAttach = !disabled && slotsRemaining > 0 && !upload.isPending;

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" data-testid="message-attachments-preview">
          {attachments.map((att, i) => (
            <li
              key={`${att.storage_path}-${i}`}
              className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 py-1 text-xs"
            >
              {att.kind === 'image' ? (
                <ImageIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              )}
              <span className="max-w-[160px] truncate">{att.filename ?? 'attachment'}</span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                disabled={disabled}
                aria-label={`Remove ${att.filename ?? 'attachment'}`}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
          data-testid="message-attachments-input"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!canAttach}
          className="inline-flex items-center gap-1.5 type-meta text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
          data-testid="message-attachments-trigger"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {upload.isPending ? 'Uploading…' : 'Attach files'}
        </button>
        {slotsRemaining < MAX_FILES && (
          <span className="type-meta-small text-[var(--text-muted)]">
            {slotsRemaining} of {MAX_FILES} slots left
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-patina-terracotta" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
