"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commercialKeys, createBrowserClient } from "@patina/supabase";
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
  isValidBudgetTargetCents,
  mapProjectInstruments,
  mapTradeScopeWorkspace,
  mapTradeScopes,
  mapWorkingBudget,
  type ProjectInstrumentView,
  type TradeScopeView,
  type TradeScopeWorkspaceView,
  type WorkingBudgetView,
} from "@/lib/document/project-commerce";

const getSupabase = () => createBrowserClient() as any;

export const commercialDocumentKeys = {
  bundle: (documentId: string) =>
    commercialKeys?.document?.(documentId) ??
    (["commercial-documents", documentId] as const),
  authority: (projectId: string) =>
    commercialKeys?.authority?.(projectId) ??
    (["project-authority", projectId] as const),
  budget: (projectId: string) =>
    commercialKeys?.budget?.(projectId) ??
    (["working-budget", projectId] as const),
  // Accessor renamed from `waves` — the underlying key string stays
  // ['furnishings-authorizations', projectId] for cache continuity with the
  // packages/supabase `commercialKeys.waves`/`commercialKeys.instruments`
  // aliases (see that module for why both still exist).
  instruments: (projectId: string) =>
    commercialKeys?.instruments?.(projectId) ??
    (["furnishings-authorizations", projectId] as const),
  // Trade scopes keep their own key rather than joining the instruments one:
  // they are a different instrument with a different RPC, and folding them
  // into ['furnishings-authorizations'] would make every trade act refetch a
  // list that never carried it.
  tradeScopes: (projectId: string) => ["trade-scopes", projectId] as const,
  tradeScope: (proposalId: string) => ["trade-scope", proposalId] as const,
};

export type CommercialNotificationDelivery =
  | "delivered"
  | "pending_retry"
  | "not_requested";

type StudioCommercialNotificationInput = {
  documentId: string;
  transition:
    | "executed"
    | "budget_published"
    | "trade_scope_sent"
    | "trade_draw_ready";
  eventId?: string;
};

async function invokeCommercialNotification(
  supabase: any,
  input: StudioCommercialNotificationInput,
): Promise<CommercialNotificationDelivery> {
  try {
    const delivery = await supabase.functions.invoke(
      "commercial-document-notify",
      {
        body: {
          documentId: input.documentId,
          transition: input.transition,
          ...(input.eventId ? { eventId: input.eventId } : {}),
        },
      },
    );
    if (!delivery.error && delivery.data?.ok === true) return "delivered";
    console.warn("commercial notification pending retry", {
      documentId: input.documentId,
      transition: input.transition,
      error: delivery.error?.message ?? delivery.data?.error ?? "unconfirmed",
    });
    return "pending_retry";
  } catch (error) {
    console.warn("commercial notification pending retry", {
      documentId: input.documentId,
      transition: input.transition,
      error: error instanceof Error ? error.message : "transport_error",
    });
    return "pending_retry";
  }
}

export function useReplayCommercialNotification() {
  return useMutation({
    mutationKey: ["replay-commercial-notification"],
    mutationFn: async (input: StudioCommercialNotificationInput) =>
      invokeCommercialNotification(getSupabase(), input),
  });
}

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

// Like finiteCents, but preserves "unset" as null instead of coercing it to
// 0 — for fields (R8's furnishingsDepositPercent) where 0 and "never set"
// are meaningfully different values, not the same one written two ways.
const nullableFiniteCents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
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
    // R8: reads either casing defensively. Nullable by design (00422) — an
    // unset term is preserved as null rather than coerced to 0, so it stays
    // distinguishable from an explicit 0% and the release RPC's 50% house
    // default (create_furnishings_authorization_from_schedule) can actually
    // apply.
    furnishingsDepositPercent: nullableFiniteCents(
      row.furnishingsDepositPercent ?? row.furnishings_deposit_percent,
    ),
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
    // The paper RPCs write metadata.executedOnPaper/paperScanDocumentId
    // (00412 shared provenance contract). The designer's own read of
    // commercial_document_signatures selects `metadata` directly (studio
    // RLS covers the whole row, unlike the client bundle RPC's allowlist),
    // so this reads it straight rather than waiting on a server projection.
    executedOnPaper: metadata.executedOnPaper === true,
    paperScanDocumentId:
      typeof metadata.paperScanDocumentId === "string"
        ? metadata.paperScanDocumentId
        : null,
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
        // Explicit columns only — signed_ip must never leave the server; the
        // rest is exactly what mapSignature reads (see below).
        .select(
          "id, proposal_id, party_role, signer_user_id, signed_name, evidence_fingerprint, signed_at, metadata",
        )
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
          // R8 — nullable by design (00422's upsert_design_services_draft
          // reads NULLIF(...) so an omitted/null value stays NULL rather
          // than getting coerced to 0, letting the release RPC's 50% house
          // default actually apply).
          furnishingsDepositPercent:
            terms.furnishingsDepositPercent === null
              ? null
              : Math.round(terms.furnishingsDepositPercent),
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
      let notificationDelivery: CommercialNotificationDelivery = "not_requested";
      if (result.commercialState === "executed") {
        // EXECUTED-ON-PAPER: record_paper_client_signature only ever moves a
        // design services document to client_signed — execution itself still
        // happens through THIS countersign, unchanged. What changes is the
        // notice: a client signature recorded from a paper original needs the
        // paper-notify route (apps/designer-portal/src/app/api/commercial/
        // [id]/paper-notify/route.ts — its own docstring names "countersign's
        // paper leg" as one of its three callers), because that route is what
        // computes hasScan and sends the paper-variant copy. A signature
        // signed on screen keeps the direct, unchanged notify call — 'executed'
        // is a STUDIO_TRANSITION (commercial-document-notify/policy.ts), so
        // the caller's own session is already allowed to fire it.
        //
        // A FAILED read here must never be read as "not paper" — that would
        // silently downgrade a genuinely paper-signed document to the online
        // notice, telling the client the wrong story about their own
        // signature. Fail the notice as pending_retry instead; the countersign
        // itself already committed above, so this never blocks it.
        const { data: clientSignature, error: clientSignatureError } = await supabase
          .from("commercial_document_signatures")
          .select("metadata")
          .eq("proposal_id", proposalId)
          .eq("party_role", "client")
          .maybeSingle();
        if (clientSignatureError) {
          console.warn("commercial notification pending retry", {
            documentId: proposalId,
            transition: "executed",
            error: clientSignatureError.message ?? "paper_detection_read_failed",
          });
          notificationDelivery = "pending_retry";
        } else {
          const clientSignedOnPaper =
            clientSignature?.metadata?.executedOnPaper === true;
          notificationDelivery = clientSignedOnPaper
            ? await postPaperNotify(proposalId, "executed")
            : await invokeCommercialNotification(supabase, {
                documentId: proposalId,
                transition: "executed",
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
        rates: Array.isArray(payload?.rates) ? payload.rates : authority.rates,
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
    // R8: null until get_project_authority_summary carries the executed
    // agreement's furnishings deposit term — never fabricate a default here.
    furnishingsDepositPercent:
      typeof (row.furnishingsDepositPercent ?? row.furnishings_deposit_percent) ===
      "number"
        ? (row.furnishingsDepositPercent ?? row.furnishings_deposit_percent)
        : null,
  };
}

export async function fetchProjectBillingAuthority(
  projectId: string,
): Promise<ProjectBillingAuthority | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_project_authority_summary", {
    p_project_id: projectId,
  });
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

function mapCreateServiceAddendumResult(
  value: any,
): CreateServiceAddendumResult {
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

// The single choke point: every commerce mutation below invalidates through
// this, so instruments + working budget + authority + the project-v2 read
// model never drift from one another.
function invalidateProjectCommerce(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.budget(projectId),
    }),
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.instruments(projectId),
    }),
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.authority(projectId),
    }),
    queryClient.invalidateQueries({ queryKey: ["project-v2", projectId] }),
    // Trade scopes ride the same choke point: they share the project's money
    // (a draw invoice is the project's receivable) and the same schedule.
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.tradeScopes(projectId),
    }),
    // AuthorizationDetail's per-line delta glyphs (useAuthorizationLineDrift)
    // — not project-scoped (its key is the sorted ffe item ids), so this
    // invalidates every such query rather than one project's. Without this
    // the ▲/▼ glyphs go stale across a send/void/execute even though every
    // other commerce read refreshes.
    queryClient.invalidateQueries({
      queryKey: ["authorization-line-drift"],
    }),
  ]);
}

export interface SetBudgetTargetInput {
  /** Guards the write to the draft version's own rows — a stale versionId
   *  (e.g. a checkpoint published mid-edit) simply matches no row rather
   *  than silently writing into the wrong version. */
  versionId: string;
  lineId: string;
  targetCents: number;
}

async function setBudgetTarget(
  projectId: string,
  { versionId, lineId, targetCents }: SetBudgetTargetInput,
): Promise<WorkingBudgetView> {
  if (!isValidBudgetTargetCents(targetCents)) {
    throw new Error("Enter a target of zero or more.");
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("project_budget_lines")
    .update({ target_cents: Math.round(targetCents) })
    .eq("id", lineId)
    .eq("budget_version_id", versionId);
  if (error) throw error;
  return fetchWorkingBudget(projectId);
}

/**
 * DerivedBudgetGrid's clay-editable Target cell. Room, category, low/high,
 * and row add/remove are retired with manual line entry — the grid's rows
 * are schedule-derived (useDeriveWorkingBudget); Target is the one figure
 * the studio still sets by hand, on the draft version's existing rows
 * (studio RLS permits the direct write; validation stays minimal per the
 * build note — non-negative only).
 */
export function useSetBudgetTargets(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["set-budget-targets", projectId],
    mutationFn: (input: SetBudgetTargetInput) =>
      setBudgetTarget(projectId, input),
    onSuccess: (budget) => {
      queryClient.setQueryData(
        commercialDocumentKeys.budget(projectId),
        budget,
      );
      void invalidateProjectCommerce(queryClient, projectId);
    },
  });
}

/**
 * "Sync from the schedule" — replaces the working budget's draft version
 * with a fresh one derived from the live FF&E schedule (room × category
 * rows, Scheduled figures stamped in). Target is the studio's to set
 * afterward via useSetBudgetTargets; this call does not take one.
 */
export function useDeriveWorkingBudget(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["derive-working-budget", projectId],
    mutationFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "derive_working_budget_draft",
        { p_project_id: projectId },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await invalidateProjectCommerce(queryClient, projectId);
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
      let notificationDelivery: CommercialNotificationDelivery =
        "not_requested";
      if (checkpointId) {
        notificationDelivery = await invokeCommercialNotification(supabase, {
          documentId: agreementId,
          transition: "budget_published",
          eventId: checkpointId,
        });
      }
      return { ...data, notificationDelivery };
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

async function fetchProjectInstruments(
  projectId: string,
): Promise<ProjectInstrumentView[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    "list_furnishings_authorizations",
    { p_project_id: projectId },
  );
  if (error) throw error;
  return mapProjectInstruments(data);
}

export function useProjectInstruments(projectId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.instruments(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: () => fetchProjectInstruments(projectId),
  });
}

export interface ReleaseForAuthorizationInput {
  name: string;
  ffeItemIds: string[];
  depositPercent?: number;
}

export interface ReleaseForAuthorizationResult {
  proposalId: string;
  documentId: string;
  itemCount: number;
}

function mapReleaseForAuthorizationResult(
  value: any,
): ReleaseForAuthorizationResult {
  const row = Array.isArray(value) ? value[0] : value;
  const proposalId = row?.proposalId ?? row?.proposal_id;
  const documentId = row?.documentId ?? row?.document_id ?? proposalId;
  if (!proposalId || !documentId) {
    throw new Error("The authorization release result was incomplete.");
  }
  return {
    proposalId: String(proposalId),
    documentId: String(documentId),
    itemCount: Number(row?.itemCount ?? row?.item_count ?? 0),
  };
}

/**
 * "Release for authorization" — names a fresh furnishings authorization
 * straight from a set of FF&E schedule items (no source proposal snapshot
 * step). Replaces useCreateFurnishingsAuthorization's "name a wave, pick a
 * source draft" flow.
 */
export function useReleaseForAuthorization(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["release-for-authorization", projectId],
    mutationFn: async ({
      name,
      ffeItemIds,
      depositPercent,
    }: ReleaseForAuthorizationInput) => {
      const trimmedName = name.trim();
      if (trimmedName.length < 2) {
        throw new Error("Name this authorization.");
      }
      if (ffeItemIds.length === 0) {
        throw new Error("Choose at least one schedule item to release.");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "create_furnishings_authorization_from_schedule",
        {
          p_project_id: projectId,
          p_name: trimmedName,
          p_ffe_item_ids: ffeItemIds,
          p_deposit_percent:
            typeof depositPercent === "number"
              ? Math.round(depositPercent)
              : null,
        },
      );
      if (error) throw error;
      return mapReleaseForAuthorizationResult(data);
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        // Released items leave the open schedule for this authorization —
        // the schedule (ceremony agent's ffe-section.tsx) reads this key.
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

export interface VoidAuthorizationInput {
  proposalId: string;
  reason: string;
}

export function useVoidAuthorization(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["void-authorization", projectId],
    mutationFn: async ({ proposalId, reason }: VoidAuthorizationInput) => {
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 5) {
        throw new Error("Record a meaningful reason for voiding this authorization.");
      }
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "void_furnishings_authorization",
        {
          p_proposal_id: proposalId,
          p_reason: trimmedReason,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

export interface AuthorizationLineDrift {
  ffeItemId: string;
  currentLineTotalCents: number | null;
  currentStatus: string | null;
}

async function fetchAuthorizationLineDrift(
  ffeItemIds: string[],
): Promise<Map<string, AuthorizationLineDrift>> {
  const ids = Array.from(new Set(ffeItemIds.filter(Boolean)));
  const map = new Map<string, AuthorizationLineDrift>();
  if (ids.length === 0) return map;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("project_ffe_items")
    .select("id, line_total_cents, status")
    .in("id", ids);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(String(row.id), {
      ffeItemId: String(row.id),
      currentLineTotalCents:
        typeof row.line_total_cents === "number" ? row.line_total_cents : null,
      currentStatus: typeof row.status === "string" ? row.status : null,
    });
  }
  return map;
}

/**
 * AuthorizationDetail's per-line delta glyph — a light, targeted read (only
 * the ids this one instrument's items point at) comparing what was signed
 * against the schedule's CURRENT line total for the same project_ffe_items
 * row, so a studio member can see at a glance whether the schedule has
 * moved since the client signed. Degrades to no glyph (empty map) for items
 * with no sourceFfeItemId yet, or when the ids list is empty.
 */
export function useAuthorizationLineDrift(
  ffeItemIds: string[],
  enabled = true,
) {
  const key = [...ffeItemIds].sort().join(",");
  return useQuery({
    queryKey: ["authorization-line-drift", key],
    queryFn: () => fetchAuthorizationLineDrift(ffeItemIds),
    enabled: enabled && ffeItemIds.length > 0,
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
    onSuccess: async (_, proposalId) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        queryClient.invalidateQueries({
          queryKey: commercialDocumentKeys.bundle(proposalId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["proposal", proposalId],
        }),
      ]);
    },
  });
}

/* ── Trade scopes (Act IV) ───────────────────────────────────────────────────
 *
 * A trade scope is drafted, bid, released, signed, engaged, worked, and
 * accepted. The RPCs below own every rule that matters — the hooks are a thin,
 * honest wire to them, and the two direct table paths (the draft body and the
 * bid ledger) exist because studio RLS covers them and the guards enforce
 * draft-only editing at the row.
 *
 * Every trade mutation refreshes the scope's own workspace AND the project's
 * trade-scope list. Engagement and voiding also move the schedule — they write
 * or retire presence lines — so those two additionally invalidate the FF&E key.
 * ─────────────────────────────────────────────────────────────────────────── */

async function fetchTradeScopes(projectId: string): Promise<TradeScopeView[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("list_trade_scopes", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return mapTradeScopes(data);
}

export function useTradeScopes(projectId: string, enabled = true) {
  return useQuery({
    queryKey: commercialDocumentKeys.tradeScopes(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: () => fetchTradeScopes(projectId),
  });
}

export async function fetchTradeScopeWorkspace(
  proposalId: string,
): Promise<TradeScopeWorkspaceView> {
  const supabase = getSupabase();
  const [termsResult, sectionsResult, bidsResult, drawsResult] =
    await Promise.all([
      supabase
        .from("trade_scope_terms")
        // The paper-acceptance recorder's display name rides along as a
        // profiles embed (00425's acceptance_recorded_by) — the same
        // pattern use-time-tracking.ts uses for "who logged this". Read
        // once here rather than a second query, since it is only ever
        // shown alongside the rest of this same terms row.
        .select("*, acceptance_recorded_by_profile:profiles!acceptance_recorded_by(full_name)")
        .eq("proposal_id", proposalId)
        .maybeSingle(),
      supabase
        .from("trade_scope_sections")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("trade_scope_bids")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("amount_cents", { ascending: true }),
      supabase
        .from("trade_scope_draws")
        .select("*")
        .eq("proposal_id", proposalId)
        .order("sort_order", { ascending: true }),
    ]);

  if (termsResult.error) throw termsResult.error;
  if (sectionsResult.error) throw sectionsResult.error;
  if (bidsResult.error) throw bidsResult.error;
  if (drawsResult.error) throw drawsResult.error;

  // Flatten the embed to a plain key before handing off to the mapper, so
  // mapTradeScopeWorkspace stays a pure function of flat rows (same
  // discipline every other mapper in project-commerce.ts follows) rather
  // than needing to know PostgREST's embed shape.
  const termsRow = termsResult.data
    ? {
        ...(termsResult.data as Record<string, unknown>),
        acceptance_recorded_by_name:
          (termsResult.data as any)?.acceptance_recorded_by_profile?.full_name ?? null,
      }
    : termsResult.data;

  return mapTradeScopeWorkspace({
    proposalId,
    terms: termsRow,
    sections: sectionsResult.data,
    bids: bidsResult.data,
    draws: drawsResult.data,
  });
}

/** The studio drawer behind one scope: terms, prose, bids, draws. */
export function useTradeScopeWorkspace(
  proposalId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: commercialDocumentKeys.tradeScope(proposalId ?? ""),
    enabled: enabled && Boolean(proposalId),
    queryFn: () => fetchTradeScopeWorkspace(proposalId as string),
  });
}

export interface CreateTradeScopeResult {
  proposalId: string;
  documentId: string;
  projectId: string;
}

function mapCreateTradeScopeResult(value: any): CreateTradeScopeResult {
  const row = Array.isArray(value) ? value[0] : value;
  const proposalId = row?.proposalId ?? row?.proposal_id;
  const documentId = row?.documentId ?? row?.document_id ?? proposalId;
  const projectId = row?.projectId ?? row?.project_id;
  if (!proposalId || !documentId || !projectId) {
    throw new Error("The trade scope was created but its record came back incomplete.");
  }
  return {
    proposalId: String(proposalId),
    documentId: String(documentId),
    projectId: String(projectId),
  };
}

export function useCreateTradeScope(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["create-trade-scope", projectId],
    mutationFn: async (title: string) => {
      const trimmed = title.trim();
      if (trimmed.length < 2) {
        throw new Error("Name this scope of work.");
      }
      const { data, error } = await getSupabase().rpc("create_trade_scope", {
        p_project_id: projectId,
        p_title: trimmed,
      });
      if (error) throw error;
      return mapCreateTradeScopeResult(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: commercialDocumentKeys.tradeScopes(projectId),
      });
      void queryClient.invalidateQueries({ queryKey: ["document-state"] });
    },
  });
}

function invalidateTradeScope(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  proposalId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.tradeScopes(projectId),
    }),
    queryClient.invalidateQueries({
      queryKey: commercialDocumentKeys.tradeScope(proposalId),
    }),
  ]);
}

export interface SaveTradeScopeDraftInput {
  proposalId: string;
  clientPriceCents: number;
  terms?: string;
  sections: readonly {
    projectRoomId: string | null;
    roomName: string;
    prose: string;
    allocationCents: number | null;
  }[];
  draws: readonly {
    label: string;
    percentage: number | null;
    amountCents: number;
    gatesOnAcceptance: boolean;
  }[];
}

/**
 * The draft body, written straight to its three tables (studio RLS, guards
 * enforcing draft-only). Sections and draws are replaced wholesale rather than
 * diffed: the sheet holds the whole schedule in one editor, so a partial
 * reconciliation would only invent a second source of truth.
 */
export function useSaveTradeScopeDraft(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["save-trade-scope-draft", projectId],
    mutationFn: async (input: SaveTradeScopeDraftInput) => {
      const supabase = getSupabase();
      const { proposalId } = input;

      const termsUpdate = await supabase
        .from("trade_scope_terms")
        .update({
          client_price_cents: Math.round(input.clientPriceCents),
          ...(input.terms === undefined ? {} : { terms: input.terms.trim() }),
        })
        .eq("proposal_id", proposalId);
      if (termsUpdate.error) throw termsUpdate.error;

      const clearSections = await supabase
        .from("trade_scope_sections")
        .delete()
        .eq("proposal_id", proposalId);
      if (clearSections.error) throw clearSections.error;

      const sectionRows = input.sections
        .filter((section) => section.prose.trim())
        .map((section, index) => ({
          proposal_id: proposalId,
          project_room_id: section.projectRoomId,
          room_name: section.roomName.trim(),
          prose: section.prose.trim(),
          allocation_cents:
            section.allocationCents === null
              ? null
              : Math.round(section.allocationCents),
          sort_order: index,
        }));
      if (sectionRows.length > 0) {
        const insertSections = await supabase
          .from("trade_scope_sections")
          .insert(sectionRows);
        if (insertSections.error) throw insertSections.error;
      }

      const clearDraws = await supabase
        .from("trade_scope_draws")
        .delete()
        .eq("proposal_id", proposalId);
      if (clearDraws.error) throw clearDraws.error;

      const drawRows = input.draws.map((draw, index) => ({
        proposal_id: proposalId,
        label: draw.label.trim(),
        percentage: draw.percentage,
        amount_cents: Math.round(draw.amountCents),
        sort_order: index,
        gates_on_acceptance: draw.gatesOnAcceptance,
      }));
      if (drawRows.length > 0) {
        const insertDraws = await supabase
          .from("trade_scope_draws")
          .insert(drawRows);
        if (insertDraws.error) throw insertDraws.error;
      }

      return { proposalId };
    },
    onSuccess: (result) =>
      invalidateTradeScope(queryClient, projectId, result.proposalId),
  });
}

export interface SetTradeScopePartyInput {
  proposalId: string;
  partyId: string;
}

export function useSetTradeScopeParty(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["set-trade-scope-party", projectId],
    mutationFn: async ({ proposalId, partyId }: SetTradeScopePartyInput) => {
      const { data, error } = await getSupabase().rpc("set_trade_scope_party", {
        p_proposal_id: proposalId,
        p_party_id: partyId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) =>
      invalidateTradeScope(queryClient, projectId, variables.proposalId),
  });
}

export interface RecordTradeBidInput {
  proposalId: string;
  partyId: string;
  partyDisplayName: string;
  amountCents: number;
  note?: string | null;
}

/**
 * A recorded bid — a number the designer already has, typed in (Phase 1,
 * ruling R3). A response that lands from a sent request writes the same row
 * with source 'party_response'; the ledger renders both the same way.
 */
export function useRecordTradeBid(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["record-trade-bid", projectId],
    mutationFn: async (input: RecordTradeBidInput) => {
      if (!input.partyId) throw new Error("Choose whose number this is.");
      if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
        throw new Error("Record what they quoted.");
      }
      const { data, error } = await getSupabase()
        .from("trade_scope_bids")
        .insert({
          proposal_id: input.proposalId,
          party_id: input.partyId,
          party_display_name: input.partyDisplayName.trim(),
          amount_cents: Math.round(input.amountCents),
          status: "quoted",
          source: "recorded",
          note: input.note?.trim() || null,
          noted_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) =>
      invalidateTradeScope(queryClient, projectId, variables.proposalId),
  });
}

export interface SelectTradeBidInput {
  proposalId: string;
  bidId: string;
}

export function useSelectTradeBid(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["select-trade-bid", projectId],
    mutationFn: async ({ bidId }: SelectTradeBidInput) => {
      const { data, error } = await getSupabase().rpc("select_trade_bid", {
        p_bid_id: bidId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) =>
      invalidateTradeScope(queryClient, projectId, variables.proposalId),
  });
}

/**
 * "Release the trade scope" — the same ceremony, the same send rail as a
 * furnishings authorization (useSendFurnishingsAuthorization): snapshot
 * fingerprint → send_commercial_document → proposal-send.
 */
export function useSendTradeScope(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["send-trade-scope", projectId],
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
      if (!sentAt || !dispatchId) {
        return {
          ...data,
          _emailDispatched: false,
          _emailDeliveryState: "pending",
          _emailRetryable: false,
          _emailDispatchDetail:
            "The trade scope send instance is incomplete. Refresh before retrying.",
        };
      }

      try {
        const delivery = await supabase.functions.invoke("proposal-send", {
          body: { proposalId, sentAt, dispatchId },
        });
        const deliveryState =
          typeof delivery.data?.delivery_state === "string"
            ? delivery.data.delivery_state
            : "pending";
        if (delivery.error && deliveryState === "pending") {
          console.warn("trade scope email pending retry", {
            proposalId,
            error: delivery.error.message,
          });
        }
        // The DB-side send already committed regardless of the client email's
        // fate above — non-blocking, mirrors executed/budget_published's
        // pending_retry posture rather than failing the mutation.
        const notificationDelivery = await invokeCommercialNotification(
          supabase,
          { documentId: proposalId, transition: "trade_scope_sent" },
        );
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
          notificationDelivery,
        };
      } catch (error) {
        console.warn("trade scope email pending retry", {
          proposalId,
          error: error instanceof Error ? error.message : "transport_error",
        });
        const notificationDelivery = await invokeCommercialNotification(
          supabase,
          { documentId: proposalId, transition: "trade_scope_sent" },
        );
        return {
          ...data,
          proposalSendDispatchId: dispatchId,
          sentAt,
          _emailDispatched: false,
          _emailDeliveryState: "pending",
          _emailRetryable: true,
          notificationDelivery,
        };
      }
    },
    onSuccess: async (_data, proposalId) => {
      await Promise.all([
        invalidateTradeScope(queryClient, projectId, proposalId),
        queryClient.invalidateQueries({
          queryKey: commercialDocumentKeys.bundle(proposalId),
        }),
        queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] }),
      ]);
    },
  });
}

/**
 * "Engage {party}" — the studio's act, after the client's signature and the
 * deposit. It writes one presence line per section into the schedule, so this
 * is one of the two trade mutations that must move the FF&E key.
 */
export function useEngageTradeScope(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["engage-trade-scope", projectId],
    mutationFn: async (proposalId: string) => {
      const { data, error } = await getSupabase().rpc("engage_trade_scope", {
        p_proposal_id: proposalId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, proposalId) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        invalidateTradeScope(queryClient, projectId, proposalId),
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

export function useMarkTradeScopeInProgress(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["mark-trade-scope-in-progress", projectId],
    mutationFn: async (proposalId: string) => {
      const { data, error } = await getSupabase().rpc(
        "mark_trade_scope_in_progress",
        { p_proposal_id: proposalId },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, proposalId) => {
      await Promise.all([
        invalidateTradeScope(queryClient, projectId, proposalId),
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

export function useRecordSubstantialCompletion(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["record-trade-substantial-completion", projectId],
    mutationFn: async (proposalId: string) => {
      const { data, error } = await getSupabase().rpc(
        "record_trade_scope_substantial_completion",
        { p_proposal_id: proposalId },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, proposalId) => {
      await Promise.all([
        invalidateTradeScope(queryClient, projectId, proposalId),
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

export interface IssueTradeDrawInput {
  proposalId: string;
  drawId: string;
}

export function useIssueTradeDrawInvoice(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["issue-trade-draw-invoice", projectId],
    mutationFn: async ({ drawId, proposalId }: IssueTradeDrawInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "issue_trade_draw_invoice",
        { p_draw_id: drawId },
      );
      if (error) throw error;
      // Event-scoped like budget_published's checkpointId — eventId is the
      // draw itself, so a second draw on the same scope mints its own
      // idempotency key rather than colliding on the proposal id.
      const notificationDelivery = await invokeCommercialNotification(
        supabase,
        { documentId: proposalId, transition: "trade_draw_ready", eventId: drawId },
      );
      return { ...data, notificationDelivery };
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        invalidateTradeScope(queryClient, projectId, variables.proposalId),
        queryClient.invalidateQueries({ queryKey: ["invoices", projectId] }),
      ]);
    },
  });
}

export interface VoidTradeScopeInput {
  proposalId: string;
  reason: string;
}

export function useVoidTradeScope(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["void-trade-scope", projectId],
    mutationFn: async ({ proposalId, reason }: VoidTradeScopeInput) => {
      const trimmedReason = reason.trim();
      if (trimmedReason.length < 5) {
        throw new Error("Record a meaningful reason for voiding this scope.");
      }
      const { data, error } = await getSupabase().rpc("void_trade_scope", {
        p_proposal_id: proposalId,
        p_reason: trimmedReason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        invalidateTradeScope(queryClient, projectId, variables.proposalId),
        queryClient.invalidateQueries({
          queryKey: ["project-ffe-items", projectId],
        }),
      ]);
    },
  });
}

/* ── Trade RFQs (Act IV · Phase 2 — asking a party for a number) ────────────
 *
 * A bid can also arrive because the studio ASKED for it, rather than being
 * typed in by hand. trade_rfq_requests is the ask: one row per party, snapshot-
 * ing the scope's current sections at the moment of the ask so a later edit to
 * the draft never rewrites what a party was shown. Sending is two calls, one
 * user act — prepare_trade_rfq upserts the (draft) ask, then the trade-rfq-send
 * edge function mints a one-time link and emails it, mirroring the
 * fingerprint→RPC→function shape the sends above use (minus the fingerprint —
 * an RFQ protects no prior signature). A party's reply lands back as a
 * trade_scope_bids row with source='party_response'; the bid ledger already
 * renders that row, so this section only owns the ask itself and its status.
 * ─────────────────────────────────────────────────────────────────────────── */

export type TradeRfqStatus = "draft" | "sent" | "responded" | "closed";

export interface TradeRfqView {
  id: string;
  proposalId: string;
  partyId: string;
  partyDisplayName: string | null;
  status: TradeRfqStatus;
  message: string | null;
  timeline: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
}

function tradeRfqStatus(value: unknown): TradeRfqStatus {
  return value === "sent" || value === "responded" || value === "closed"
    ? value
    : "draft";
}

function mapTradeRfq(row: any): TradeRfqView {
  return {
    id: String(row.id),
    proposalId: String(row.proposal_id ?? row.proposalId),
    partyId: String(row.party_id ?? row.partyId),
    partyDisplayName:
      typeof row.party_display_name === "string" ? row.party_display_name : null,
    status: tradeRfqStatus(row.status),
    message: typeof row.message === "string" ? row.message : null,
    timeline: typeof row.timeline === "string" ? row.timeline : null,
    sentAt: typeof row.sent_at === "string" ? row.sent_at : null,
    respondedAt: typeof row.responded_at === "string" ? row.responded_at : null,
    closedAt: typeof row.closed_at === "string" ? row.closed_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

async function fetchTradeRfqs(scopeId: string): Promise<TradeRfqView[]> {
  const { data, error } = await getSupabase()
    .from("trade_rfq_requests")
    .select("*")
    .eq("proposal_id", scopeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTradeRfq);
}

const tradeRfqKeys = {
  list: (scopeId: string) => ["trade-rfqs", scopeId] as const,
};

/**
 * The RFQ dispatch log for one scope — direct studio-RLS select, read-only.
 * A reply arrives out-of-band (the party answers from their own device, on
 * their own time, with nothing on this screen to invalidate the cache), so
 * this opts back into refetch-on-focus: the app's global default turns it
 * off (src/lib/react-query.ts), which is right for everything else here but
 * wrong for a status only an outside actor can change.
 */
export function useTradeRfqs(scopeId: string, enabled = true) {
  return useQuery({
    queryKey: tradeRfqKeys.list(scopeId),
    queryFn: () => fetchTradeRfqs(scopeId),
    enabled: enabled && Boolean(scopeId),
    refetchOnWindowFocus: true,
  });
}

export interface SendTradeRfqInput {
  partyId: string;
  message?: string | null;
  timeline?: string | null;
  /**
   * Resend: re-invoke trade-rfq-send directly against an already-sent ask's
   * id, skipping prepare_trade_rfq. prepare_trade_rfq's upsert is
   * DRAFT-only (00403 idiom) — a 'sent' row never matches its WHERE clause,
   * so calling it again after a send would silently INSERT A SECOND ask row
   * for the same party rather than reuse the first. mint_trade_rfq_token's
   * revoke-then-mint is scoped to a single rfq_request_id, so resending
   * against the SAME row is what actually revokes the old link; a second row
   * would leave the original token live (wrong — "resend" must mean the old
   * link stops working, not "also send a new one").
   */
  existingRfqId?: string;
}

export interface SendTradeRfqResult {
  rfqId: string;
  recipient: string | null;
  emailSent: boolean;
}

/**
 * Translates a trade-rfq-send failure — a thrown FunctionsHttpError (non-2xx)
 * or a resolved body that carries its own `error` — into designer-readable
 * copy. no_recipient in particular has to read as fixable, not as a stack
 * trace (the po-send / quote-request-send idiom this mirrors).
 *
 * Any failure that carries no parseable JSON body (or a JSON body with no
 * `detail`) falls through to a brand-voice generic — never the raw SDK
 * string ("Edge Function returned a non-2xx status code"), which reads like
 * an internal error, not a fixable instruction.
 */
async function tradeRfqSendFailureMessage(
  error: unknown,
  fallback: unknown,
): Promise<string> {
  let code: string | null = null;
  let detail: string | null = null;

  const context = (error as { context?: { json?: () => Promise<any> } } | null)
    ?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.json();
      code = typeof body?.error === "string" ? body.error : null;
      detail = typeof body?.detail === "string" ? body.detail : null;
    } catch {
      // No JSON body on the error response — fall through.
    }
  }
  if (!code && fallback && typeof fallback === "object") {
    const body = fallback as { error?: string; detail?: string };
    code = typeof body.error === "string" ? body.error : code;
    detail = typeof body.detail === "string" ? body.detail : detail;
  }

  if (code === "no_recipient") {
    return (
      detail ??
      "No email on file for this party — add one to their contact and try again."
    );
  }
  if (detail) return detail;
  // No JSON body (or a body without a detail string) — never surface the raw
  // SDK/network string; a designer needs an instruction, not a stack trace.
  return "The request could not be sent. Check the party's email and try again.";
}

/**
 * "Send a request" — one party, one act: snapshot the scope's current
 * sections into a draft ask (prepare_trade_rfq — upsert-by-draft, so a retry
 * after a failed send reuses the same draft rather than piling up rows), then
 * mint the token and email it (trade-rfq-send, mode 'send').
 *
 * "Resend" (input.existingRfqId set) skips prepare_trade_rfq entirely and
 * re-invokes trade-rfq-send against the SAME already-sent row — see
 * SendTradeRfqInput.existingRfqId for why that distinction is load-bearing.
 */
export function useSendTradeRfq(scopeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["send-trade-rfq", scopeId],
    mutationFn: async (input: SendTradeRfqInput): Promise<SendTradeRfqResult> => {
      const supabase = getSupabase();
      let rfqId = input.existingRfqId;

      if (!rfqId) {
        const { data: prepared, error: prepareError } = await supabase.rpc(
          "prepare_trade_rfq",
          {
            p_proposal_id: scopeId,
            p_party_id: input.partyId,
            p_message: input.message?.trim() || null,
            p_timeline: input.timeline?.trim() || null,
          },
        );
        if (prepareError) throw prepareError;
        const preparedRow = Array.isArray(prepared) ? prepared[0] : prepared;
        rfqId = preparedRow?.id ?? preparedRow?.rfqId ?? preparedRow?.rfq_id;
        if (!rfqId) {
          throw new Error("The request could not be prepared.");
        }
      }

      const { data, error } = await supabase.functions.invoke("trade-rfq-send", {
        body: { rfqRequestId: rfqId, mode: "send" },
      });
      if (error || data?.error) {
        throw new Error(await tradeRfqSendFailureMessage(error, data));
      }

      return {
        rfqId: String(rfqId),
        recipient: typeof data?.recipient === "string" ? data.recipient : null,
        emailSent: data?.emailSent === true,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tradeRfqKeys.list(scopeId) });
    },
  });
}

/* ── Executed on paper (the studio records a printed original) ──────────────
 *
 * Four RPCs share one honest shape (00412's shared provenance contract): the
 * studio was handed a signed or accepted paper original instead of an
 * on-screen act, and records it as the client's own — same effects as the
 * matching online act, signed_ip NULL (the paper tell), and an evidence
 * fingerprint taken at record time.
 *
 * Notify wiring is NOT uniform across the four — it follows exactly what the
 * paper-notify route (apps/designer-portal/src/app/api/commercial/[id]/
 * paper-notify/route.ts) actually accepts, per its own ALLOWED_TRANSITIONS:
 *   - record_paper_client_signature → 'client_signed'. The route 400s this
 *     transition on purpose (its docstring: "client_signed has no paper
 *     analog on the studio side — recording the paper client signature
 *     triggers countersign, which itself fires 'executed'"), so this mutation
 *     never calls it. The client-signed→executed leg is instead handled
 *     inside useCountersignDesignServicesAgreement below.
 *   - execute_furnishings_authorization_on_paper / execute_trade_scope_on_
 *     paper → 'furnishings_executed' / 'trade_scope_executed', THEN
 *     'deposit_ready' when the RPC's own response carries a depositInvoiceId
 *     — mirroring the client-portal sign route's post-execute notification
 *     block (apps/client-portal/src/app/api/proposals/[id]/sign/route.ts).
 *     Both transitions live in commercial-document-notify's CLIENT_TRANSITIONS
 *     (policy.ts) — a plain studio-session call would 403, which is exactly
 *     why the route exists (it re-authorizes from the caller's session, then
 *     invokes the notify function as the service actor).
 *   - record_paper_trade_acceptance → 'trade_scope_accepted'. RULING
 *     ADJUSTMENT (supersedes the original "suppressed for paper" decision):
 *     a paper acceptance now sends the client a paper-variant notice of its
 *     own — the studio recorded their acceptance and the final payment
 *     follows (core.ts). The route allows this transition exactly like the
 *     two execute acts above.
 *
 * A failed notify never rolls back a recorded signature — it degrades to
 * `notificationDelivery: 'pending_retry'`, the same posture every other
 * commerce notify in this file already takes.
 * ─────────────────────────────────────────────────────────────────────────── */

type PaperNotifyTransition =
  | "executed"
  | "furnishings_executed"
  | "trade_scope_executed"
  | "deposit_ready"
  | "trade_scope_accepted";

/**
 * POSTs to the designer-portal's paper-notify route. The route re-
 * authorizes the caller from their own session, reads whether a scan was
 * attached, and invokes commercial-document-notify as the service actor
 * (bypassing the CLIENT_TRANSITIONS actor gate a studio session would trip on
 * its own). Non-blocking: a transport or route failure degrades to
 * 'pending_retry' rather than throwing back into the mutation — callers
 * always get a signature/execution recorded even if the notice lags.
 */
async function postPaperNotify(
  proposalId: string,
  transition: PaperNotifyTransition,
): Promise<CommercialNotificationDelivery> {
  try {
    const response = await fetch(`/api/commercial/${proposalId}/paper-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transition }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok === true) return "delivered";
    console.warn("paper commercial notification pending retry", {
      proposalId,
      transition,
      error: data?.error ?? `http_${response.status}`,
    });
    return "pending_retry";
  } catch (error) {
    console.warn("paper commercial notification pending retry", {
      proposalId,
      transition,
      error: error instanceof Error ? error.message : "transport_error",
    });
    return "pending_retry";
  }
}

/**
 * Uploads the paper original's scan onto the Folio's proposal leg
 * (project-documents/{proposalId}/…, 00252 — same storage mechanics as
 * useUploadProposalFolioFile in @/hooks/use-folio), except `client_visible`
 * defaults TRUE here: a scan the studio attaches to a paper record is
 * evidence the client is entitled to see, not a private working file. Not a
 * version chain — each paper record's scan is a fresh attachment tied to
 * that one act, not a re-upload of a prior file. Returns the new
 * project_documents row's id, which the paper RPCs validate belongs to this
 * proposal before accepting it as `p_scan_document_id`.
 */
export async function uploadPaperScanDocument(
  proposalId: string,
  file: File,
): Promise<string> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();

  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const storagePath = `${proposalId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("project-documents")
    .upload(storagePath, file, { contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const docType = file.type === "application/pdf"
    ? "pdf"
    : file.type.startsWith("image/")
      ? "img"
      : "doc";

  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: null,
      proposal_id: proposalId,
      title: file.name,
      doc_type: docType,
      storage_path: storagePath,
      size_bytes: file.size,
      uploaded_by: auth?.user?.id ?? null,
      // 'proposal' — the same section_key useUploadProposalFolioFile writes;
      // the CHECK constraint (project_documents_section_key_check, 00380)
      // does not carry a dedicated value for a commercial paper scan.
      anchor_kind: "section",
      section_key: "proposal",
      client_visible: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data?.id;
  if (!id) throw new Error("The scan could not be filed.");
  return String(id);
}

export interface RecordPaperClientSignatureInput {
  signedName: string;
  paperSignedOn: string;
  scanDocumentId?: string | null;
}

export interface PaperRecordResult {
  notificationDelivery: CommercialNotificationDelivery;
  [key: string]: unknown;
}

/**
 * "Record signed on paper" for a design services agreement / addendum —
 * `record_paper_client_signature` (sent → client_signed only; execution
 * remains the studio's separate, unchanged countersign act below).
 */
export function useRecordPaperClientSignature(proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["record-paper-client-signature", proposalId],
    mutationFn: async (
      input: RecordPaperClientSignatureInput,
    ): Promise<PaperRecordResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "record_paper_client_signature",
        {
          p_proposal_id: proposalId,
          p_signed_name: input.signedName.trim(),
          p_paper_signed_on: input.paperSignedOn,
          p_scan_document_id: input.scanDocumentId ?? null,
        },
      );
      if (error) throw error;
      // No notify here — see the section note above. record_paper_client_
      // signature only reaches client_signed; the paper-notify route 400s
      // that transition on purpose, and the real "executed" notice fires
      // from useCountersignDesignServicesAgreement once the studio
      // countersigns. 'not_requested' keeps this mutation's return shape
      // identical to the other three (all PaperRecordResult).
      return { ...(data ?? {}), notificationDelivery: "not_requested" };
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: commercialDocumentKeys.bundle(proposalId),
        }),
        queryClient.invalidateQueries({ queryKey: ["proposal", proposalId] }),
        queryClient.invalidateQueries({ queryKey: ["document-state"] }),
        queryClient.invalidateQueries({ queryKey: ["desk-engagements"] }),
        // A scan attached at record time lands in the same Folio bucket the
        // proposal-folio strip reads (project-documents/{proposalId}/…,
        // 00252) — invalidate so it actually shows up there without a
        // manual refresh.
        ...(variables.scanDocumentId
          ? [queryClient.invalidateQueries({ queryKey: ["proposal-folio", proposalId] })]
          : []),
      ]);
    },
  });
}

export interface ExecuteOnPaperInput {
  proposalId: string;
  signedName: string;
  paperSignedOn: string;
  scanDocumentId?: string | null;
}

/**
 * "Record & execute" for a furnishings authorization — execute_furnishings_
 * authorization_on_paper (sent → executed, in one act, ALL the online
 * execution's effects preserved: schedule lines apply, the deposit invoice
 * follows).
 */
export function useExecuteFurnishingsAuthorizationOnPaper(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["execute-furnishings-authorization-on-paper", projectId],
    mutationFn: async (
      input: ExecuteOnPaperInput,
    ): Promise<PaperRecordResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "execute_furnishings_authorization_on_paper",
        {
          p_proposal_id: input.proposalId,
          p_signed_name: input.signedName.trim(),
          p_paper_signed_on: input.paperSignedOn,
          p_scan_document_id: input.scanDocumentId ?? null,
        },
      );
      if (error) throw error;
      const notificationDelivery = await postPaperNotify(
        input.proposalId,
        "furnishings_executed",
      );
      // Mirrors the client-portal sign route: fire deposit_ready right after
      // execution whenever this act actually raised a deposit invoice.
      const depositInvoiceId =
        (data as Record<string, unknown> | null)?.depositInvoiceId ??
        (data as Record<string, unknown> | null)?.deposit_invoice_id;
      const depositNotificationDelivery: CommercialNotificationDelivery =
        depositInvoiceId
          ? await postPaperNotify(input.proposalId, "deposit_ready")
          : "not_requested";
      return { ...(data ?? {}), notificationDelivery, depositNotificationDelivery };
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        queryClient.invalidateQueries({
          queryKey: commercialDocumentKeys.bundle(variables.proposalId),
        }),
        queryClient.invalidateQueries({
          queryKey: ["proposal", variables.proposalId],
        }),
        // See useRecordPaperClientSignature's onSuccess for why: a scan
        // attached at record time needs the Folio strip's query invalidated
        // to actually show up there.
        ...(variables.scanDocumentId
          ? [
              queryClient.invalidateQueries({
                queryKey: ["proposal-folio", variables.proposalId],
              }),
            ]
          : []),
      ]);
    },
  });
}

/**
 * "Record & execute" for a trade scope — execute_trade_scope_on_paper (sent →
 * executed, ALL the online execution's effects preserved: first-draw gate,
 * the deposit draw auto-issues, the RFQ sweep closes out open asks).
 */
export function useExecuteTradeScopeOnPaper(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["execute-trade-scope-on-paper", projectId],
    mutationFn: async (
      input: ExecuteOnPaperInput,
    ): Promise<PaperRecordResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "execute_trade_scope_on_paper",
        {
          p_proposal_id: input.proposalId,
          p_signed_name: input.signedName.trim(),
          p_paper_signed_on: input.paperSignedOn,
          p_scan_document_id: input.scanDocumentId ?? null,
        },
      );
      if (error) throw error;
      const notificationDelivery = await postPaperNotify(
        input.proposalId,
        "trade_scope_executed",
      );
      // Mirrors the client-portal sign route: fire deposit_ready right after
      // execution whenever this act auto-issued the first draw invoice.
      const depositInvoiceId =
        (data as Record<string, unknown> | null)?.depositInvoiceId ??
        (data as Record<string, unknown> | null)?.deposit_invoice_id;
      const depositNotificationDelivery: CommercialNotificationDelivery =
        depositInvoiceId
          ? await postPaperNotify(input.proposalId, "deposit_ready")
          : "not_requested";
      return { ...(data ?? {}), notificationDelivery, depositNotificationDelivery };
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        invalidateTradeScope(queryClient, projectId, variables.proposalId),
        queryClient.invalidateQueries({
          queryKey: commercialDocumentKeys.bundle(variables.proposalId),
        }),
        ...(variables.scanDocumentId
          ? [
              queryClient.invalidateQueries({
                queryKey: ["proposal-folio", variables.proposalId],
              }),
            ]
          : []),
      ]);
    },
  });
}

export interface RecordPaperTradeAcceptanceInput {
  proposalId: string;
  signedName: string;
  paperSignedOn: string;
  /** 00425: the acceptance's own scan pointer (acceptance_scan_document_id)
   *  — a separate attachment from either execution signature's scan, since
   *  it is a different act on a different date. */
  scanDocumentId?: string | null;
}

/**
 * "Record accepted on paper" — record_paper_trade_acceptance. Requires
 * progress_state='substantially_complete' server-side and is idempotent
 * once accepted. It issues nothing of its own on the money side — the final
 * draw is still a separate "Issue draw" act once the schedule allows it —
 * but RULING ADJUSTMENT (supersedes "suppressed for paper"): it DOES notify
 * the client that their acceptance was recorded, through the same
 * paper-notify route the two execute acts use.
 */
export function useRecordPaperTradeAcceptance(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["record-paper-trade-acceptance", projectId],
    mutationFn: async (
      input: RecordPaperTradeAcceptanceInput,
    ): Promise<PaperRecordResult> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc(
        "record_paper_trade_acceptance",
        {
          p_proposal_id: input.proposalId,
          p_signed_name: input.signedName.trim(),
          p_paper_signed_on: input.paperSignedOn,
          p_scan_document_id: input.scanDocumentId ?? null,
        },
      );
      if (error) throw error;
      const notificationDelivery = await postPaperNotify(
        input.proposalId,
        "trade_scope_accepted",
      );
      return { ...(data ?? {}), notificationDelivery };
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        invalidateProjectCommerce(queryClient, projectId),
        invalidateTradeScope(queryClient, projectId, variables.proposalId),
        ...(variables.scanDocumentId
          ? [
              queryClient.invalidateQueries({
                queryKey: ["proposal-folio", variables.proposalId],
              }),
            ]
          : []),
      ]);
    },
  });
}
