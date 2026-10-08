"use client";

/**
 * The Build room (US-21 Direction A, CONTRACT §3.4): a working sheet inside
 * the (document) layout, so the drawer, ⌘K and the document's hold (the
 * `doc/[id]` layout) carry straight through. `?lens=` and `?room=` are the
 * whole of its address; the lens bodies fill the shell's children slot.
 */

import { Suspense, use, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useProjectFFEItems,
  useProjectRoomPlacements,
  useRemovedProjectLines,
} from "@patina/supabase";
import { BuildRoomShell } from "@/components/document/pieces/build-room-shell";
import { RoughInLens } from "@/components/document/pieces/rough-in-lens";
import { SpecLens } from "@/components/document/pieces/spec-lens";
import { useCanSeeMargin } from "@/hooks/use-can-see-margin";
import {
  useAddDocumentRoom,
  useDocumentRooms,
} from "@/hooks/use-document-rooms";
import { useDocumentEngagement } from "@/hooks/use-document-state";
import {
  buildRoomHref,
  buildRoomReturnHref,
  parseBuildRoomSearch,
  type BuildRoomState,
} from "@/lib/document/pieces/build-room-url";
import {
  deriveRoomCounts,
  type RoomCountsLine,
} from "@/lib/document/pieces/room-counts";

export default function BuildRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <BuildRoom docId={id} />
    </Suspense>
  );
}

function BuildRoom({ docId }: { docId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canSeeMoney = useCanSeeMargin();
  const { lens, room } = parseBuildRoomSearch(searchParams, { canSeeMoney });

  const { data: resolution } = useDocumentEngagement(docId);
  const row = resolution?.kind === "engagement" ? resolution.row : null;
  const projectId = row?.project_id ?? null;

  const { data: rooms } = useDocumentRooms(projectId);
  const { data: lines } = useProjectFFEItems(projectId ?? "");
  const { data: placements } = useProjectRoomPlacements(projectId);
  const { data: removed } = useRemovedProjectLines(projectId ?? "");
  const addRoom = useAddDocumentRoom(projectId);

  // An activated proposal's or accepted lead's id answers at its project (R6, F1).
  useEffect(() => {
    if (resolution?.kind !== "redirect") return;
    router.replace(buildRoomHref(resolution.projectId, { lens, room }));
  }, [resolution, router, lens, room]);

  const roomList = useMemo(
    () => (rooms ?? []).map((r) => ({ id: r.id, name: r.name })),
    [rooms],
  );
  const counts = useMemo(
    () =>
      deriveRoomCounts(
        (lines ?? []) as RoomCountsLine[],
        placements,
        roomList.map((r) => r.id),
      ),
    [lines, placements, roomList],
  );

  const navigate = useCallback(
    (next: BuildRoomState) => router.push(buildRoomHref(docId, next)),
    [router, docId],
  );
  const leave = useCallback(
    () => router.push(buildRoomReturnHref(docId, room)),
    [router, docId, room],
  );
  const onAddRoom = useCallback(
    async (name: string) => {
      const created = await addRoom.mutateAsync({ name });
      navigate({ lens, room: created.id });
    },
    [addRoom, navigate, lens],
  );

  if (!row) return <main aria-busy={resolution == null} />;

  if (!projectId) {
    return (
      <main className="mx-auto max-w-[56ch] px-6 py-12 text-[14px] leading-[1.5]">
        <p>The pieces are built on a project. This document has none yet.</p>
        <a
          href={`/doc/${docId}`}
          className="mt-3 inline-flex min-h-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-4"
        >
          ← Back to the document
        </a>
      </main>
    );
  }

  return (
    <BuildRoomShell
      docId={docId}
      jobName={row.title}
      rooms={roomList}
      counts={counts}
      removedCount={removed?.length ?? 0}
      lens={lens}
      room={room}
      canSeeMoney={canSeeMoney}
      onNavigate={navigate}
      onReturn={leave}
      onAddRoom={onAddRoom}
    >
      {lens === "rough" ? (
        <RoughInLens
          docId={docId}
          projectId={projectId}
          rooms={roomList}
          room={room}
        />
      ) : null}
      {lens === "spec" && (
        <SpecLens
          docId={docId}
          projectId={projectId}
          room={room}
          canSeeMoney={canSeeMoney}
        />
      )}
    </BuildRoomShell>
  );
}
