import Link from 'next/link';
import { PhaseDot } from '@/components/portal/phase-dot';
import { PHASE_CONFIG, ALL_PHASES, normalizePhaseSlug, type ProjectPhase } from '@/types/project-ui';

interface ProjectIdentityHeaderProps {
  project: {
    name: string;
    client_name?: string;
    client_location?: string;
    site_address?: string | null;
    startDate?: string | null;
    start_date?: string | null;
    client_id?: string | null;
    client?: { full_name?: string | null; display_name?: string | null; email?: string | null } | null;
    proposal?: { id: string } | null;
  };
  phase: ProjectPhase;
  projectId: string;
}

function formatStartDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Date-only strings (YYYY-MM-DD) parse as UTC midnight; rendering them in a
  // timezone behind UTC shifts the displayed day back by one ("Started May 28"
  // for a 2026-05-29 start). Parse date-only values in local time instead.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
  const date = dateOnly
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProjectIdentityHeader({ project, phase, projectId }: ProjectIdentityHeaderProps) {
  const canonicalPhase = normalizePhaseSlug(phase);
  const phaseConfig = PHASE_CONFIG[canonicalPhase];
  const currentIndex = ALL_PHASES.indexOf(canonicalPhase);
  const startedLabel = formatStartDate(project.startDate ?? project.start_date);

  return (
    <div
      className="mb-6 grid items-start gap-8 border-b pb-5"
      style={{ borderColor: 'var(--border-default)', gridTemplateColumns: '1fr auto' }}
    >
      <div>
        {/* Phase indicator */}
        <div className="mb-1.5 flex items-center gap-2">
          <PhaseDot phase={phase} />
          <span
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.68rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: phaseConfig.color,
            }}
          >
            {phaseConfig.label}
          </span>
        </div>

        {/* Project title */}
        <h1
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 400,
            fontSize: 'clamp(1.5rem, 3vw, 1.9rem)',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            marginBottom: '0.1rem',
          }}
        >
          {project.name}
        </h1>

        {/* Client + location + date */}
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            marginBottom: '0.75rem',
          }}
        >
          {(() => {
            // Derive client name from the joined `client` profile embed
            // (full_name/display_name/email) — `client_name` is rarely set
            // directly. Join only the present parts so there's never a
            // dangling "· Started …" when the client/location is missing.
            const clientName =
              project.client_name ||
              project.client?.full_name ||
              project.client?.display_name ||
              project.client?.email ||
              '';
            const where = project.site_address || project.client_location || '';
            const parts = [clientName, where].filter(Boolean);
            if (startedLabel) parts.push(`Started ${startedLabel}`);
            return parts.join(' · ');
          })()}
        </div>

        {/* Phase progress dots */}
        <div className="flex items-center gap-1.5">
          {ALL_PHASES.map((p, i) => {
            const isDone = i < currentIndex;
            const isActive = i === currentIndex;
            return (
              <div key={p} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: isDone
                      ? 'var(--color-sage)'
                      : isActive
                        ? 'var(--color-clay)'
                        : 'var(--color-pearl)',
                  }}
                />
                {i < ALL_PHASES.length - 1 && (
                  <span
                    className="inline-block h-[2px] w-[18px] shrink-0"
                    style={{
                      background: isDone ? 'var(--color-sage)' : 'var(--color-pearl)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-1.5">
        <Link
          href={
            project.proposal?.id
              ? `/portal/proposals/${project.proposal.id}`
              : `/portal/proposals/new?projectId=${projectId}`
          }
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-center text-[var(--text-primary)] no-underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Proposal
        </Link>
        <Link
          href={project.client_id ? `/portal/clients/${project.client_id}` : `/portal/clients`}
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-center text-[var(--text-primary)] no-underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Client
        </Link>
        <Link
          href={`/portal/rooms`}
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-center text-[var(--text-primary)] no-underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Room Scan
        </Link>
        <Link
          href={`#documents`}
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-center text-[var(--text-primary)] no-underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Documents
        </Link>
      </div>
    </div>
  );
}
