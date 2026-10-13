"use client";

/**
 * Where a library piece has been used (US-28 S10c; uplift.md (c) area 5).
 *
 * A piece is "used on" a job when a live line on that job's pieces list
 * (`project_ffe_items`, not removed) points at it. The job's name comes from
 * the project; its stage, which draws the tick and prints the stage word,
 * comes from `document_state.active_section`. A read of rows the designer can
 * already see under RLS: no new data, no write.
 */

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@patina/supabase";

export type UsageStage =
  | "brief"
  | "discovery"
  | "direction"
  | "proposal"
  | "project"
  | "install"
  | "care";

export interface PieceUse {
  projectId: string;
  /** The job's name, e.g. "Holloway Den". */
  title: string;
  clientName: string | null;
  stage: UsageStage;
}

export const USAGE_STAGE_WORD: Record<UsageStage, string> = {
  brief: "Brief",
  discovery: "Discovery",
  direction: "Direction",
  proposal: "Proposal",
  project: "Project",
  install: "Install",
  care: "Care",
};

/** The stage class that draws a job's tick. Care has no stage colour. */
export function usageStageClass(stage: UsageStage): string {
  return stage === "care" ? "" : `st-${stage}`;
}

export interface UsageLine {
  product_id: string | null;
  project_id: string | null;
  project?: { name?: string | null } | null;
}

export interface UsageDoc {
  project_id: string | null;
  client_name?: string | null;
  active_section?: string | null;
}

function toStage(value: string | null | undefined): UsageStage {
  return value && value in USAGE_STAGE_WORD ? (value as UsageStage) : "project";
}

/** Group live lines into each piece's jobs: one entry per job, by name. */
export function groupPieceUsage(
  lines: readonly UsageLine[],
  docs: readonly UsageDoc[],
): Record<string, PieceUse[]> {
  const docByProject = new Map<string, UsageDoc>();
  for (const doc of docs) {
    if (doc.project_id && !docByProject.has(doc.project_id)) {
      docByProject.set(doc.project_id, doc);
    }
  }

  const byProduct: Record<string, PieceUse[]> = {};
  for (const line of lines) {
    if (!line.product_id || !line.project_id) continue;
    const uses = (byProduct[line.product_id] ??= []);
    if (uses.some((use) => use.projectId === line.project_id)) continue;
    const doc = docByProject.get(line.project_id);
    uses.push({
      projectId: line.project_id,
      title: line.project?.name?.trim() || "Untitled job",
      clientName: doc?.client_name ?? null,
      stage: toStage(doc?.active_section),
    });
  }
  for (const uses of Object.values(byProduct)) {
    uses.sort((a, b) => a.title.localeCompare(b.title));
  }
  return byProduct;
}

export function usePieceUsage(productIds: readonly string[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["library-piece-usage", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, PieceUse[]>> => {
      const supabase = createBrowserClient();
      const { data: lines, error } = await supabase
        .from("project_ffe_items")
        .select("product_id, project_id, project:projects(name)")
        .in("product_id", ids)
        .is("removed_at", null);
      if (error) throw error;

      const projectIds = Array.from(
        new Set(
          ((lines ?? []) as UsageLine[])
            .map((line) => line.project_id)
            .filter((id): id is string => !!id),
        ),
      );
      if (projectIds.length === 0) return {};

      const { data: docs, error: docError } = await supabase
        .from("document_state")
        .select("project_id, client_name, active_section")
        .in("project_id", projectIds);
      if (docError) throw docError;

      return groupPieceUsage(
        (lines ?? []) as UsageLine[],
        (docs ?? []) as UsageDoc[],
      );
    },
  });
}
