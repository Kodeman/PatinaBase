'use client';

import { useCallback, useMemo, useState } from 'react';

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
import { partitionProposals, useClientProposals } from '@/hooks/use-proposals-client';
import { commercialSummaryFromProposal } from '@/lib/commercial-documents';
import { useNamedInvoice } from '@/lib/threshold/checkout-return';
import {
  parseSourceDate,
  toInvoiceModel,
  type ThresholdMark,
} from '@/lib/threshold/derive';
import { visibleInvoices } from '@/lib/threshold/invoice-rollup';

import { DoorGate, type DoorProposal } from './door-gate';

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

   THE ORIGIN AGREEMENT STANDS HERE TOO (R30). A design-services agreement is
   `proposals.project_id NULL` by design until the studio countersigns it —
   00331 and 00566 both name that row the ORIGIN agreement, and countersigning
   is what CREATES the project. So the very first paper a household is ever
   sent arrives before she has a house, and every door that reads papers is
   project-scoped: `Threshold` filters on the summary's projectId, and `/`
   never reaches it because there is no project to open. The agreement was
   unreachable — a signature the studio was waiting on, behind a page that
   said she had no projects.

   Here it is read the same way the house reads its own: `list_client_proposals`
   is scoped by `client_id`, not by project, so the origin agreement is already
   hers to list, and `get_client_commercial_document_bundle` — the read behind
   the leaf — gates on `client_id` as well. The DoorGate below is the SAME
   instrument the house hangs, with the same signature line, the same consent
   and the same POST; only `projectId` is null, which `DoorActs` and the
   invalidation already accept.

   The moment the studio countersigns, the project exists: `list_client_proposals`
   coalesces the commercial binding's project_id, the summary stops reading
   null, this door drops the paper, and `/` opens the house instead. Nothing
   renders it twice.

   A household with neither a letter nor an agreement still meets the empty
   state; this door only stands where something is waiting. ─────────────── */

const OPEN_STATUSES = new Set<Invoice['status']>(['sent', 'partially_paid']);

/** A door and everything the plate and the leaf still need after it is signed. */
interface SealedDoor {
  mark: ThresholdMark;
  paper: DoorProposal;
  designerId: string | null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function byDueDate(a: Invoice, b: Invoice): number {
  const left = parseSourceDate(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  const right = parseSourceDate(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
  return left - right;
}

export interface LetterboxDoorProps {
  /**
   * `?proposal=<id>`, off a folded `/proposals/<id>[/sign]` (retired-routes).
   * It chooses WHICH door carries the page-level `#door` anchor the fold lands
   * on — the paper the mail was actually about rather than whichever agreement
   * happens to be first. Exactly `Threshold`'s own `namedProposalId` rule.
   */
  namedProposalId?: string | null;
}

export function LetterboxDoor({ namedProposalId = null }: LetterboxDoorProps = {}) {
  const hydrated = useHydrated();
  const { user } = useAuth();
  const invoicesQuery = useClientInvoices();
  const proposalsQuery = useClientProposals();

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

  // ── the agreements waiting for her name ────────────────────────────────────
  // An ORIGIN agreement is a pending design-services document bound to no
  // project. `service_addendum` is deliberately absent: an addendum amends a
  // standing engagement and therefore always has a house to be read in.
  //
  // The summary's projectId, never the raw column — `list_client_proposals`
  // coalesces `project_commercial_documents.project_id` into it, which is what
  // makes a countersigned agreement stop being an origin agreement here.
  const pendingProposals = partitionProposals(proposalsQuery.data).pending;
  const origins = useMemo(
    () =>
      pendingProposals.flatMap((proposal) => {
        const commercial = commercialSummaryFromProposal(proposal);
        // `?? null`: `list_client_proposals` strips a null project_id from the
        // payload entirely (jsonb_strip_nulls), so the summary's projectId is
        // `undefined` on exactly the papers this door exists for.
        const boundTo = commercial.projectId ?? null;
        if (boundTo !== null || commercial.kind !== 'design_services') return [];
        const paper: DoorProposal = {
          id: proposal.id,
          title: proposal.title,
          totalAmountCents:
            typeof proposal.total_amount === 'number' ? proposal.total_amount : 0,
          sentAt: commercial.sentAt,
          updatedAt: proposal.updated_at ?? null,
          kind: commercial.kind,
          validUntil: proposal.valid_until ?? null,
        };
        return [{ paper, designerId: proposal.designer_id ?? null }];
      }),
    [pendingProposals],
  );
  const [sealed, setSealed] = useState<SealedDoor[]>([]);
  // Sticky across the signature: signing empties `origins`, and a plate that
  // reads its studio off `origins[0]` would fall back to "Your studio" the
  // moment the leaf swings — on the very page that says who holds her name.
  const originDesignerId = origins[0]?.designerId ?? sealed[0]?.designerId ?? null;

  /* Signing takes the paper out of `pendingProposals`, and the invalidation
     the door runs afterwards refetches this very list — so without this the
     section would unmount about half a second after the leaf swung, taking
     P-19's receipt and the pending-delivery recovery with it. Kept by id for
     the rest of the visit, exactly as `Threshold` keeps its own (W3-01). */
  const sealDoor = (door: SealedDoor) =>
    setSealed((held) =>
      held.some((sealedDoor) => sealedDoor.mark.id === door.mark.id)
        ? held
        : [...held, door],
    );

  // The plate has to name the studio whose letter is actually standing in the
  // slot, and `Letterbox` chooses that letter itself: the one the address
  // named, else the soonest-due open one. Repeating the choice here (over the
  // same `letters` list it is handed) is what keeps a household holding
  // letters from two studios from reading one studio's plate over the other
  // studio's letter.
  const namedId = useNamedInvoice();
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
  //
  // A household with no letter at all reads its plate off the agreement's own
  // designer instead — the same resolver, the other end of the relationship.
  const plateStudioId = inSlot?.studio_id ?? null;
  const plateDesignerId = inSlot ? (inSlot.designer_id ?? null) : originDesignerId;
  const identityQuery = useStudioIdentity({
    studioId: plateStudioId,
    designerId: plateDesignerId,
  });
  // A DISABLED TanStack v5 query reports `pending` forever, and this door holds
  // a blank page while the plate is pending — so the hold has to know the
  // difference between "still asking" and "nothing to ask".
  const plateAsked = plateStudioId !== null || plateDesignerId !== null;

  const today = useMemo(() => (hydrated ? new Date() : undefined), [hydrated]);

  const refetch = invoicesQuery.refetch;
  // Stable: the confirmation poll holds this in an effect's dependency list.
  const onRefetch = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // A door that renders the empty state and then grows a letter is the one
  // reversal a money surface may not perform — and a page that says nothing is
  // waiting and then grows an agreement is the same reversal on the signature.
  const anyoneWaiting = standing.length > 0 || origins.length > 0 || sealed.length > 0;
  if (
    invoicesQuery.isPending ||
    proposalsQuery.isPending ||
    (anyoneWaiting && plateAsked && identityQuery.isPending)
  ) {
    return (
      <div data-testid="letterbox-door-hold" aria-hidden="true" className="min-h-[40vh]" />
    );
  }

  if (!anyoneWaiting) return <ProjectsEmptyState />;

  const studioName = identityQuery.data?.name?.trim() || 'Your studio';
  // Two standings, one voice. The agreement is named first because it is what
  // the relationship turns on; the letters keep the sentence they had.
  const standings = [
    origins.length > 0
      ? `${capitalize(countInWords(origins.length))} ${
          origins.length === 1 ? 'agreement is' : 'agreements are'
        } waiting for you.`
      : null,
    open.length > 0
      ? `${capitalize(countInWords(open.length))} ${
          open.length === 1 ? 'letter is' : 'letters are'
        } waiting for you.`
      : null,
  ].filter((line): line is string => line !== null);
  const waiting =
    standings.length > 0 ? standings.join(' ') : 'Nothing is waiting for you.';

  // A sealed door's paper has already left `origins`; the door is still drawn
  // from it, so the lookup keeps it and a live paper always wins.
  const doors: SealedDoor[] = [
    ...origins.map(({ paper, designerId }) => ({
      mark: {
        id: `door:${paper.id}`,
        kind: 'door' as const,
        roomId: null,
        label: paper.title,
        anchor: 'doorstep',
        proposalId: paper.id,
        amountCents: paper.totalAmountCents,
      },
      paper,
      designerId,
    })),
    ...sealed.filter(
      (door) => !origins.some(({ paper }) => paper.id === door.paper.id),
    ),
  ];
  // The paper the address named takes `#door` when it is one of hers, exactly
  // as the house decides it — server-to-render, never in an effect: `#door` is
  // in the URL at first paint.
  const firstDoorId =
    (namedProposalId
      ? doors.find((door) => door.paper.id === namedProposalId)?.mark.id
      : null) ??
    doors[0]?.mark.id ??
    null;

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

      {doors.map((door) => (
        <DoorGate
          key={door.mark.id}
          mark={door.mark}
          proposal={door.paper}
          // The studio's note lives on a project thread; a household with no
          // house has none to pin.
          note={null}
          projectId={null}
          first={door.mark.id === firstDoorId}
          studioName={studioName}
          onSigned={() => sealDoor(door)}
        />
      ))}

      {standing.length > 0 && (
        <div className="mt-6">
          <Letterbox
            invoice={open.length > 0 ? toInvoiceModel(open[0]) : null}
            invoices={letters}
            designerName={identityQuery.data?.name ?? null}
            onRefetch={onRefetch}
            today={today}
          />
        </div>
      )}

      <EmptyStateActs />
    </div>
  );
}
