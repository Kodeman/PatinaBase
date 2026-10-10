"use client";

import { useId, useState } from "react";
import { useFfePairLines, useLinkFfePair } from "@patina/supabase";
import { readPair, useAddComFabricLine } from "../buying/com-piece";

/**
 * T-30 (D4, a4): `This piece takes COM` on the line, as a checkbox. It reuses
 * the buy cell's pair (`buying/com-piece.tsx`): ticking adds the fabric line
 * beside the piece and links it as COM; clearing unlinks the fabric, which
 * stays an ordinary line. The COM facts and yardage stay in the buy cell.
 */

type ComPieceRow = {
  id: string;
  name: string;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  parent_ffe_item_id?: string | null;
  link_kind?: string | null;
};

export function ComToggle({
  projectId,
  item,
  canEdit,
}: {
  projectId: string;
  item: ComPieceRow;
  canEdit: boolean;
}) {
  const { data: lines } = useFfePairLines(projectId);
  const addFabric = useAddComFabricLine();
  const link = useLinkFfePair({ errorSurface: "inline" });
  const [error, setError] = useState<string | null>(null);
  const boxId = useId();
  const reasonId = useId();

  const pair = readPair(item, lines ?? []);
  const takesCom = pair.children.length > 0;
  const pending = addFabric.isPending || link.isPending;
  const gate = pair.onPiece
    ? "This line is on a piece, so it takes no COM."
    : null;
  const blocked = !canEdit || !lines || !!gate || pending;

  const toggle = () => {
    if (blocked) return;
    setError(null);
    const work = takesCom
      ? Promise.all(
          pair.children.map((child) =>
            link.mutateAsync({ childId: child.id, parentId: null }),
          ),
        )
      : addFabric.add(projectId, item);
    work.catch((e: Error) =>
      setError(
        e.message ||
          (takesCom
            ? "The fabric was not unlinked."
            : "The fabric line was not added."),
      ),
    );
  };

  return (
    <div data-testid="com-toggle" className="flex flex-col gap-1">
      <span className="inline-flex min-h-[44px] items-center gap-2">
        <input
          id={boxId}
          type="checkbox"
          checked={takesCom}
          aria-disabled={blocked || undefined}
          aria-describedby={gate ? reasonId : undefined}
          onChange={toggle}
          className="h-4 w-4 accent-[color:var(--sheet-ink,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed"
        />
        <label
          htmlFor={boxId}
          className="font-sans text-[15px] text-[color:var(--sheet-ink,#1A1816)]"
        >
          This piece takes COM
        </label>
      </span>
      {gate && (
        <span
          id={reasonId}
          className="font-sans text-[13px] text-[color:var(--sheet-ink-faint,#6B655E)]"
        >
          {gate}
        </span>
      )}
      {pair.children.map((child) => (
        <span
          key={child.id}
          className="font-sans text-[13px] text-[color:var(--sheet-ink-muted,#4A4540)]"
        >
          Takes COM · {child.name}
          {child.vendor_name ? ` from ${child.vendor_name}` : ""}
        </span>
      ))}
      {error && (
        <p
          role="alert"
          className="font-sans text-[13px] text-[color:var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
