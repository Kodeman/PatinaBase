'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  COMPLIANCE_DOC_TYPE_LABELS,
  complianceKeys,
  invalidateComplianceFanout,
  type ComplianceDocType,
  type StudioComplianceDocument,
} from './use-studio-contacts';
import { touchInstantDay } from './use-touches';

// ═══════════════════════════════════════════════════════════════════════════
// THE INBOUND QUEUE — paper the FIRM sent, waiting for the studio's check
//
// Spec §6. A document that arrives through the paperwork door lands unverified
// (`inbound = true`, `verified_at IS NULL`) and NEVER touches the verified
// paper already on file: the two coexist until a studio member confirms or
// refuses the new one (spec §5.4 / acceptance 5).
//
// Confirm supersedes; reject records a reason and drafts ONE chase. Neither
// deletes a row — a superseded or refused document stays queryable, which is
// the existing pattern for compliance paper (crm-model line 310).
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export const inboundDocumentKeys = {
  all: ['inbound-compliance-documents'] as const,
  forHolder: (holderId: string | null | undefined) =>
    ['inbound-compliance-documents', holderId ?? null] as const,
};

/**
 * 00637's named refusals, said in words.
 *
 * R-AZ's four confirm legs — a successor with no end date, one that has
 * already lapsed, one that ends sooner than the paper it retires, and one that
 * drops a gate the retired paper held — are all ordinary firm behaviour: a
 * renewal for a shorter term, a dated certificate that lapsed in the post.
 * Every one is raised as a bare token with a HINT, and `inbound-queue-band`
 * prints this function's answer in a `role="alert"` region, so a token missing
 * from this map is announced aloud to the studio as the whole explanation
 * (W4 r2 MAJOR-1). All six tokens 00637 can raise are named here.
 */
const INBOUND_REFUSAL_SENTENCES: Record<string, string> = {
  compliance_confirm_needs_a_live_date:
    'This paper retires a dated one, so it needs its own end date, and that ' +
    'date has to be ahead. Ask the firm for the dates before you confirm it.',
  compliance_confirm_already_lapsed:
    'This paper has already lapsed, so it cannot retire the paper on file. ' +
    'Ask the firm for a current one.',
  compliance_confirm_ends_sooner:
    'This paper ends before the one it would retire. Ask the firm for a ' +
    'renewal that runs at least as long.',
  compliance_confirm_drops_a_gate:
    'The paper this would retire blocks more than this one does. Confirming ' +
    'it would quietly open a gate the studio had shut.',
  compliance_rejection_reason_required:
    'Say why it is refused. A refusal the firm cannot read is one it cannot fix.',
  compliance_document_already_verified:
    'This document has already been confirmed.',
  compliance_document_already_rejected:
    'This document has already been refused.',
  compliance_document_not_found:
    "This paper is not in your studio's book.",
};

export function asInboundDocumentError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [token, sentence] of Object.entries(INBOUND_REFUSAL_SENTENCES)) {
    if (message.includes(token)) return sentence;
  }
  if (/row-level security|permission denied|42501/i.test(message)) {
    return "This studio's book is not yours to write. Ask an owner or admin.";
  }
  return message || 'Could not record that just now.';
}

/** "2 documents waiting for your check" — spec §6's band header. */
export function inboundQueueHeading(count: number): string {
  return `${count} document${count === 1 ? '' : 's'} waiting for your check`;
}

/**
 * "COI, general liability, uploaded 12 Sep 2026 by Twin Cities Drywall."
 *
 * `other_named` IS THE FIRM'S OWN NAME FOR ITS PAPER (W4 r3 MAJOR-1). The map
 * answers 'Other' for it, which is truthy, so the `?? doc.doc_label` fallback
 * below was unreachable and this line printed "Other" — on the one face where
 * Confirm (which retires the paper on file and opens its gate) and Reject
 * (which files a refusal the firm reads) are taken. The company card's Paper
 * table (`compliance-table.tsx:40-47`) and the firm's own `/paperwork` page
 * (`paperwork-model.ts:110-115`) both special-case it, so the same card named
 * the paper twice.
 */
export function inboundDocumentLine(
  doc: Pick<StudioComplianceDocument, 'doc_type' | 'doc_label' | 'created_at'>,
  firmName: string,
): string {
  const label =
    doc.doc_type === 'other_named'
      ? doc.doc_label?.trim() || 'Other'
      : (COMPLIANCE_DOC_TYPE_LABELS[doc.doc_type as ComplianceDocType] ??
        doc.doc_label ??
        doc.doc_type);
  // `created_at` is timestamptz: the studio's calendar day, never the UTC
  // slice, or an evening upload reads as tomorrow's (W4 r3 MAJOR-4).
  const date = touchInstantDay(doc.created_at);
  return date
    ? `${label}, uploaded ${date} by ${firmName}.`
    : `${label}, uploaded by ${firmName}.`;
}

/**
 * The paper waiting on one holder: inbound, unconfirmed, unrefused.
 *
 * NOT `useComplianceDocuments({ unverifiedOnly: true })`: that hook runs its
 * rows through `retainedComplianceDocuments`, which is the reckoning of what
 * the studio HOLDS, and a pending upload holds nothing yet. The band asks a
 * different question — what has arrived and not been looked at.
 */
export function useInboundDocuments(holderId: string | null | undefined) {
  return useQuery({
    queryKey: inboundDocumentKeys.forHolder(holderId),
    enabled: !!holderId,
    queryFn: async (): Promise<StudioComplianceDocument[]> => {
      if (!holderId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_compliance_documents')
        .select('*')
        .eq('holder_id', holderId)
        .eq('inbound', true)
        .is('verified_at', null)
        .is('rejected_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StudioComplianceDocument[];
    },
  });
}

function invalidateInbound(
  queryClient: ReturnType<typeof useQueryClient>,
  holderId: string,
) {
  void queryClient.invalidateQueries({ queryKey: inboundDocumentKeys.all });
  // Confirming a document changes the paper WORD on the Directory row, the
  // seat line, every roster row and the card's own table — the same fan-out
  // `useRecordComplianceDocument` performs, for the same reason.
  invalidateComplianceFanout(queryClient, holderId);
  void queryClient.invalidateQueries({ queryKey: complianceKeys.all });
}

/**
 * Spec §6 Confirm — stamp the pending paper and retire what it replaces.
 *
 * Idempotent in the database: a second Confirm on a stamped row changes
 * nothing and returns the same id.
 */
export function useConfirmInboundDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      holderId: string;
    }): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('confirm_inbound_document', {
        p_document_id: input.documentId,
      });
      if (error) throw new Error(asInboundDocumentError(error));
      return data as string;
    },
    onSuccess: (_data, input) => invalidateInbound(queryClient, input.holderId),
  });
}

/**
 * Spec §6 Reject — record the refusal and its reason, and draft ONE chase.
 *
 * The chase lands `awaiting_review` on the existing agent queue (Agent OS: no
 * automated external sends), keyed idempotently on the document, so a
 * double-tap drafts one note.
 */
export function useRejectInboundDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      holderId: string;
      reason: string;
    }): Promise<string> => {
      const reason = input.reason.trim();
      if (!reason) {
        throw new Error(
          INBOUND_REFUSAL_SENTENCES.compliance_rejection_reason_required,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('reject_inbound_document', {
        p_document_id: input.documentId,
        p_reason: reason,
      });
      if (error) throw new Error(asInboundDocumentError(error));
      return data as string;
    },
    onSuccess: (_data, input) => invalidateInbound(queryClient, input.holderId),
  });
}
