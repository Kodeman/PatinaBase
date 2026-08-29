'use client';

/**
 * The maker's nameplate (R5) — the studio's signature on the Studio Drawer.
 * Replaces the plain "Studio" micro-label: a monogram + the designer's name +
 * the active studio, always visible, so "what account is this logged into" is
 * answered at a glance. Click opens the Account sheet. The status dot mirrors
 * the declared availability (hydration-gated like the old AccountMenu).
 */

import {
  useAvailability,
  useProfile,
  useOrganizations,
  type AvailabilityStatus,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { monogramOf, activeStudio } from '@/lib/document/account-identity';
import { openAccount } from './account-sheet';

const DOT: Record<AvailabilityStatus, string> = {
  online: 'var(--color-sage)',
  away: 'var(--color-golden-hour)',
  busy: 'var(--color-terracotta)',
  offline: 'rgba(44,41,38,0.22)',
};

export function AccountNameplate() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: orgs } = useOrganizations();
  const hydrated = useHydrated();
  // The dot reads the shared availability query; the realtime subscription
  // that keeps it fresh lives once in the always-mounted AccountSheet.
  const { data: status } = useAvailability();

  const name = profile?.display_name || profile?.full_name || user?.name || null;
  const email = user?.email ?? '';
  const studio = activeStudio(orgs);
  const current: AvailabilityStatus = hydrated ? (status ?? 'online') : 'offline';

  return (
    <button
      type="button"
      onClick={openAccount}
      aria-label="Account and settings"
      aria-haspopup="dialog"
      className="ml-1 flex shrink-0 items-center gap-2 rounded-[5px] border border-transparent py-[0.3rem] pl-1 pr-2 transition-colors hover:border-[rgba(196,165,123,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
    >
      <span className="relative inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(196,165,123,0.16)] font-mono text-[11px] uppercase tracking-wider text-[var(--color-mocha)]">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          monogramOf(name, email)
        )}
        <span
          aria-hidden
          className="absolute bottom-[-1px] right-[-1px] h-[8px] w-[8px] rounded-full border-2 border-[var(--bg-surface)]"
          style={{ background: DOT[current] }}
        />
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block max-w-[120px] truncate font-heading text-[11px] font-medium text-[var(--text-primary)]">
          {name ?? email ?? 'Account'}
        </span>
        {studio && (
          <span className="block max-w-[120px] truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {studio.name}
          </span>
        )}
      </span>
    </button>
  );
}
