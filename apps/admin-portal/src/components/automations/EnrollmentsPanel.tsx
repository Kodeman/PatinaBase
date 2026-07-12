'use client';

import { useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAutomationEnrollments,
  useEnrollInAutomation,
  useUnenrollFromAutomation,
  type AutomationEnrollment,
} from '@patina/supabase/hooks';

const PAGE_SIZE = 25;

const statusColors: Record<AutomationEnrollment['status'], string> = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  unsubscribed: 'bg-gray-100 text-gray-500',
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Designer-onboarding program, Wave 4 — full enrollment management for a
 * single automated_sequences row: paginated table (email, step, status,
 * next send), "enroll by email" input, per-row unenroll. Backed by the
 * dedicated api/admin/comms/automations/[id]/enrollments endpoint via
 * @patina/supabase's useAutomationEnrollments/useEnrollInAutomation/
 * useUnenrollFromAutomation hooks. Additive to (does not replace) the
 * existing "Recent Enrollments" summary card on this page, which is backed
 * by the cheaper useSequenceEnrollments (embedded-in-detail-GET) hook.
 */
export function EnrollmentsPanel({ sequenceId }: { sequenceId: string }) {
  const [email, setEmail] = useState('');
  const [page, setPage] = useState(0);

  const { data, isLoading } = useAutomationEnrollments(sequenceId, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const enroll = useEnrollInAutomation(sequenceId);
  const unenroll = useUnenrollFromAutomation(sequenceId);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleEnroll = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    enroll.mutate(
      { email: trimmed },
      {
        onSuccess: () => {
          setEmail('');
          setPage(0);
        },
      }
    );
  };

  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-patina-charcoal">Enrollments</h3>
        <span className="text-xs text-patina-clay-beige">{total} total</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleEnroll();
          }}
          placeholder="Enroll by email"
          className="flex-1 px-3 py-1.5 text-sm border border-patina-clay-beige/30 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-patina-mocha-brown/20 focus:border-patina-mocha-brown"
        />
        <button
          onClick={handleEnroll}
          disabled={!email.trim() || enroll.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-patina-mocha-brown rounded-lg hover:bg-patina-charcoal transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {enroll.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UserPlus className="w-3.5 h-3.5" />
          )}
          Enroll
        </button>
      </div>
      {enroll.isError && (
        <p className="text-xs text-red-600 mb-3">
          {enroll.error instanceof Error ? enroll.error.message : 'Failed to enroll'}
        </p>
      )}
      {unenroll.isError && (
        <p className="text-xs text-red-600 mb-3">
          {unenroll.error instanceof Error ? unenroll.error.message : 'Failed to unenroll'}
        </p>
      )}

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-patina-clay-beige" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-patina-clay-beige py-4 text-center">No enrollments yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-patina-clay-beige border-b border-patina-clay-beige/20">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Next send</th>
                <th className="py-2 pr-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-patina-clay-beige/10 last:border-0">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-patina-charcoal truncate max-w-[220px]">
                      {row.email ?? `${row.user_id.slice(0, 8)}…`}
                    </div>
                    {row.display_name && (
                      <div className="text-xs text-patina-clay-beige">{row.display_name}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-patina-charcoal">{row.current_step + 1}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium capitalize',
                        statusColors[row.status] ?? 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-patina-clay-beige">
                    {row.status === 'active' ? formatDateTime(row.next_step_at) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {row.status !== 'unsubscribed' && (
                      <button
                        onClick={() => unenroll.mutate(row.id)}
                        disabled={unenroll.isPending}
                        className="text-patina-clay-beige hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Unenroll"
                        aria-label={`Unenroll ${row.email ?? row.user_id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-xs text-patina-clay-beige">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded hover:bg-patina-off-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => ((p + 1) * PAGE_SIZE < total ? p + 1 : p))}
            disabled={(page + 1) * PAGE_SIZE >= total}
            className="px-2 py-1 rounded hover:bg-patina-off-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
