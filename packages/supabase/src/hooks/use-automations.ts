import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";
import type {
  AutomatedSequence,
  SequenceEnrollment,
  SequenceTriggerConfig,
  SequenceStep,
  SequenceStatus,
} from "@patina/shared/types";

const getSupabase = () => createBrowserClient();

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * List all automated sequences with status, step counts, and performance.
 */
export function useAutomations() {
  return useQuery<AutomatedSequence[]>({
    queryKey: ["automations"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/comms/automations", { headers });
      if (!res.ok) throw new Error("Failed to fetch automations");
      return res.json();
    },
  });
}

/**
 * Get a single automation sequence detail.
 */
export function useAutomation(id: string | null) {
  return useQuery<AutomatedSequence>({
    queryKey: ["automation", id],
    queryFn: async () => {
      if (!id) throw new Error("No automation ID");
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch automation");
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Create a new automation sequence.
 */
export function useCreateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      trigger_config: SequenceTriggerConfig;
      steps_json?: SequenceStep[];
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/comms/automations", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create automation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

/**
 * Update an existing automation sequence.
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      description?: string | null;
      trigger_config?: SequenceTriggerConfig;
      steps_json?: SequenceStep[];
      status?: SequenceStatus;
    }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update automation");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automation", variables.id] });
    },
  });
}

/**
 * Delete an automation sequence.
 */
export function useDeleteAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete automation");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

/**
 * Activate an automation (set status to 'active').
 */
export function useActivateAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to activate automation");
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automation", id] });
    },
  });
}

/**
 * Pause an automation (set status to 'paused').
 */
export function usePauseAutomation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to pause automation");
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["automation", id] });
    },
  });
}

/**
 * List enrollments for a specific sequence.
 */
export function useSequenceEnrollments(sequenceId: string | null) {
  return useQuery<SequenceEnrollment[]>({
    queryKey: ["sequence-enrollments", sequenceId],
    queryFn: async () => {
      if (!sequenceId) throw new Error("No sequence ID");
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/comms/automations/${sequenceId}`, {
        headers,
      });
      if (!res.ok) throw new Error("Failed to fetch automation");
      const data = await res.json();
      return data.enrollments || [];
    },
    enabled: !!sequenceId,
  });
}

// ─── Enrollment management (designer-onboarding program, Wave 4) ───────────
// Dedicated endpoint (api/admin/comms/automations/[id]/enrollments) — richer
// than useSequenceEnrollments above (email/display_name join, pagination,
// manual enroll/unenroll). Kept as a separate hook + query key rather than
// replacing useSequenceEnrollments, which some callers may still rely on for
// the cheap embedded-in-detail-GET list.

export interface AutomationEnrollment {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  current_step: number;
  status: "active" | "completed" | "unsubscribed";
  next_step_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  step_history: unknown;
}

export interface AutomationEnrollmentsPage {
  rows: AutomationEnrollment[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Paginated, profile-joined enrollments for a sequence, from the dedicated
 * enrollments endpoint.
 */
export function useAutomationEnrollments(
  sequenceId: string | null,
  params?: { limit?: number; offset?: number },
) {
  return useQuery<AutomationEnrollmentsPage>({
    queryKey: [
      "automation-enrollments",
      sequenceId,
      params?.limit,
      params?.offset,
    ],
    queryFn: async () => {
      if (!sequenceId) throw new Error("No sequence ID");
      const headers = await getAuthHeaders();
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString();
      const res = await fetch(
        `/api/admin/comms/automations/${sequenceId}/enrollments${query ? `?${query}` : ""}`,
        { headers },
      );
      if (!res.ok) throw new Error("Failed to fetch enrollments");
      return res.json();
    },
    enabled: !!sequenceId,
  });
}

/**
 * Manually enroll a user (by email or user_id) into a sequence. Reactivates
 * a completed/unsubscribed enrollment in place rather than duplicating it
 * (server-side semantics — see the route handler).
 */
export function useEnrollInAutomation(sequenceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { email?: string; user_id?: string }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/automations/${sequenceId}/enrollments`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Failed to enroll" }));
        throw new Error(err.error || "Failed to enroll");
      }
      return res.json() as Promise<AutomationEnrollment>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["automation-enrollments", sequenceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["sequence-enrollments", sequenceId],
      });
      queryClient.invalidateQueries({ queryKey: ["automation", sequenceId] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });
}

/**
 * Unenroll (soft — sets status to 'unsubscribed') a single enrollment row.
 */
export function useUnenrollFromAutomation(sequenceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/admin/comms/automations/${sequenceId}/enrollments`,
        {
          method: "DELETE",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ enrollment_id: enrollmentId }),
        },
      );
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Failed to unenroll" }));
        throw new Error(err.error || "Failed to unenroll");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["automation-enrollments", sequenceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["sequence-enrollments", sequenceId],
      });
      queryClient.invalidateQueries({ queryKey: ["automation", sequenceId] });
    },
  });
}
