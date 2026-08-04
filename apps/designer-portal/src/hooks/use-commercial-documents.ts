"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@patina/supabase";
import {
  asCommercialDocumentKind,
  asCommercialState,
  type CommercialDocument,
  type CommercialSignature,
  type CountersignDesignServicesResult,
  type ProjectBillingAuthority,
  type ServiceAgreementTerms,
  type ServiceRate,
} from "@/lib/document/commercial-documents";

const getSupabase = () => createBrowserClient() as any;

export const commercialDocumentKeys = {
  bundle: (proposalId: string) => ["commercial-document", proposalId] as const,
  authority: (projectId: string) =>
    ["project-billing-authority", projectId] as const,
};

export interface CommercialDocumentBundle {
  document: CommercialDocument;
  terms: ServiceAgreementTerms | null;
  rates: ServiceRate[];
  signatures: CommercialSignature[];
}

const finiteCents = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return stringList(parsed);
  } catch {
    // A newline-delimited legacy value remains readable during rollout.
  }
  return trimmed
    .split("\n")
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
};

function mapDocument(row: any): CommercialDocument {
  return {
    id: String(row.id),
    projectId: typeof row.project_id === "string" ? row.project_id : null,
    kind: asCommercialDocumentKind(row.document_kind),
    state: asCommercialState(row.commercial_state),
    title: String(row.title ?? "Commercial document"),
    version: Number(row.version ?? 1),
    waveName: null,
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
    executedAt:
      typeof row.accepted_at === "string" && row.commercial_state === "executed"
        ? row.accepted_at
        : null,
    supersededAt:
      typeof row.superseded_at === "string" ? row.superseded_at : null,
    replacementProposalId:
      typeof row.replacement_proposal_id === "string"
        ? row.replacement_proposal_id
        : null,
  };
}

function mapTerms(
  row: any,
  proposalId: string,
  currentRateVersion: number,
): ServiceAgreementTerms | null {
  if (!row) return null;
  return {
    proposalId,
    scope: String(row.scope ?? ""),
    deliverables: stringList(row.deliverables),
    exclusions: stringList(row.exclusions),
    billingCeilingCents: finiteCents(row.billing_ceiling_cents),
    retainerAmountCents: finiteCents(row.retainer_amount_cents),
    retainerActivationPolicy:
      row.retainer_activation_policy === "retainer_paid"
        ? "retainer_paid"
        : "immediate",
    billingCadence:
      row.billing_cadence === "biweekly" || row.billing_cadence === "milestone"
        ? row.billing_cadence
        : "monthly",
    currency: String(row.currency ?? "USD"),
    terms: String(row.terms ?? ""),
    currentRateVersion: Number(row.current_rate_version ?? currentRateVersion),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function mapRate(row: any): ServiceRate {
  return {
    id: String(row.id),
    proposalId: String(row.proposal_id),
    version: Number(row.version ?? 1),
    roleName: String(row.role_name ?? ""),
    hourlyRateCents: finiteCents(row.hourly_rate_cents),
    effectiveAt:
      typeof row.effective_at === "string"
        ? row.effective_at
        : typeof row.created_at === "string"
          ? row.created_at
          : null,
  };
}

function mapSignature(row: any): CommercialSignature {
  const metadata =
    row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    party: row.party_role === "studio" ? "studio" : "client",
    signerName: String(row.signed_name ?? row.signer_name ?? ""),
    signedAt: String(row.signed_at ?? ""),
    consentVersion: Number(
      metadata.consent_version ?? row.consent_version ?? 1,
    ),
    documentFingerprint: String(
      row.evidence_fingerprint ?? row.document_fingerprint ?? "",
    ),
  };
}

export async function fetchCommercialDocumentBundle(
  proposalId: string,
): Promise<CommercialDocumentBundle> {
  const supabase = getSupabase();
  const [proposalResult, termsResult, ratesResult, signaturesResult] =
    await Promise.all([
      supabase
        .from("proposals")
        .select(
          "id, project_id, document_kind, commercial_state, title, version, sent_at, accepted_at, superseded_at, replacement_proposal_id",
        )
        .eq("id", proposalId)
        .single(),
      supabase
        .from("proposal_service_terms")
        .select("*")
        .eq("proposal_id", proposalId)
        .maybeSingle(),
      supabase
        .from("proposal_service_rates")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("version", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("commercial_document_signatures")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("signed_at", { ascending: true }),
    ]);

  if (proposalResult.error) throw proposalResult.error;
  if (termsResult.error) throw termsResult.error;
  if (ratesResult.error) throw ratesResult.error;
  if (signaturesResult.error) throw signaturesResult.error;

  const rates: ServiceRate[] = (ratesResult.data ?? []).map(mapRate);
  const currentRateVersion = rates.reduce(
    (latest, rate) => Math.max(latest, rate.version),
    1,
  );

  const signatures: CommercialSignature[] = (signaturesResult.data ?? []).map(
    mapSignature,
  );
  const document = mapDocument(proposalResult.data);
  const studioSignature = signatures.find(
    (signature) => signature.party === "studio",
  );

  return {
    document: studioSignature
      ? { ...document, executedAt: studioSignature.signedAt }
      : document,
    terms: mapTerms(termsResult.data, proposalId, currentRateVersion),
    rates: rates.filter((rate) => rate.version === currentRateVersion),
    signatures,
  };
}

export function useCommercialDocument(proposalId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.bundle(proposalId),
    queryFn: () => fetchCommercialDocumentBundle(proposalId),
    enabled: enabled && Boolean(proposalId),
  });
}

export interface ServiceAgreementDraftInput {
  terms: ServiceAgreementTerms;
  rates: ServiceRate[];
}

export function useSaveServiceAgreement(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["save-service-agreement", proposalId],
    mutationFn: async ({ terms, rates }: ServiceAgreementDraftInput) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc("upsert_design_services_draft", {
        p_proposal_id: proposalId,
        p_terms: {
          scope: terms.scope.trim(),
          deliverables: terms.deliverables
            .map((item) => item.trim())
            .filter(Boolean),
          exclusions: terms.exclusions
            .map((item) => item.trim())
            .filter(Boolean),
          billingCeilingCents: Math.round(terms.billingCeilingCents),
          retainerAmountCents: Math.round(terms.retainerAmountCents),
          retainerActivationPolicy: terms.retainerActivationPolicy,
          billingCadence: terms.billingCadence,
          currency: terms.currency,
          terms: terms.terms.trim(),
          currentRateVersion: terms.currentRateVersion,
        },
        p_rates: rates
          .filter((rate) => rate.roleName.trim() && rate.hourlyRateCents > 0)
          .map((rate, sortOrder) => ({
            roleName: rate.roleName.trim(),
            hourlyRateCents: Math.round(rate.hourlyRateCents),
            sortOrder,
            effectiveAt: rate.effectiveAt,
          })),
      });
      if (error) throw error;

      return await fetchCommercialDocumentBundle(proposalId);
    },
    onSuccess: (bundle) => {
      queryClient.setQueryData(
        commercialDocumentKeys.bundle(proposalId),
        bundle,
      );
      void queryClient.invalidateQueries({
        queryKey: ["proposal", proposalId],
      });
      void queryClient.invalidateQueries({ queryKey: ["commercial-document"] });
    },
  });
}

function mapCountersignResult(value: any): CountersignDesignServicesResult {
  const row = Array.isArray(value) ? value[0] : value;
  const projectId = row?.projectId ?? row?.project_id;
  const billingAuthorityId =
    row?.billingAuthorityId ?? row?.billing_authority_id;
  if (!projectId || !billingAuthorityId) {
    throw new Error(
      "The countersign result did not include its authority links.",
    );
  }
  return {
    proposalId: String(row.proposalId ?? row.proposal_id),
    commercialState: asCommercialState(
      row.commercialState ?? row.commercial_state,
    ),
    projectId: String(projectId),
    agreementId: String(
      row.agreementId ?? row.agreement_id ?? row.proposalId ?? row.proposal_id,
    ),
    billingAuthorityId: String(billingAuthorityId),
    newlyExecuted: Boolean(row.newlyExecuted ?? row.newly_executed),
  };
}

export function useCountersignDesignServicesAgreement(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["countersign-design-services", proposalId],
    mutationFn: async (signerName: string) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "countersign_design_services_agreement",
        {
          p_proposal_id: proposalId,
          p_signer_name: signerName.trim(),
        },
      );
      if (error) throw error;
      const result = mapCountersignResult(data);
      if (result.newlyExecuted) {
        void supabase.functions
          .invoke("commercial-document-notify", {
            body: { documentId: proposalId, transition: "executed" },
          })
          .catch(() => {
            // The countersign transaction is durable; notification replay is
            // independent and must not repeat project activation.
          });
      }
      return result;
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["proposal", proposalId],
      });
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.bundle(proposalId),
      });
      void queryClient.invalidateQueries({ queryKey: ["document-state"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-engagements"] });
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.authority(result.projectId),
      });
    },
  });
}

export async function fetchCommercialDocumentSendFingerprint(
  proposalId: string,
): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    "get_commercial_document_send_snapshot",
    { p_proposal_id: proposalId },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const fingerprint =
    typeof row === "string"
      ? row
      : (row?.documentFingerprint ??
        row?.fingerprint ??
        row?.document_fingerprint ??
        row?.expected_fingerprint);
  if (typeof fingerprint !== "string" || !fingerprint) {
    throw new Error("The agreement send fingerprint is unavailable.");
  }
  return fingerprint;
}

export function useSendServiceAgreement(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["send-service-agreement", proposalId],
    mutationFn: async ({
      personalMessage,
      validUntil,
    }: {
      personalMessage?: string;
      validUntil?: string;
    }) => {
      const supabase = getSupabase();
      const expectedFingerprint =
        await fetchCommercialDocumentSendFingerprint(proposalId);
      const { data, error } = await supabase.rpc("send_commercial_document", {
        p_proposal_id: proposalId,
        p_expected_fingerprint: expectedFingerprint,
        p_personal_message: personalMessage?.trim() || null,
        p_valid_until: validUntil ?? null,
      });
      if (error) throw error;

      const sentAt = data?.sentAt ?? data?.sent_at;
      const dispatchId =
        data?.proposalSendDispatchId ?? data?.proposal_send_dispatch_id;
      if (sentAt && dispatchId) {
        const delivery = await supabase.functions.invoke("proposal-send", {
          body: {
            proposalId,
            sentAt,
            dispatchId,
          },
        });
        if (delivery.error) {
          return { ...data, emailDispatched: false };
        }
        return {
          ...data,
          emailDispatched: delivery.data?.delivery_state === "delivered",
        };
      }
      return { ...data, emailDispatched: false };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["proposal", proposalId],
      });
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.bundle(proposalId),
      });
      void queryClient.invalidateQueries({ queryKey: ["document-state"] });
      void queryClient.invalidateQueries({ queryKey: ["desk-engagements"] });
    },
  });
}

function mapAuthority(value: any): ProjectBillingAuthority | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    projectId: String(row.projectId ?? row.project_id),
    agreementId: String(row.agreementId ?? row.agreement_id),
    state:
      row.state === "retainer_pending" ||
      row.state === "exhausted" ||
      row.state === "superseded"
        ? row.state
        : "active",
    currency: String(row.currency ?? "USD"),
    ceilingCents: finiteCents(row.ceilingCents ?? row.ceiling_cents),
    authorizedCents: finiteCents(row.authorizedCents ?? row.authorized_cents),
    accruedCents: finiteCents(row.accruedCents ?? row.accrued_cents),
    invoicedCents: finiteCents(row.invoicedCents ?? row.invoiced_cents),
    pendingAuthorizationCents: finiteCents(
      row.pendingAuthorizationCents ?? row.pending_authorization_cents,
    ),
    remainingCents: finiteCents(row.remainingCents ?? row.remaining_cents),
    retainerAmountCents: finiteCents(
      row.retainerAmountCents ?? row.retainer_amount_cents,
    ),
    retainerPaidCents: finiteCents(
      row.retainerPaidCents ?? row.retainer_paid_cents,
    ),
    retainerActivationPolicy:
      (row.retainerActivationPolicy ?? row.retainer_activation_policy) ===
      "retainer_paid"
        ? "retainer_paid"
        : "immediate",
    activeRateVersion: Number(
      row.activeRateVersion ?? row.active_rate_version ?? 1,
    ),
    billingThrough:
      typeof (row.billingThrough ?? row.billing_through) === "string"
        ? (row.billingThrough ?? row.billing_through)
        : null,
    rates: Array.isArray(row.rates)
      ? row.rates.map((rate: any) => ({
          id: String(rate.id),
          proposalId: String(
            rate.proposalId ?? rate.proposal_id ?? row.agreementId ?? "",
          ),
          version: Number(rate.version ?? 1),
          roleName: String(rate.roleName ?? rate.role_name ?? ""),
          hourlyRateCents: finiteCents(
            rate.hourlyRateCents ?? rate.hourly_rate_cents,
          ),
          effectiveAt:
            typeof (rate.effectiveAt ?? rate.effective_at) === "string"
              ? (rate.effectiveAt ?? rate.effective_at)
              : null,
        }))
      : [],
  };
}

export function useProjectBillingAuthority(projectId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.authority(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "get_project_authority_summary",
        { p_project_id: projectId },
      );
      if (error) throw error;
      return mapAuthority(data);
    },
  });
}
