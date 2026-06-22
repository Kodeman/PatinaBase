'use client';

/**
 * The maker's nameplate for the mobile drawer sheet (D13) — the phone's home
 * for "what account is this". A full-width tappable row: monogram + name +
 * studio + status dot → opens the Account sheet. Mirrors the desktop
 * AccountNameplate; kept separate so its hooks run only while the drawer sheet
 * is mounted.
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

const DOT: Record<AvailabilityStatus, string> = {
  online: 'var(--color-sage)',
  away: 'var(--color-golden-hour)',
  busy: 'var(--color-terracotta)',
  offline: 'rgba(250,247,242,0.4)',
};

export function MobileAccountHeader({ onOpen }: { onOpen: () => void }) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: orgs } = useOrganizations();
  const hydrated = useHydrated();
  // Realtime sync lives in the always-mounted AccountSheet; read shared cache.
  const { data: status } = useAvailability();

  const name = profile?.display_name || profile?.full_name || user?.name || null;
  const email = user?.email ?? '';
  const studio = activeStudio(orgs);
  const current: AvailabilityStatus = hydrated ? (status ?? 'online') : 'offline';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Account and settings"
      aria-haspopup="dialog"
      className="flex w-full items-center gap-3 rounded-[6px] border border-[rgba(250,247,242,0.12)] bg-[rgba(250,247,242,0.04)] px-3 py-2.5 text-left active:border-[rgba(196,165,123,0.45)]"
    >
      <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(250,247,242,0.08)] font-mono text-[11px] uppercase tracking-wider text-[var(--color-pearl)]">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          monogramOf(name, email)
        )}
        <span
          aria-hidden
          className="absolute bottom-[-1px] right-[-1px] h-[9px] w-[9px] rounded-full border-2 border-[var(--color-charcoal)]"
          style={{ background: DOT[current] }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-[14px] font-medium text-[rgba(250,247,242,0.92)]">
          {name ?? email ?? 'Account'}
        </span>
        <span className="block truncate font-mono text-[9px] uppercase tracking-[0.07em] text-[rgba(250,247,242,0.45)]">
          {studio ? studio.name : email}
        </span>
      </span>
      <span aria-hidden className="font-mono text-[14px] text-[var(--color-clay)] opacity-70">
        ›
      </span>
    </button>
  );
}
