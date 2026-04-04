'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClients } from '@patina/supabase';
import type { DesignerClient } from '@patina/supabase';
import { SearchInput } from '@/components/portal/search-input';
import { FilterRow } from '@/components/portal/filter-row';
import { LoadingStrata } from '@/components/portal/loading-strata';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

const avatarColors: Record<string, { bg: string; fg: string }> = {
  lead: { bg: 'rgba(139, 156, 173, 0.12)', fg: 'var(--color-dusty-blue)' },
  proposal: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  active: { bg: 'rgba(122, 155, 118, 0.12)', fg: 'var(--color-sage)' },
  completed: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  nurture: { bg: 'rgba(196, 165, 123, 0.1)', fg: 'var(--accent-primary)' },
};

const filterOptions = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'decision', label: 'Needs Decision' },
  { key: 'archived', label: 'Archived' },
];

export default function MessagesPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: rawClients, isLoading } = useClients();
  const clients = (Array.isArray(rawClients) ? rawClients : []) as DesignerClient[];

  // Filter clients by search
  const filtered = search
    ? clients.filter((c) => {
        const name = c.client?.full_name || c.client_name || '';
        return name.toLowerCase().includes(search.toLowerCase());
      })
    : clients;

  // Sort by most recently updated
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  return (
    <div className="pt-8">
      <div className="mb-6">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 400,
            color: 'var(--text-primary)',
          }}
        >
          Messages
        </h1>
      </div>

      <FilterRow options={filterOptions} active={filter} onChange={setFilter} />

      <div className="mb-4" style={{ maxWidth: '280px' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search conversations\u2026"
        />
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : sorted.length > 0 ? (
        <div>
          {sorted.map((client) => {
            const name =
              client.client?.full_name ||
              client.client_name ||
              client.client_email ||
              'Unknown Client';
            const stage = client.status || 'active';
            const colors = avatarColors[stage] || avatarColors.active;
            const lastUpdate = new Date(client.updated_at);
            const isToday = lastUpdate.toDateString() === new Date().toDateString();

            return (
              <div
                key={client.id}
                className="relative grid cursor-pointer items-center gap-4 border-b border-[var(--border-subtle)] py-4 transition-colors hover:bg-[var(--bg-hover)]"
                style={{
                  gridTemplateColumns: '44px 1fr auto',
                  transitionDuration: 'var(--duration-fast)',
                }}
                onClick={() => router.push(`/portal/clients/${client.id}/messages`)}
              >
                {/* Avatar */}
                <div
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-full"
                  style={{
                    background: colors.bg,
                    color: colors.fg,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '0.82rem',
                  }}
                >
                  {getInitials(name)}
                </div>

                {/* Content */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="type-label" style={{ fontSize: '0.88rem' }}>
                      {name}
                    </span>
                  </div>
                  {client.notes && (
                    <div
                      className="mt-0.5 max-w-[420px] truncate"
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.82rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {client.notes.split('\n')[0]?.slice(0, 80)}
                    </div>
                  )}
                  <div
                    className="mt-1"
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.52rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {client.location || ''} \u00B7 {stage}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="text-right">
                  <div
                    style={{
                      fontFamily: 'var(--font-meta)',
                      fontSize: '0.52rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {isToday
                      ? lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : lastUpdate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No conversations yet.
        </p>
      )}
    </div>
  );
}
