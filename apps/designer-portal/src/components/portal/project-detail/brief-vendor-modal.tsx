'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStartVendorBrief, useVendorProfiles } from '@patina/supabase';
import { Button, Select, Textarea } from '@/components/ui/controls';

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
          <Select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            disabled={isLoading || startBrief.isPending}
            className="mt-1"
          >
            <option value="">
              {isLoading ? 'Loading vendors…' : 'Select a vendor'}
            </option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.full_name ?? v.id.slice(0, 8)}
              </option>
            ))}
          </Select>
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
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Outline the brief — scope, materials, timing, anything you want them to know up front."
            rows={5}
            disabled={startBrief.isPending}
            className="mt-1 resize-y"
          />
        </label>

        {error && (
          <p className="type-meta mb-3 text-patina-terracotta">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={startBrief.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit}
          >
            {startBrief.isPending ? 'Opening…' : 'Open brief'}
          </Button>
        </div>
      </form>
    </div>
  );
}
