/**
 * Owner-attribution byline for shared-workspace list rows (Studio Wave 5).
 * Callers gate rendering on `useStudioHasTeam()` — solo designers never even
 * mount this, so there is zero visible change for the common (personal-
 * studio) case. Renders nothing when the row's designer didn't resolve
 * (legacy data with no joined profile) — never a placeholder.
 *
 * Deliberately shared across both design idioms in this app (the pre-
 * Document `portal/` zone and the Document-model `document/` surfaces) —
 * it takes no app-specific tokens, just the CSS custom properties both
 * idioms already resolve against (see globals.css: `--text-muted` IS
 * `--color-aged-oak`).
 */

interface OwnerBylineProps {
  name: string | null | undefined;
  avatarUrl?: string | null;
  className?: string;
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function OwnerByline({ name, avatarUrl, className }: OwnerBylineProps) {
  if (!name) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[var(--text-muted,var(--color-aged-oak))] ${className ?? ''}`}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-hover,rgba(196,165,123,0.12))] font-mono text-[7px] font-semibold uppercase tracking-wide"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          monogram(name)
        )}
      </span>
      {name}
    </span>
  );
}
