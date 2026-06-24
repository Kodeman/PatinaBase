'use client';

/**
 * The "Preview as the [clients]" full-screen layer (R43). Reuses the
 * proposal-grain mirror rail and the client-mirror's thin charcoal banner so the
 * two previews read as one session. Esc closes here (and stops the document's
 * put-down handler beneath). The document beneath stays mounted (D1).
 *
 * Extracted from proposal-instruments.tsx so both the letterhead and the
 * ProposalWatch view can mount it without a circular import.
 */

import { ProposalPreviewRail } from './drafting/proposal-mirror';

export function ProposalPreview({
  proposalId,
  clientName,
  onClose,
}: {
  proposalId: string;
  clientName: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`What ${clientName} sees`}
      data-testid="proposal-preview"
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {/* The thin charcoal banner — same frame as the project mirror. */}
      <div className="flex items-baseline justify-between bg-[var(--color-charcoal)] px-7 py-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.75)]">
          You&rsquo;re seeing what they see
        </p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to your copy
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-8 min-[980px]:px-16">
        <ProposalPreviewRail proposalId={proposalId} clientName={clientName} />
      </div>
    </div>
  );
}
