'use client';

import { useClientSelections } from '@/hooks/use-commercial-client';
import type { ClientSelection } from '@/lib/commercial-documents';
import { JourneyStepper } from './journey-stepper';

// Whole-dollar, no cents — matches the rest of the commercial-document rail
// (commercial-document-shell.tsx, project-commercial-summary.tsx), which
// intentionally differs from @patina/shared's formatCurrency (keeps cents).
function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function groupByRoom(selections: ClientSelection[]): Array<[string, ClientSelection[]]> {
  const groups = new Map<string, ClientSelection[]>();
  for (const selection of selections) {
    const key = selection.roomName || 'General';
    const existing = groups.get(key);
    if (existing) existing.push(selection);
    else groups.set(key, [selection]);
  }
  return Array.from(groups.entries());
}

function SelectionCard({ selection }: { selection: ClientSelection }) {
  const allowance = selection.allowance;
  const isUnresolvedAllowance = !!allowance && allowance.resolvedCents === null;
  const remainingCents =
    allowance && allowance.resolvedCents !== null ? allowance.ceilingCents - allowance.resolvedCents : null;

  return (
    <div className="flex gap-4 py-4" data-testid="client-selection-card">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[3px] bg-[var(--bg-surface)]">
        {selection.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selection.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-body-small text-[var(--text-primary)]">{selection.name}</p>
        {isUnresolvedAllowance ? (
          <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
            Allowance · up to {money(allowance!.ceilingCents)}
          </p>
        ) : (
          <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
            {money(selection.clientUnitPriceCents)}
            {remainingCents !== null && remainingCents > 0
              ? ` · ${money(remainingCents)} back to the ${selection.roomName}`
              : ''}
          </p>
        )}
        <div className="mt-2">
          <JourneyStepper status={selection.status} />
        </div>
      </div>
    </div>
  );
}

/**
 * "Your selections" — room-grouped, image-led cards for the goods a client
 * has agreed to on this project. Replaces FFEStatus + FFEPipelinePanel for
 * commercial projects.
 */
export function ClientSelections({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useClientSelections(projectId);

  if (isLoading) {
    return (
      <div className="mt-8 py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
      </div>
    );
  }

  if (isError) return null;

  const selections = data?.selections ?? [];

  return (
    <section className="mt-8" data-testid="client-selections">
      <h2 className="type-section-head">Your selections</h2>

      {selections.length === 0 ? (
        <p className="type-body-small mt-4 text-[var(--text-muted)]" data-testid="client-selections-empty">
          Nothing yet. Pieces appear here once you have agreed to them.
        </p>
      ) : (
        groupByRoom(selections).map(([roomName, items]) => (
          <div key={roomName} className="mt-6">
            <p className="type-meta text-[var(--text-muted)]">{roomName}</p>
            <div className="mt-2 divide-y divide-[var(--border-subtle)]">
              {items.map((item) => (
                <SelectionCard key={item.id} selection={item} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
