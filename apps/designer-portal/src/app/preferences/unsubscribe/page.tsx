import Link from 'next/link';
import { createServiceClient } from '@patina/supabase/server';
import { applyUnsubscribeToken, type UnsubscribeOutcome } from '@patina/notifications';

interface PageProps {
  searchParams: Promise<{ token?: string; status?: string; type?: string }>;
}

export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token ?? '';

  let outcome: UnsubscribeOutcome;
  const validStatuses = new Set(['applied', 'expired', 'invalid', 'malformed']);
  if (params.status && validStatuses.has(params.status)) {
    outcome = {
      ok: params.status === 'applied',
      status: params.status as UnsubscribeOutcome['status'],
      type: params.type as UnsubscribeOutcome['type'],
    };
  } else if (!token) {
    outcome = { ok: false, status: 'malformed' };
  } else {
    outcome = await applyUnsubscribeToken(createServiceClient(), token);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-subtle)] p-6 font-sans">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-sm overflow-hidden">
        <header className="bg-[#3C3226] px-10 py-7 text-center">
          <span className="font-serif text-xl font-semibold tracking-[0.15em] text-[var(--color-off-white)]">
            PATINA
          </span>
        </header>
        <div className="p-10">
          {outcome.ok ? (
            <>
              <h1 className="font-serif text-2xl font-semibold text-[var(--color-charcoal)] mb-4">
                You&apos;ve been unsubscribed
              </h1>
              <p className="text-[var(--color-bark)] text-[15px] leading-6 mb-4">
                {outcome.type === 'all_marketing'
                  ? "We've turned off marketing emails to your address."
                  : `We've unsubscribed you from ${humanize(outcome.type)} emails.`}
              </p>
              <Link
                href="/portal/settings/notifications"
                className="inline-block bg-[var(--color-taupe)] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
              >
                Manage preferences
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-serif text-2xl font-semibold text-[var(--color-charcoal)] mb-4">
                We couldn&apos;t complete that
              </h1>
              <p className="text-[var(--color-bark)] text-[15px] leading-6 mb-6">
                {errorCopy(outcome.status)}
              </p>
              <Link
                href="/portal/settings/notifications"
                className="inline-block bg-[var(--color-taupe)] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
              >
                Sign in to manage
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function humanize(type: string | undefined): string {
  return (type ?? 'these').replace(/_/g, ' ');
}

function errorCopy(status: string): string {
  switch (status) {
    case 'expired':
      return 'This link has expired (72-hour window).';
    case 'invalid':
      return 'This link is invalid or was tampered with.';
    case 'malformed':
      return 'The link is missing required information.';
    case 'error':
      return 'Something went wrong on our side — please try again.';
    default:
      return 'Something unexpected happened.';
  }
}
