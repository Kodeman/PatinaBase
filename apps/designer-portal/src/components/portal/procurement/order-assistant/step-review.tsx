'use client';

/**
 * Order Assistant v2 — Review step.
 *
 * The informational half of the old single-scroll flow (PRD §6 steps 1–2):
 * open the vendor's trade portal and copy a clean item manifest for pasting
 * into the vendor's order form. Purely presentational — copy state lives in
 * the panel shell so the per-(vendor, project) context reset clears it.
 */

import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/controls';
import { ConfigurationSnapshotCard } from '@/components/document/configuration-snapshot-card';
import {
  extractConfigurationSnapshotEnvelope,
  formatConfigurationSnapshotForClipboard,
} from '@/components/document/rooms/piece/custom-commission-model';
import {
  formatDollars,
  itemTradeCents,
  type OrderAssistantFFEItem,
  type OrderAssistantProject,
  type OrderAssistantVendor,
} from './types';

/** Studio ship-to surface is out of scope for Wave 1.4; PRD shows a static placeholder. */
export const SHIP_TO_PLACEHOLDER = 'Middlewest Studio · Madison WI';

export function formatItemDetailsForClipboard(
  vendor: OrderAssistantVendor,
  project: OrderAssistantProject,
  items: OrderAssistantFFEItem[]
): string {
  const lines: string[] = [];
  lines.push(`${vendor.name} — ${project.name}`);
  lines.push('');
  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. ${item.name}`);
    if (item.room) lines.push(`   Room: ${item.room}`);
    lines.push(`   Ship to: ${SHIP_TO_PLACEHOLDER}`);
    // Vendor-facing amounts are TRADE cost (00186) — never client prices.
    lines.push(`   ${formatDollars(itemTradeCents(item))}`);
    formatConfigurationSnapshotForClipboard(item).forEach((line) =>
      lines.push(`   ${line}`),
    );
    lines.push('');
  });
  const total = items.reduce((sum, i) => sum + itemTradeCents(i), 0);
  lines.push(`Total: ${formatDollars(total)}`);
  return lines.join('\n');
}

export interface StepReviewProps {
  vendor: OrderAssistantVendor;
  ffeItems: OrderAssistantFFEItem[];
  copyState: 'idle' | 'copied' | 'error';
  onCopyDetails: () => void;
}

export function StepReview({ vendor, ffeItems, copyState, onCopyDetails }: StepReviewProps) {
  return (
    <>
      {/* Open vendor portal */}
      <section
        className="mb-3 rounded-[5px] border px-3 py-3"
        style={{
          borderColor: 'rgba(196,165,123,0.2)',
          background: 'rgba(196,165,123,0.06)',
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="type-meta-small text-[var(--color-clay,#C4A57B)]">
            Open vendor portal
          </div>
          {vendor.trade_portal_url ? (
            <a
              href={vendor.trade_portal_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
            >
              Open in new tab
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono text-[0.58rem] text-[var(--text-muted)]">
              No trade portal on file
            </span>
          )}
        </div>
        <div className="text-[0.7rem] leading-relaxed text-[var(--text-muted)]">
          {vendor.trade_portal_url ?? '—'}
          {vendor.trade_account_email ? ` · ${vendor.trade_account_email}` : ''}
        </div>
      </section>

      {/* Copy item details */}
      <section className="mb-3 rounded-[5px] border border-[var(--border-default)] px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="type-meta-small text-[var(--text-primary)]">
            Copy item details
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopyDetails}
          >
            <Copy className="h-3 w-3" />
            {copyState === 'copied'
              ? 'Copied!'
              : copyState === 'error'
                ? 'Copy failed'
                : 'Copy details'}
          </Button>
        </div>
        <div
          className="border-l-2 pl-3 text-[0.7rem] leading-[1.7] text-[var(--text-primary)]"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {ffeItems.map((item, idx) => {
            const configuration = extractConfigurationSnapshotEnvelope(item);
            return (
              <div key={item.id} className={idx > 0 ? 'mt-3' : ''}>
                <div>
                  <strong>{idx + 1}.</strong> {item.name}
                  {item.room ? ` · ${item.room}` : ''}
                </div>
                <div className="text-[var(--text-muted)]">
                  Ship to: {SHIP_TO_PLACEHOLDER}
                </div>
                {configuration && (
                  <div className="mt-2">
                    <ConfigurationSnapshotCard
                      snapshot={configuration.snapshot}
                      configurationHash={configuration.hash}
                      approvedHash={configuration.approvedHash}
                      lockedAt={configuration.lockedAt}
                      label="Order configuration"
                      compact
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
