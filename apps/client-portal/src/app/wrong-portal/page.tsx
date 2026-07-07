'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  describeAccountKind,
  describeAccountKindFromDomain,
  foreignPortalFromDomain,
  resolveForeignPortalHome,
} from '@/lib/portal-access';

/**
 * Wrong-portal interstitial. Patina portals share one SSO cookie across
 * `.patina.cloud`, so a designer or manufacturer identity can land here on the
 * client (homeowner) portal. Rather than show confusing empty states, we
 * explain the mismatch and offer a route to the portal they belong on, plus a
 * "sign out and switch accounts" escape hatch.
 *
 * The account kind + destination come from the `?as=<domain>` hint the
 * middleware sets from its authoritative service-role lookup. We fall back to
 * client-side JWT roles only for a direct visit without the hint (JWT
 * `app_metadata.roles` is not populated in this deployment, so it is a weak
 * signal — the middleware hint is preferred whenever present).
 */
function WrongPortalContent() {
  const { user, signOut } = useAuth();
  const searchParams = useSearchParams();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const asDomain = searchParams.get('as');
  const roles = user?.roles ?? [];
  const email = user?.email ?? '';

  const home = asDomain ? foreignPortalFromDomain(asDomain) : resolveForeignPortalHome(roles);
  const accountKind = asDomain ? describeAccountKindFromDomain(asDomain) : describeAccountKind(roles);

  async function handleSwitchAccounts() {
    setIsSigningOut(true);
    try {
      // signOut() clears the shared Supabase session and routes to /auth/signin.
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="type-section-head">You&rsquo;re on the wrong portal</h1>
          <p className="type-body mx-auto">
            You&rsquo;re signed in as {accountKind} account{email ? ` (${email})` : ''}. The Patina
            client portal is for homeowners working with a designer.
          </p>
        </div>

        {home && (
          <div className="border-l-2 border-patina-dusty-blue pl-4 text-left">
            <p className="type-meta">Your workspace</p>
            <p className="mt-1 type-body-small text-[var(--text-muted)]">
              Continue to {home.label} to pick up where you left off.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          {home && (
            <a
              href={home.url}
              className="rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
            >
              Continue to {home.label}
            </a>
          )}
          <button
            onClick={handleSwitchAccounts}
            disabled={isSigningOut}
            className="rounded-[3px] border border-[var(--border-default)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--text-primary)] disabled:opacity-50"
          >
            {isSigningOut ? 'Signing out…' : 'Sign out and switch accounts'}
          </button>
        </div>

        <p className="type-body-small text-[var(--text-muted)]">
          If you believe this is a mistake, contact your designer or our support team.
        </p>
      </div>
    </div>
  );
}

export default function WrongPortalPage() {
  return (
    <Suspense fallback={null}>
      <WrongPortalContent />
    </Suspense>
  );
}
