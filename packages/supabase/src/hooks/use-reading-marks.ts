"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";

const getSupabase = () => createBrowserClient();

export const readingMarkKeys = {
  current: (projectId: string) => ["project-reading-mark", projectId] as const,
  previous: (projectId: string) =>
    ["project-reading-mark", "previous", projectId] as const,
};

export function useReadingMark(projectId: string | undefined) {
  return useQuery({
    queryKey: readingMarkKeys.current(projectId ?? ""),
    queryFn: async (): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("project_reading_marks")
        .select("read_at")
        .eq("project_id", projectId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.read_at ?? null;
    },
    enabled: !!projectId,
  });
}

export interface MarkProjectReadInput {
  projectId: string;
}

export function useMarkProjectRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
    }: MarkProjectReadInput): Promise<string | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("mark_project_read", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return (data ?? null) as string | null;
    },
    onSuccess: (previous, variables) => {
      queryClient.setQueryData(
        readingMarkKeys.previous(variables.projectId),
        previous ?? null,
      );
      queryClient.invalidateQueries({
        queryKey: readingMarkKeys.current(variables.projectId),
      });
    },
  });
}

/**
 * Cache-only read of the timestamp `useMarkProjectRead` stashed under the
 * `previous` key — no fetcher of its own; `enabled: false` + `staleTime:
 * Infinity` keep it from ever hitting the network, so it only ever reflects
 * what the mutation's onSuccess wrote via setQueryData.
 */
export function usePreviousReadingMark(projectId: string | undefined) {
  return useQuery({
    queryKey: readingMarkKeys.previous(projectId ?? ""),
    queryFn: (): string | null => null,
    enabled: false,
    staleTime: Infinity,
    initialData: null as string | null,
  });
}
