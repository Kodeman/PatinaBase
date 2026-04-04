'use client';

import {
  useProjectV2,
  useProjectRooms,
  useProjectPaymentMilestones,
  useProjectPhases,
} from '@patina/supabase';

function formatDollars(cents: number): string {
  if (!cents) return '$0';
  return `$${(cents / 100).toLocaleString()}`;
}

interface ProjectScopeDetailsProps {
  projectId: string;
}

/**
 * Client-facing project scope details panel.
 * Shows scope boundaries, room scope cards, phase timeline with revision counters,
 * and payment milestones. Only renders when v2 project data exists.
 */
export function ProjectScopeDetails({ projectId }: ProjectScopeDetailsProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = useProjectV2(projectId) as { data: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rooms } = useProjectRooms(projectId) as { data: any[] | undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: milestones } = useProjectPaymentMilestones(projectId) as { data: any[] | undefined };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phases } = useProjectPhases(projectId) as { data: any[] | undefined };

  // Only render if we have v2 project data
  if (!project?.budget_cents && !rooms?.length && !phases?.length) return null;

  const scopeBoundaries = project?.scope_boundaries || [];
  const hasScope = scopeBoundaries.length > 0 || (rooms && rooms.length > 0);

  if (!hasScope && !phases?.length && !milestones?.length) return null;

  return (
    <div className="mt-8 space-y-8">
      {/* Scope Boundaries */}
      {scopeBoundaries.length > 0 && (
        <section>
          <h3 className="mb-3 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
            Scope Boundaries
          </h3>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="mb-2 font-body text-xs font-medium text-amber-800">
              The following are not included in this project:
            </p>
            <ul className="space-y-1">
              {scopeBoundaries.map((boundary: { description: string }, i: number) => (
                <li key={i} className="flex items-start gap-2 font-body text-xs text-amber-700">
                  <span className="mt-0.5 text-amber-400">-</span>
                  {boundary.description}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Room Scope Cards */}
      {rooms && rooms.length > 0 && (
        <section>
          <h3 className="mb-3 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
            Rooms in Scope
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {rooms.map((room: {
              id: string;
              name: string;
              room_type: string | null;
              dimensions: string | null;
              budget_cents: number;
              committed_cents: number;
              ffe_categories: string[];
            }) => {
              const progress = room.budget_cents > 0
                ? Math.round(((room.committed_cents || 0) / room.budget_cents) * 100)
                : 0;

              return (
                <div
                  key={room.id}
                  className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300"
                >
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-body text-sm font-medium text-gray-900">
                      {room.name}
                    </span>
                    <span className="font-mono text-xs text-gray-400">
                      {formatDollars(room.budget_cents)}
                    </span>
                  </div>
                  {room.dimensions && (
                    <p className="mb-2 font-body text-xs text-gray-500">{room.dimensions}</p>
                  )}
                  {room.ffe_categories?.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {room.ffe_categories.map((cat: string) => (
                        <span
                          key={cat}
                          className="rounded-sm border border-gray-200 px-1.5 py-0.5 font-body text-[0.6rem] text-gray-500"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Progress bar */}
                  <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gray-400 transition-all"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 font-mono text-[0.55rem] text-gray-400">
                    {progress}% committed
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Phase Timeline with Revision Counters */}
      {phases && phases.length > 0 && (
        <section>
          <h3 className="mb-3 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
            Project Phases
          </h3>
          <div className="space-y-2">
            {phases.map((phase: {
              id: string;
              name: string;
              status: string;
              progress: number;
              revision_limit: number;
              revisions_used: number;
              start_date: string | null;
              target_end_date: string | null;
            }) => {
              const statusColors: Record<string, string> = {
                completed: 'bg-green-500',
                in_progress: 'bg-blue-500',
                pending: 'bg-gray-300',
                delayed: 'bg-amber-500',
              };

              return (
                <div
                  key={phase.id}
                  className="flex items-center gap-3 rounded-md border border-gray-200 px-4 py-3"
                >
                  <div
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      statusColors[phase.status] || statusColors.pending
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="font-body text-sm text-gray-900">{phase.name}</span>
                    {phase.start_date && (
                      <span className="ml-2 font-mono text-[0.55rem] text-gray-400">
                        {new Date(phase.start_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        {phase.target_end_date &&
                          ` – ${new Date(phase.target_end_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}`}
                      </span>
                    )}
                  </div>
                  {/* Revision counter */}
                  {phase.revision_limit > 0 && (
                    <span
                      className={`flex-shrink-0 font-mono text-[0.55rem] ${
                        phase.revisions_used >= phase.revision_limit
                          ? 'text-red-500'
                          : 'text-gray-400'
                      }`}
                    >
                      {phase.revisions_used}/{phase.revision_limit} revisions
                    </span>
                  )}
                  {/* Progress */}
                  <div className="w-16 flex-shrink-0">
                    <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full transition-all ${
                          statusColors[phase.status] || 'bg-gray-300'
                        }`}
                        style={{ width: `${phase.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Payment Milestones */}
      {milestones && milestones.length > 0 && (
        <section>
          <h3 className="mb-3 font-mono text-[0.6rem] uppercase tracking-widest text-gray-400">
            Payment Schedule
          </h3>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            {milestones.map((milestone: {
              id: string;
              label: string;
              percentage: number;
              amount_cents: number;
              trigger_condition: string | null;
              status: string;
              paid_at: string | null;
            }, i: number) => (
              <div
                key={milestone.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? 'border-t border-gray-100' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      milestone.status === 'paid'
                        ? 'bg-green-500'
                        : milestone.status === 'outstanding'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                    }`}
                  />
                  <div>
                    <span className="font-body text-sm text-gray-900">{milestone.label}</span>
                    {milestone.trigger_condition && (
                      <span className="ml-2 font-mono text-[0.55rem] text-gray-400">
                        {milestone.trigger_condition}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-serif text-sm font-medium text-gray-900">
                    {formatDollars(milestone.amount_cents)}
                  </span>
                  <span className="ml-2 font-mono text-[0.55rem] text-gray-400">
                    {milestone.percentage}%
                  </span>
                  {milestone.paid_at && (
                    <span className="ml-2 font-mono text-[0.55rem] text-green-600">
                      Paid {new Date(milestone.paid_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
