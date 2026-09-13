"use client";

/**
 * CHASE THE RENEWAL — a draft, never a send.
 *
 * "Chase the renewal" writes one row onto the agent queue and stops there: the
 * task lands `awaiting_review`, and a person presses send. No automated
 * external sends is a standing rule, and the act's own consequence sentence on
 * the company card says exactly that.
 *
 * ⚠ THE QUEUE IS WRITTEN SERVER-SIDE (CR-3 / QA-1). `enqueue_agent_task` is
 * granted to `postgres`, `service_role` and `agent_writer` only — never to
 * `authenticated` — so this used to call it from `createBrowserClient()` and
 * fail on every press with `permission denied for function enqueue_agent_task`.
 * The act now posts to `/api/people/chase-renewal`, which proves studio
 * membership through the caller's OWN RLS and then enqueues with the service
 * role. A browser client is not an agent.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

/** The queue's own word for this work. */
export const COMPLIANCE_CHASE_TASK_TYPE = "compliance_chase";

/** What the act promises on the face, and what it actually does. */
export function chaseConsequenceSentence(firmName: string): string {
  return `This drafts a note to ${firmName}'s paperwork contact and files it for your review. Nothing is sent until you send it.`;
}

export interface ChaseRenewalInput {
  organizationId: string;
  /** The firm's card. */
  companyId: string;
  companyName: string;
  /** The paper being chased, so the draft can name it. */
  documentId?: string | null;
  documentLabel?: string | null;
  /** The person the note is addressed to, when the firm names one. */
  paperworkContactPersonId?: string | null;
}

export function useChaseTheRenewal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChaseRenewalInput) => {
      const response = await fetch("/api/people/chase-renewal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: input.companyId,
          documentId: input.documentId ?? null,
          documentLabel: input.documentLabel ?? null,
          paperworkContactPersonId: input.paperworkContactPersonId ?? null,
        }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(detail?.error ?? "Could not draft that note just now.");
      }
      return (await response.json()) as { taskId: string | null };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["agent-tasks"] });
    },
  });
}
