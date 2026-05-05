'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { SegmentRules } from '@patina/shared/types';

interface AudienceSampleRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
}

interface Props {
  rules: SegmentRules | null;
  limit?: number;
  debounceMs?: number;
}

export function AudienceSamplePreview({ rules, limit = 25, debounceMs = 400 }: Props) {
  const [sample, setSample] = useState<AudienceSampleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!rules || rules.conditions.length === 0) {
      setSample([]);
      setTotal(0);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch('/api/admin/comms/audiences/preview', {
          method: 'POST',
          headers,
          body: JSON.stringify({ rules, limit }),
        });
        if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
        const data = await res.json();
        setSample(data.sample || []);
        setTotal(data.total || 0);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [rules, limit, debounceMs]);

  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-patina-charcoal">Sample Recipients</h3>
        <span className="text-xs text-patina-clay-beige">
          {loading
            ? 'Loading…'
            : !rules || rules.conditions.length === 0
              ? 'Add rules to preview'
              : `${sample.length} of ${total.toLocaleString()}`}
        </span>
      </div>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      {!rules || rules.conditions.length === 0 ? (
        <p className="text-xs text-patina-clay-beige">
          Define at least one rule to preview matching recipients.
        </p>
      ) : sample.length === 0 && !loading ? (
        <p className="text-xs text-patina-clay-beige">No recipients match these rules.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-patina-clay-beige/20">
          <table className="w-full text-xs">
            <thead className="bg-patina-off-white">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-patina-clay-beige uppercase tracking-wider">Email</th>
                <th className="text-left px-3 py-2 font-medium text-patina-clay-beige uppercase tracking-wider">Name</th>
                <th className="text-left px-3 py-2 font-medium text-patina-clay-beige uppercase tracking-wider">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-patina-clay-beige/10">
              {sample.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-1.5 text-patina-charcoal">{r.email}</td>
                  <td className="px-3 py-1.5 text-patina-charcoal">{r.display_name || '—'}</td>
                  <td className="px-3 py-1.5 text-patina-clay-beige">{r.role || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
