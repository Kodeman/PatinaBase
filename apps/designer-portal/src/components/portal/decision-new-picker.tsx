'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClients } from '@patina/supabase';
import { X } from 'lucide-react';
import type { DesignerClient } from '@patina/supabase';
import { Button, IconButton, Input } from '@/components/ui/controls';

interface DecisionNewPickerProps {
  onClose: () => void;
}

function clientLabel(c: DesignerClient): string {
  return (
    c.client?.full_name ||
    c.client_name ||
    c.client_email ||
    'Unnamed client'
  );
}

/**
 * PT-D-2-T1-4 — "+ New Decision" picker.
 *
 * The dashboard CTA used to dump the designer on /portal/clients with no
 * indication of what to do next. This modal lets them pick the client the
 * decision is for, then routes straight to the full-page composer
 * (/portal/clients/[id]/decisions/new) where project + options are set.
 */
export function DecisionNewPicker({ onClose }: DecisionNewPickerProps) {
  const router = useRouter();
  const { data: clients, isLoading } = useClients();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = (clients ?? []) as DesignerClient[];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => clientLabel(c).toLowerCase().includes(q));
  }, [clients, query]);

  const choose = (clientId: string) => {
    router.push(`/portal/clients/${clientId}/decisions/new`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New decision"
        className="w-full max-w-[520px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.2rem' }}>
            New decision
          </h3>
          <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </div>

        <p
          className="mb-4 type-body"
          style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}
        >
          Choose the client this decision is for. You&apos;ll set the options and
          (optionally) link a project on the next step.
        </p>

        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients..."
          className="mb-3"
          // intentional autofocus: search field in a just-opened picker modal
          autoFocus
        />

        {isLoading ? (
          <p className="py-8 text-center type-body italic text-[var(--text-muted)]">
            Loading clients…
          </p>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-md border-2 border-dashed py-8 text-center"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <p className="type-body text-[0.85rem] text-[var(--text-muted)]">
              {clients && clients.length > 0
                ? 'No clients match that search.'
                : 'No clients yet. Add a client before creating a decision.'}
            </p>
          </div>
        ) : (
          <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => choose(c.id)}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:border-[var(--accent-primary)]"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <span
                  className="truncate type-label"
                  style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}
                >
                  {clientLabel(c)}
                </span>
                <span className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
                  {c.status}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
