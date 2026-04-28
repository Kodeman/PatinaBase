'use client';

import { useState } from 'react';
import { useUpdateProject } from '@/hooks/use-projects';

export type ClientVisibilityTier = 'full' | 'milestone' | 'curated';

interface ClientViewToggleProps {
  projectId: string;
  current: ClientVisibilityTier;
}

const TIER_INFO: Record<ClientVisibilityTier, { label: string; desc: string }> = {
  full: { label: 'Full access', desc: 'Client sees daily progress, all updates, photos as they happen.' },
  milestone: { label: 'Milestones', desc: 'Phase-end updates and major decisions only.' },
  curated: { label: 'Curated', desc: 'Designer publishes specific updates. Final reveal at completion.' },
};

export function ClientViewToggle({ projectId, current }: ClientViewToggleProps) {
  const update = useUpdateProject();
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const change = async (tier: ClientVisibilityTier) => {
    await update.mutateAsync({ id: projectId, data: { client_visibility_tier: tier } });
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setPreviewing((v) => !v)}
        className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
        style={{
          borderColor: previewing ? 'var(--text-primary)' : 'var(--border-default)',
          background: previewing ? 'var(--bg-hover)' : 'transparent',
          fontFamily: 'var(--font-body)',
        }}
        aria-pressed={previewing}
      >
        {previewing ? '◉' : '○'} Client view
      </button>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
        style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
      >
        Tier · {TIER_INFO[current].label} ▾
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border bg-[var(--bg-surface)] p-2 shadow-md"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {(Object.keys(TIER_INFO) as ClientVisibilityTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => change(tier)}
              className="block w-full rounded-[3px] px-2 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
              style={{ background: tier === current ? 'var(--bg-hover)' : undefined }}
            >
              <div className="type-label">{TIER_INFO[tier].label}</div>
              <div className="type-body text-[0.72rem] text-[var(--text-muted)]">
                {TIER_INFO[tier].desc}
              </div>
            </button>
          ))}
        </div>
      )}

      {previewing && (
        <span
          className="ml-2 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider"
          style={{
            background: 'var(--color-golden-hour, #E8C547)',
            color: 'var(--text-primary)',
          }}
        >
          Previewing
        </span>
      )}
    </div>
  );
}

/**
 * Hook for components inside Project Detail to know if they should show
 * cost/vendor/internal columns based on the current client-view preview state.
 */
export function isClientHidden(field: 'cost' | 'vendor' | 'internal' | 'earnings', tier: ClientVisibilityTier): boolean {
  // 'full' tier: client sees costs and vendors but not internal designer notes/earnings
  if (tier === 'full') return field === 'internal' || field === 'earnings';
  // 'milestone' tier: hide costs, vendors, internal, and earnings
  if (tier === 'milestone') return ['cost', 'vendor', 'internal', 'earnings'].includes(field);
  // 'curated' tier: same as milestone (designer publishes specific updates only)
  return ['cost', 'vendor', 'internal', 'earnings'].includes(field);
}
