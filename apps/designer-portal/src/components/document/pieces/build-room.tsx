"use client";

/**
 * The Build room (US-21 Direction A, CONTRACT §3.4): a working sheet inside
 * the (document) layout, so the drawer, ⌘K and the document's hold (the
 * `doc/[id]` layout) carry straight through. `?lens=` and `?room=` are the
 * whole of its address; the lens bodies fill the shell's children slot.
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  useProjectFFEItems,
  useProjectPalettes,
  useProjectRoomPlacements,
  useRemovedProjectLines,
} from "@patina/supabase";
import { BuildRoomShell } from "@/components/document/pieces/build-room-shell";
import { PiecesSkeleton } from "@/components/loading";
import {
  FinishesLens,
  roomFinishesByRoom,
} from "@/components/document/pieces/finishes-lens";
import { PriceLens } from "@/components/document/pieces/price-lens";
import { ReleaseLens } from "@/components/document/pieces/release-lens";
import { RoughInLens } from "@/components/document/pieces/rough-in-lens";
import { SpecLens } from "@/components/document/pieces/spec-lens";
import {
  useAddDocumentRoom,
  useDocumentRooms,
} from "@/hooks/use-document-rooms";
import { useDocumentEngagement } from "@/hooks/use-document-state";
import { type BuildRoomState } from "@/lib/document/pieces/build-room-url";
import {
  deriveRoomCounts,
  type RoomCountsLine,
} from "@/lib/document/pieces/room-counts";

export interface BuildRoomProps extends BuildRoomState {
  docId: string;
  canSeeMoney: boolean;
  embedded?: boolean;
  onNavigate: (state: BuildRoomState) => void;
  onReturn: () => void;
  onRequestClose?: () => void;
  /** The host resolves old proposal/lead addresses to their canonical project. */
  onRedirect: (projectId: string) => void;
}

export function BuildRoom({
  docId,
  lens,
  room,
  canSeeMoney,
  embedded = false,
  onNavigate,
  onReturn,
  onRequestClose,
  onRedirect,
}: BuildRoomProps) {
  const {
    data: resolution,
    isError: resolutionFailed,
    fetchStatus,
  } = useDocumentEngagement(docId);
  const row = resolution?.kind === "engagement" ? resolution.row : null;
  const projectId = row?.project_id ?? null;

  const { data: rooms, isPending: roomsPending } = useDocumentRooms(projectId);
  const { data: lines, isPending: linesPending } = useProjectFFEItems(
    projectId ?? "",
  );
  const { data: placements, isPending: placementsPending } =
    useProjectRoomPlacements(projectId);
  const { data: removed } = useRemovedProjectLines(projectId ?? "");
  const { data: palettes } = useProjectPalettes(projectId ?? "");
  const addRoom = useAddDocumentRoom(projectId);

  // An activated proposal's or accepted lead's id answers at its project (R6, F1).
  useEffect(() => {
    if (resolution?.kind !== "redirect") return;
    onRedirect(resolution.projectId);
  }, [resolution, onRedirect]);

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
  // The Finishes head counts surfaces: the room's, or every room's (a11).
  const surfaceCount = useMemo(() => {
    const byRoom = roomFinishesByRoom(palettes);
    if (room != null) return byRoom.get(room)?.length ?? 0;
    return roomList.reduce((n, r) => n + (byRoom.get(r.id)?.length ?? 0), 0);
  }, [palettes, room, roomList]);

  const onAddRoom = useCallback(
    async (name: string) => {
      const created = await addRoom.mutateAsync({ name });
      onNavigate({ lens, room: created.id });
    },
    [addRoom, onNavigate, lens],
  );

  if (!row) {
    // US-34 F13a (H1): only a read that answered can say there is nothing
    // here. A failed read says so; one still in flight, or a redirect on its
    // way, is the shaped sheet, never a blank one. The read is disabled only
    // for an id that is not a UUID, which no document has.
    const missing =
      resolution?.kind === "missing" ||
      (resolution == null && fetchStatus === "idle" && !resolutionFailed);
    if (resolutionFailed && resolution == null) {
      return (
        <BuildRoomNote role="alert" embedded={embedded} onReturn={onReturn}>
          The pieces could not be read. Reload the page to try again.
        </BuildRoomNote>
      );
    }
    if (missing) {
      return (
        <BuildRoomNote embedded={embedded} onReturn={onReturn}>
          This document could not be found.
        </BuildRoomNote>
      );
    }
    return <PiecesSkeleton />;
  }

  if (!projectId) {
    return (
      <ProjectRequiredNote
        docId={docId}
        embedded={embedded}
        onReturn={onReturn}
      />
    );
  }

  // SQ-1012 (N14) — the sheet is composed from three reads: the rooms (the
  // rail's rows and the lens's room tables), the lines and their placements.
  // Printed as each one answered, every line first stood under "Not in a room
  // yet", the room tables then landed above it (a 300px push) and the
  // placements then emptied it (CLS 0.18). The shaped placeholder holds until
  // all three have answered; a failed read stops holding.
  if (roomsPending || linesPending || placementsPending) {
    return <PiecesSkeleton />;
  }

  return (
    <BuildRoomShell
      embedded={embedded}
      onRequestClose={onRequestClose}
      docId={docId}
      jobName={row.title}
      rooms={roomList}
      counts={counts}
      removedCount={removed?.length ?? 0}
      lens={lens}
      room={room}
      canSeeMoney={canSeeMoney}
      surfaceCount={surfaceCount}
      onNavigate={onNavigate}
      onReturn={onReturn}
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
      {lens === "price" && (
        <PriceLens
          docId={docId}
          projectId={projectId}
          room={room}
          canSeeMoney={canSeeMoney}
        />
      )}
      {lens === "release" && (
        <ReleaseLens
          docId={docId}
          projectId={projectId}
          room={room}
          canSeeMoney={canSeeMoney}
        />
      )}
      {lens === "finishes" && (
        <FinishesLens
          docId={docId}
          projectId={projectId}
          room={room}
          canSeeMoney={canSeeMoney}
        />
      )}
    </BuildRoomShell>
  );
}

/** A Build room that cannot open says why, in the sheet's own note. */
function BuildRoomNote({
  role,
  children,
  embedded,
  onReturn,
}: {
  role?: "alert";
  children: string;
  embedded: boolean;
  onReturn: () => void;
}) {
  const Container = embedded ? "section" : "main";
  return (
    <Container
      aria-label={embedded ? "FF&E schedule" : undefined}
      className="mx-auto max-w-[56ch] px-6 py-12 text-[14px] leading-[1.5]"
    >
      <p role={role}>{children}</p>
      <a
        href="/desk"
        onClick={
          embedded
            ? (event) => {
                event.preventDefault();
                onReturn();
              }
            : undefined
        }
        className="mt-3 inline-flex min-h-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-4"
      >
        {embedded ? "← Back to the document" : "← Back to the desk"}
      </a>
    </Container>
  );
}

function ProjectRequiredNote({
  docId,
  embedded,
  onReturn,
}: Pick<BuildRoomProps, "docId" | "embedded" | "onReturn">) {
  const NoteContainer = embedded ? "section" : "main";
  return (
    <NoteContainer
      aria-label={embedded ? "FF&E schedule" : undefined}
      className="mx-auto max-w-[56ch] px-6 py-12 text-[14px] leading-[1.5]"
    >
      <p>The pieces are built on a project. This document has none yet.</p>
      <a
        href={`/doc/${docId}`}
        onClick={
          embedded
            ? (event) => {
                event.preventDefault();
                onReturn();
              }
            : undefined
        }
        className="mt-3 inline-flex min-h-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline underline-offset-4"
      >
        ← Back to the document
      </a>
    </NoteContainer>
  );
}
