'use client';

import { useState } from 'react';
import { Button } from '@patina/design-system';
import { useAcceptTradeScope, useClientSelections } from '@/hooks/use-commercial-client';
import type { ClientSelection } from '@/lib/commercial-documents';
import { JourneyStepper, TradeJourneyStepper } from './journey-stepper';

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
 * A trade presence card — one per scope section, standing in for the work
 * itself rather than a piece of furniture. No image, no productId, no FF&E
 * journey: the trade rail tracks progress through the work
 * (selection.tradeJourney), not procurement. "Accept the finished work"
 * appears only once the studio has marked the scope substantially complete —
 * the same gate the accept route itself enforces server-side.
 */
function TradeSelectionCard({ selection, projectId }: { selection: ClientSelection; projectId: string }) {
  const proposalId = selection.instrument?.proposalId ?? null;
  const journey = selection.tradeJourney ?? 'none';
  const canAccept = journey === 'substantially_complete' && !!proposalId;
  const accept = useAcceptTradeScope(proposalId, projectId);
  const [name, setName] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAccept() {
    if (name.trim().length < 2) {
      setError('Type your full name to accept the finished work.');
      return;
    }
    setError(null);
    try {
      await accept.mutateAsync(name.trim());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept this work right now.');
    }
  }

  return (
    <div className="flex gap-4 py-4" data-testid="client-trade-selection-card">
      <div className="min-w-0 flex-1">
        <p className="type-body-small text-[var(--text-primary)]">{selection.name}</p>
        <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
          {money(selection.clientLineTotalCents)}
        </p>
        <div className="mt-2">
          <TradeJourneyStepper state={journey} />
        </div>

        {canAccept && (
          <div className="mt-3">
            {showForm ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="name"
                  className="rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 type-body-small text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
                  data-testid="accept-trade-scope-name"
                />
                <Button
                  size="sm"
                  onClick={onAccept}
                  disabled={accept.isPending}
                  data-testid="accept-trade-scope-confirm"
                >
                  {accept.isPending ? 'Accepting…' : 'Confirm acceptance'}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowForm(true)}
                data-testid="accept-trade-scope"
              >
                Accept the finished work
              </Button>
            )}
            {error && (
              <p className="type-meta-small mt-1 text-patina-terracotta" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Your selections" — room-grouped, image-led cards for the goods a client
 * has agreed to on this project. Replaces FFEStatus + FFEPipelinePanel for
 * commercial projects. Trade presence lines (kind:'trade') render as
 * TradeSelectionCard instead — no image, a trade journey instead of a
 * goods journey, and the accept act when the work is substantially complete.
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
              {items.map((item) =>
                item.kind === 'trade' ? (
                  <TradeSelectionCard key={item.id} selection={item} projectId={projectId} />
                ) : (
                  <SelectionCard key={item.id} selection={item} />
                ),
              )}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
