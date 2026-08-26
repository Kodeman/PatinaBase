'use client';

/**
 * ProposalVersionHistory (R44) — a quiet DM-mono strip of the proposal's
 * version chain, read straight off useProposalVersions (parent_proposal_id
 * lineage). Not a panel, not a table: one editorial row —
 *   v1 · sent Jun 4   v2 · current draft
 * — sitting under the letterhead. The version the document is currently showing
 * is marked but inert; an earlier (superseded) version is a quiet link that
 * opens it READ-ONLY in a paper DocSheet (ProposalBlocksReadOnly, the canonical
 * blocks) — the document beneath never unmounts (D1).
 */

import { useState } from 'react';
import { useProposalVersions } from '@/hooks/use-proposals';
import { DocumentAction } from './document-action';
import { DocSheet } from './overlays/doc-sheet';
import { ProposalBlocksReadOnly } from './proposal-blocks-readonly';

function versionLabel(v: {
  id: string;
  status: string;
  sent_at: string | null;
}): string {
  if (v.sent_at) {
    const d = new Date(v.sent_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `sent ${d}`;
  }
  if (v.status === 'draft') return 'draft';
  return v.status;
}

export function ProposalVersionHistory({ proposalId }: { proposalId: string }) {
  const { data: versions } = useProposalVersions(proposalId);
  const [viewing, setViewing] = useState<string | null>(null);

  // A single-version chain has no history worth showing.
  if (!versions || versions.length <= 1) return null;

  // Ascending so the strip reads v1 → v2 left to right.
  const ordered = [...versions].sort(
    (a, b) => (a.version ?? 0) - (b.version ?? 0),
  );

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {ordered.map((v) => {
          const isCurrent = v.id === proposalId;
          const label = isCurrent ? 'current' : versionLabel(v);
          // The version on screen is inert; earlier ones open read-only.
          if (isCurrent) {
            return (
              <span
                key={v.id}
                className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-clay-ink)]"
              >
                v{v.version} · {label}
              </span>
            );
          }
          return (
            <DocumentAction
              key={v.id}
              actionKey={`open-proposal-version-${v.version}`}
              variant="tertiary"
              onClick={() => setViewing(v.id)}
              className="min-h-11 px-1"
            >
              v{v.version} · {label}
            </DocumentAction>
          );
        })}
      </div>

      {viewing && (
        <DocSheet open onClose={() => setViewing(null)} title="Earlier version">
          <div className="mx-auto max-w-[680px]">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
              {(() => {
                const v = versions.find((x) => x.id === viewing);
                return v
                  ? `v${v.version} · ${versionLabel(v)} · read-only`
                  : 'read-only';
              })()}
            </p>
            {/* The canonical blocks render dark ink on the laid paper sheet (R96). */}
            <div className="mt-3 rounded-[4px] px-5 py-5">
              <ProposalBlocksReadOnly proposalId={viewing} />
            </div>
          </div>
        </DocSheet>
      )}
    </>
  );
}
