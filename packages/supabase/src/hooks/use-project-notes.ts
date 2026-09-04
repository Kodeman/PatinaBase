"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "../client";
import type { Database, Json } from "../database.types";

const getSupabase = () => createBrowserClient();

type ProjectNoteRow = Database["public"]["Tables"]["project_notes"]["Row"];

export interface ProjectNoteEnclosure {
  kind: "proposal" | "trade_scope" | "invoice";
  id: string;
}

export interface ProjectNote {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  enclosures: ProjectNoteEnclosure[];
  state: "standing" | "answered" | "retired";
  sentAt: string;
  answeredAt: string | null;
  retiredAt: string | null;
}

function toProjectNote(row: ProjectNoteRow): ProjectNote {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    body: row.body,
    enclosures: (row.enclosures ?? []) as unknown as ProjectNoteEnclosure[],
    state: row.state as ProjectNote["state"],
    sentAt: row.sent_at,
    answeredAt: row.answered_at,
    retiredAt: row.retired_at,
  };
}

export const projectNotesKeys = {
  all: ["project-notes"] as const,
  list: (projectId: string) => ["project-notes", projectId] as const,
};

export function useProjectNotes(projectId: string | undefined) {
  return useQuery({
    queryKey: projectNotesKeys.list(projectId ?? ""),
    queryFn: async (): Promise<ProjectNote[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("project_notes")
        .select("*")
        .eq("project_id", projectId as string)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as ProjectNoteRow[]).map(toProjectNote);
    },
    enabled: !!projectId,
  });
}

export interface SendProjectNoteInput {
  projectId: string;
  body: string;
  enclosures?: ProjectNoteEnclosure[];
}

export function useSendProjectNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      body,
      enclosures,
    }: SendProjectNoteInput): Promise<ProjectNote> => {
      const supabase = getSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("project_notes")
        .insert({
          project_id: projectId,
          author_id: user.id,
          body,
          enclosures: (enclosures ?? []) as unknown as Json,
        })
        .select()
        .single();
      if (error) throw error;
      return toProjectNote(data as ProjectNoteRow);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectNotesKeys.list(variables.projectId),
      });
    },
  });
}

export interface RetireProjectNoteInput {
  noteId: string;
  projectId: string;
}

export function useRetireProjectNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      noteId,
    }: RetireProjectNoteInput): Promise<ProjectNote> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("project_notes")
        .update({ state: "retired", retired_at: new Date().toISOString() })
        .eq("id", noteId)
        .select()
        .single();
      if (error) throw error;
      return toProjectNote(data as ProjectNoteRow);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: projectNotesKeys.list(variables.projectId),
      });
    },
  });
}

/**
 * Channel lifecycle mirrors useThreadRealtime (use-comms.ts) — one channel per
 * project, torn down and rebuilt on projectId change, removed on unmount.
 */
export function useProjectNotesRealtime(projectId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel: RealtimeChannel = supabase
      .channel(`project-notes:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_notes",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: projectNotesKeys.list(projectId),
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);
}
