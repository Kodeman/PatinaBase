'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStartVendorBrief, useVendorProfiles } from '@patina/supabase';

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export function BriefVendorModal({ projectId, open, onClose }: Props) {
  const router = useRouter();
  const { data: vendors = [], isLoading } = useVendorProfiles();
  const startBrief = useStartVendorBrief();
  const [vendorId, setVendorId] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canSubmit =
    !!vendorId && body.trim().length > 0 && !startBrief.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const threadId = await startBrief.mutateAsync({
        vendorProfileId: vendorId,
        projectId,
        initialMessage: body.trim(),
      });
      onClose();
      router.push(`/portal/messages/${threadId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open brief');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border bg-[var(--bg-primary)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
      >
        <h2 className="type-section-title mb-1">Brief a vendor</h2>
        <p className="type-body-small mb-4 text-[var(--text-muted)]">
          Open a thread with a vendor about this project. They'll receive your
          opening message and can respond directly.
        </p>

        <label className="block mb-3">
          <span className="type-meta-small uppercase tracking-wider">Vendor</span>
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={isLoading || startBrief.isPending}
            className="mt-1 w-full rounded border bg-transparent px-3 py-2 text-sm focus:border-patina-clay focus:outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          >
            <option value="">
              {isLoading ? 'Loading vendors…' : 'Select a vendor'}
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name ?? v.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {!isLoading && vendors.length === 0 && (
            <p className="type-meta-small mt-1 text-[var(--text-muted)]">
              No vendor profiles available. Vendors must be onboarded with a
              profile before a brief can be opened.
            </p>
          )}
        </label>

        <label className="block mb-4">
          <span className="type-meta-small uppercase tracking-wider">
            Opening message
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Outline the brief — scope, materials, timing, anything you want them to know up front."
            rows={5}
            disabled={startBrief.isPending}
            className="mt-1 w-full resize-y rounded border bg-transparent px-3 py-2 text-sm focus:border-patina-clay focus:outline-none"
            style={{ borderColor: 'var(--border-default)' }}
          />
        </label>

        {error && (
          <p className="type-meta mb-3 text-patina-terracotta">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={startBrief.isPending}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{
              borderColor: 'var(--border-default)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-[3px] bg-patina-clay px-4 py-1.5 text-[0.8rem] font-medium text-white disabled:opacity-50"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {startBrief.isPending ? 'Opening…' : 'Open brief'}
          </button>
        </div>
      </form>
    </div>
  );
}
