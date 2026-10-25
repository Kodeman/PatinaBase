"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@patina/supabase";
import { boundedInTransport } from "./bounded-in-transport";

interface NamedLine {
  name?: string | null;
  selection_thread_id?: string | null;
}

/** Thread id → its need label, where it has one. */
export type NeedLabels = Readonly<Record<string, string>>;

/** The need the line answers (D2): its thread's need label, else its name. */
export function lineName(line: NamedLine, needLabels: NeedLabels = {}): string {
  return (
    (line.selection_thread_id && needLabels[line.selection_thread_id]) ||
    line.name?.trim() ||
    "Unnamed line"
  );
}

/**
 * The need labels, from the same source the Spec lens reads
 * (`project_ffe_selection_threads.need_label`, spec-lens.tsx). A fill names
 * the line after the product; the need stays on the thread.
 */
export function useNeedLabels(
  projectId: string,
  lines: readonly NamedLine[],
): NeedLabels {
  const threadIds = useMemo(
    () =>
      [
        ...new Set(
          lines
            .map((line) => line.selection_thread_id)
            .filter((id): id is string => !!id),
        ),
      ].sort(),
    [lines],
  );
  const { data } = useQuery({
    queryKey: [
      "project-ffe-items",
      projectId,
      "need-labels",
      threadIds.join(","),
    ],
    enabled: threadIds.length > 0,
    queryFn: async (): Promise<NeedLabels> => {
      const supabase = createBrowserClient() as any;
      const labels: Record<string, string> = {};
      await boundedInTransport([{
        ids: threadIds,
        read: async (ids) => {
          const { data: threads, error } = await supabase
            .from("project_ffe_selection_threads")
            .select("id, need_label")
            .in("id", ids);
          if (error) throw error;
          for (const thread of (threads ?? []) as {
            id: string;
            need_label: string | null;
          }[]) {
            if (thread.need_label?.trim())
              labels[thread.id] = thread.need_label.trim();
          }
        },
      }]);
      return labels;
    },
  });
  return data ?? {};
}

