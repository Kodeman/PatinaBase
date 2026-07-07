import Link from 'next/link';

import type { ClientOrdersError } from '@/lib/data/orders';

interface OrdersErrorStateProps {
  error: ClientOrdersError;
  /** Current path, used as the retry link and the sign-in callback URL. */
  returnTo: string;
}

/**
 * Inline "the orders service couldn't be reached" state — rendered in place
 * of the order list/detail content, not thrown to the route's error.tsx
 * boundary. A backend outage is an expected, recoverable condition for this
 * page (unlike a render crash), so it gets a same-page message instead of
 * the full-screen error boundary. Visually mirrors app/error.tsx (charcoal
 * CTA, muted supporting copy) scaled down to sit inline in the page.
 */
export function OrdersErrorState({ error, returnTo }: OrdersErrorStateProps) {
  const isAuthError = error === 'unauthorized';

  return (
    <div className="py-16 text-center" data-testid="orders-error-state">
      <h2 className="font-heading text-lg text-[var(--text-primary)]">
        {isAuthError ? 'Please sign in again' : "We couldn't load your orders right now"}
      </h2>
      <p className="type-body-small mx-auto mt-2 max-w-md text-[var(--text-muted)]">
        {isAuthError
          ? 'Your session needs to be refreshed before we can show your orders.'
          : 'Our order system is temporarily unavailable. Your orders are safe — please try again in a few minutes.'}
      </p>
      <div className="mt-5">
        <Link
          href={
            isAuthError ? `/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}` : returnTo
          }
          className="inline-flex items-center justify-center rounded-[3px] bg-patina-charcoal px-5 py-2.5 text-sm font-medium text-white no-underline transition hover:opacity-90"
        >
          {isAuthError ? 'Sign in' : 'Try again'}
        </Link>
      </div>
    </div>
  );
}
