"use client";

/**
 * Add a piece to a project — a paper sheet over the Piece Room that lists the
 * designer's active projects and places the piece into one's FF&E schedule via
 * the same `usePlaceInDocument` path the Engine uses (added_via='engine',
 * item_type 'tbd', client/trade prices carried through). Zero shadows (D4).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FfeDuplicateMode } from "@patina/types";
import { useProjects } from "@patina/supabase";
import { DocumentAction } from "../../document-action";
import { RoomSheet } from "../room-sheet";
import {
  usePlaceInDocument,
  type PlaceablePiece,
} from "@/hooks/use-place-in-document";
import { productEvents } from "@/lib/analytics/events";

export function AddToProjectSheet({
  open,
  onClose,
  piece,
  configurationId = null,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  piece: PlaceablePiece;
  configurationId?: string | null;
  onAdded: (projectName: string, outcome: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: projects, isLoading } = useProjects();
  const place = usePlaceInDocument();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<FfeDuplicateMode>("reuse");
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const contextualProjectId = searchParams.get("projectId");
  const contextualRoomId = searchParams.get("roomId");
  const contextualBoardId = searchParams.get("boardId");
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    if (!open) return;
    setDuplicateMode("reuse");
    setErr(null);
    requestKey.current = null;
  }, [open]);

  const targets = (
    (projects ?? []) as Array<{
      id: string;
      name: string | null;
      status: string | null;
    }>
  ).filter(
    (p) =>
      p.status !== "completed" &&
      p.status !== "archived" &&
      p.status !== "cancelled",
  );

  const add = async (projectId: string, projectName: string) => {
    setBusy(projectId);
    setErr(null);
    try {
      const request = {
        projectId,
        piece,
        configurationId,
        assignmentScope: contextualProjectId === projectId && contextualRoomId ? "room" as const : "unassigned" as const,
        roomId: contextualProjectId === projectId ? contextualRoomId : null,
        boardId: contextualProjectId === projectId ? contextualBoardId : null,
        duplicateMode,
      };
      const fingerprint = JSON.stringify(request);
      if (requestKey.current?.fingerprint !== fingerprint) {
        requestKey.current = {
          fingerprint,
          key: globalThis.crypto?.randomUUID?.() ?? `piece-${projectId}-${piece.id}-${Date.now()}`,
        };
      }
      const result = await place.mutateAsync({
        ...request,
        idempotencyKey: requestKey.current.key,
      });
      productEvents.addToProject(piece.id);
      const outcome = {
        created: "Created selection",
        reused: "Reused selection",
        filled: "Filled placeholder",
        held: "Held for duplicate review",
      }[result.outcome];
      onAdded(projectName, outcome);
      onClose();
      if (returnTo) router.push(returnTo);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add to that project.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <RoomSheet
      open={open}
      onClose={onClose}
      title={`Add “${piece.name}” to a project`}
    >
      <p className="mb-4 text-[0.8rem] text-[var(--color-aged-oak)]">
        {configurationId
          ? "The exact choices and maker-rule result travel with the project as a preserved specification."
          : "The piece lands in the project’s schedule as a TBD line — refine the room, quantity, and price there."}
      </p>
      <fieldset className="mb-4">
        <legend className="mb-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
          If this piece is already in the project
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {([['reuse', 'Reuse'], ['create', 'Separate need'], ['hold', 'Hold']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={duplicateMode === value}
              onClick={() => setDuplicateMode(value)}
              className={`min-h-11 rounded-[3px] border px-2 text-[11px] ${duplicateMode === value ? 'border-[var(--color-clay)]' : 'border-[var(--color-pearl)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {isLoading ? (
        <p className="text-[0.8rem] italic text-[var(--color-aged-oak)]">
          Reading your projects…
        </p>
      ) : targets.length === 0 ? (
        <p className="text-[0.8rem] italic text-[var(--color-aged-oak)]">
          No open projects to add to yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {[...targets].sort((a, b) => Number(b.id === contextualProjectId) - Number(a.id === contextualProjectId)).map((p, index) => (
            <li key={p.id}>
              <DocumentAction
                actionKey="add-piece-to-project"
                surfaceKey="piece"
                regionKey={`project-target-${index}`}
                variant="primary"
                onClick={() => void add(p.id, p.name ?? "the project")}
                disabled={busy !== null}
                loading={busy === p.id}
                loadingLabel={`Adding to ${p.name ?? "project"}…`}
                className="w-full justify-between text-left normal-case tracking-normal"
                trailing={busy === p.id ? undefined : "add →"}
              >
                {p.name ?? "Untitled project"}
              </DocumentAction>
            </li>
          ))}
        </ul>
      )}
      {err && (
        <p className="mt-3 text-[0.74rem] text-[var(--color-terracotta-ink)]">
          {err}
        </p>
      )}
    </RoomSheet>
  );
}
