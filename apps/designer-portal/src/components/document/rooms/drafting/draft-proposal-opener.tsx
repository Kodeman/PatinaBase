'use client';

/**
 * Draft a design agreement for an existing household (R85 · PRO-01) — the
 * ad-hoc entry to the Drafting Room that SKIPS lead → discovery for a repeat
 * client. It creates an EMPTY draft design agreement (no template — templates
 * are retired per R85; the Discovery-seeded path covers the seeded case)
 * linked to the chosen household, then walks straight into `/drafting/[id]`.
 *
 * Two exports:
 *   • `useOpenDraftProposal()` — the primitive opener. Integration (the ⌘K
 *     "draft a design agreement" row, verb key `draft-proposal` unchanged for
 *     analytics continuity) passes both the profile and designer-client
 *     relationship identities.
 *   • `DraftProposalSheet` — a paper overlay that reuses the R73 ClientPicker
 *     (invite-and-link a captured household included) to pick the household,
 *     then calls the primitive. Mount it from the ⌘K row (integration owns the
 *     row itself). A household with no email on file (no Patina profile and
 *     not even invitable) has no way to reach the client portal to sign, so
 *     the picker disables those rows here (`requireClientLogin`) with an
 *     inline hint rather than letting the dialog silently no-op.
 *
 * K14 (RC7-E3-5) — a household that already has an open Discovery-seeded
 * Direction is not quietly forked. Before any write the sheet reads the
 * household's open Direction fresh (`openDirectionQuery`); when there is one,
 * it asks: "Continue the existing Direction" opens it and writes nothing;
 * "Start a separate agreement" writes the empty draft as before, deliberately.
 * With no open Direction the pick opens the draft exactly as it always has.
 *
 * Zero shadows (D4); Esc closes; failures render inline (R83 — no toast).
 *
 * LAYERING. The sheet was mouse-dead: the picker opened, and every click on it
 * closed the dialog instead of selecting a household. Two causes, one shape.
 *   (a) The layer sat INLINE at `z-[70]`. ClientPicker's Radix popover portals
 *       to <body> at `z-50`, so the backdrop painted over it —
 *       `document.elementFromPoint` under the cursor returned the backdrop, not
 *       the row the designer could plainly see.
 *   (b) The layer was ALSO the backdrop and carried the dismiss handler, so the
 *       mousedown that landed on it read as "clicked outside" and closed.
 * The fix was the shape DocSheet already uses (doc-sheet.tsx), which is why the
 * other three ClientPicker hosts — household-sheet, open-project-sheet,
 * send-sheet — never had this problem: portal the layer to <body>, keep it in
 * the `z-50` overlay band, and make the scrim a separate absolutely-positioned
 * child. Ordering is then by DOM position, and the popover's portal is always
 * appended after the sheet's. There is deliberately no z-index bump on the
 * popover: nothing in the repo overrides that `z-50`, and a picker that has to
 * out-number its host is a picker that breaks in the next host. The sheet now
 * IS a DocSheet (RC-8 review), so it also has that dialog's focus trap and
 * focus restoration, which the hand-built layer never had.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient, openDirectionQuery, type OpenDirection } from '@patina/supabase';
import { useClients, type DesignerClient } from '@/hooks/use-clients';
import { useAuth } from '@/hooks/use-auth';
import { ClientPicker } from '@/components/portal/client-picker';
import { rememberRoomOrigin } from '@/lib/document/room-origin';
import { DocumentAction, DocumentActionGroup } from '@/components/document/document-action';
import { DocSheet } from '@/components/document/overlays/doc-sheet';

export interface OpenDraftProposalArgs {
  /** The household's profiles.id (designer_clients.client_id) — a linked client. */
  clientId: string;
  /** The household relationship row preserved on proposal.designer_client_id. */
  designerClientId: string;
  /** Owner of the exact relationship row; may be a studio collaborator. */
  designerId: string;
  /** Optional display name for the draft's title; falls back to "New proposal". */
  clientName?: string | null;
}

/**
 * The primitive opener. Creates an empty draft proposal for the household and
 * navigates into the Drafting Room. Returns the new proposal id.
 *
 * Signature: `openDraftProposal(args: OpenDraftProposalArgs) => Promise<string>`
 */
export function useOpenDraftProposal() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  // Hard cutover: current UI creates the commercial kind explicitly. The DB
  // default stays `legacy` only for historical records and callers.
  const createAgreement = useMutation({
    mutationKey: ['create-design-services-agreement'],
    meta: { errorSurface: 'inline' },
    mutationFn: async ({
      title,
      clientId,
      designerClientId,
      designerId,
    }: {
      title: string;
      clientId: string;
      designerClientId: string;
      designerId: string;
    }) => {
      const supabase = createBrowserClient() as any;
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error('Sign in before opening an agreement.');

      const { data, error } = await supabase
        .from('proposals')
        .insert({
          designer_id: designerId,
          client_id: clientId,
          designer_client_id: designerClientId,
          title,
          status: 'draft',
          total_amount: 0,
          document_kind: 'design_services',
          commercial_state: 'draft',
        })
        .select('id')
        .single();
      if (error) throw error;
      if (!data?.id) {
        throw new Error('The draft was not created. Refresh and try again.');
      }
      return data as { id: string };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
      void queryClient.invalidateQueries({ queryKey: ['proposal-stats'] });
    },
  });

  const openDraftProposal = useCallback(
    async ({
      clientId,
      designerClientId,
      designerId,
      clientName,
    }: OpenDraftProposalArgs): Promise<string> => {
      const trimmed = clientName?.trim();
      const title = trimmed
        ? `${trimmed} — design services agreement`
        : 'Design services agreement';
      const proposal = await createAgreement.mutateAsync({
        title,
        clientId,
        designerClientId,
        designerId,
      });
      // Stash where we came from so "← back" out of the Room returns here.
      rememberRoomOrigin(pathname);
      router.push(`/drafting/${proposal.id}`);
      return proposal.id as string;
    },
    [createAgreement, router, pathname],
  );

  /** K14 — open the household's existing Direction; writes nothing. A draft
   *  opens in its Contract Room; an issued one on its own paper (the Room
   *  would only evict it there). */
  const continueDirection = useCallback(
    (direction: Pick<OpenDirection, 'id' | 'commercial_state'>) => {
      rememberRoomOrigin(pathname);
      router.push(
        direction.commercial_state === 'draft'
          ? `/drafting/${direction.id}`
          : `/doc/${direction.id}`,
      );
    },
    [router, pathname],
  );

  return { openDraftProposal, continueDirection, isCreating: createAgreement.isPending };
}

/** Studio RLS can expose one relationship per teammate for the same household.
 * The cold-start picker is household-shaped, so collapse linked duplicates and
 * prefer the signed-in designer's relationship. A household owned only by a
 * collaborator stays available; proposal ownership follows that exact row. */
export function normalizeDraftHouseholds(
  clients: DesignerClient[],
  currentDesignerId: string | null | undefined,
): DesignerClient[] {
  const normalized: DesignerClient[] = [];
  const indexByHousehold = new Map<string, number>();

  for (const relationship of clients) {
    const key = relationship.client_id
      ? `profile:${relationship.client_id}`
      : `relationship:${relationship.id}`;
    const existingIndex = indexByHousehold.get(key);
    if (existingIndex === undefined) {
      indexByHousehold.set(key, normalized.length);
      normalized.push(relationship);
      continue;
    }

    const existing = normalized[existingIndex];
    if (
      currentDesignerId &&
      relationship.designer_id === currentDesignerId &&
      existing.designer_id !== currentDesignerId
    ) {
      normalized[existingIndex] = relationship;
    }
  }

  return normalized;
}

/**
 * The household-picker overlay for the ⌘K "draft a design agreement" cold
 * start. Integration toggles `open`; on household selection it opens the draft.
 */
export function DraftProposalSheet({
  open,
  onClose,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  /** Where focus goes on close when the control that opened the sheet is gone
   *  (a ⌘K row unmounts with the palette before the sheet can capture it). */
  returnFocusTo?: HTMLElement | null;
}) {
  const { openDraftProposal, continueDirection, isCreating } = useOpenDraftProposal();
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // K14 — the picked household's open Direction, awaiting the designer's choice.
  const [choice, setChoice] = useState<{
    household: DesignerClient;
    direction: OpenDirection;
  } | null>(null);
  const households = useMemo(
    () => normalizeDraftHouseholds(clients ?? [], user?.id),
    [clients, user?.id],
  );
  // The pick a pending Direction read answers for. A close, or a newer pick,
  // moves it on, so a read that resolves after either is dropped unread: it
  // neither writes a draft nor brings back a choice nobody is looking at.
  const lookupRef = useRef(0);
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) return;
    lookupRef.current += 1;
    setChoice(null);
    setError(null);
    setChecking(false);
  }, [open]);
  // An unmount mid-read drops it too: nothing is left to draft for.
  useEffect(
    () => () => {
      lookupRef.current += 1;
    },
    [],
  );

  // The picker gives way to the choice, so focus goes to its first act rather
  // than falling to <body> with the picker that held it.
  useEffect(() => {
    if (choice) continueRef.current?.focus();
  }, [choice]);

  const handlePick = async (clientId: string | null) => {
    // Defensive: the picker disables no-login rows (client_id null) for this
    // flow — an agreement can't reach a client who has no way to sign in.
    // If one somehow gets picked anyway, say so instead of quietly closing.
    if (!clientId) {
      setError('Needs a client login before an agreement can be sent — add their email first.');
      return;
    }
    setError(null);
    const household = households.find((dc) => dc.client_id === clientId);
    if (!household) {
      setError('That household relationship is no longer available. Refresh and try again.');
      return;
    }
    // K14 — read the household's open Direction fresh, across every
    // relationship row it has here, before anything is written.
    const lookup = ++lookupRef.current;
    let direction: OpenDirection | null;
    setChecking(true);
    try {
      direction = await queryClient.fetchQuery({
        ...openDirectionQuery(
          (clients ?? []).filter((dc) => dc.client_id === clientId).map((dc) => dc.id),
        ),
        staleTime: 0,
      });
    } catch {
      if (lookup !== lookupRef.current) return;
      setChecking(false);
      setError('Could not check this household for an open Direction. Try again.');
      return;
    }
    if (lookup !== lookupRef.current) return;
    setChecking(false);
    if (direction) {
      setChoice({ household, direction });
      return;
    }
    await startAgreement(household);
  };

  const startAgreement = async (household: DesignerClient) => {
    setError(null);
    const clientName =
      household.client?.full_name ?? household.client_name ?? household.client_email ?? null;
    try {
      await openDraftProposal({
        clientId: household.client_id as string,
        designerClientId: household.id,
        designerId: household.designer_id,
        clientName,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the draft. Try again.');
    }
  };

  const choiceName = choice
    ? (choice.household.client?.full_name ??
      choice.household.client_name ??
      choice.household.client_email ??
      'This household')
    : null;

  // DocSheet — the Document's dialog (as household-sheet, open-project-sheet
  // and send-sheet, the other ClientPicker hosts): portalled to <body> in the
  // z-50 band with its scrim as a separate child, a focus trap, Esc, scroll
  // lock and focus restored to the control that opened it.
  return (
    <DocSheet
      open={open}
      onClose={onClose}
      title="Draft a design agreement for an existing household"
      kind="draft-proposal"
      returnFocusTo={returnFocusTo}
    >
      <div data-testid="draft-proposal-layer" className="mx-auto w-full max-w-[420px]">
        <p className="font-heading text-[1.15rem] text-[var(--color-charcoal)]">
          Draft a design agreement
        </p>
        {choice ? (
          <>
            <p
              className="mb-2 mt-1 text-[0.78rem] text-[var(--color-aged-oak)]"
              data-testid="draft-proposal-open-direction"
            >
              {choiceName} already has an open Direction
              {choice.direction.title ? <>, “{choice.direction.title}”</> : null}. Continue it, or
              start a separate agreement beside it; the Direction stays as it is.
            </p>
            <DocumentActionGroup
              surfaceKey="drafting"
              regionKey="draft-proposal-open-direction"
              aria-label="Open Direction choice"
            >
              <DocumentAction
                ref={continueRef}
                actionKey="continue-open-direction"
                variant="primary"
                disabled={isCreating}
                onClick={() => {
                  continueDirection(choice.direction);
                  onClose();
                }}
              >
                Continue the existing Direction
              </DocumentAction>
              <DocumentAction
                actionKey="start-separate-agreement"
                variant="secondary"
                disabled={isCreating}
                loading={isCreating}
                loadingLabel="Opening the draft…"
                onClick={() => startAgreement(choice.household)}
              >
                Start a separate agreement
              </DocumentAction>
            </DocumentActionGroup>
          </>
        ) : (
          <>
            <p className="mb-4 mt-1 text-[0.78rem] text-[var(--color-aged-oak)]">
              For an existing household — no lead, no discovery. Pick the client and the Contract
              Room opens in its services posture.
            </p>
            <ClientPicker
              value={null}
              onChange={handlePick}
              placeholder={
                checking
                  ? 'Checking for an open Direction…'
                  : isCreating
                    ? 'Opening the draft…'
                    : 'Search or add a household…'
              }
              disabled={checking || isCreating}
              clientOptions={households}
              requireClientLogin
            />
          </>
        )}
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-[3px] border border-[var(--color-terracotta,#c77b6e)] bg-[rgba(199,123,110,0.06)] px-2.5 py-1.5 text-[0.72rem] leading-snug text-[var(--color-terracotta,#c77b6e)]"
          >
            {error}
          </div>
        )}
      </div>
    </DocSheet>
  );
}

/** Open the household-picker cold start from anywhere (⌘K). The overlay is
 *  layout-mounted, so this is the always-mounted-listener pattern
 *  (openInvoiceComposer), not the Desk pending-flag one. `returnFocusTo` is
 *  for an opener that unmounts as it opens the sheet: ⌘K passes the element
 *  that held focus before the palette opened (its F21 restore target). */
export function openDraftProposalPicker(options?: { returnFocusTo?: HTMLElement | null }) {
  window.dispatchEvent(
    new CustomEvent('document:open-draft-proposal', {
      detail: { returnFocusTo: options?.returnFocusTo ?? null },
    }),
  );
}

/** The layout host for the ⌘K "draft a design agreement" cold start. */
export function DraftProposalOverlay() {
  const [open, setOpen] = useState(false);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ returnFocusTo?: HTMLElement | null } | null>).detail;
      setReturnFocusTo(detail?.returnFocusTo ?? null);
      setOpen(true);
    };
    window.addEventListener('document:open-draft-proposal', onOpen);
    return () => window.removeEventListener('document:open-draft-proposal', onOpen);
  }, []);
  return (
    <DraftProposalSheet open={open} onClose={() => setOpen(false)} returnFocusTo={returnFocusTo} />
  );
}
