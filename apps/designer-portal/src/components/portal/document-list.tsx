import type { MockDocument } from '@/types/project-ui';

interface DocumentListProps {
  documents: MockDocument[];
  onView?: (doc: MockDocument) => void;
  onAdd?: () => void;
}

const typeConfig: Record<string, { bg: string; color: string; label: string }> = {
  pdf: { bg: 'rgba(199, 123, 110, 0.1)', color: 'var(--color-terracotta)', label: 'PDF' },
  img: { bg: 'rgba(196, 165, 123, 0.1)', color: 'var(--accent-primary)', label: 'IMG' },
  doc: { bg: 'rgba(139, 156, 173, 0.1)', color: 'var(--color-dusty-blue)', label: 'DOC' },
  xls: { bg: 'rgba(139, 156, 173, 0.1)', color: 'var(--color-dusty-blue)', label: 'XLS' },
};

export function DocumentList({ documents, onView, onAdd }: DocumentListProps) {
  return (
    <div>
      {documents.map((doc) => {
        const cfg = typeConfig[doc.type] ?? typeConfig.doc;

        return (
          <div
            key={doc.id}
            className="grid items-center gap-3 border-b py-2.5"
            style={{
              gridTemplateColumns: '36px 1fr auto',
              borderColor: 'rgba(229, 226, 221, 0.4)',
            }}
          >
            {/* Type icon */}
            <div
              className="flex h-[42px] w-[36px] items-center justify-center rounded type-meta-small"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </div>

            {/* Name + meta */}
            <div>
              <div className="font-body text-[0.85rem] font-medium text-[var(--text-primary)]">
                {doc.title}
              </div>
              <div className="type-meta-small">
                {doc.date} · {doc.size}
              </div>
            </div>

            {/* Action */}
            {onView && (
              <button
                className="type-btn-text bg-transparent px-2 py-1 text-[0.72rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => onView(doc)}
              >
                View
              </button>
            )}
          </div>
        );
      })}

      {onAdd && (
        <div className="mt-3">
          <button
            className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]"
            onClick={onAdd}
          >
            + Add Document
          </button>
        </div>
      )}
    </div>
  );
}
