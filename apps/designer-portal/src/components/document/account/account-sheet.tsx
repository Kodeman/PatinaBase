'use client';

/**
 * The Account sheet (R5) — the document-native home for "who am I, what account
 * is this, and the settings that go with it". A Drawer-weight SHEET (D14, like
 * Orders/Accounts/Hours): it slides over whatever is in hand and never unmounts
 * it. Opened from the maker's nameplate on the Studio Drawer, the mobile drawer
 * sheet, and ⌘K — all via the `document:open-account` event, mirroring
 * InterruptionSettings.
 *
 * Note the deliberate disambiguation: the drawer's "Accounts" book is the
 * studio's MONEY ledger; this sheet is the designer's LOGIN account. They never
 * share a label — this one is reached only through the nameplate.
 *
 * Identity front-matter answers the client's literal question (name · email ·
 * studio); the R28 page links re-skin the old /portal/settings pages into the
 * charcoal language with no change to their data layer.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  useAvailability,
  useSetAvailability,
  useAvailabilityRealtime,
  useProfile,
  useOrganizations,
  AVAILABILITY_STATUSES,
  type AvailabilityStatus,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { DocSheet } from '../overlays/doc-sheet';
import { monogramOf, activeStudio } from '@/lib/document/account-identity';
import { AccountProfilePage } from './account-profile-page';
import { AccountNotificationsPage } from './account-notifications-page';
import { AccountSecurityPage } from './account-security-page';
import { AccountDevicesPage } from './account-devices-page';

const STATUS_META: Record<AvailabilityStatus, { label: string; color: string }> = {
  online: { label: 'Online', color: 'var(--color-sage)' },
  away: { label: 'Away', color: 'var(--color-golden-hour)' },
  busy: { label: 'Busy', color: 'var(--color-terracotta)' },
  offline: { label: 'Offline', color: 'rgba(250,247,242,0.4)' },
};

type AccountPage = 'profile' | 'notifications' | 'security' | 'devices';

const PAGES: { key: AccountPage; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'devices', label: 'Devices' },
];

/** Open the Account sheet from anywhere in the document model. */
export function openAccount() {
  window.dispatchEvent(new CustomEvent('document:open-account'));
}

export function AccountSheet() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<AccountPage>('profile');

  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { data: orgs } = useOrganizations();
  const hydrated = useHydrated();

  const { data: status } = useAvailability();
  const setAvailability = useSetAvailability();
  useAvailabilityRealtime();

  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      setPage('profile');
      setOpen(true);
    };
    window.addEventListener('document:open-account', onOpen);
    return () => window.removeEventListener('document:open-account', onOpen);
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  }, [signOut]);

  const name = profile?.display_name || profile?.full_name || user?.name || null;
  const email = user?.email ?? profile?.email ?? '';
  const studio = activeStudio(orgs);
  const currentStatus: AvailabilityStatus = hydrated ? (status ?? 'online') : 'offline';

  return (
    <DocSheet open={open} onClose={() => setOpen(false)} title="Account">
      <div className="mx-auto max-w-xl">
        {/* Identity front-matter — the literal answer to "what account is this". */}
        <div className="flex items-start gap-3.5">
          <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[rgba(250,247,242,0.08)] font-mono text-[13px] uppercase tracking-wider text-[var(--color-pearl)]">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              monogramOf(name, email)
            )}
            <span
              aria-hidden
              className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--color-charcoal)]"
              style={{ background: STATUS_META[currentStatus].color }}
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-xl text-[var(--color-pearl)]">
              {name ?? email}
            </h2>
            {name && (
              <p className="truncate text-[12px] text-[rgba(250,247,242,0.55)]">{email}</p>
            )}
            {studio && (
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)]">
                {studio.name}
                <span className="text-[rgba(250,247,242,0.4)]"> · {studio.role}</span>
              </p>
            )}
          </div>
        </div>

        {/* Availability — declared, not live (same model as the old AccountMenu). */}
        <div className="mt-4">
          <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[rgba(250,247,242,0.4)]">
            Status
          </p>
          <div
            role="radiogroup"
            aria-label="Availability status"
            className="flex flex-wrap gap-1.5"
          >
            {AVAILABILITY_STATUSES.map((value) => {
              const selected = currentStatus === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAvailability.mutate(value)}
                  className={`flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[11px] transition-colors ${
                    selected
                      ? 'border-[rgba(196,165,123,0.45)] bg-[rgba(196,165,123,0.12)] text-[var(--color-off-white)]'
                      : 'border-[rgba(250,247,242,0.12)] text-[rgba(250,247,242,0.7)] hover:border-[rgba(196,165,123,0.4)]'
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: STATUS_META[value].color }}
                  />
                  {STATUS_META[value].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* R28 page links — DM-mono, never tabs. */}
        <div className="mb-4 mt-5 flex flex-wrap items-baseline gap-x-4 border-b border-[rgba(250,247,242,0.1)] pb-2">
          {PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPage(p.key)}
              aria-current={page === p.key ? 'page' : undefined}
              className={`font-mono text-[9.5px] uppercase tracking-[0.08em] transition-colors ${
                page === p.key
                  ? 'text-[var(--color-clay)]'
                  : 'text-[rgba(250,247,242,0.45)] hover:text-[rgba(250,247,242,0.8)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {page === 'profile' && <AccountProfilePage />}
        {page === 'notifications' && <AccountNotificationsPage />}
        {page === 'security' && <AccountSecurityPage />}
        {page === 'devices' && <AccountDevicesPage />}

        {/* Sign out */}
        <div className="mt-7 border-t border-[rgba(250,247,242,0.1)] pt-4">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-terracotta)] transition-colors hover:text-[var(--color-off-white)] disabled:opacity-60"
          >
            {isSigningOut ? 'Signing out…' : '⏻ Sign out'}
          </button>
        </div>
      </div>
    </DocSheet>
  );
}
