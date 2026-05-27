'use client';

/**
 * Procurement → Calendar (delivery calendar) — placeholder shell.
 *
 * Full delivery-calendar view ships in Wave 2.3. Sprint 1 only wires the route
 * so the sub-nav link does not 404.
 */
export default function ProcurementCalendarPage() {
  return (
    <div className="pt-8">
      <div className="mb-6">
        <h1 className="type-section-head">Calendar</h1>
        <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
          Delivery calendar view.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border-default)] px-6 py-12 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Coming in Phase 2
        </p>
        <p className="mt-1 text-[0.8rem] text-[var(--text-muted)]">
          The delivery calendar ships in Wave 2.3. Track upcoming PO ETAs on
          the By Vendor and By Status views in the meantime.
        </p>
      </div>
    </div>
  );
}
