'use client';

import { useCallback, useMemo, useState } from 'react';

import { useQueries } from '@tanstack/react-query';

import { invoiceBalanceCents } from '@patina/shared';
import type { Invoice } from '@patina/supabase';
import { useClientInvoices, useStudioIdentity } from '@patina/supabase';

import { ProjectsEmptyState, EmptyStateActs } from '@/components/projects/ProjectsEmptyState';
import { ScoredAction } from '@/components/threshold/instruments/scored-action';
import { Doorplate } from '@/components/threshold/doorplate';
import { Letterbox } from '@/components/threshold/letterbox';
import {
  countInWords,
  monthAndYear,
} from '@/components/threshold/instruments/standing-sentence';
import { useAuth } from '@/hooks/use-auth';
import { clientCommercialDocumentQueryOptions } from '@/hooks/use-commercial-client';
import { useHydrated } from '@/hooks/use-hydrated';
import { partitionProposals, useClientProposals } from '@/hooks/use-proposals-client';
import {
  commercialSummaryFromProposal,
  isOriginKind,
  type CommercialDocumentBundle,
} from '@/lib/commercial-documents';
import { useNamedInvoice } from '@/lib/threshold/checkout-return';
import {
  parseSourceDate,
  toInvoiceModel,
  type PreviouslyEntry,
  type ThresholdMark,
} from '@/lib/threshold/derive';
import { visibleInvoices } from '@/lib/threshold/invoice-rollup';

import { KIND_LABEL } from './consent-copy';
import { DoorGate, type DoorProposal } from './door-gate';
import { Previously } from './previously';

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

   AND IT KEEPS THE RECORD. Her signature does not create the house — the
   studio's countersignature does, days later — so between the two acts the
   agreement is `client_signed` and STILL bound to no project. Pending is the
   only thing a door draws, so without this she would sign, come back, and meet
   "no active projects yet" over the paper she had just put her name to. The
   house does not do that: an accepted document becomes a lasting line in
   Previously (`threshold.tsx`), and that is the idiom this door borrows —
   the same `Previously`, the same `instrument:<id>` line, the same unfold into
   the paper read in full.

   The moment the studio countersigns, the project exists: `list_client_proposals`
   coalesces the commercial binding's project_id, the summary stops reading
   null, this door drops both the paper and its record, and `/` opens the house
   instead. Nothing renders it twice.

   A household with neither a letter, an agreement, nor a signed record still
   meets the empty state; this door only stands where something is. ─────── */

const OPEN_STATUSES = new Set<Invoice['status']>(['sent', 'partially_paid']);

/** A door and everything the plate and the leaf still need after it is signed. */
interface SealedDoor {
  mark: ThresholdMark;
  paper: DoorProposal;
  designerId: string | null;
}

/** A signed origin agreement, and the studio whose name is on it. */
interface KeptRecord {
  proposalId: string;
  label: string;
  /** What the LIST row can date the record with, until the bundle answers. */
  listedDate: Date | null;
  designerId: string | null;
}

/* ── THE DATE HER SIGNATURE PUT ON IT ────────────────────────────────────────
   R30's round-2 amendment: the kept record is dated by the client's OWN
   signature row — `commercial_document_signatures.signed_at`, party `client` —
   and never by `proposals.signed_at`, which `_countersign_design_services_
   agreement_impl` alone writes and which is therefore NULL through the whole
   window this record exists for.

   That row reaches the portal in one place: the bundle. `list_client_proposals`
   projects no signature at all (checked against the live definition), so the
   list can only offer `proposals.updated_at` — her signature's timestamp today,
   but only because `update_proposals_updated_at` is an unqualified BEFORE
   UPDATE trigger and no writer currently touches the row in between. That is a
   coincidence the record should not be dated by. So the bundle is read here,
   through the SAME query options the unfold uses (`useQueries`, exactly as
   `threshold.tsx` reads its held instruments) — one cache entry per paper, so
   the line and the reading it unfolds into cannot disagree, and unfolding pays
   nothing.

   The read never holds the page. A record is not an ask, the bundle is one RPC
   behind the list, and a line that blanked its date until a second read landed
   would be worse than the list's own answer — so `listedDate` stands until the
   signature row arrives. ──────────────────────────────────────────────────── */
function clientSignedAt(bundle: CommercialDocumentBundle | null | undefined): Date | null {
  const signature = (bundle?.signatures ?? []).find((row) => row.party === 'client');
  return parseSourceDate(signature?.signedAt);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ── ONE DOOR, ONE STUDIO ────────────────────────────────────────────────────
   The plate names whichever studio's letter is standing in the slot; this door
   may not. Two studios reach the same household — a studio invoice from one
   alongside an origin agreement from another, or two agreements from two
   studios, which the sentence above already pluralises for — and the sentence
   THIS door prints is the receipt for a signature: `<studio> has your
   signature.` So it is resolved from the paper's OWN designer, never from the
   page's plate, or she is told the wrong studio holds her name.

   `useStudioIdentity` keys on the ids it was asked with, so two doors from one
   studio share a single read. Null resolves to the door's own "Your studio"
   fallback, and the receipt only exists after she signs — long after this
   settles — so the door never waits on it. ──────────────────────────────── */
function OriginDoor({
  door,
  first,
  onSigned,
}: {
  door: SealedDoor;
  first: boolean;
  onSigned: () => void;
}) {
  const identity = useStudioIdentity({ studioId: null, designerId: door.designerId });
  return (
    <DoorGate
      mark={door.mark}
      proposal={door.paper}
      // The studio's note lives on a project thread; a household with no
      // house has none to pin.
      note={null}
      projectId={null}
      // R30 — no project means no project thread, but it never meant no
      // studio. The ask reaches the designer whose studio sent this paper,
      // through the direct thread the roster row behind it already allows.
      designerId={door.designerId}
      first={first}
      studioName={identity.data?.name ?? null}
      onSigned={onSigned}
    />
  );
}

/* ── WHEN THE PAPERS CANNOT BE READ (R30 · N2) ───────────────────────────────
   `useClientSafeProposals` sets no `retry`, so it inherits the app's
   `retry: 2`; after the third failure the query settles with `isPending` false
   and no data. Every paper this door draws comes from that one read — so on a
   failure `origins` and `kept` are empty, and a household whose only paper is
   a pending origin agreement met "no active projects yet" over the very
   agreement R30 exists to reach. The empty state is a CLAIM about her house,
   and the page had no grounds to make it.

   So a failed read says so, in the house's own idiom, and offers the read
   again. It is not an error surface: nothing has gone wrong with her paper,
   and the sentence says as much. ─────────────────────────────────────────── */
export function PapersUnread({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="papers-unread" className="mt-6 max-w-[52ch]">
      <p className="text-[17px] leading-[1.62] text-[var(--text-primary)]">
        Your papers could not be drawn just now. Nothing on them has changed.
      </p>
      <div className="mt-3">
        <ScoredAction
          actionKey="papers_redraw"
          regionKey="door"
          surfaceKey="the_threshold"
          variant="secondary"
          onClick={onRetry}
        >
          Try again
        </ScoredAction>
      </div>
    </div>
  );
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
  // An ORIGIN agreement is a pending document bound to no project —
  // design-services, and from Wave 3 a design-build prime, which is
  // project-less through her signature for exactly the same reason.
  // `ORIGIN_DOCUMENT_KINDS` (lib/commercial-documents.ts) is the one list, and
  // `service_addendum` is deliberately absent from it: an addendum amends a
  // standing engagement and therefore always has a house to be read in.
  //
  // The summary's projectId, never the raw column — `list_client_proposals`
  // coalesces `project_commercial_documents.project_id` into it, which is what
  // makes a countersigned agreement stop being an origin agreement here.
  const { pending: pendingProposals, accepted: acceptedProposals } = partitionProposals(
    proposalsQuery.data,
  );
  const origins = useMemo(
    () =>
      pendingProposals.flatMap((proposal) => {
        const commercial = commercialSummaryFromProposal(proposal);
        // `?? null`: `list_client_proposals` strips a null project_id from the
        // payload entirely (jsonb_strip_nulls), so the summary's projectId is
        // `undefined` on exactly the papers this door exists for.
        const boundTo = commercial.projectId ?? null;
        if (boundTo !== null || !isOriginKind(commercial.kind)) return [];
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
  // ── the agreement she has already signed ───────────────────────────────────
  // `client_signed` and still project-less: her name is on it and the studio's
  // is not yet, so no house exists to keep the record in. It is kept here, in
  // the house's own back matter, until countersigning moves both the paper and
  // its record into the project. The same filter as `origins` — a bound one is
  // the house's to show — and the same `instrument:<id>` shape `threshold.tsx`
  // mints, so `Previously` unfolds it into the paper read in full.
  const kept = useMemo(
    () =>
      acceptedProposals.flatMap<KeptRecord>((proposal) => {
        const commercial = commercialSummaryFromProposal(proposal);
        if ((commercial.projectId ?? null) !== null || !isOriginKind(commercial.kind)) {
          return [];
        }
        return [
          {
            proposalId: proposal.id,
            label: `${KIND_LABEL[commercial.kind] ?? 'Document'} · ${proposal.title}`,
            // `executedAt` is the COUNTERSIGNATURE's date, and a countersigned
            // paper has already left this door — so on every record this door
            // can draw it is null, and the line would be permanently undated.
            // `updated_at` is what the client's own act wrote:
            // `_sign_design_services_agreement_authorized` stamps it in the
            // statement that moves the row to `client_signed`. It is what the
            // LIST can say; `clientSignedAt` says what her signature said.
            listedDate: parseSourceDate(commercial.executedAt ?? proposal.updated_at),
            designerId: proposal.designer_id ?? null,
          },
        ];
      }),
    [acceptedProposals],
  );
  const keptBundles = useQueries({
    queries: kept.map((record) => clientCommercialDocumentQueryOptions(record.proposalId)),
  });
  const keptEntries: PreviouslyEntry[] = kept.map((record, index) => ({
    id: `instrument:${record.proposalId}`,
    kind: 'instrument',
    label: record.label,
    date: clientSignedAt(keptBundles[index]?.data) ?? record.listedDate,
    state: 'signed',
  }));

  const [sealed, setSealed] = useState<SealedDoor[]>([]);
  // Sticky across the signature: signing empties `origins`, and a plate that
  // reads its studio off `origins[0]` would fall back to "Your studio" the
  // moment the leaf swings — on the very page that says who holds her name.
  // The kept record carries the same studio into the visits that come after,
  // where nothing is waiting and the plate would otherwise have nothing to
  // read at all.
  const originDesignerId =
    origins[0]?.designerId ?? sealed[0]?.designerId ?? kept[0]?.designerId ?? null;

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
  // A signed agreement asks nothing of her, but it is still hers to find: the
  // door stands for the record as readily as for the ask.
  const anythingHere = anyoneWaiting || kept.length > 0;
  /* THE PAPERS MAY NOT HOLD THE MONEY (R30 round-2 amendment: the studio
     invoice "renders beside the origin agreement, never blank behind it").
     The letters read first — a household with one standing is already
     drawable, and holding it for a second read that cannot take the letter
     away is a blank page over a money surface for as long as
     `list_client_proposals` takes, which on a failure is three tries and
     their backoff (`useClientSafeProposals` sets no retry, so it inherits the
     app's `retry: 2`). The hold is only for the case it exists for: with no
     letter standing, the page's whole answer is the papers', and rendering
     "no projects yet" before they arrive is the one reversal this surface may
     not perform. An agreement arriving BESIDE a letter adds a sentence; it
     never contradicts one. */
  if (
    invoicesQuery.isPending ||
    (standing.length === 0 && proposalsQuery.isPending) ||
    (anythingHere && plateAsked && identityQuery.isPending)
  ) {
    return (
      <div data-testid="letterbox-door-hold" aria-hidden="true" className="min-h-[40vh]" />
    );
  }

  // A failed read is not an empty house. `ProjectsEmptyState` says she has
  // nothing, and after three failed tries this door does not know that — so it
  // says what it does know and offers the read again (R30 · N2).
  const papersUnread = proposalsQuery.isError;
  if (!anythingHere) {
    return papersUnread ? (
      <PapersUnread onRetry={() => void proposalsQuery.refetch()} />
    ) : (
      <ProjectsEmptyState />
    );
  }

  const studioName = identityQuery.data?.name?.trim() || 'Your studio';

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
  // A door she has just signed is still standing on the page, carrying her
  // name and the studio's receipt for it — and "Nothing is waiting for you."
  // printed directly over that reads as though the ceremony had not happened.
  // Nothing IS waiting; the sentence simply has nothing to add above a door
  // that already says so, so it steps aside until the door does. A page with
  // no door at all (the record alone, on the next visit) keeps it.
  //
  // And a page that could not read the papers may not say "Nothing is waiting
  // for you" either: it does not know. The notice below the sentence says what
  // it does know instead (R30 · N2).
  const waiting =
    standings.length > 0
      ? standings.join(' ')
      : doors.length > 0 || papersUnread
        ? null
        : 'Nothing is waiting for you.';

  return (
    <div className="min-w-0" data-testid="letterbox-door">
      <Doorplate
        projectName={studioName}
        preparedFor={user?.name ?? null}
        monthLabel={today ? monthAndYear(today) : null}
      />

      {waiting !== null && (
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.62] text-[var(--text-primary)]">
          {waiting}
        </p>
      )}

      {/* A letter standing in the slot draws the page, but it says nothing
          about the papers — so a failed papers read is still said out loud
          here rather than read as "no agreements". */}
      {papersUnread && <PapersUnread onRetry={() => void proposalsQuery.refetch()} />}

      {doors.map((door) => (
        <OriginDoor
          key={door.mark.id}
          door={door}
          first={door.mark.id === firstDoorId}
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

      {/* Renders nothing until something has closed — the house's own rule. */}
      <Previously entries={keptEntries} />

      <EmptyStateActs />
    </div>
  );
}
