"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commercialKeys, createBrowserClient } from "@patina/supabase";
import type { WorkingBudgetVersion } from "@patina/types";
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
import {
  mapFurnishingsWaves,
  mapWorkingBudget,
  validateWorkingBudgetLines,
  workingBudgetTotals,
  type FurnishingsWaveView,
  type WorkingBudgetLineDraft,
  type WorkingBudgetView,
} from "@/lib/document/project-commerce";

const getSupabase = () => createBrowserClient() as any;

export const commercialDocumentKeys = {
  bundle: commercialKeys.document,
  authority: commercialKeys.authority,
  budget: commercialKeys.budget,
  waves: commercialKeys.waves,
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
      void queryClient.invalidateQueries({ queryKey: commercialKeys.all });
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
      let notificationDelivery: "delivered" | "pending_retry" | "not_requested" =
        "not_requested";
      if (result.newlyExecuted) {
        try {
          const delivery = await supabase.functions.invoke(
            "commercial-document-notify",
            {
              body: { documentId: proposalId, transition: "executed" },
            },
          );
          notificationDelivery =
            !delivery.error && delivery.data?.ok === true
              ? "delivered"
              : "pending_retry";
          if (notificationDelivery === "pending_retry") {
            console.warn("commercial countersign notification pending retry", {
              proposalId,
              error:
                delivery.error?.message ??
                delivery.data?.error ??
                "unconfirmed",
            });
          }
        } catch (error) {
          notificationDelivery = "pending_retry";
          console.warn("commercial countersign notification pending retry", {
            proposalId,
            error: error instanceof Error ? error.message : "transport_error",
          });
        }
      }
      return { ...result, notificationDelivery };
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

export function adaptProjectBillingAuthority(
  value: any,
): ProjectBillingAuthority | null {
  const payload = Array.isArray(value) ? value[0] : value;
  // 00406 returns a deliberately curated envelope. Keep the old flat shape as
  // a rollout fallback, but never pass activity/raw-entry collections through
  // this studio summary adapter.
  const authority =
    payload?.authority && typeof payload.authority === "object"
      ? payload.authority
      : payload;
  const summary =
    payload?.summary && typeof payload.summary === "object"
      ? payload.summary
      : {};
  const row = authority
    ? {
        ...authority,
        ...summary,
        rates: Array.isArray(payload?.rates)
          ? payload.rates
          : authority.rates,
      }
    : null;
  if (!row?.id) return null;
  return {
    id: String(row.id),
    projectId: String(row.projectId ?? row.project_id),
    agreementId: String(row.agreementId ?? row.agreement_id),
    // Unknown future/malformed states must never accidentally grant billable
    // authority. Only the server's exact `active` value is active.
    state:
      row.state === "active" ||
      row.state === "retainer_pending" ||
      row.state === "exhausted" ||
      row.state === "superseded"
        ? row.state
        : "superseded",
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

export async function fetchProjectBillingAuthority(
  projectId: string,
): Promise<ProjectBillingAuthority | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    "get_project_authority_summary",
    { p_project_id: projectId },
  );
  if (error) throw error;
  return adaptProjectBillingAuthority(data);
}

export interface CreateServiceAddendumResult {
  proposalId: string;
  documentId: string;
  projectId: string;
  documentKind: "service_addendum";
  commercialState: "draft";
}

function mapCreateServiceAddendumResult(value: any): CreateServiceAddendumResult {
  const row = Array.isArray(value) ? value[0] : value;
  const proposalId = row?.proposalId ?? row?.proposal_id;
  const documentId = row?.documentId ?? row?.document_id ?? proposalId;
  const projectId = row?.projectId ?? row?.project_id;
  const documentKind = row?.documentKind ?? row?.document_kind;
  const commercialState = row?.commercialState ?? row?.commercial_state;
  if (
    !proposalId ||
    !documentId ||
    !projectId ||
    documentKind !== "service_addendum" ||
    commercialState !== "draft"
  ) {
    throw new Error("The services addendum result was incomplete.");
  }
  return {
    proposalId: String(proposalId),
    documentId: String(documentId),
    projectId: String(projectId),
    documentKind,
    commercialState,
  };
}

export function useCreateServiceAddendum(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["create-service-addendum", projectId],
    mutationFn: async (title: string) => {
      const { data, error } = await getSupabase().rpc(
        "create_service_addendum",
        {
          p_project_id: projectId,
          p_title: title.trim(),
        },
      );
      if (error) throw error;
      return mapCreateServiceAddendumResult(data);
    },
    onSuccess: (result) => {
      // Creating a draft addendum does not replace or invalidate the current
      // authority. That transition remains countersign-only on the server.
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["document-state"] });
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.bundle(result.proposalId),
      });
    },
  });
}

export function useProjectBillingAuthority(projectId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.authority(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: () => fetchProjectBillingAuthority(projectId),
  });
}

async function fetchWorkingBudget(
  projectId: string,
): Promise<WorkingBudgetView> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_project_working_budget", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return mapWorkingBudget(data);
}

export function useWorkingBudget(projectId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.budget(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: () => fetchWorkingBudget(projectId),
  });
}

export interface SaveWorkingBudgetDraftInput {
  projectId: string;
  version: WorkingBudgetVersion | null;
  note: string;
  lines: WorkingBudgetLineDraft[];
}

async function saveWorkingBudgetDraft({
  projectId,
  version,
  note,
  lines,
}: SaveWorkingBudgetDraftInput): Promise<WorkingBudgetView> {
  const validation = validateWorkingBudgetLines(lines);
  if (!validation.valid) {
    throw new Error(Object.values(validation.errors)[0]);
  }

  const supabase = getSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user?.id) throw new Error("Sign in before saving this budget.");

  const totals = workingBudgetTotals(lines);
  let draftId = version?.state === "draft" ? version.id : null;
  let createdDraft = false;

  if (!draftId) {
    const { data, error } = await supabase
      .from("project_budget_versions")
      .insert({
        project_id: projectId,
        version: (version?.version ?? 0) + 1,
        status: "draft",
        low_total_cents: totals.lowCents,
        target_total_cents: totals.targetCents,
        high_total_cents: totals.highCents,
        note: note.trim() || null,
        created_by: authData.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    draftId = String(data.id);
    createdDraft = true;
  }

  const rows = lines.map((line, sortOrder) => ({
    id: line.id,
    budget_version_id: draftId,
    project_room_id: line.roomId,
    room_name: line.roomName.trim(),
    category: line.category.trim(),
    low_cents: Math.round(line.lowCents),
    target_cents: Math.round(line.targetCents),
    high_cents: Math.round(line.highCents),
    sort_order: sortOrder,
  }));

  const { error: upsertError } = await supabase
    .from("project_budget_lines")
    .upsert(rows, { onConflict: "id" });
  if (upsertError) {
    if (createdDraft) {
      await supabase.from("project_budget_versions").delete().eq("id", draftId);
    }
    throw upsertError;
  }

  if (version?.state === "draft") {
    const retained = new Set(lines.map((line) => line.id));
    const removed = version.lines
      .map((line) => line.id)
      .filter((lineId) => !retained.has(lineId));
    if (removed.length > 0) {
      const { error } = await supabase
        .from("project_budget_lines")
        .delete()
        .in("id", removed)
        .eq("budget_version_id", draftId);
      if (error) throw error;
    }
  }

  const { error: versionError } = await supabase
    .from("project_budget_versions")
    .update({
      low_total_cents: totals.lowCents,
      target_total_cents: totals.targetCents,
      high_total_cents: totals.highCents,
      note: note.trim() || null,
    })
    .eq("id", draftId)
    .eq("status", "draft");
  if (versionError) throw versionError;

  return fetchWorkingBudget(projectId);
}

function invalidateProjectCommerce(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: commercialDocumentKeys.budget(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: commercialDocumentKeys.waves(projectId),
  });
  void queryClient.invalidateQueries({
    queryKey: commercialDocumentKeys.authority(projectId),
  });
  void queryClient.invalidateQueries({ queryKey: ["project-v2", projectId] });
}

export function useSaveWorkingBudgetDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["save-working-budget", projectId],
    mutationFn: saveWorkingBudgetDraft,
    onSuccess: (budget) => {
      queryClient.setQueryData(
        commercialDocumentKeys.budget(projectId),
        budget,
      );
      invalidateProjectCommerce(queryClient, projectId);
    },
  });
}

export function usePublishBudgetCheckpoint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["publish-budget-checkpoint", projectId],
    mutationFn: async ({
      versionId,
      agreementId,
    }: {
      versionId: string;
      agreementId: string;
    }) => {
      if (!agreementId) {
        throw new Error("The executed agreement link is unavailable.");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("publish_budget_checkpoint", {
        p_project_id: projectId,
        p_version_id: versionId,
      });
      if (error) throw error;
      const checkpointId = data?.checkpointId ?? data?.checkpoint_id;
      if (checkpointId) {
        try {
          await supabase.functions.invoke("commercial-document-notify", {
            body: {
              documentId: agreementId,
              transition: "budget_published",
              eventId: checkpointId,
            },
          });
        } catch {
          // The checkpoint is durable and the edge notification is idempotent.
          // Delivery can be replayed without publishing another checkpoint.
        }
      }
      return data;
    },
    onSuccess: () => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useOverrideBudgetCheckpoint(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["override-budget-checkpoint", projectId],
    mutationFn: async ({
      checkpointId,
      reason,
    }: {
      checkpointId: string;
      reason: string;
    }) => {
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 5) {
        throw new Error("Record a meaningful reason for the override.");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("override_budget_checkpoint", {
        p_checkpoint_id: checkpointId,
        p_reason: trimmedReason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateProjectCommerce(queryClient, projectId),
  });
}

async function fetchFurnishingsWaves(
  projectId: string,
): Promise<FurnishingsWaveView[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    "list_furnishings_authorizations",
    { p_project_id: projectId },
  );
  if (error) throw error;
  return mapFurnishingsWaves(data);
}

export function useFurnishingsAuthorizations(
  projectId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: commercialDocumentKeys.waves(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: () => fetchFurnishingsWaves(projectId),
  });
}

export function useCreateFurnishingsAuthorization(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["create-furnishings-authorization", projectId],
    mutationFn: async ({
      waveName,
      sourceProposalId,
    }: {
      waveName: string;
      sourceProposalId: string;
    }) => {
      const trimmedName = waveName.trim();
      if (trimmedName.length < 2) {
        throw new Error("Name this furnishings authorization wave.");
      }
      if (!sourceProposalId) {
        throw new Error("Choose a draft furnishing proposal to snapshot.");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "create_furnishings_authorization",
        {
          p_project_id: projectId,
          p_wave_name: trimmedName,
          p_source_proposal_id: sourceProposalId,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateProjectCommerce(queryClient, projectId),
  });
}

export function useSendFurnishingsAuthorization(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["send-furnishings-authorization", projectId],
    mutationFn: async (proposalId: string) => {
      const supabase = getSupabase();
      const fingerprint =
        await fetchCommercialDocumentSendFingerprint(proposalId);
      const { data, error } = await supabase.rpc("send_commercial_document", {
        p_proposal_id: proposalId,
        p_expected_fingerprint: fingerprint,
        p_personal_message: null,
        p_valid_until: null,
      });
      if (error) throw error;

      const sentAt = data?.sentAt ?? data?.sent_at;
      const dispatchId =
        data?.proposalSendDispatchId ?? data?.proposal_send_dispatch_id;
      if (sentAt && dispatchId) {
        try {
          const delivery = await supabase.functions.invoke("proposal-send", {
            body: { proposalId, sentAt, dispatchId },
          });
          const deliveryState =
            typeof delivery.data?.delivery_state === "string"
              ? delivery.data.delivery_state
              : "pending";
          if (delivery.error && deliveryState === "pending") {
            console.warn("furnishings authorization email pending retry", {
              proposalId,
              error: delivery.error.message,
            });
          }
          return {
            ...data,
            proposalSendDispatchId: dispatchId,
            sentAt,
            _emailDispatched: deliveryState === "delivered",
            _emailDeliveryState: deliveryState,
            _emailRetryable:
              typeof delivery.data?.retryable === "boolean"
                ? delivery.data.retryable
                : deliveryState === "pending" || deliveryState === "in_flight",
            _emailDispatchDetail:
              typeof delivery.data?.detail === "string"
                ? delivery.data.detail
                : undefined,
          };
        } catch (error) {
          console.warn("furnishings authorization email pending retry", {
            proposalId,
            error: error instanceof Error ? error.message : "transport_error",
          });
          return {
            ...data,
            proposalSendDispatchId: dispatchId,
            sentAt,
            _emailDispatched: false,
            _emailDeliveryState: "pending",
            _emailRetryable: true,
          };
        }
      }
      return {
        ...data,
        _emailDispatched: false,
        _emailDeliveryState: "pending",
        _emailRetryable: false,
        _emailDispatchDetail:
          "The furnishings send instance is incomplete. Refresh before retrying.",
      };
    },
    onSuccess: (_, proposalId) => {
      invalidateProjectCommerce(queryClient, projectId);
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.bundle(proposalId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["proposal", proposalId],
      });
    },
  });
}
