import Link from 'next/link';
import { PhaseDot } from '@/components/portal/phase-dot';
import { PHASE_CONFIG, ALL_PHASES, type ProjectPhase } from '@/types/project-ui';

interface ProjectIdentityHeaderProps {
  project: {
    name: string;
    client_name?: string;
    client_location?: string;
    startDate: string;
  };
  phase: ProjectPhase;
  projectId: string;
}

export function ProjectIdentityHeader({ project, phase, projectId }: ProjectIdentityHeaderProps) {
  const phaseConfig = PHASE_CONFIG[phase];
  const currentIndex = ALL_PHASES.indexOf(phase);

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
          {project.client_name}
          {project.client_location ? ` · ${project.client_location}` : ''}
          {' · Started '}
          {new Date(project.startDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
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
          href={`/portal/proposals`}
          className="rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-center text-[var(--text-primary)] no-underline"
          style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500 }}
        >
          Proposal
        </Link>
        <Link
          href={`/portal/clients`}
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
