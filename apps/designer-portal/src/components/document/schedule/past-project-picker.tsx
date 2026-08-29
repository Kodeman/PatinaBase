'use client';

/**
 * PastProjectPicker — the inline list behind birth's "from a past project"
 * starting point (Slice 03 §3/§4, R100). Typographic, no modal: the
 * designer's readable projects with a phase count each, so she can pick the
 * six-phase renovation over the three-phase refresh. Picking clones that
 * project's schedule as an as-built chain (the caller runs
 * copy_schedule_as_built via useCopyScheduleAsBuilt).
 *
 * Shared across surfaces (`surface` prop) — the spine wires it here; the
 * proposal composer reuses it later. Projects with zero phases are the
 * caller's to filter (nothing to copy); this renders whatever it's handed.
 */

export interface PastProjectOption {
  id: string;
  name: string;
  phaseCount: number;
}

export interface PastProjectPickerProps {
  projects: PastProjectOption[];
  onPick: (sourceProjectId: string) => void;
  isLoading?: boolean;
  busy?: boolean;
  /** Shared-surface hook for the later proposal reuse; no behavior split yet. */
  surface?: 'proposal' | 'project';
}

export function PastProjectPicker({ projects, onPick, isLoading = false, busy = false }: PastProjectPickerProps) {
  if (isLoading) {
    return (
      <p className="mt-[0.6rem] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        finding your projects…
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="mt-[0.6rem] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        No past project with a schedule to copy from yet.
      </p>
    );
  }

  return (
    <ul className="mt-[0.6rem] max-w-[560px]">
      {projects.map((p) => (
        <li key={p.id} className="border-t border-[var(--color-pearl)] last:border-b">
          <button
            type="button"
            onClick={() => onPick(p.id)}
            disabled={busy}
            className="flex w-full items-baseline justify-between gap-[1rem] py-[0.6rem] text-left disabled:opacity-50"
          >
            <span className="min-w-0 truncate font-heading text-[1rem] text-[var(--color-charcoal)]">
              {p.name}
            </span>
            <span className="flex-none font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
              {p.phaseCount} phase{p.phaseCount === 1 ? '' : 's'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
