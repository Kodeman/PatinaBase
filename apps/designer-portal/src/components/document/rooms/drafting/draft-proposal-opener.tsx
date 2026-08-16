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
 * The fix is the shape DocSheet already uses (doc-sheet.tsx), which is why the
 * other three ClientPicker hosts — household-sheet, open-project-sheet,
 * send-sheet — never had this problem: portal the layer to <body>, keep it in
 * the `z-50` overlay band, and make the scrim a separate absolutely-positioned
 * child. Ordering is then by DOM position, and the popover's portal is always
 * appended after the sheet's. There is deliberately no z-index bump on the
 * popover: nothing in the repo overrides that `z-50`, and a picker that has to
 * out-number its host is a picker that breaks in the next host.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient, useOrganizations } from '@patina/supabase';
import { useClients, type DesignerClient } from '@/hooks/use-clients';
import { ClientPicker } from '@/components/portal/client-picker';
import { rememberRoomOrigin } from '@/lib/document/room-origin';

export interface OpenDraftProposalArgs {
  /** Explicit active workspace stamped onto the proposal. */
  studioId: string;
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
      studioId,
      clientId,
      designerClientId,
      designerId,
    }: {
      title: string;
      studioId: string;
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
          studio_id: studioId,
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
      studioId,
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
        studioId,
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

  return { openDraftProposal, isCreating: createAgreement.isPending };
}

/** Keep only relationships already frozen to the selected exact workspace.
 * No current-owner, recency, or "primary" relationship preference is valid. */
export function normalizeDraftHouseholds(
  clients: DesignerClient[],
  studioId: string | null,
): DesignerClient[] {
  if (!studioId) return [];
  return clients.filter((relationship) => relationship.studio_id === studioId);
}

/**
 * The household-picker overlay for the ⌘K "draft a design agreement" cold
 * start. Integration toggles `open`; on household selection it opens the draft.
 */
export function DraftProposalSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { openDraftProposal, isCreating } = useOpenDraftProposal();
  const { data: clients } = useClients();
  const { data: organizations } = useOrganizations();
  const [error, setError] = useState<string | null>(null);
  const [studioId, setStudioId] = useState<string | null>(null);
  const eligibleStudios = useMemo(
    () =>
      (organizations ?? []).filter(
        (organization) =>
          organization.type === 'design_studio' &&
          organization.status === 'active' &&
          organization.membership.status === 'active' &&
          organization.membership.role !== 'guest',
      ),
    [organizations],
  );
  const households = useMemo(
    () => normalizeDraftHouseholds(clients ?? [], studioId),
    [clients, studioId],
  );

  useEffect(() => {
    if (!open) return;
    setStudioId((current) => {
      if (current && eligibleStudios.some((studio) => studio.id === current)) {
        return current;
      }
      return eligibleStudios.length === 1 ? eligibleStudios[0].id : null;
    });
  }, [eligibleStudios, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = async (
    designerClientId: string | null,
    clientId: string | null,
  ) => {
    // Defensive: the picker disables no-login rows (client_id null) for this
    // flow — an agreement can't reach a client who has no way to sign in.
    // If one somehow gets picked anyway, say so instead of quietly closing.
    if (!clientId) {
      setError('Needs a client login before an agreement can be sent — add their email first.');
      return;
    }
    setError(null);
    if (!studioId || !designerClientId) {
      setError('Choose a studio workspace and its exact household relationship.');
      return;
    }
    const household = households.find(
      (relationship) => relationship.id === designerClientId,
    );
    if (!household) {
      setError('That household relationship is no longer available. Refresh and try again.');
      return;
    }
    const clientName =
      household?.client?.full_name ?? household?.client_name ?? household?.client_email ?? null;
    try {
      await openDraftProposal({
        studioId,
        clientId,
        designerClientId: household.id,
        designerId: household.designer_id,
        clientName,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the draft. Try again.');
    }
  };

  const layer = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Draft a design agreement for an existing household"
      data-testid="draft-proposal-layer"
    >
      {/* The scrim is its OWN element, not the layer. When the layer carried
          both the veil and the dismiss handler, every mousedown that landed on
          it — including one aimed at the picker's popover — satisfied
          `e.target === e.currentTarget` and closed the sheet. */}
      <button
        type="button"
        aria-label="Close draft agreement backdrop"
        data-testid="draft-proposal-backdrop"
        tabIndex={-1}
        onMouseDown={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(28,25,23,0.28)]"
      />
      <div className="relative w-full max-w-[420px] rounded-[8px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-5 py-5">
        <p className="font-heading text-[1.15rem] text-[var(--color-charcoal)]">
          Draft a design agreement
        </p>
        <p className="mb-4 mt-1 text-[0.78rem] text-[var(--color-aged-oak)]">
          For an existing household — no lead, no discovery. Pick the client and the Drafting Room
          opens in its services posture.
        </p>
        {eligibleStudios.length > 1 && (
          <select
            aria-label="Studio workspace"
            value={studioId ?? ''}
            onChange={(event) => {
              setStudioId(event.target.value || null);
              setError(null);
            }}
            className="mb-3 w-full rounded border border-[var(--doc-ink-border)] bg-transparent px-2 py-2 text-[0.8rem] text-[var(--color-charcoal)]"
          >
            <option value="">Choose a studio workspace…</option>
            {eligibleStudios.map((studio) => (
              <option key={studio.id} value={studio.id}>
                {studio.name}
              </option>
            ))}
          </select>
        )}
        <ClientPicker
          value={null}
          onChange={(clientId) => {
            if (!clientId) {
              setError(
                'Needs a client login before an agreement can be sent — add their email first.',
              );
            }
          }}
          onRelationshipChange={(relationshipId, clientId) => {
            void handlePick(relationshipId, clientId);
          }}
          studioId={studioId}
          placeholder={isCreating ? 'Opening the draft…' : 'Search or add a household…'}
          disabled={isCreating || !studioId}
          clientOptions={households}
          requireClientLogin
        />
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-[3px] border border-[var(--color-terracotta,#c77b6e)] bg-[rgba(199,123,110,0.06)] px-2.5 py-1.5 text-[0.72rem] leading-snug text-[var(--color-terracotta,#c77b6e)]"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );

  // Portalled to <body>, exactly as DocSheet is. The stack orders by DOM
  // position: ClientPicker's Radix popover portals to <body> too, and it is
  // appended AFTER this layer (it cannot exist before the sheet is open), so at
  // equal z-index the popover paints on top. That is the whole mechanism, and
  // it is why the three DocSheet-hosted ClientPickers work and this one did
  // not. Rendered inline the layer never joins that ordering at all.
  return typeof document === 'undefined' ? layer : createPortal(layer, document.body);
}

/** Open the household-picker cold start from anywhere (⌘K). The overlay is
 *  layout-mounted, so this is the always-mounted-listener pattern
 *  (openInvoiceComposer), not the Desk pending-flag one. */
export function openDraftProposalPicker() {
  window.dispatchEvent(new CustomEvent('document:open-draft-proposal'));
}

/** The layout host for the ⌘K "draft a design agreement" cold start. */
export function DraftProposalOverlay() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('document:open-draft-proposal', onOpen);
    return () => window.removeEventListener('document:open-draft-proposal', onOpen);
  }, []);
  return <DraftProposalSheet open={open} onClose={() => setOpen(false)} />;
}
