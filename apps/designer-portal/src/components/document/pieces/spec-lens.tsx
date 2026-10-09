"use client";

/**
 * US-21 T-29: the Spec lens (a4, a6, a14; S3, S4, D2, D15). Two panes on the
 * working sheet: the place's lines on the left as `name · stage · N OF 6`,
 * and the active line's fields on the right. `NEXT UNFINISHED →` walks the
 * lines with fewer than six fields filled. At 390 the panes stack (a14): the
 * fields first, `NEXT UNFINISHED →` at their foot, then the line list. There
 * a tapped line brings its pane into view and focuses its heading (F9). A
 * fill focuses the same heading and says so in a polite live region (F4/F5).
 * Money, procurement and receiving are not on this lens. A group (T-52, D6)
 * prints as its heading with its members under it, each `↳`; grouping itself
 * is done in Rough in.
 *
 * The lens reads its own data. The spec columns and the need labels come from
 * `project_ffe_specs` and `project_ffe_selection_threads` under a key inside
 * `['project-ffe-items', projectId]`, so every FF&E write refreshes them.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBrowserClient,
  useProjectFFEItems,
  useProjectLineGroups,
  useProjectRoomPlacements,
  type ProjectFfeSpec,
} from "@patina/supabase";
import type { FfeRoomPlacement } from "@patina/types";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import {
  REMOVED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import {
  linesForPlace,
  nextUnfinishedId,
  specProgress,
  specProgressLabel,
} from "@/lib/document/pieces/spec-progress";
import {
  LABOR_STAMP_LABEL,
  isLaborLine,
  laborPiece,
  lineStampLabel,
} from "@/lib/document/stamp-derivation";
import { pieceLineStage } from "@/lib/document/pieces/line-stage";
import { liveBuildRoomLines } from "@/lib/document/pieces/live-lines";
import { AlsoInLine } from "./placement-chips";
import {
  GROUP_MEMBER_MARK,
  LineGroupRow,
  layoutLineGroups,
  memberInset,
} from "./line-group-row";
import {
  INKED_ACT_CLS,
  SpecFieldsPane,
  type SpecLensLine,
  type SpecLensSpec,
} from "./spec-fields-pane";

export interface SpecLensProps {
  docId: string;
  projectId: string;
  room: BuildRoomPlace;
  canSeeMoney: boolean;
}

interface SpecFieldRows {
  specs: Record<string, SpecLensSpec>;
  needLabels: Record<string, string>;
}

const SPEC_COLUMNS =
  "id, ffe_item_id, row_version, finish, material, color_fabric, selected_dimensions, exact_location, trade_notes, selected_media";

/** Below `md` the panes stack, so the fields pane sits above the line list. */
const STACKED_QUERY = "(max-width: 767.98px)";

function stacked(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(STACKED_QUERY).matches
  );
}

export const specFieldRowsKey = (
  projectId: string,
  lineIds: readonly string[],
) => ["project-ffe-items", projectId, "spec-lens", lineIds.join(",")] as const;

function useSpecFieldRows(projectId: string, lines: readonly SpecLensLine[]) {
  const lineIds = useMemo(() => lines.map((l) => l.id).sort(), [lines]);
  const threadIds = useMemo(
    () =>
      [
        ...new Set(lines.map((l) => l.selection_thread_id).filter(Boolean)),
      ] as string[],
    [lines],
  );
  return useQuery({
    queryKey: specFieldRowsKey(projectId, lineIds),
    enabled: lineIds.length > 0,
    queryFn: async (): Promise<SpecFieldRows> => {
      const supabase = createBrowserClient() as any;
      const [specs, threads] = await Promise.all([
        supabase
          .from("project_ffe_specs")
          .select(SPEC_COLUMNS)
          .in("ffe_item_id", lineIds),
        threadIds.length > 0
          ? supabase
              .from("project_ffe_selection_threads")
              .select("id, need_label")
              .in("id", threadIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (specs.error) throw specs.error;
      if (threads.error) throw threads.error;
      const result: SpecFieldRows = { specs: {}, needLabels: {} };
      for (const spec of (specs.data ?? []) as SpecLensSpec[]) {
        result.specs[spec.ffe_item_id] = spec;
      }
      for (const thread of (threads.data ?? []) as {
        id: string;
        need_label: string | null;
      }[]) {
        if (thread.need_label?.trim())
          result.needLabels[thread.id] = thread.need_label;
      }
      return result;
    },
  });
}

export function SpecLens({ projectId, room, canSeeMoney }: SpecLensProps) {
  const queryClient = useQueryClient();
  const { data: rawLines } = useProjectFFEItems(projectId);
  const { data: placements } = useProjectRoomPlacements(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const { data: groupData } = useProjectLineGroups(projectId);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Runs after the chosen line's pane mounts, so the heading is its own.
  useEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

  /** Shows a line; at 390 its pane sits above the list, so it takes focus. */
  const choose = (id: string) => {
    setChosenId(id);
    if (stacked()) setFocusRequest((n) => n + 1);
  };

  const allLines = useMemo(
    () =>
      liveBuildRoomLines(rawLines as unknown as SpecLensLine[] | undefined),
    [rawLines],
  );
  const rooms = useMemo(
    () => (roomRows ?? []).map((r) => ({ id: r.id, name: r.name })),
    [roomRows],
  );
  const lines = useMemo(
    () =>
      linesForPlace(
        allLines,
        placements ?? [],
        room,
        rooms.map((r) => r.id),
      ),
    [allLines, placements, room, rooms],
  );
  /** The list as it prints: each group's heading over its members (T-52). */
  const entries = useMemo(() => {
    // A room's groups print in that room; Throughout and the unassigned pile
    // take the room-less ones; the whole job takes all.
    const placeRoom =
      room == null ? undefined : rooms.some((r) => r.id === room) ? room : null;
    const groups = (groupData ?? [])
      .filter((g) => placeRoom === undefined || g.projectRoomId === placeRoom)
      .map((g) => ({ id: g.id, name: g.name }));
    return layoutLineGroups(lines, groups, {
      groupId: (line) =>
        (line as SpecLensLine & { line_group_id?: string | null })
          .line_group_id,
      labor: isLaborLine,
    });
  }, [lines, groupData, room, rooms]);
  const fields = useSpecFieldRows(projectId, lines);
  const specs = fields.data?.specs ?? {};
  const needLabels = fields.data?.needLabels ?? {};

  const needLabelOf = (line: SpecLensLine) =>
    (line.selection_thread_id && needLabels[line.selection_thread_id]) ||
    line.name;
  const progressOf = (id: string) => {
    const line = lines.find((l) => l.id === id);
    return line ? specProgress(line, specs[id]) : 0;
  };
  const placementsOf = (id: string): FfeRoomPlacement[] =>
    (placements ?? []).filter((p) => p.ffeItemId === id);

  const orderedIds = entries.flatMap((entry) =>
    entry.kind === "line" ? [entry.item.id] : [],
  );
  const firstUnfinished = nextUnfinishedId(orderedIds, null, progressOf);
  const activeId =
    chosenId && orderedIds.includes(chosenId)
      ? chosenId
      : (firstUnfinished ?? orderedIds[0] ?? null);
  const active = lines.find((l) => l.id === activeId) ?? null;
  const nextId = nextUnfinishedId(orderedIds, activeId, progressOf);

  const onSpecSaved = (saved: ProjectFfeSpec) => {
    queryClient.setQueryData<SpecFieldRows>(
      specFieldRowsKey(projectId, [...orderedIds].sort()),
      (current) =>
        current
          ? {
              ...current,
              specs: {
                ...current.specs,
                [saved.ffe_item_id]: {
                  ...current.specs[saved.ffe_item_id],
                  ...saved,
                },
              },
            }
          : current,
    );
  };

  if (room === REMOVED_PLACE) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        Removed lines are not specced. Restore one in Rough in to spec it.
      </p>
    );
  }
  if (rawLines && lines.length === 0) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        No lines here yet. Add them in Rough in, then spec them here.
      </p>
    );
  }

  const next = (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className={INKED_ACT_CLS}
        aria-disabled={nextId == null || undefined}
        aria-describedby={nextId == null ? "spec-next-reason" : undefined}
        onClick={() => {
          if (nextId) choose(nextId);
        }}
      >
        NEXT UNFINISHED →
      </button>
      {nextId == null && (
        <span
          id="spec-next-reason"
          className="font-sans text-[13px] text-[var(--sheet-ink-faint)]"
        >
          Every other line here has its six fields.
        </span>
      )}
    </span>
  );

  const list = (
    <ul aria-label="Lines" className="flex flex-col">
      {entries.map((entry) => {
        if (entry.kind === "heading")
          return (
            <LineGroupRow
              key={`group:${entry.group.id}`}
              group={entry.group}
              variant="list"
            />
          );
        const { item: line, member } = entry;
        const stage = pieceLineStage(line, laborPiece(line, allLines)).kind;
        const labor = isLaborLine(line);
        const current = line.id === activeId;
        return (
          <li key={line.id}>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              onClick={() => choose(line.id)}
              className={`grid min-h-[var(--row,40px)] w-full grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-[var(--sheet-rule)] py-2 text-left hover:bg-[var(--sheet-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--clay-ink)] ${
                memberInset(member, labor) || "pl-2"
              } pr-2 ${current ? "outline outline-1 -outline-offset-1 outline-[var(--sheet-rule-strong)]" : ""}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-sans text-[14px] font-medium leading-[1.4] text-[var(--sheet-ink)]">
                  {(labor || member) && (
                    <span
                      aria-hidden="true"
                      className="mr-1 text-[var(--sheet-ink-faint)]"
                    >
                      {GROUP_MEMBER_MARK}
                    </span>
                  )}
                  {needLabelOf(line)}
                </span>
                {room && rooms.some((r) => r.id === room) && (
                  <AlsoInLine
                    placements={placementsOf(line.id)}
                    rooms={rooms}
                    hereRoomId={room}
                    unit={line.unit}
                  />
                )}
              </span>
              <span className="flex items-center gap-1">
                {labor && (
                  <span className="stamp stamp--labor">
                    {LABOR_STAMP_LABEL}
                  </span>
                )}
                <span className={`stamp stamp--${stage}`}>
                  {lineStampLabel(stage)}
                </span>
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--sheet-ink-faint)]">
                {specProgressLabel(specProgress(line, specs[line.id]))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  // One copy of each part: the list and NEXT UNFINISHED on the left at
  // 1440 (a4); at 390 the fields come first and the act sits at their foot,
  // with the list under it (a14).
  return (
    <div
      data-testid="spec-lens"
      className="grid grid-cols-1 gap-6 py-6 md:grid-cols-[520px_minmax(0,1fr)] md:gap-x-12"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="order-3 md:order-none md:col-start-1 md:row-start-1">
        {list}
      </div>
      <div className="order-2 md:order-none md:col-start-1 md:row-start-2">
        {next}
      </div>
      {active && (
        <div className="order-1 min-w-0 md:order-none md:col-start-2 md:row-span-2 md:row-start-1">
          <SpecFieldsPane
            key={active.id}
            projectId={projectId}
            canSeeMoney={canSeeMoney}
            line={active}
            spec={specs[active.id] ?? null}
            needLabel={needLabelOf(active)}
            piece={laborPiece(active, allLines)}
            laborLines={allLines.filter(
              (l) => isLaborLine(l) && l.parent_ffe_item_id === active.id,
            )}
            placements={placementsOf(active.id)}
            rooms={rooms}
            onSpecSaved={onSpecSaved}
            headingRef={headingRef}
            onAnnounce={setAnnouncement}
            onFilled={(message) => {
              // The fill may finish the line; keep it rather than walk on.
              setChosenId(active.id);
              setAnnouncement(message);
              setFocusRequest((n) => n + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}
