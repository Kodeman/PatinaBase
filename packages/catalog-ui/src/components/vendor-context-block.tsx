'use client';

import * as React from 'react';

export type SignalStrength = 'weak' | 'moderate' | 'strong';

export interface VendorContextBlockProps {
  vendorName: string;
  vendorWebsite?: string | null;
  studioItemCount: number;
  projectsUsedCount: number;
  /** Lifetime PO value in cents (sum across non-cancelled POs). */
  lifetimeOrderValueCents: number;
  /** Unresolved damage_claims (drafted + vendor_notified). */
  damageClaimCount: number;
  signalStrength: SignalStrength;
  className?: string;
}

const STRENGTH_THEME: Record<SignalStrength, { label: string; color: string }> = {
  strong: { label: 'Strong signal', color: 'var(--color-sage, #A8B5A0)' },
  moderate: { label: 'Moderate signal', color: 'var(--color-golden-hour, #E8C547)' },
  weak: { label: 'Early signal', color: 'var(--color-dusty-blue, #8B9CAD)' },
};

/**
 * Clay-tinted vendor summary card rendered at the top of the
 * NominateToCatalogModal (PRD §5.5). The four stats give the
 * nominating designer (and the Patina reviewer reading the
 * nomination) the why-this-makes-sense context at a glance.
 */
export function VendorContextBlock({
  vendorName,
  vendorWebsite,
  studioItemCount,
  projectsUsedCount,
  lifetimeOrderValueCents,
  damageClaimCount,
  signalStrength,
  className,
}: VendorContextBlockProps) {
  const theme = STRENGTH_THEME[signalStrength];

  return (
    <section
      className={className}
      aria-label={`${vendorName} relationship context`}
      style={{
        background: 'rgba(196, 165, 123, 0.06)',
        border: '1px solid rgba(196, 165, 123, 0.25)',
        borderRadius: 6,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div
            className="type-meta-small"
            style={{
              color: 'var(--color-clay, #C4A57B)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            About this vendor
          </div>
          <div style={{ fontSize: '1.05rem', color: 'var(--text-primary, #2C2926)' }}>
            {vendorName}
          </div>
          {vendorWebsite && (
            <a
              href={vendorWebsite}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted, #8B7355)',
                textDecoration: 'underline',
              }}
            >
              {vendorWebsite}
            </a>
          )}
        </div>
        <span
          className="type-meta-small"
          style={{
            color: theme.color,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            background: 'rgba(255, 255, 255, 0.5)',
            border: `1px solid ${theme.color}`,
            borderRadius: 2,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {theme.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Studio items" value={studioItemCount.toLocaleString()} />
        <Stat
          label="Projects"
          value={projectsUsedCount.toLocaleString()}
        />
        <Stat label="Lifetime value" value={formatCompactCurrency(lifetimeOrderValueCents)} />
        <Stat
          label="Damage claims"
          value={damageClaimCount.toLocaleString()}
          highlight={damageClaimCount > 0 ? 'caution' : undefined}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'caution';
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="type-meta-small"
        style={{
          color: 'var(--text-muted, #8B7355)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 500,
          color:
            highlight === 'caution'
              ? 'var(--color-terracotta, #D4A090)'
              : 'var(--text-primary, #2C2926)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/** Compact dollar formatting per PRD §5.5: $47K, $1.2M, etc. */
function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    return `$${Math.round(dollars / 1_000)}K`;
  }
  return `$${Math.round(dollars).toLocaleString()}`;
}
