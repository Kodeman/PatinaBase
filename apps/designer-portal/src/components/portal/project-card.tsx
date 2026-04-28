'use client';

/**
 * ProjectCard — compact card used in the client-profile page's
 * "Active & Past Projects" section.
 *
 * Percent-complete is derived from `current_phase` using the canonical
 * ALL_PHASE_SLUGS order (6 phases). Each completed phase accounts for
 * ~16 pp of progress; an active phase is treated as half-complete for that
 * step. When `current_phase` is absent we fall back to status:
 *   draft → 5%, active → 40%, on_hold → 40%, completed → 100%, cancelled → 0%
 */

import Link from 'next/link';
import { ProgressBar } from './progress-bar';

const PHASE_ORDER = [
  'consultation',
  'concept_development',
  'design_refinement',
  'procurement',
  'installation',
  'final_walkthrough',
] as const;

const STATUS_FALLBACK_PERCENT: Record<string, number> = {
  draft: 5,
  active: 40,
  on_hold: 40,
  completed: 100,
  cancelled: 0,
};

const projectStatusColors: Record<string, string> = {
  active: 'var(--color-sage)',
  completed: 'var(--text-muted)',
  on_hold: 'var(--color-golden-hour)',
  cancelled: 'var(--color-terracotta)',
};

function derivePercent(status: string | null, currentPhase: string | null): number {
  if (status === 'completed') return 100;
  if (status === 'cancelled') return 0;

  if (currentPhase) {
    const idx = PHASE_ORDER.indexOf(currentPhase as (typeof PHASE_ORDER)[number]);
    if (idx !== -1) {
      // Each phase = 100/6 ≈ 16.7 pp; active phase is half-credit
      const step = 100 / PHASE_ORDER.length;
      return Math.round(idx * step + step * 0.5);
    }
  }

  return STATUS_FALLBACK_PERCENT[status ?? ''] ?? 40;
}

export interface ProjectCardProject {
  id: string;
  name: string;
  status: string | null;
  current_phase: string | null;
  start_date: string | null;
  target_end_date: string | null;
}

export function ProjectCard({ project }: { project: ProjectCardProject }) {
  const statusColor =
    projectStatusColors[project.status as string] || 'var(--text-muted)';

  const started = project.start_date
    ? new Date(project.start_date).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : null;
  const ended = project.target_end_date
    ? new Date(project.target_end_date).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      })
    : null;

  const percent = derivePercent(project.status, project.current_phase);

  return (
    <div
      style={{
        padding: '0.75rem 1rem',
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          {project.name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: statusColor,
          }}
        >
          {project.status}
        </span>
      </div>

      {(started || ended) && (
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}
        >
          {started && ended
            ? `${started} — ${ended}`
            : started
              ? `Started ${started}`
              : `Due ${ended}`}
        </div>
      )}

      {project.current_phase && (
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
            marginBottom: '0.5rem',
          }}
        >
          Phase: {project.current_phase}
        </div>
      )}

      {/* Percent-complete bar */}
      <div className="mb-2" data-testid="project-progress-bar">
        <ProgressBar progress={percent} />
      </div>

      <Link
        href={`/portal/projects/${project.id}`}
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--accent-primary)',
          textDecoration: 'none',
        }}
      >
        View Project &rarr;
      </Link>
    </div>
  );
}
