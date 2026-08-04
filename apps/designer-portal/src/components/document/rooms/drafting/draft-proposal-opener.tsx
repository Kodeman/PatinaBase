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
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useClients, type DesignerClient } from '@/hooks/use-clients';
import { useAuth } from '@/hooks/use-auth';
import { ClientPicker } from '@/components/portal/client-picker';
import { rememberRoomOrigin } from '@/lib/document/room-origin';

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

  return { openDraftProposal, isCreating: createAgreement.isPending };
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { openDraftProposal, isCreating } = useOpenDraftProposal();
  const { data: clients } = useClients();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const households = useMemo(
    () => normalizeDraftHouseholds(clients ?? [], user?.id),
    [clients, user?.id],
  );

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
    const clientName =
      household?.client?.full_name ?? household?.client_name ?? household?.client_email ?? null;
    try {
      await openDraftProposal({
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(28,25,23,0.28)] px-4 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Draft a design agreement for an existing household"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[420px] rounded-[8px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] px-5 py-5">
        <p className="font-heading text-[1.15rem] text-[var(--color-charcoal)]">
          Draft a design agreement
        </p>
        <p className="mb-4 mt-1 text-[0.78rem] text-[var(--color-aged-oak)]">
          For an existing household — no lead, no discovery. Pick the client and the Drafting Room
          opens in its services posture.
        </p>
        <ClientPicker
          value={null}
          onChange={handlePick}
          placeholder={isCreating ? 'Opening the draft…' : 'Search or add a household…'}
          disabled={isCreating}
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
