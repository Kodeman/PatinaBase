'use client';

import { useMemo } from 'react';

import { invoiceBalanceCents } from '@patina/shared';
import type { Invoice } from '@patina/supabase';
import { useClientInvoices, useStudioIdentity } from '@patina/supabase';

import { ProjectsEmptyState, EmptyStateActs } from '@/components/projects/ProjectsEmptyState';
import { Doorplate } from '@/components/threshold/doorplate';
import { Letterbox } from '@/components/threshold/letterbox';
import {
  countInWords,
  monthAndYear,
} from '@/components/threshold/instruments/standing-sentence';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useNamedInvoice, useStripStaleTillParams } from '@/lib/threshold/checkout-return';
import { parseSourceDate, toInvoiceModel } from '@/lib/threshold/derive';
import { visibleInvoices } from '@/lib/threshold/invoice-rollup';

/* ── The front door, when there is no house ─────────────────────────────────
   A studio invoice can reach a household the studio has never opened a
   project for — a consultation, a paid review, a retainer. She has no house,
   so `ProjectsEmptyState` would tell her she has no projects and hand her
   nothing to do about the money she has been sent, and it mounts no
   letterbox at all — the one place a studio invoice can state its own
   figures and offer its own address (00574 · K1).

   So the front door becomes the letterbox itself — the studio's letterhead
   and the letter, "Open the invoice" its only act (W3b — settle-in-place is
   retired). No header and no nav (R135): every act she has is on this page.

   This door never renders `RoadOrders` (there are no projects, so there are
   no direct orders), so it is also the one place with no `useCheckoutReturn`
   consumer left to strike a stale return off the address — `stripStaleTillParams`
   below does that alone.

   A household with no letter waiting still meets the empty state; this door
   only stands where there is something in the slot. ────────────────────── */

const OPEN_STATUSES = new Set<Invoice['status']>(['sent', 'partially_paid']);

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function byDueDate(a: Invoice, b: Invoice): number {
  const left = parseSourceDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = parseSourceDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

export function LetterboxDoor() {
  const hydrated = useHydrated();
  const { user } = useAuth();
  const invoicesQuery = useClientInvoices();

  // Drafts are pre-issue and are not hers to read; RLS already withholds them
  // and this withholds them again.
  const letters = useMemo(
    () =>
      (invoicesQuery.data ?? []).filter(
        (row) => row.project_id === null && row.status !== 'draft',
      ),
    [invoicesQuery.data],
  );
  // Void letters are cancelled: they are neither owed nor kept, so a household
  // whose only studio invoice was voided meets the empty state rather than a
  // letterbox with nothing readable in it.
  const standing = useMemo(() => visibleInvoices(letters), [letters]);

  const open = useMemo(
    () =>
      standing
        .filter((row) => OPEN_STATUSES.has(row.status) && invoiceBalanceCents(row) > 0)
        .sort(byDueDate),
    [standing],
  );

  // The plate has to name the studio whose letter is actually standing in the
  // slot, and `Letterbox` chooses that letter itself: the one the address
  // named, else the soonest-due open one. Repeating the choice here (over the
  // same `letters` list it is handed) is what keeps a household holding
  // letters from two studios from reading one studio's plate over the other
  // studio's letter.
  const namedId = useNamedInvoice();
  // No `RoadOrders` ever mounts on this door — see the file comment.
  useStripStaleTillParams(true);
  const inSlot =
    (namedId ? (letters.find((row) => row.id === namedId) ?? null) : null) ??
    open[0] ??
    standing[0] ??
    null;

  // The letterhead comes off that letter's OWN studio (00571 gives p_studio_id
  // precedence), never off the designer's primary studio: a designer who
  // belongs to two would otherwise sign a letter with the other one's name.
  // The designer rides along as the fallback the resolver falls through to
  // when the named studio is not an active design studio.
  const identityQuery = useStudioIdentity({
    studioId: inSlot?.studio_id ?? null,
    designerId: inSlot?.designer_id ?? null,
  });

  const today = useMemo(() => (hydrated ? new Date() : undefined), [hydrated]);

  // A door that renders the empty state and then grows a letter is the one
  // reversal a money surface may not perform.
  if (invoicesQuery.isPending || (standing.length > 0 && identityQuery.isPending)) {
    return (
      <div data-testid="letterbox-door-hold" aria-hidden="true" className="min-h-[40vh]" />
    );
  }

  if (standing.length === 0) return <ProjectsEmptyState />;

  const studioName = identityQuery.data?.name?.trim() || 'Your studio';
  const waiting =
    open.length === 0
      ? 'Nothing is waiting for you.'
      : `${capitalize(countInWords(open.length))} ${
          open.length === 1 ? 'letter is' : 'letters are'
        } waiting for you.`;

  return (
    <div className="min-w-0" data-testid="letterbox-door">
      <Doorplate
        projectName={studioName}
        preparedFor={user?.name ?? null}
        monthLabel={today ? monthAndYear(today) : null}
      />

      <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.62] text-[var(--text-primary)]">
        {waiting}
      </p>

      <div className="mt-6">
        <Letterbox
          invoice={open.length > 0 ? toInvoiceModel(open[0]) : null}
          invoices={letters}
          today={today}
        />
      </div>

      <EmptyStateActs />
    </div>
  );
}
