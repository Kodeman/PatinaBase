// Hooks for the Plan Room (00429): sheets, prints, batches, issues, transmittals.
// Raw transmittal tokens pass through mutation results only and are never cached or persisted.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";

const getSupabase = () => createBrowserClient() as any;

export interface PlanSheet {
  created_at: string;
  created_by: string | null;
  current_print_id: string | null;
  current_print_number: number;
  discipline: string | null;
  id: string;
  project_id: string;
  sheet_number: string;
  sort_order: number;
  state: string;
  title: string;
  updated_at: string;
}

export interface PlanPrint {
  batch_id: string;
  created_at: string;
  created_by: string | null;
  id: string;
  page_index: number | null;
  print_number: number;
  project_document_id: string;
  rev_letter: string;
  sha256: string;
  sheet_id: string;
  source: string;
  source_filename: string | null;
  text_sha256: string | null;
}

export interface PlanPrintBatch {
  confirmed_sheet_ids: string[];
  created_at: string;
  created_by: string | null;
  created_sheet_ids: string[];
  flipped_sheet_ids: string[];
  id: string;
  idempotency_key: string;
  item_count: number;
  project_id: string;
  request_hash: string;
  source_filename: string | null;
}

export interface PlanIssue {
  created_at: string;
  created_by: string | null;
  id: string;
  idempotency_key: string;
  issue_number: number;
  issued_at: string;
  name: string;
  prior_issue_id: string | null;
  project_id: string;
  request_hash: string;
  set_checksum: string;
  sheet_count: number;
}

export interface PlanIssuePrint {
  created_at: string;
  id: string;
  issue_id: string;
  print_id: string;
  rev_letter: string;
  sha256: string;
  sheet_id: string;
  sheet_number: string;
  sheet_title: string;
}

export interface PlanTransmittal {
  created_at: string;
  created_by: string | null;
  id: string;
  issue_id: string;
  message: string | null;
  party_company: string | null;
  party_display_name: string;
  party_email: string | null;
  party_id: string | null;
  project_id: string;
  purpose: string;
  sent_at: string;
}

/** Only the safe columns — token_hash is column-denied to portal roles. */
export interface PlanTransmittalTokenSafe {
  id: string;
  transmittal_id: string;
  project_id: string;
  status: string;
  expires_at: string;
  first_opened_at: string | null;
  view_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface PlanRoomBundle {
  sheets: PlanSheet[];
  prints: PlanPrint[];
  batches: PlanPrintBatch[];
  issues: PlanIssue[];
  issuePrints: PlanIssuePrint[];
  transmittals: PlanTransmittal[];
  tokens: PlanTransmittalTokenSafe[];
}

export interface FilePlanPrintsResult {
  batchId: string;
  idempotent: boolean;
  prints: Array<{
    sheetId: string;
    sheetNumber: string;
    isNewSheet: boolean;
    printId: string;
    printNumber: number;
    revLetter: string;
    projectDocumentId: string;
  }>;
  flippedSheetIds: string[];
}

export interface PlanIssuePreview {
  sheets: Array<{
    sheetId: string;
    sheetNumber: string;
    sheetTitle: string;
    revLetter: string;
    sha256: string;
    printId: string;
  }>;
  checksumPreview: string;
  priorIssue: {
    id: string;
    name: string;
    issueNumber: number;
    issuedAt: string;
  } | null;
  drift: {
    added: string[];
    changed: string[];
    removed: string[];
    unchanged: string[];
  };
}

export interface CreatePlanIssueResult {
  issue: {
    id: string;
    projectId: string;
    issueNumber: number;
    name: string;
    issuedAt: string;
    setChecksum: string;
    sheetCount: number;
    priorIssueId: string | null;
  };
  idempotent: boolean;
  sheets: Array<{
    sheetId: string;
    printId: string;
    sheetNumber: string;
    sheetTitle: string;
    revLetter: string;
    sha256: string;
  }>;
  drift: {
    added: string[];
    changed: string[];
    removed: string[];
    unchanged: string[];
  };
}

export interface CreatePlanTransmittalResult {
  transmittal: Record<string, unknown>;
  token: string;
}

export interface PlanRoomHoldings {
  parties: Array<{
    partyId: string | null;
    partyDisplayName: string;
    partyCompany: string | null;
    purpose: string;
    sentAt: string;
    issueId: string;
    issueName: string;
    activeLink: {
      status: string;
      expiresAt: string;
      firstOpenedAt: string | null;
      viewCount: number;
    } | null;
    holds: Array<{
      sheetId: string;
      sheetNumber: string;
      heldRev: string;
      currentRev: string;
      behind: boolean;
    }>;
    behindCount: number;
  }>;
}

export interface PrintUploadInput {
  storage_path: string;
  sha256: string;
  text_sha256?: string | null;
  size_bytes?: number | null;
  page_index?: number | null;
  source_filename?: string | null;
  doc_type?: string | null;
}

export type FilePlanPrintEntry =
  | {
      kind: "new_sheet";
      sheet: { number: string; title: string; discipline?: string | null };
      print: PrintUploadInput;
    }
  | { kind: "revision"; sheet_id: string; print: PrintUploadInput }
  | { kind: "confirm_current"; sheet_id: string };

export interface ClientPlanSheet {
  sheetId: string;
  projectId: string;
  number: string;
  title: string;
  discipline: string | null;
  revLetter: string;
  revDate: string;
  projectDocumentId: string;
  storagePath: string | null;
  sizeBytes: number | null;
}

export const planRoomKeys = {
  all: ["plan-room"] as const,
  room: (projectId: string) => ["plan-room", "room", projectId] as const,
  holdings: (projectId: string) =>
    ["plan-room", "holdings", projectId] as const,
  issuePreview: (projectId: string, sheetIds: string[] | null) =>
    [
      "plan-room",
      "issue-preview",
      projectId,
      sheetIds ? [...sheetIds].sort() : null,
    ] as const,
  clientSet: (projectIds: string[]) =>
    ["plan-room", "client-set", [...projectIds].sort()] as const,
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return value ?? [];
}

export function usePlanRoom(projectId: string) {
  return useQuery<PlanRoomBundle>({
    queryKey: planRoomKeys.room(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = getSupabase();
      const [sheetsResult, issuesResult] = await Promise.all([
        supabase
          .from("plan_sheets")
          .select("*")
          .eq("project_id", projectId)
          .order("sort_order", { ascending: true })
          .order("sheet_number", { ascending: true }),
        supabase.from("plan_issues").select("*").eq("project_id", projectId),
      ]);
      const headError = [sheetsResult, issuesResult].find(
        (result) => result.error,
      )?.error;
      if (headError) throw headError;

      const sheets = asArray<PlanSheet>(sheetsResult.data);
      const issues = asArray<PlanIssue>(issuesResult.data);
      const sheetIds = sheets.map((sheet) => sheet.id);
      const issueIds = issues.map((issue) => issue.id);

      const [
        printsResult,
        batchesResult,
        issuePrintsResult,
        transmittalsResult,
        tokensResult,
      ] = await Promise.all([
        // plan_prints / plan_issue_prints carry no project_id; scope through
        // their parents, with the zero-uuid sentinel keeping an empty IN valid.
        supabase
          .from("plan_prints")
          .select("*")
          .in(
            "sheet_id",
            sheetIds.length > 0
              ? sheetIds
              : ["00000000-0000-0000-0000-000000000000"],
          ),
        supabase
          .from("plan_print_batches")
          .select("*")
          .eq("project_id", projectId),
        supabase
          .from("plan_issue_prints")
          .select("*")
          .in(
            "issue_id",
            issueIds.length > 0
              ? issueIds
              : ["00000000-0000-0000-0000-000000000000"],
          ),
        supabase
          .from("plan_transmittals")
          .select("*")
          .eq("project_id", projectId),
        // token_hash is column-denied; `*` would be rejected outright.
        supabase
          .from("plan_transmittal_tokens")
          .select(
            "id, transmittal_id, project_id, status, expires_at, first_opened_at, view_count, last_used_at, created_at",
          )
          .eq("project_id", projectId),
      ]);
      const firstError = [
        printsResult,
        batchesResult,
        issuePrintsResult,
        transmittalsResult,
        tokensResult,
      ].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      return {
        sheets,
        prints: asArray<PlanPrint>(printsResult.data),
        batches: asArray<PlanPrintBatch>(batchesResult.data),
        issues,
        issuePrints: asArray<PlanIssuePrint>(issuePrintsResult.data),
        transmittals: asArray<PlanTransmittal>(transmittalsResult.data),
        tokens: asArray<PlanTransmittalTokenSafe>(tokensResult.data),
      };
    },
  });
}

export function usePlanRoomHoldings(projectId: string) {
  return useQuery<PlanRoomHoldings>({
    queryKey: planRoomKeys.holdings(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc(
        "get_plan_room_holdings",
        { p_project_id: projectId },
      );
      if (error) throw error;
      return data as PlanRoomHoldings;
    },
  });
}

export function usePlanIssuePreview(
  projectId: string,
  sheetIds: string[] | null,
) {
  return useQuery<PlanIssuePreview>({
    queryKey: planRoomKeys.issuePreview(projectId, sheetIds),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("preview_plan_issue", {
        p_project_id: projectId,
        ...(sheetIds ? { p_sheet_ids: sheetIds } : {}),
      });
      if (error) throw error;
      return data as PlanIssuePreview;
    },
  });
}

export function useFilePlanPrints(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({
      idempotencyKey,
      sourceFilename,
      entries,
    }: {
      idempotencyKey: string;
      sourceFilename?: string | null;
      entries: FilePlanPrintEntry[];
    }): Promise<FilePlanPrintsResult> => {
      const { data, error } = await getSupabase().rpc("file_plan_prints", {
        p_project_id: projectId,
        p_idempotency_key: idempotencyKey,
        p_entries: entries,
        ...(sourceFilename ? { p_source_filename: sourceFilename } : {}),
      });
      if (error) throw error;
      return data as FilePlanPrintsResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.holdings(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["folio-files", projectId],
      });
    },
  });
}

export function useSetPlanSheetState(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sheetId,
      state,
    }: {
      sheetId: string;
      state: string;
    }) => {
      const { data, error } = await getSupabase().rpc("set_plan_sheet_state", {
        p_sheet_id: sheetId,
        p_state: state,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: ["folio-files", projectId],
      });
    },
  });
}

export function useDeletePlanSheet(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sheetId: string) => {
      const { data, error } = await getSupabase().rpc("delete_plan_sheet", {
        p_sheet_id: sheetId,
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
    },
  });
}

export function useCreatePlanIssue(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({
      name,
      idempotencyKey,
      sheetIds,
    }: {
      name: string;
      idempotencyKey: string;
      sheetIds?: string[] | null;
    }): Promise<CreatePlanIssueResult> => {
      const { data, error } = await getSupabase().rpc("create_plan_issue", {
        p_project_id: projectId,
        p_name: name,
        p_idempotency_key: idempotencyKey,
        ...(sheetIds ? { p_sheet_ids: sheetIds } : {}),
      });
      if (error) throw error;
      return data as CreatePlanIssueResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.holdings(projectId),
      });
    },
  });
}

export function useCreatePlanTransmittal(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({
      issueId,
      purpose,
      partyId,
      recipientName,
      recipientCompany,
      message,
    }: {
      issueId: string;
      purpose: string;
      partyId?: string | null;
      recipientName?: string | null;
      recipientCompany?: string | null;
      message?: string | null;
    }): Promise<CreatePlanTransmittalResult> => {
      const { data, error } = await getSupabase().rpc(
        "create_plan_transmittal",
        {
          p_issue_id: issueId,
          p_purpose: purpose,
          ...(partyId ? { p_party_id: partyId } : {}),
          ...(recipientName ? { p_recipient_name: recipientName } : {}),
          ...(recipientCompany
            ? { p_recipient_company: recipientCompany }
            : {}),
          ...(message ? { p_message: message } : {}),
        },
      );
      if (error) throw error;
      // The raw token exists only in this mutation result; never write it to the cache.
      return data as CreatePlanTransmittalResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.holdings(projectId),
      });
    },
  });
}

export function useReissuePlanTransmittalLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transmittalId: string) => {
      const { data, error } = await getSupabase().rpc(
        "reissue_plan_transmittal_link",
        { p_transmittal_id: transmittalId },
      );
      if (error) throw error;
      // Carries a fresh raw token — mutation result only, never cached.
      return data as {
        transmittalId: string;
        token: string;
        expiresAt: string;
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.holdings(projectId),
      });
    },
  });
}

export function useRevokePlanTransmittalLink(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transmittalId: string) => {
      const { data, error } = await getSupabase().rpc(
        "revoke_plan_transmittal_link",
        { p_transmittal_id: transmittalId },
      );
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.room(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: planRoomKeys.holdings(projectId),
      });
    },
  });
}

export function useClientPlanSet(projectIds: string[]) {
  return useQuery<ClientPlanSheet[]>({
    queryKey: planRoomKeys.clientSet(projectIds),
    enabled: projectIds.length > 0,
    queryFn: async () => {
      // CONTRACT: this function must never select from plan_transmittals,
      // plan_transmittal_tokens, plan_issues, plan_issue_prints, or
      // plan_print_batches, and never selects token or holder columns — a
      // source-text contract test in the designer portal pins this.
      const supabase = getSupabase();
      const sheetsResult = await supabase
        .from("plan_sheets")
        .select(
          "id, project_id, sheet_number, title, discipline, state, current_print_id",
        )
        .in("project_id", projectIds)
        .eq("state", "shared");
      if (sheetsResult.error) throw sheetsResult.error;
      const sheets = asArray<
        Pick<
          PlanSheet,
          | "id"
          | "project_id"
          | "sheet_number"
          | "title"
          | "discipline"
          | "state"
          | "current_print_id"
        >
      >(sheetsResult.data);
      const sheetIds = sheets.map((sheet) => sheet.id);

      // RLS structurally limits this read to current prints of shared sheets.
      const printsResult = await supabase
        .from("plan_prints")
        .select("id, sheet_id, rev_letter, project_document_id, created_at")
        .in(
          "sheet_id",
          sheetIds.length > 0
            ? sheetIds
            : ["00000000-0000-0000-0000-000000000000"],
        );
      if (printsResult.error) throw printsResult.error;
      const prints = asArray<
        Pick<
          PlanPrint,
          "id" | "sheet_id" | "rev_letter" | "project_document_id" | "created_at"
        >
      >(printsResult.data);
      const documentIds = prints.map((print) => print.project_document_id);

      const documentsResult = await supabase
        .from("project_documents")
        .select("id, storage_path, size_bytes")
        .in(
          "id",
          documentIds.length > 0
            ? documentIds
            : ["00000000-0000-0000-0000-000000000000"],
        );
      if (documentsResult.error) throw documentsResult.error;
      const documents = asArray<{
        id: string;
        storage_path: string | null;
        size_bytes: number | null;
      }>(documentsResult.data);

      const printsById = new Map(prints.map((print) => [print.id, print]));
      const documentsById = new Map(
        documents.map((document) => [document.id, document]),
      );

      return sheets
        .flatMap((sheet): ClientPlanSheet[] => {
          const print = sheet.current_print_id
            ? printsById.get(sheet.current_print_id)
            : undefined;
          if (!print) return [];
          const document = documentsById.get(print.project_document_id);
          return [
            {
              sheetId: sheet.id,
              projectId: sheet.project_id,
              number: sheet.sheet_number,
              title: sheet.title,
              discipline: sheet.discipline ?? null,
              revLetter: print.rev_letter,
              revDate: print.created_at,
              projectDocumentId: print.project_document_id,
              storagePath: document?.storage_path ?? null,
              sizeBytes: document?.size_bytes ?? null,
            },
          ];
        })
        .sort((a, b) => a.number.localeCompare(b.number));
    },
  });
}
