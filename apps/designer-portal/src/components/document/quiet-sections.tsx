/**
 * Quiet active-section bodies for stages that carry little data yet.
 * Deliberately minimal and honest (DECISIONS.md I10 — flagged for design
 * review): Discovery fills in later slices; Care grows its Guide, reviews,
 * and cadence per R5 in Slice 6.
 */

export function DiscoverySection({ clientName }: { clientName: string }) {
  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">
          Discovery
        </h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          In discovery
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-body)]">
        Working with {clientName}. Nothing on file yet.
      </p>
    </section>
  );
}

export function CareSection({ completedLabel }: { completedLabel: string | null }) {
  return (
    <section>
      <div className="mb-1.5 mt-5 flex items-baseline justify-between">
        <h2 className="font-heading text-[16px] font-medium text-[var(--color-charcoal)]">Care</h2>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Ongoing
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-[var(--text-body)]">
        {completedLabel ? `Project completed · ${completedLabel}.` : 'Project completed.'}
      </p>
    </section>
  );
}
