/**
 * Catalog LayerView stub. Filled in Sprint 3 (S3.1) with the four tabs
 * (Browse / For projects / Founding Circle / Teach), Aesthete-driven sort,
 * and Vendor Nomination CTA.
 */
export default function CatalogLibraryPage() {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-10 text-center">
      <div
        className="type-meta-small mb-3"
        style={{ color: 'var(--color-clay, #C4A57B)' }}
      >
        Coming in Sprint 3
      </div>
      <h2 className="type-section-head mb-2">Patina Catalog</h2>
      <p className="mx-auto max-w-md font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
        The shared marketplace. One-click ordering, Aesthete-tuned
        recommendations, makers worth keeping. Nominated by designers,
        onboarded by Patina.
      </p>
    </div>
  );
}
