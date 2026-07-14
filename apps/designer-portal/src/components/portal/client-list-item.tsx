'use client';

import Link from 'next/link';
import { StageBadge } from './stage-badge';
import { OwnerByline } from '@/components/ui/owner-byline';

type Stage = 'lead' | 'proposal' | 'active' | 'completed' | 'nurture';

const avatarColors: Record<Stage, { bg: string; fg: string }> = {
  lead: { bg: 'rgba(139, 156, 173, 0.12)', fg: 'var(--color-dusty-blue)' },
  proposal: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  active: { bg: 'rgba(122, 155, 118, 0.12)', fg: 'var(--color-sage)' },
  completed: { bg: 'rgba(196, 165, 123, 0.15)', fg: 'var(--color-mocha)' },
  nurture: { bg: 'rgba(196, 165, 123, 0.1)', fg: 'var(--accent-primary)' },
};

interface ClientListItemProps {
  id: string;
  name: string;
  initials: string;
  projectDescription?: string;
  location?: string;
  stage: Stage;
  stageDetail?: string;
  financialValue?: string;
  financialLabel?: string;
  /**
   * Shared-workspace owner attribution (Studio Wave 5). The caller gates
   * this on `useStudioHasTeam()`, so it's `undefined`/omitted for solo
   * designers — zero visible change for the common case. `null` when the
   * row's joined designer profile didn't resolve (legacy data); either way
   * `OwnerByline` renders nothing.
   */
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
}

export function ClientListItem({
  id,
  name,
  initials,
  projectDescription,
  location,
  stage,
  stageDetail,
  financialValue,
  financialLabel,
  ownerName,
  ownerAvatarUrl,
}: ClientListItemProps) {
  const colors = avatarColors[stage] || avatarColors.active;

  return (
    <Link
      href={`/portal/clients/${id}`}
      aria-label={name}
      className="grid cursor-pointer items-center gap-4 border-b border-[var(--border-subtle)] py-4 no-underline transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        gridTemplateColumns: '44px 1fr auto auto',
        transitionDuration: 'var(--duration-fast)',
      }}
    >
      {/* Avatar */}
      <div
        className="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: colors.bg,
          color: colors.fg,
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: '0.82rem',
        }}
      >
        {initials}
      </div>

      {/* Name + context */}
      <div className="min-w-0">
        <div className="type-label" style={{ fontSize: '0.9rem' }}>
          {name}
        </div>
        <div className="type-label-secondary mt-0.5">
          {[projectDescription, location].filter(Boolean).join(' \u00B7 ')}
        </div>
        {ownerName && (
          <div className="type-meta-small mt-1">
            <OwnerByline name={ownerName} avatarUrl={ownerAvatarUrl} />
          </div>
        )}
      </div>

      {/* Stage badge + detail */}
      <div className="hidden text-right md:block">
        <StageBadge stage={stage} />
        {stageDetail && (
          <div className="type-meta-small mt-1">
            {stageDetail}
          </div>
        )}
      </div>

      {/* Financial value */}
      {financialValue && (
        <div className="text-right">
          <div className="font-heading text-[0.95rem] font-semibold">
            {financialValue}
          </div>
          {financialLabel && (
            <div className="type-meta-small mt-0.5">
              {financialLabel}
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
