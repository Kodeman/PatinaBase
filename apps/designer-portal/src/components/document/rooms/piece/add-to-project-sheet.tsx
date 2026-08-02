"use client";

/**
 * Add a piece to a project — a paper sheet over the Piece Room that lists the
 * designer's active projects and places the piece into one's FF&E schedule via
 * the same `usePlaceInDocument` path the Engine uses (added_via='engine',
 * item_type 'tbd', client/trade prices carried through). Zero shadows (D4).
 */

import { useState } from "react";
import { usePlaceProductConfiguration, useProjects } from "@patina/supabase";
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
  onAdded: (projectName: string) => void;
}) {
  const { data: projects, isLoading } = useProjects();
  const place = usePlaceInDocument();
  const placeConfiguration = usePlaceProductConfiguration();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      if (configurationId) {
        await placeConfiguration.mutateAsync({
          projectId,
          configurationId,
          source: { surface: "library-piece" },
        });
      } else {
        await place.mutateAsync({ projectId, piece });
      }
      productEvents.addToProject(piece.id);
      onAdded(projectName);
      onClose();
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
          {targets.map((p, index) => (
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
        <p className="mt-3 text-[0.74rem] text-[var(--color-terracotta)]">
          {err}
        </p>
      )}
    </RoomSheet>
  );
}
