'use client';

/**
 * Procurement → Receiving — placeholder shell.
 *
 * Full receiving dashboard ships in Wave 2.3. Sprint 1 only wires the route
 * so the sub-nav link does not 404.
 */
export default function ProcurementReceivingPage() {
  return (
    <div className="pt-8">
      <div className="mb-6">
        <h1 className="type-section-head">Receiving</h1>
        <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
          Inbound shipments + delivery reconciliation.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Coming in Phase 2
        </p>
        <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
          Receiving dashboard ships in Wave 2.3. Track shipment status on the
          By Status board in the meantime.
        </p>
      </div>
    </div>
  );
}
