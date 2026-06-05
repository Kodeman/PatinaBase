'use client';

import { useRef } from 'react';
import type { MockDocument, DocumentCategory } from '@/types/project-ui';
import { Button } from '@/components/ui/controls';

interface DocumentGridProps {
  documents: MockDocument[];
  /** When true, show the upload control. */
  editable?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => void;
}

const categoryIcon: Record<DocumentCategory, { icon: string; bg: string; color: string }> = {
  contract: { icon: '§', bg: 'rgba(196, 165, 123, 0.1)', color: 'var(--color-clay)' },
  drawing: { icon: '◇', bg: 'rgba(139, 156, 173, 0.1)', color: 'var(--color-dusty-blue)' },
  photo: { icon: '◐', bg: 'rgba(122, 155, 118, 0.1)', color: 'var(--color-sage)' },
  spec: { icon: '▤', bg: 'rgba(139, 115, 85, 0.08)', color: 'var(--text-muted)' },
};

function typeToFormat(type: string): string {
  const map: Record<string, string> = { pdf: 'PDF', img: 'IMG', doc: 'DOC', xls: 'XLSX', dwg: 'DWG', png: 'PNG', xlsx: 'XLSX' };
  return map[type] ?? type.toUpperCase();
}

export function DocumentGrid({ documents, editable = false, uploading = false, onUpload }: DocumentGridProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div id="documents">
      <h3
        style={{
          fontFamily: 'var(--font-heading)',
          fontWeight: 500,
          fontSize: '1.25rem',
          lineHeight: 1.35,
          marginBottom: '0.25rem',
        }}
      >
        Documents
      </h3>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Version-controlled project documents · Click to view or download
      </div>

      {documents.map((doc) => {
        const cat = doc.category ?? 'spec';
        const iconStyle = categoryIcon[cat];

        return (
          <div
            key={doc.id}
            className="grid items-center gap-2.5 border-b py-1.5"
            style={{
              gridTemplateColumns: '18px 1fr auto auto',
              borderColor: 'rgba(229, 226, 221, 0.3)',
              cursor: 'pointer',
            }}
          >
            {/* Icon */}
            <div
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm"
              style={{
                background: iconStyle.bg,
                color: iconStyle.color,
                fontSize: '0.55rem',
              }}
            >
              {iconStyle.icon}
            </div>

            {/* Name */}
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              {doc.title}
            </div>

            {/* Version + date */}
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.48rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
              }}
            >
              {doc.version ? `${doc.version} · ` : ''}{doc.date}
            </div>

            {/* Format */}
            <div
              style={{
                fontFamily: 'var(--font-meta)',
                fontSize: '0.58rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              {typeToFormat(doc.type)}
            </div>
          </div>
        );
      })}

      {documents.length === 0 && (
        <div className="py-6 text-center type-body italic text-[var(--text-muted)]" style={{ fontSize: '0.82rem' }}>
          No documents yet.
        </div>
      )}

      {editable && onUpload && (
        <div className="mt-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : '+ Upload Document'}
          </Button>
        </div>
      )}
    </div>
  );
}
