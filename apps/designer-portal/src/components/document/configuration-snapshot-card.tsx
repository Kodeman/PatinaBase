'use client';

import {
  assessSnapshotSafety,
  summarizeCommissionSnapshot,
  type SnapshotSafety,
} from './rooms/piece/custom-commission-model';

export interface ConfigurationSnapshotCardProps {
  snapshot: unknown;
  configurationHash?: string | null;
  approvedHash?: string | null;
  lockedAt?: string | null;
  label?: string;
  compact?: boolean;
}

const SAFETY_TONE: Record<SnapshotSafety['kind'], string> = {
  draft: 'var(--color-aged-oak)',
  approved: 'var(--color-sage)',
  issued: 'var(--color-dusty-blue)',
  requires_reapproval: 'var(--color-terracotta)',
};

function shortHash(hash: string | null): string | null {
  if (!hash) return null;
  const withoutPrefix = hash.replace(/^sha256:/, '');
  return withoutPrefix.length > 12
    ? `${withoutPrefix.slice(0, 8)}…${withoutPrefix.slice(-4)}`
    : withoutPrefix;
}

/**
 * One visual contract for the same saved selection in the project spec,
 * vendor quote review, and purchase-order handoff. The hash and lock language
 * make it explicit that an issued order is not reading live Library data.
 */
export function ConfigurationSnapshotCard({
  snapshot,
  configurationHash = null,
  approvedHash = null,
  lockedAt = null,
  label = 'Configuration snapshot',
  compact = false,
}: ConfigurationSnapshotCardProps) {
  const summary = summarizeCommissionSnapshot(snapshot);
  const hash = configurationHash ?? summary.hash;
  const safety = assessSnapshotSafety({
    workingHash: hash,
    approvedHash,
    lockedAt,
  });
  const details = [
    summary.dimensions,
    summary.materialFinish,
    summary.fabricator ? `Maker · ${summary.fabricator}` : null,
    summary.quote,
    summary.drawingCount > 0
      ? `${summary.drawingCount} drawing${summary.drawingCount === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean) as string[];

  return (
    <section
      aria-label={label}
      className={`border-l-2 pl-3 ${compact ? 'py-1' : 'py-2.5'}`}
      style={{ borderColor: SAFETY_TONE[safety.kind] }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="doc-type-meta uppercase tracking-[0.09em] text-[var(--text-muted)]">
          {label}
          {summary.revision ? ` · revision ${summary.revision}` : ''}
        </p>
        {(lockedAt || hash) && (
          <p className="doc-type-meta uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {lockedAt ? 'locked' : 'hash'} {shortHash(hash)}
          </p>
        )}
      </div>
      <p className="mt-1 font-heading text-[15px] font-medium text-[var(--color-charcoal)]">
        {summary.title}
      </p>
      {details.length > 0 && (
        <p className="doc-type-body mt-1 leading-relaxed text-[var(--text-muted)]">
          {details.join(' · ')}
        </p>
      )}
      <p
        role={safety.kind === 'requires_reapproval' ? 'alert' : 'status'}
        className="doc-type-body mt-1.5 leading-snug"
        style={{ color: SAFETY_TONE[safety.kind] }}
      >
        {safety.message}
      </p>
    </section>
  );
}
