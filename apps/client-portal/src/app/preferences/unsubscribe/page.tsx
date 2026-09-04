import Link from "next/link";
import type { UnsubscribeOutcome } from "@patina/notifications";

interface PageProps {
  searchParams: Promise<{ token?: string; status?: string; type?: string }>;
}

export const dynamic = "force-dynamic";

/* This page NEVER unsubscribes anyone on a GET.

   It is public (the recipient clicking out of an email usually has no
   session), and a public GET that mutates is taken by things that are not the
   recipient: Outlook SafeLinks, the Gmail link proxy, a security appliance, a
   browser prefetch. Any one of them fetching the address would silently turn a
   person's mail off. Until this portal's route tree was retired the sign-in
   wall hid that; nothing hides it now.

   So a token arriving here is not applied — it is offered. The one button
   POSTs it to /api/unsubscribe, which applies it and sends the browser back
   here with `?status=`, the only render this page reaches on its own. The
   List-Unsubscribe one-click POST in the mail headers is unaffected: it goes
   straight to that route and never passes through this page. */

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token ?? "";

  const validStatuses = new Set(["applied", "expired", "invalid", "malformed"]);
  const settled = params.status && validStatuses.has(params.status);

  if (!settled && token) return <ConfirmUnsubscribe token={token} />;

  const outcome: UnsubscribeOutcome = settled
    ? {
        ok: params.status === "applied",
        status: params.status as UnsubscribeOutcome["status"],
        type: params.type as UnsubscribeOutcome["type"],
      }
    : { ok: false, status: "malformed" };

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
                {outcome.type === "all_marketing"
                  ? "We've turned off all marketing emails. You'll still receive essential account notifications."
                  : `We've unsubscribed you from ${humanizeType(outcome.type)} emails.`}
              </p>
              <p className="text-[#4A453F] text-[15px] leading-6 mb-6">
                Change your mind? Manage all preferences in your account.
              </p>
              {/* `/preferences` is retired: preferences live on the mat of
                  the client's project page now. Linking the old address would
                  cost a fold (and a sign-in hop) to reach the same place. */}
              <Link
                href="/#mat"
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
                href="/#mat"
                className="inline-block bg-[#A3927C] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
              >
                Sign in to manage
              </Link>
            </>
          )}
        </div>
        <footer className="bg-[#2C2926] px-10 py-6 text-center">
          <p className="text-[#A09890] text-xs m-0">
            Patina — hello@patina.cloud
          </p>
        </footer>
      </div>
    </main>
  );
}

function ConfirmUnsubscribe({ token }: { token: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F1ED] p-6 font-sans">
      <div className="w-full max-w-xl bg-white rounded-lg shadow-sm overflow-hidden">
        <header className="bg-[#3C3226] px-10 py-7 text-center">
          <span className="font-serif text-xl font-semibold tracking-[0.15em] text-[#FAF7F2]">
            PATINA
          </span>
        </header>
        <div className="p-10">
          <h1 className="font-serif text-2xl font-semibold text-[#2C2926] mb-4">
            Turn these emails off?
          </h1>
          <p className="text-[#4A453F] text-[15px] leading-6 mb-6">
            Confirm and we&apos;ll stop sending them. You&apos;ll still receive
            essential account notifications.
          </p>
          <form
            method="POST"
            action={`/api/unsubscribe?token=${encodeURIComponent(token)}`}
          >
            <button
              type="submit"
              data-testid="unsubscribe-confirm"
              className="inline-block bg-[#A3927C] text-white px-9 py-3.5 rounded-full font-semibold text-sm"
            >
              Unsubscribe me
            </button>
          </form>
        </div>
        <footer className="bg-[#2C2926] px-10 py-6 text-center">
          <p className="text-[#A09890] text-xs m-0">Patina — hello@patina.cloud</p>
        </footer>
      </div>
    </main>
  );
}

function humanizeType(type: string | undefined): string {
  if (!type) return "these";
  return type.replace(/_/g, " ");
}

function errorCopy(status: string): string {
  switch (status) {
    case "expired":
      return "This unsubscribe link has expired (72-hour window). Please use the link in your most recent email.";
    case "invalid":
      return "This link is invalid or was tampered with.";
    case "malformed":
      return "The link is missing required information.";
    case "error":
      return "Something went wrong on our side. Please try again in a few minutes.";
    default:
      return "Something unexpected happened.";
  }
}
