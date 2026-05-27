/**
 * Studio LayerView stub. Filled in Sprint 2 (S2.1) with the By Vendor /
 * By Category views, promotion banner, and bulk-promotion modal.
 */
export default function StudioLibraryPage() {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-10 text-center">
      <div
        className="type-meta-small mb-3"
        style={{ color: 'var(--color-sage, #A8B5A0)' }}
      >
        Coming in Sprint 2
      </div>
      <h2 className="type-section-head mb-2">Studio Library</h2>
      <p className="mx-auto max-w-md font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
        Items that have proven out in real projects — vendor contact stored,
        lead times documented, ready to specify again. Promote from your
        personal library when a piece earns it.
      </p>
    </div>
  );
}
