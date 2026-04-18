'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { ShieldOff, Mail, AlertTriangle, RotateCcw } from 'lucide-react';

interface SuppressionRow {
  id: string;
  email: string | null;
  display_name: string | null;
  email_suppressed: boolean;
  email_suppressed_at: string | null;
  email_bounce_count: number | null;
  email_complaint: boolean | null;
  updated_at: string | null;
}

async function fetchSuppressions(token: string, offset = 0, limit = 50) {
  const res = await fetch(
    `/api/admin/comms/suppressions?offset=${offset}&limit=${limit}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  return res.json() as Promise<{ rows: SuppressionRow[]; total: number }>;
}

async function unsuppress(token: string, userId: string) {
  const res = await fetch(
    `/api/admin/comms/suppressions/${userId}/unsuppress`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`Unsuppress failed: ${res.status}`);
}

export default function SuppressedPage() {
  const { session } = useAuth();
  const accessToken = session?.accessToken;
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    fetchSuppressions(accessToken)
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  async function handleUnsuppress(userId: string) {
    if (!accessToken) return;
    setWorking(userId);
    setError(null);
    try {
      await unsuppress(accessToken, userId);
      setRows((prev) => prev.filter((r) => r.id !== userId));
      setTotal((t) => Math.max(0, t - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unsuppress failed');
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="min-h-screen bg-patina-off-white">
      <header className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <ShieldOff className="w-5 h-5 text-patina-mocha-brown" />
          <h1 className="text-2xl font-display font-semibold text-patina-charcoal">
            Suppressed recipients
          </h1>
        </div>
        <p className="text-sm text-patina-clay-beige">
          Users whose email delivery is paused due to hard bounces or complaints.
          {total > 0 && ` · ${total} suppressed`}
        </p>
      </header>

      <div className="px-8 py-6 max-w-6xl">
        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg flex items-start gap-2 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-patina-clay-beige">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-patina-clay-beige/20">
            <Mail className="w-8 h-8 mx-auto mb-3 text-patina-clay-beige/60" />
            <p className="text-patina-clay-beige">No suppressed recipients.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden">
            <table className="w-full">
              <thead className="bg-patina-off-white">
                <tr>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-6 py-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-6 py-3">
                    Suppressed at
                  </th>
                  <th className="text-right text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-6 py-3">
                    Bounces
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-6 py-3">
                    Complaint
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-patina-clay-beige/20">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-patina-charcoal">
                        {row.email ?? '—'}
                      </p>
                      {row.display_name && (
                        <p className="text-xs text-patina-clay-beige">{row.display_name}</p>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-patina-charcoal">
                      {row.email_suppressed_at
                        ? new Date(row.email_suppressed_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-patina-charcoal">
                      {row.email_bounce_count ?? 0}
                    </td>
                    <td className="px-6 py-3">
                      {row.email_complaint ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                          Yes
                        </span>
                      ) : (
                        <span className="text-sm text-patina-clay-beige">No</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => handleUnsuppress(row.id)}
                        disabled={working === row.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md',
                          'bg-white border border-patina-clay-beige/40 text-patina-charcoal',
                          'hover:bg-patina-off-white disabled:opacity-50',
                        )}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {working === row.id ? 'Unsuppressing…' : 'Unsuppress'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
