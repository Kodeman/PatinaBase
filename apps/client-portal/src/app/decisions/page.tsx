'use client';

import { useAllDecisions } from '@patina/supabase';
import type { ClientDecision } from '@patina/supabase';
import { DecisionCardClient } from '@/components/decision-card-client';
import { StrataMark } from '@/components/strata-mark';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function ClientDecisionsPage() {
  const { data: decisions, isLoading } = useAllDecisions();

  const now = new Date();
  const pending = (decisions ?? []).filter(
    (d: ClientDecision) => d.status === 'pending'
  );
  const overdue = pending.filter(
    (d) => d.due_date && new Date(d.due_date) < now
  );
  const awaiting = pending.filter(
    (d) => !d.due_date || new Date(d.due_date) >= now
  );
  const resolved = (decisions ?? []).filter(
    (d: ClientDecision) => d.status === 'responded'
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">
        Your Decisions
      </h1>
      <p className="type-body mt-2">
        Choices your designer needs from you to keep your project moving forward.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {!isLoading && pending.length === 0 && resolved.length === 0 && (
        <div className="py-16 text-center">
          <p className="type-body-small">No decisions yet. Your designer will send choices here when they need your input.</p>
        </div>
      )}

      {/* Overdue decisions */}
      {overdue.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-terracotta">
            Overdue ({overdue.length})
          </h2>
          <div className="space-y-0">
            {overdue.map((decision: ClientDecision) => (
              <Link key={decision.id} href={`/decisions/${decision.id}`} className="block no-underline">
                <DecisionCardClient decision={decision} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Awaiting response decisions */}
      {awaiting.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">
            Awaiting Your Response ({awaiting.length})
          </h2>
          <div className="space-y-0">
            {awaiting.map((decision: ClientDecision) => (
              <Link key={decision.id} href={`/decisions/${decision.id}`} className="block no-underline">
                <DecisionCardClient decision={decision} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && resolved.length > 0 && (
        <StrataMark variant="mini" />
      )}

      {/* Resolved decisions */}
      {resolved.length > 0 && (
        <section className={pending.length === 0 ? 'mt-10' : 'mt-2'}>
          <h2 className="type-meta mb-4">
            Resolved ({resolved.length})
          </h2>
          <div className="space-y-0">
            {resolved.map((decision: ClientDecision) => (
              <DecisionCardClient key={decision.id} decision={decision} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
