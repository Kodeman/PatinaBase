'use client';

import { useCallback, useRef, useState } from 'react';

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  description?: string;
  hint?: string;
  className?: string;
}

export function UploadZone({
  onFiles,
  accept,
  multiple = true,
  label = 'Drop images here or click to upload',
  description,
  hint = 'JPG, PNG, WebP · 2000×2000px min · Max 10MB each',
  className = '',
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  return (
    <div
      className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-200 ${
        isDragging
          ? 'border-[var(--accent-primary)] bg-[var(--bg-hover)]'
          : 'border-[var(--color-pearl)] hover:border-[var(--accent-primary)]'
      } ${className}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />
      {description && (
        <p className="mb-2 font-body text-[1rem] text-[var(--text-body)]">{description}</p>
      )}
      <p className="font-body text-[0.85rem] text-[var(--text-muted)]">{label}</p>
      {hint && (
        <p className="mt-2 type-meta-small">
          {hint}
        </p>
      )}
    </div>
  );
}
