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
    <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED] p-6 font-sans">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-sm overflow-hidden">
        <header className="bg-[#3C3226] px-10 py-7 text-center">
          <span className="font-serif text-xl font-semibold tracking-[0.15em] text-[#FAF7F2]">
            PATINA
          </span>
        </header>
        <div className="p-10">
          {outcome.ok ? (
            <>
              <h1 className="font-serif text-2xl font-semibold text-[#2C2926] mb-4">
                You&apos;ve been unsubscribed
              </h1>
              <p className="text-[#4A453F] text-[15px] leading-6 mb-4">
                {outcome.type === 'all_marketing'
                  ? "We've turned off all marketing emails. You'll still receive essential account notifications."
                  : `We've unsubscribed you from ${humanizeType(outcome.type)} emails.`}
              </p>
              <p className="text-[#4A453F] text-[15px] leading-6 mb-6">
                Change your mind? Manage all preferences in your account.
              </p>
              <Link
                href="/settings/notifications"
                className="inline-block bg-[#A3927C] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
              >
                Manage Preferences
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-serif text-2xl font-semibold text-[#2C2926] mb-4">
                We couldn&apos;t complete that
              </h1>
              <p className="text-[#4A453F] text-[15px] leading-6 mb-4">
                {errorCopy(outcome.status)}
              </p>
              <p className="text-[#4A453F] text-[15px] leading-6 mb-6">
                You can always log in and update preferences directly.
              </p>
              <Link
                href="/settings/notifications"
                className="inline-block bg-[#A3927C] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
              >
                Sign in to manage
              </Link>
            </>
          )}
        </div>
        <footer className="bg-[#2C2926] px-10 py-6 text-center">
          <p className="text-[#A09890] text-xs m-0">Patina — hello@patina.cloud</p>
        </footer>
      </div>
    </main>
  );
}

function humanizeType(type: string | undefined): string {
  if (!type) return 'these';
  return type.replace(/_/g, ' ');
}

function errorCopy(status: string): string {
  switch (status) {
    case 'expired':
      return 'This unsubscribe link has expired (72-hour window). Please use the link in your most recent email.';
    case 'invalid':
      return 'This link is invalid or was tampered with.';
    case 'malformed':
      return 'The link is missing required information.';
    case 'error':
      return 'Something went wrong on our side. Please try again in a few minutes.';
    default:
      return 'Something unexpected happened.';
  }
}
