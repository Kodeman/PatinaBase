'use client';

/**
 * Shared view chrome for the People Room — the Playfair title + the quiet
 * sub-line (prototype .view-title / .view-sub), and a placeholder block the
 * Wave-0 skeleton uses until a track fills its slot. Typography-first, zero
 * shadows (D4).
 */

export function ViewHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-heading text-[1.6rem] font-medium leading-tight text-[var(--color-charcoal)]">
        {title}
      </h1>
      {sub && <p className="mt-0.5 text-[0.78rem] text-[var(--color-aged-oak)]">{sub}</p>}
    </div>
  );
}

/** A quiet "arrives in Track N" notice for an unfilled view slot. */
export function ViewPlaceholder({ track }: { track: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
      <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
        This view is bound in <span className="font-mono">{track}</span>. The Room shell, the
        directory, and the navigation contract are in place around it.
      </p>
    </div>
  );
}
