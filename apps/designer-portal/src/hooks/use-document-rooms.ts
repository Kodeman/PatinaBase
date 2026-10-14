/**
 * Rooms on the schedule (R25) — audit-first: project_rooms shipped in 00066
 * (name, budget_cents allocation, sort_order, committed/actual rollups) and
 * project_ffe_items.project_room_id already exists with activation lineage.
 * Nothing additive needed — the paper just starts rendering the truth.
 * Allocations feed the Account Page's by-room variance from the SAME rows.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBrowserClient,
  useOptimisticMutation,
  useTriageProjectFfeItems,
} from "@patina/supabase";
import type { FfeAssignmentScope } from "@patina/types";

type AddRoomInput = { name: string; budgetCents?: number | null };
type AddRoomVariables = AddRoomInput & { id: string; sortOrder: number };
type AddRoomCache = DocumentRoom[];

const getSupabase = () => createBrowserClient() as any;
const roomKey = (projectId: string | null) =>
  ["document-rooms", projectId] as const;
const NO_ROOMS: AddRoomVariables[] = [];

export interface DocumentRoom {
  id: string;
  project_id: string;
  name: string;
  budget_cents: number;
  sort_order: number;
}

export function useDocumentRooms(projectId: string | null) {
  return useQuery<DocumentRoom[]>({
    queryKey: roomKey(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("project_rooms")
        .select("id, project_id, name, budget_cents, sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentRoom[];
    },
  });
}

export function useAddDocumentRoom(
  projectId: string | null,
  options: { optimistic?: boolean } = {},
) {
  const qc = useQueryClient();
  const key = roomKey(projectId);
  const plain = useMutation({
    mutationFn: async (input: AddRoomInput) => {
      const supabase = getSupabase();
      const { data: existing } = await supabase
        .from("project_rooms")
        .select("sort_order")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder =
        ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;
      const { data, error } = await supabase
        .from("project_rooms")
        .insert({
          project_id: projectId,
          name: input.name,
          budget_cents: input.budgetCents ?? 0,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentRoom;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const ink = useOptimisticMutation<
    AddRoomVariables,
    DocumentRoom,
    AddRoomCache
  >({
    honesty: "internal",
    scopeId: `document-rooms:${projectId ?? ""}`,
    keys: [key],
    mutationFn: async (input) => {
      const { data, error } = await getSupabase()
        .from("project_rooms")
        .insert({
          id: input.id,
          project_id: projectId,
          name: input.name,
          budget_cents: input.budgetCents ?? 0,
          sort_order: input.sortOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentRoom;
    },
    // A room being added has one face, the caller's "Adding…" ghost drawn from
    // `pending`. The list holds written rooms only, so nothing can act on a
    // room before its receipt, which `merge` adds before pending ends.
    apply: (rooms) => rooms,
    invert: (rooms) => rooms,
    merge: (rooms, receipt) =>
      rooms.some((room) => room.id === receipt.id)
        ? rooms.map((room) =>
            room.id === receipt.id ? { ...room, ...receipt } : room,
          )
        : [...rooms, receipt].sort((a, b) => a.sort_order - b.sort_order),
    onSuccess: async (receipt) => {
      // A first create can finish before the initial list query has cached rows.
      // Seed its receipt before the mutation leaves pending, then let the list
      // reconcile without removing the receipt in the meantime.
      qc.setQueryData<AddRoomCache>(key, (rooms) =>
        rooms?.some((room) => room.id === receipt.id)
          ? rooms.map((room) =>
              room.id === receipt.id ? { ...room, ...receipt } : room,
            )
          : [...(rooms ?? []), receipt].sort(
              (a, b) => a.sort_order - b.sort_order,
            ),
      );
      void qc.invalidateQueries({ queryKey: key, exact: true });
    },
  });

  const mutate = (
    input: AddRoomInput,
    mutateOptions?: Parameters<typeof plain.mutate>[1],
  ) => {
    if (!options.optimistic) {
      plain.mutate(input, mutateOptions);
      return;
    }
    const rooms = qc.getQueryData<AddRoomCache>(key) ?? [];
    const pendingOrders = qc
      .getMutationCache()
      .findAll({
        mutationKey: ["optimistic", `document-rooms:${projectId ?? ""}`],
        status: "pending",
      })
      .map(
        (mutation) => (mutation.state.variables as AddRoomVariables).sortOrder,
      );
    const sortOrder =
      Math.max(-1, ...rooms.map((room) => room.sort_order), ...pendingOrders) +
      1;
    ink.mutate(
      { ...input, id: crypto.randomUUID(), sortOrder },
      mutateOptions as Parameters<typeof ink.mutate>[1],
    );
  };
  const selected = options.optimistic ? ink : plain;
  return {
    ...selected,
    pending: options.optimistic ? ink.pending : NO_ROOMS,
    mutate,
  } as Omit<typeof plain, "mutate"> & {
    pending: AddRoomVariables[];
    mutate: typeof mutate;
  };
}

/** Assign a line to a room (from the unfold; drag lands here too). */
export function useAssignLineRoom(projectId: string | null) {
  const triage = useTriageProjectFfeItems();
  return {
    ...triage,
    mutate: ({
      itemId,
      roomId,
      assignmentScope,
    }: {
      itemId: string;
      roomId: string | null;
      assignmentScope: FfeAssignmentScope;
    }) => {
      if (!projectId) return;
      triage.mutate({
        projectId,
        selectionIds: [itemId],
        assignmentScope,
        roomId,
      });
    },
  };
}
