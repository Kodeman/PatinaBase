"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";

// ═══════════════════════════════════════════════════════════════════════════
// FIELD TIME REPORTS — hours a trade party reported by text (Field Line P3)
//
// An evening text asks a consented trade party how many hours they put in; a
// numeric reply becomes a PROPOSAL in field_time_reports, never an hour on
// anybody's ledger. The designer decides from the Desk: accept (the proposal
// stays in this ledger), not right, or book it to a profile-backed teammate —
// only that last one writes a project_time_entries row, and only because a
// person named the teammate (US-4 S4/S5/S9).
//
// A thin typed read of field_time_report_queue (the view owns membership) plus
// the field_time_report_decide RPC, which is the ONLY writer. Version travels
// with every decision: two designers acting on the same card is a conflict the
// server refuses (field_time_report_stale), not a last-write-wins race.
// 30s poll, matching the Desk's other field reads (use-sms-review).
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

/** One proposed report from public.field_time_report_queue (US-4 S5). */
export interface FieldTimeReportRow {
  id: string;
  organization_id: string | null;
  project_id: string;
  project_name: string | null;
  party_id: string | null;
  party_name: string | null;
  task_id: string | null;
  task_title: string | null;
  reported_hours: number;
  note: string | null;
  reported_at: string;
  version: number;
}

export const fieldTimeReportKeys = {
  all: ["field-time-reports"] as const,
};

/**
 * Proposed reports across my projects, newest first. The view is
 * security_invoker, so membership already bounds the queue.
 */
export function useFieldTimeReportQueue() {
  return useQuery({
    queryKey: fieldTimeReportKeys.all,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<FieldTimeReportRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from("field_time_report_queue")
        .select("*")
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FieldTimeReportRow[];
    },
  });
}

export interface DecideFieldTimeReportInput {
  reportId: string;
  decision: "accepted" | "rejected";
  /** The version the designer was looking at — the server's conflict check. */
  expectedVersion: number;
  /**
   * A profile-backed project member to book the hours to. Explicit only: left
   * out (or null), the decision writes no time entry at all, ever.
   */
  attributeToUserId?: string | null;
}

/** True when a decision lost the version race (US-4 S4, SQLSTATE 40001). */
export function isFieldTimeReportStale(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const fields = error as Record<string, unknown>;
  return ["message", "details", "hint", "code"].some((key) => {
    const value = fields[key];
    return (
      typeof value === "string" && value.includes("field_time_report_stale")
    );
  });
}

/**
 * Accept, reject, or accept-with-attribution one proposed report. Wraps
 * field_time_report_decide (SECURITY DEFINER — it authorizes auth.uid() against
 * the project, refuses a decided report, refuses a stale version, and refuses a
 * non-member attribution). `stale` is true when the row moved under the
 * designer, so the card can ask her to take another look at the refreshed one.
 */
export function useDecideFieldTimeReport() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: DecideFieldTimeReportInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc("field_time_report_decide", {
        p_report_id: input.reportId,
        p_decision: input.decision,
        p_expected_version: input.expectedVersion,
        p_attribute_to_user_id: input.attributeToUserId ?? null,
      });
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: fieldTimeReportKeys.all });
      // Booking to a teammate is the one decision that lands a real hour, so it
      // also sweeps the surfaces an hour shows up on (the same by-key idiom
      // use-sms-review uses for the surfaces a field effect touches).
      if (input.attributeToUserId) {
        void queryClient.invalidateQueries({ queryKey: ["time"] });
        void queryClient.invalidateQueries({
          queryKey: ["document-hours-week"],
        });
      }
    },
    onError: (error) => {
      // A stale card is showing the designer an old version: refresh it so the
      // second look is at the row as it now stands.
      if (isFieldTimeReportStale(error)) {
        void queryClient.invalidateQueries({
          queryKey: fieldTimeReportKeys.all,
        });
      }
    },
  });

  return {
    ...mutation,
    stale: mutation.isError && isFieldTimeReportStale(mutation.error),
  };
}
