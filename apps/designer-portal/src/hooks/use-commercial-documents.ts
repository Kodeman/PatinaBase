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
      const notificationDelivery =
        result.commercialState === "executed"
          ? await invokeCommercialNotification(supabase, {
              documentId: proposalId,
              transition: "executed",
            })
          : "not_requested";
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
        .select("*")
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

  return mapTradeScopeWorkspace({
    proposalId,
    terms: termsResult.data,
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
 * "Release for authorization" — the same verb, the same ceremony, the same
 * send rail as a furnishings authorization (useSendFurnishingsAuthorization):
 * snapshot fingerprint → send_commercial_document → proposal-send.
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
