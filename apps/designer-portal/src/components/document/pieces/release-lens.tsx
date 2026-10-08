"use client";

/**
 * US-21 T-41: the Release lens (a3; S7, D1 row 6, D18, Q13).
 *
 * - **The table**, across rooms: `LINE · ROOM · STAGE · READINESS · FOR THE
 *   CLIENT`, grouped by room heading rows, labor under its piece.
 * - **FOR THE CLIENT** is Leah's disposition (Candidate · Selected · Alternate),
 *   written through the triage RPC with the line's room unchanged.
 *   Placeholders print `—`.
 * - **READY FOR LEAH** on each room heading records a hand-back (00742) and
 *   writes nothing else: no disposition, no select, no release.
 * - **The ceremony** names its whole set, labor included, then the consequence
 *   sentence, then the one terminal act. It drafts the authorization through
 *   `create_furnishings_authorization_from_schedule` and sends it, so the lines
 *   read RELEASED. A seat without money sees the table, never the ceremony.
 *
 * Nothing here edits a spec or a price.
 */

import { useId, useMemo, useState } from "react";
import {
  useHandBackRoom,
  useProjectFFEItems,
  useProjectFfeReadiness,
  useRoomHandbacks,
  useTriageProjectFfeItems,
} from "@patina/supabase";
import type { FfeAssignmentScope } from "@patina/types";
import {
  useProjectInstruments,
  useReleaseForAuthorization,
  useSendFurnishingsAuthorization,
} from "@/hooks/use-commercial-documents";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import { nextInstrumentNumber } from "@/lib/document/authorization-derivation";
import { fmtDay, fmtUsd } from "@/lib/document/format";
import {
  REMOVED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import {
  CLIENT_DISPOSITIONS,
  deriveReleaseLens,
  dispositionWord,
  readyLineIds,
  releaseActLabel,
  releaseAmountCents,
  releaseConsequence,
  releaseSetHead,
  type ReleaseGroup,
  type ReleaseLensLine,
  type ReleaseRow,
  type ServerReadiness,
} from "@/lib/document/pieces/readiness";
import {
  LABOR_STAMP_LABEL,
  lineStampLabel,
} from "@/lib/document/stamp-derivation";
import { cn } from "@/lib/utils";

export interface ReleaseLensProps {
  docId: string;
  projectId: string;
  room: BuildRoomPlace;
  canSeeMoney: boolean;
}

const ACT_CLS =
  "inline-flex min-h-[44px] min-w-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink,#1A1816)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed aria-disabled:text-[color:var(--sheet-ink-faint,#6B655E)]";
/** SPEC §2.5 `.act--terminal`: the Release ceremony's one act. The transparent
 *  border is what forced colors paints as the button's edge. */
const TERMINAL_CLS =
  "act--terminal inline-flex min-h-[44px] items-center rounded-[3px] border border-transparent bg-[var(--sheet-ink,#1A1816)] px-5 py-3 font-sans text-[16px] font-medium text-[var(--sheet,#FFFFFF)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
const SELECT_CLS =
  "min-h-[44px] max-w-full cursor-pointer appearance-none bg-transparent pr-1 font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink,#1A1816)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const HEAD_CELL =
  "h-[40px] px-2 text-left font-mono text-[12px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--sheet-ink)]";
const CELL =
  "px-2 py-1 align-middle font-sans text-[14px] leading-[1.4] text-[var(--sheet-ink)]";
const CONSEQUENCE_CLS =
  "consequence font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]";

const COLUMNS = [
  { label: "Line", width: undefined },
  { label: "Room", width: "160px" },
  { label: "Stage", width: "180px" },
  { label: "Readiness", width: "240px" },
  { label: "For the client", width: "170px" },
] as const;

export function ReleaseLens({
  projectId,
  room,
  canSeeMoney,
}: ReleaseLensProps) {
  const { data: rawLines } = useProjectFFEItems(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const lines = useMemo(
    () => (rawLines ?? []) as unknown as ReleaseLensLine[],
    [rawLines],
  );
  const rooms = useMemo(
    () => (roomRows ?? []).map((r) => ({ id: r.id, name: r.name })),
    [roomRows],
  );
  const readyIds = useMemo(() => readyLineIds(lines), [lines]);
  const readiness = useProjectFfeReadiness(readyIds);
  const server = useMemo(
    () =>
      new Map<string, ServerReadiness>(
        (readiness.data ?? []).map((r) => [r.selectionId, r]),
      ),
    [readiness.data],
  );
  const model = useMemo(
    () => deriveReleaseLens(lines, rooms, room, server),
    [lines, rooms, room, server],
  );
  const roomName = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms],
  );

  if (room === REMOVED_PLACE) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        Removed lines are not released. Restore one in Rough in to release it.
      </p>
    );
  }
  if (rawLines && model.groups.length === 0) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        No lines here yet. Add them in Rough in, then release them here.
      </p>
    );
  }

  return (
    <div data-testid="release-lens" className="flex flex-col gap-6 py-6">
      {readiness.isError && (
        <p
          role="alert"
          className="font-sans text-[14px] text-[var(--sheet-ink)]"
        >
          The release check did not load, so nothing can be released yet.{" "}
          <button
            type="button"
            className={ACT_CLS}
            onClick={() => void readiness.refetch()}
          >
            TRY AGAIN
          </button>
        </p>
      )}
      <div className="max-w-full overflow-x-auto">
        <table
          aria-label="Release"
          className="w-full min-w-[760px] table-fixed border-collapse"
        >
          <colgroup>
            {COLUMNS.map((col) => (
              <col
                key={col.label}
                style={col.width ? { width: col.width } : undefined}
              />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--sheet-rule-strong)]">
              {COLUMNS.map((col) => (
                <th key={col.label} scope="col" className={HEAD_CELL}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          {model.groups.map((group) => (
            <RoomGroup
              key={group.key}
              group={group}
              projectId={projectId}
              roomName={roomName}
            />
          ))}
        </table>
      </div>
      {canSeeMoney && <Ceremony projectId={projectId} set={model.set} />}
    </div>
  );
}

function RoomGroup({
  group,
  projectId,
  roomName,
}: {
  group: ReleaseGroup;
  projectId: string;
  roomName: ReadonlyMap<string, string>;
}) {
  return (
    <tbody>
      <tr className="border-b border-[var(--sheet-rule-strong)]">
        <th
          scope="rowgroup"
          colSpan={4}
          className="h-[48px] px-2 text-left font-heading text-[18px] font-normal italic leading-[1.2] text-[var(--sheet-ink)]"
        >
          {group.name}
        </th>
        <td className="px-2 text-left">
          {group.roomId && (
            <HandBack
              projectId={projectId}
              roomId={group.roomId}
              roomName={group.name}
            />
          )}
        </td>
      </tr>
      {group.rows.map((row) => (
        <LineRow
          key={row.line.id}
          row={row}
          projectId={projectId}
          roomName={roomName}
        />
      ))}
    </tbody>
  );
}

function placeWord(
  line: ReleaseLensLine,
  roomName: ReadonlyMap<string, string>,
): string {
  if (line.assignment_scope === "room" && line.project_room_id) {
    return roomName.get(line.project_room_id) ?? "Not in a room yet";
  }
  return line.assignment_scope === "throughout"
    ? "Throughout"
    : "Not in a room yet";
}

function LineRow({
  row,
  projectId,
  roomName,
}: {
  row: ReleaseRow;
  projectId: string;
  roomName: ReadonlyMap<string, string>;
}) {
  const { line, kind, labor, readiness, disposition } = row;
  const word = lineStampLabel(kind);
  return (
    <tr
      data-line-id={line.id}
      className="h-[var(--row,40px)] border-b border-[var(--sheet-rule)] hover:bg-[var(--sheet-row-hover)]"
    >
      <td className={cn(CELL, "font-medium", labor && "pl-8")}>
        {labor && (
          <span
            aria-hidden="true"
            className="mr-1 text-[var(--sheet-ink-faint)]"
          >
            ↳
          </span>
        )}
        {line.name}
      </td>
      <td className={CELL}>{placeWord(line, roomName)}</td>
      <td className={CELL}>
        <span className="flex flex-wrap items-center gap-1">
          {labor && (
            <span className="stamp stamp--labor">{LABOR_STAMP_LABEL}</span>
          )}
          {word && <span className={`stamp stamp--${kind}`}>{word}</span>}
        </span>
      </td>
      <td className={CELL}>{readiness ?? "—"}</td>
      <td className={CELL}>
        {disposition === "select" ? (
          <DispositionSelect line={line} projectId={projectId} />
        ) : disposition === "read" ? (
          dispositionWord(line.design_disposition)
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function DispositionSelect({
  line,
  projectId,
}: {
  line: ReleaseLensLine;
  projectId: string;
}) {
  const triage = useTriageProjectFfeItems();
  const errorId = useId();
  const current = line.design_disposition ?? "candidate";
  const known = (CLIENT_DISPOSITIONS as readonly string[]).includes(current);
  const scope = (line.assignment_scope ?? "unassigned") as FfeAssignmentScope;
  return (
    <span className="flex flex-col">
      <select
        aria-label={`For the client, ${line.name ?? "line"}`}
        aria-describedby={triage.isError ? errorId : undefined}
        value={current}
        onChange={(event) =>
          triage.mutate({
            projectId,
            selectionIds: [line.id],
            // Triage writes the room with the disposition; this one stays put.
            assignmentScope: scope,
            roomId: scope === "room" ? (line.project_room_id ?? null) : null,
            disposition: event.target
              .value as (typeof CLIENT_DISPOSITIONS)[number],
          })
        }
        className={SELECT_CLS}
      >
        {!known && (
          <option value={current} disabled>
            {dispositionWord(current)}
          </option>
        )}
        {CLIENT_DISPOSITIONS.map((value) => (
          <option key={value} value={value}>
            {dispositionWord(value)}
          </option>
        ))}
      </select>
      {triage.isError && (
        <span
          id={errorId}
          role="alert"
          className="font-sans text-[13px] text-[var(--sheet-ink)]"
        >
          That did not save. Choose again.
        </span>
      )}
    </span>
  );
}

function HandBack({
  projectId,
  roomId,
  roomName,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
}) {
  const handBack = useHandBackRoom();
  const { data: handbacks } = useRoomHandbacks(projectId);
  const noteId = useId();
  // Most recent first (useRoomHandbacks orders by handed_back_at desc).
  const last = (handbacks ?? []).find((h) => h.projectRoomId === roomId);
  const busy = handBack.isPending;
  return (
    <span className="flex flex-col items-start">
      <button
        type="button"
        className={ACT_CLS}
        aria-label={`Ready for Leah, ${roomName}`}
        aria-disabled={busy || undefined}
        aria-describedby={last || handBack.isError ? noteId : undefined}
        onClick={() => {
          if (busy) return;
          handBack.mutate({ projectId, roomId });
        }}
      >
        READY FOR LEAH
      </button>
      {(last || handBack.isError) && (
        <span
          id={noteId}
          role={handBack.isError ? "alert" : "status"}
          className="font-sans text-[13px] text-[var(--sheet-ink-faint)]"
        >
          {handBack.isError
            ? "That did not record. Try again."
            : `Handed back ${fmtDay(last!.handedBackAt)}`}
        </span>
      )}
    </span>
  );
}

function Ceremony({
  projectId,
  set,
}: {
  projectId: string;
  set: ReturnType<typeof deriveReleaseLens>["set"];
}) {
  const { data: instruments } = useProjectInstruments(projectId);
  const release = useReleaseForAuthorization(projectId);
  const send = useSendFurnishingsAuthorization(projectId);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Kept once drafted, so a send that fails retries the send alone and never
  // mints a second instrument for the same lines.
  const [drafted, setDrafted] = useState<{
    ids: string;
    proposalId: string;
  } | null>(null);
  const busy = release.isPending || send.isPending;
  const ids = set.rows.map((r) => r.line.id);
  const idsKey = [...ids].sort().join(",");

  if (set.rows.length === 0) {
    return (
      <div className="flex flex-col items-end gap-3 text-right">
        {done && (
          <p role="status" className={CONSEQUENCE_CLS}>
            {done}
          </p>
        )}
        <p className="font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink-faint)]">
          Nothing here is ready and selected for the client yet.
        </p>
      </div>
    );
  }

  const run = async () => {
    if (busy) return;
    setError(null);
    setDone(null);
    const count = set.rows.length;
    try {
      let proposalId = drafted?.ids === idsKey ? drafted.proposalId : null;
      if (!proposalId) {
        const number = nextInstrumentNumber(instruments ?? []);
        const created = await release.mutateAsync({
          name: `Furnishings authorization № ${number}`,
          ffeItemIds: ids,
        });
        proposalId = created.proposalId;
        setDrafted({ ids: idsKey, proposalId });
      }
      await send.mutateAsync(proposalId);
      setDrafted(null);
      setDone(
        `Released ${count} ${count === 1 ? "line" : "lines"} to the client for authorization.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The release did not go through.",
      );
    }
  };

  return (
    <section
      aria-label="This release"
      className="ml-auto flex max-w-[640px] flex-col items-end gap-3 text-right"
    >
      <p className={CONSEQUENCE_CLS}>{releaseSetHead(set)}</p>
      <ul className="flex flex-col gap-1">
        {set.rows.map((row) => (
          <li key={row.line.id} className={CONSEQUENCE_CLS}>
            {row.labor ? `↳ ${row.line.name} (labor)` : row.line.name}{" "}
            <span className="tabular-nums">
              {fmtUsd(releaseAmountCents(row.line))}
            </span>
          </li>
        ))}
      </ul>
      <p className={CONSEQUENCE_CLS}>{releaseConsequence(set)}</p>
      {error && (
        <p
          role="alert"
          className="font-sans text-[14px] text-[var(--sheet-ink)]"
        >
          {error}
        </p>
      )}
      {done && (
        <p role="status" className={CONSEQUENCE_CLS}>
          {done}
        </p>
      )}
      <button
        type="button"
        className={TERMINAL_CLS}
        aria-disabled={busy || undefined}
        onClick={() => void run()}
      >
        {releaseActLabel(set)}
      </button>
    </section>
  );
}
