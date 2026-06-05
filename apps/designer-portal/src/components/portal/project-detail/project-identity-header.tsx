import Link from 'next/link';
import { PhaseDot } from '@/components/portal/phase-dot';
import { PageActionBar } from '@/components/portal';
import { Button } from '@/components/ui/controls';
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
  // AP-C0: activated projects persist a simplified phase vocab (e.g. 'concept')
  // that isn't a PHASE_CONFIG key; an un-normalized value crashes here. Keep the
  // normalizePhaseSlug guard exactly as-is so PHASE_CONFIG[canonicalPhase] and
  // the dots index are always valid.
  const canonicalPhase = normalizePhaseSlug(phase);
  const phaseConfig = PHASE_CONFIG[canonicalPhase];
  const currentIndex = ALL_PHASES.indexOf(canonicalPhase);
  const startedLabel = formatStartDate(project.startDate ?? project.start_date);

  // Phase indicator lives in `meta` (not the kit `status` chip) deliberately:
  // phases use the rich per-phase --phase-* palette via phaseConfig.color, which
  // the 6 semantic StatusBadge tones can't reproduce. Keeping the existing
  // PhaseDot + uppercase label preserves exact phase-color fidelity.
  const phaseIndicator = (
    <div className="flex items-center gap-2">
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
  );

  // Client + location + date cluster (conditional logic preserved verbatim).
  const clientLine = (() => {
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
    const text = parts.join(' · ');
    if (!text) return null;
    return (
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.82rem',
          color: 'var(--text-muted)',
        }}
      >
        {text}
      </span>
    );
  })();

  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {phaseIndicator}
      {clientLine}
      {/* Phase progress dots — moved INTACT from the prior grid block. */}
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
  );

  const actions = (
    <>
      <Button variant="secondary" size="sm" asChild>
        <Link
          href={
            project.proposal?.id
              ? `/portal/proposals/${project.proposal.id}`
              : `/portal/proposals/new?projectId=${projectId}`
          }
          className="no-underline"
        >
          Proposal
        </Link>
      </Button>
      <Button variant="secondary" size="sm" asChild>
        <Link
          href={project.client_id ? `/portal/clients/${project.client_id}` : `/portal/clients`}
          className="no-underline"
        >
          Client
        </Link>
      </Button>
      <Button variant="secondary" size="sm" asChild>
        <Link href={`/portal/rooms`} className="no-underline">
          Room Scan
        </Link>
      </Button>
      <Button variant="secondary" size="sm" asChild>
        <Link href={`#documents`} className="no-underline">
          Documents
        </Link>
      </Button>
    </>
  );

  return <PageActionBar meta={meta} actions={actions} />;
}
