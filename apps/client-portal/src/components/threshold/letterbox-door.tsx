'use client';

import { useCallback, useMemo } from 'react';

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
import { parseSourceDate, toInvoiceModel } from '@/lib/threshold/derive';
import { visibleInvoices } from '@/lib/threshold/invoice-rollup';

/* ── The front door, when there is no house ─────────────────────────────────
   A studio invoice can reach a household the studio has never opened a
   project for — a consultation, a paid review, a retainer. She has no house,
   so `ProjectsEmptyState` would tell her she has no projects and hand her
   nothing to do about the money she has been sent. Worse, it mounts no
   letterbox, and the letterbox is the only thing that reads the return from
   the till: a client who paid would come back to "no active projects yet"
   and no receipt.

   So the front door becomes the letterbox itself — the studio's letterhead,
   the letter, and the same settlement ceremony unfolding in place. No header
   and no nav (R135): every act she has is on this page.

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

  // The letterhead comes off the letter's OWN studio (00571 gives p_studio_id
  // precedence), never off the designer's primary studio: a designer who
  // belongs to two would otherwise sign a letter with the other one's name.
  // The designer rides along as the fallback the resolver falls through to
  // when the named studio is not an active design studio.
  const identityQuery = useStudioIdentity({
    studioId: standing[0]?.studio_id ?? null,
    designerId: standing[0]?.designer_id ?? null,
  });

  const today = useMemo(() => (hydrated ? new Date() : undefined), [hydrated]);

  const refetch = invoicesQuery.refetch;
  // Stable: the confirmation poll holds this in an effect's dependency list.
  const onRefetch = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const open = useMemo(
    () =>
      standing
        .filter((row) => OPEN_STATUSES.has(row.status) && invoiceBalanceCents(row) > 0)
        .sort(byDueDate),
    [standing],
  );

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
          designerName={identityQuery.data?.name ?? null}
          onRefetch={onRefetch}
          today={today}
        />
      </div>

      <EmptyStateActs />
    </div>
  );
}
