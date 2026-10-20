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
 *   sentence, then the explicit save. It drafts the authorization through
 *   `create_furnishings_authorization_from_schedule` and opens the saved preview.
 *   Sending is a separate act there. A seat without money sees only the table.
 * - **A drafted release** is read from the server (00755
 *   `draft_release_for_project`). While one exists the ceremony shows its lines
 *   with Preview and Void authorization draft, and offers no new release.
 *   A newly saved preview retains its ID even if the draft reread fails.
 * - **No client linked:** the send would be refused, so the act is replaced
 *   by a sentence and nothing is drafted.
 * - **Refusals** read as sentences (`releaseRefusalMessage`), never SQL text,
 *   and the ceremony names every Selected line it leaves out, with its reason.
 *
 * Nothing here edits a spec or a price.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDraftRelease,
  useHandBackRoom,
  useProject,
  useProjectFFEItems,
  useProjectFfeReadiness,
  useRoomHandbacks,
  useTriageProjectFfeItems,
} from "@patina/supabase";
import type { FfeAssignmentScope } from "@patina/types";
import {
  useProjectInstruments,
  useReleaseForAuthorization,
  useVoidAuthorization,
} from "@/hooks/use-commercial-documents";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import { nextInstrumentNumber } from "@/lib/document/authorization-derivation";
import { fmtDay } from "@/lib/document/format";
import {
  REMOVED_PLACE,
  type BuildRoomPlace,
} from "@/lib/document/pieces/build-room-url";
import {
  CLIENT_DISPOSITIONS,
  deriveReleaseLens,
  dispositionWord,
  draftReleaseHead,
  draftReleaseSet,
  readyLineIds,
  releaseAmountText,
  releaseSetHead,
  type ReleaseGroup,
  type ReleaseLensLine,
  type ReleaseOmission,
  type ReleaseRow,
  type ReleaseSet,
  type ServerReadiness,
} from "@/lib/document/pieces/readiness";
import { releaseRefusalMessage } from "@/lib/document/pieces/release-refusals";
import { liveBuildRoomLines } from "@/lib/document/pieces/live-lines";
import {
  QUIET_FOCUS,
  ROOM_HEADING_ATTR,
} from "@/lib/document/pieces/sheet-focus";
import {
  LABOR_STAMP_LABEL,
  lineStampLabel,
} from "@/lib/document/stamp-derivation";
import { cn } from "@/lib/utils";
import { PurchasingAuthorizationPreviewSheet } from "../overlays/purchasing-authorization-preview-sheet";

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
  // a3's trailing column: the line menu's place, empty for now.
  { label: "Line menu", width: "52px" },
] as const;

const NO_CLIENT = "Link a client to this job before releasing.";
const VOID_REASON = "Voided in the Build room to release again.";
/** The release RPC's budget-checkpoint refusals (release-refusals.ts); each is
 *  remedied in the Document's Working budget. */
const CHECKPOINT_REFUSAL =
  /latest furnishings checkpoint must be acknowledged|budget checkpoint no longer matches its published version|is not covered by the acknowledged budget/;
/** The Document's arrival landing (lib/arrival): ArrivalMount writes it for a
 *  `[data-register="act"]` link, and /doc/[id] consumes it on a soft entry to
 *  unfold Money and focus its heading. A hard load drops it. */
const MONEY_LANDING = JSON.stringify({ kind: "region", region: "money" });

export function ReleaseLens(props: ReleaseLensProps) {
  return <ReleaseLensContent key={props.projectId} {...props} />;
}

function ReleaseLensContent({
  docId,
  projectId,
  room,
  canSeeMoney,
}: ReleaseLensProps) {
  const previewReturn = useRef<HTMLDivElement>(null);
  const { data: rawLines } = useProjectFFEItems(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const lines = useMemo(
    () =>
      liveBuildRoomLines(rawLines as unknown as ReleaseLensLine[] | undefined),
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
  const draft = useDraftRelease(projectId);
  const drafted = useMemo(
    () => new Set(draft.data?.itemIds ?? []),
    [draft.data],
  );
  const model = useMemo(
    () => deriveReleaseLens(lines, rooms, room, server, drafted),
    [lines, rooms, room, server, drafted],
  );
  const roomName = useMemo(
    () => new Map(rooms.map((r) => [r.id, r.name])),
    [rooms],
  );

  if (room === REMOVED_PLACE) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        Removed selections are excluded from authorization. Restore them in Preliminary selections first.
      </p>
    );
  }
  if (rawLines && model.groups.length === 0 && !canSeeMoney) {
    return (
      <p className="max-w-[56ch] py-6 font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]">
        No selections yet. Add them in Preliminary selections, then return for purchasing authorization.
      </p>
    );
  }

  return (
    <div ref={previewReturn} tabIndex={-1} data-testid="release-lens" className="flex flex-col gap-6 py-6">
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
              {COLUMNS.map((col, i) =>
                i === COLUMNS.length - 1 ? (
                  <th key={col.label} scope="col" className={HEAD_CELL}>
                    <span className="sr-only">{col.label}</span>
                  </th>
                ) : (
                  <th key={col.label} scope="col" className={HEAD_CELL}>
                    {col.label}
                  </th>
                ),
              )}
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
      {canSeeMoney && (
        <Ceremony
          key={projectId}
          previewReturn={previewReturn}
          docId={docId}
          projectId={projectId}
          set={model.set}
          omitted={model.omitted}
          lines={lines}
          draft={draft}
        />
      )}
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
          tabIndex={group.roomId ? -1 : undefined}
          {...(group.roomId ? { [ROOM_HEADING_ATTR]: group.roomId } : null)}
          className={cn(
            "h-[48px] px-2 text-left font-heading text-[18px] font-normal italic leading-[1.2] text-[var(--sheet-ink)]",
            QUIET_FOCUS,
          )}
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
        <td />
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
  const { line, stamp, labor, readiness, disposition } = row;
  // A line the server gate refuses prints its blocker where READY would be.
  const word = stamp ? lineStampLabel(stamp) : readiness;
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
          {stamp
            ? word && <span className={`stamp stamp--${stamp}`}>{word}</span>
            : word}
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
      <td className={CELL} />
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
          The selection was not saved. Choose again.
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
        Mark room ready for review
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

function CeremonyLines({ set }: { set: ReleaseSet }) {
  return (
    <ul className="flex flex-col gap-1">
      {set.rows.map((row) => (
        <li key={row.line.id} className={CONSEQUENCE_CLS}>
          {row.labor ? `↳ ${row.line.name} (labor)` : row.line.name}{" "}
          <span className="tabular-nums">{releaseAmountText(row.line)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Selected lines the set leaves out, each with its reason. */
function LeftOut({ omitted }: { omitted: readonly ReleaseOmission[] }) {
  if (omitted.length === 0) return null;
  return (
    <section aria-label="Excluded selections" className="flex flex-col gap-1">
      <p className={CONSEQUENCE_CLS}>Not in this release:</p>
      <ul className="flex flex-col gap-1">
        {omitted.map(({ row, reason }) => (
          <li key={row.line.id} className={CONSEQUENCE_CLS}>
            {row.labor ? `↳ ${row.line.name} (labor)` : row.line.name}: {reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Ceremony({
  previewReturn,
  docId,
  projectId,
  set,
  omitted,
  lines,
  draft,
}: {
  docId: string;
  projectId: string;
  set: ReleaseSet;
  omitted: readonly ReleaseOmission[];
  lines: readonly ReleaseLensLine[];
  draft: ReturnType<typeof useDraftRelease>;
  previewReturn: React.RefObject<HTMLDivElement | null>;
}) {
  const { data: instruments } = useProjectInstruments(projectId);
  const { data: project } = useProject(projectId);
  const release = useReleaseForAuthorization(projectId);
  const voidDraft = useVoidAuthorization(projectId);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [retiredId, setRetiredId] = useState<string | null>(null);
  const retired = useRef<string | null>(null);
  const [identityUnavailable, setIdentityUnavailable] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [error, setError] = useState<string | null>(null);
  const [checkpointRefused, setCheckpointRefused] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Held from the press until the lens has re-read what the act changed. The
  // ref stops a second press before React re-renders; the state disables it.
  const acting = useRef(false);
  const [rereading, setRereading] = useState(false);
  const busy =
    rereading || release.isPending || voidDraft.isPending;
  // Unknown while either read loads: nothing is drafted on a guess.
  const settled = project != null && draft.data !== undefined;
  const noClient = project != null && project.client_id == null;
  const pending = draft.data?.proposalId === retiredId ? null : draft.data ?? null;
  const refresh = () => Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ["project-ffe-items", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["project-ffe-readiness"] }),
    draft.refetch(),
  ]);
  const retirePreview = (proposalId: string) => {
    retired.current = proposalId;
    setRetiredId(proposalId);
    setPreviewId(null);
    setPreviewOpen(false);
  };
  const sent = async () => {
    if (!previewId || retired.current === previewId) return;
    retirePreview(previewId);
    acting.current = true;
    setRereading(true);
    setDone("Authorization sent. Email delivery is tracked on the saved authorization.");
    await refresh();
    acting.current = false;
    if (active.current) setRereading(false);
  };
  const previewSheet = previewOpen && previewId ? <PurchasingAuthorizationPreviewSheet projectId={projectId} proposalId={previewId} fallbackFocusRef={previewReturn} onClose={() => setPreviewOpen(false)} onSent={() => void sent()} /> : null;

  const attempt = async (act: () => Promise<string>) => {
    if (busy || acting.current) return;
    acting.current = true;
    setRereading(true);
    setError(null);
    setCheckpointRefused(false);
    setDone(null);
    try {
      const message = await act();
      if (active.current) setDone(message);
    } catch (cause) {
      if (active.current) {
        setError(releaseRefusalMessage(cause));
        setCheckpointRefused(
          CHECKPOINT_REFUSAL.test(
            String((cause as { message?: unknown } | null)?.message ?? cause),
          ),
        );
      }
    } finally {
      await refresh();
      acting.current = false;
      if (active.current) setRereading(false);
    }
  };

  const errorNote = error && (
    <>
      <p role="alert" className="font-sans text-[14px] text-[var(--sheet-ink)]">
        {identityUnavailable ? "The draft was saved but its identity is unavailable. Open the authorization ledger; do not save again." : error}
      </p>
      {checkpointRefused && !identityUnavailable && (
        <section
          aria-label="Working budget recovery"
          className="flex flex-col items-end gap-1"
        >
          <p className={CONSEQUENCE_CLS}>
            A budget checkpoint is planning alignment with the client, not
            purchase approval, a signature or payment. Set up or review the
            spending plan in Working budget and publish a checkpoint there; the
            client acknowledges it in their project. Your selections stay saved
            here. Nothing is published, acknowledged or sent from this page.
          </p>
          {/* Unmarked while held: ArrivalMount's capture listener would
              otherwise write the landing for a click that does not navigate. */}
          <span data-register={busy ? undefined : "act"}>
            <Link
              href={`/doc/${docId}`}
              data-landing={MONEY_LANDING}
              className={ACT_CLS}
              aria-disabled={busy || undefined}
              onClick={(event) => {
                if (busy || acting.current) event.preventDefault();
              }}
            >
              Open Working budget
            </Link>
          </span>
        </section>
      )}
    </>
  );
  const doneNote = done && (
    <p role="status" className={CONSEQUENCE_CLS}>
      {done}
    </p>
  );
  const noClientNote = <p className={CONSEQUENCE_CLS}>{NO_CLIENT}</p>;

  const content = () => {
  if (draft.isError) {
    return (
      <p
        role="alert"
        className="ml-auto font-sans text-[14px] text-[var(--sheet-ink)]"
      >
        The draft check did not load, so nothing can be released yet.{" "}
        <button
          type="button"
          className={ACT_CLS}
          onClick={() => void draft.refetch()}
        >
          TRY AGAIN
        </button>
        {previewId && (
          <button
            type="button"
            className={ACT_CLS}
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </button>
        )}
      </p>
    );
  }

  if (pending) {
    const shown = draftReleaseSet(lines, pending.itemIds);
    return (
      <section
        aria-label="This release"
        className="ml-auto flex max-w-[640px] flex-col items-end gap-3 text-right"
      >
        <p className={CONSEQUENCE_CLS}>{draftReleaseHead(shown)}</p>
        <CeremonyLines set={shown} />
        <p className={CONSEQUENCE_CLS}>
          These lines are on a drafted release. Preview the saved authorization
          before sending, or void it to release them again.
        </p>
        {errorNote}
        {doneNote}
        <div className="flex flex-wrap items-center justify-end gap-4">
          <button
            type="button"
            className={ACT_CLS}
            aria-disabled={busy || undefined}
            onClick={() =>
              void attempt(async () => {
                if (retired.current === pending.proposalId) return "";
                await voidDraft.mutateAsync({
                  proposalId: pending.proposalId,
                  reason: VOID_REASON,
                });
                if (active.current) retirePreview(pending.proposalId);
                return "The draft is void. Its lines can be released again.";
              })
            }
          >
            Void authorization draft
          </button>
          {noClient ? (
            noClientNote
          ) : (
            <button
              type="button"
              className={TERMINAL_CLS}
              aria-disabled={busy || !settled || undefined}
              onClick={() => {
                if (!settled) return;
                if (busy || acting.current) return;
                setPreviewId(pending.proposalId);
                setPreviewOpen(true);
              }}
            >
              Preview
            </button>
          )}
        </div>
      </section>
    );
  }

  if (set.rows.length === 0 && !previewId && !identityUnavailable) {
    return (
      <div className="flex flex-col items-end gap-3 text-right">
        {done && (
          <p role="status" className={CONSEQUENCE_CLS}>
            {done}
          </p>
        )}
        <p className="font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink-faint)]">
          {lines.length === 0 ? "No selections yet. Add them in Preliminary selections, then return for purchasing authorization." : "No selections are ready for purchasing authorization."}
        </p>
        <LeftOut omitted={omitted} />
      </div>
    );
  }

  const run = () => {
    if (!settled || noClient || identityUnavailable) return;
    if (previewId) { setPreviewOpen(true); return; }
    const ids = set.rows.map((r) => r.line.id);
    void attempt(async () => {
      const number = nextInstrumentNumber(instruments ?? []);
      const created = await release.mutateAsync({
        name: `Furnishings authorization № ${number}`,
        ffeItemIds: ids,
      });
      if (!active.current) return "";
      if (!created?.proposalId) {
        setIdentityUnavailable(true);
        throw new Error("The draft was saved but its identity is unavailable. Open the authorization ledger; do not save again.");
      }
      setPreviewId(created.proposalId);
      setPreviewOpen(true);
      return "Draft saved. Nothing has been sent to the client.";
    });
  };

  return (
    <section
      aria-label="This release"
      className="ml-auto flex max-w-[640px] flex-col items-end gap-3 text-right"
    >
      <p className={CONSEQUENCE_CLS}>{releaseSetHead(set)}</p>
      <CeremonyLines set={set} />
      <LeftOut omitted={omitted} />
      <p className={CONSEQUENCE_CLS}>Saving creates a draft and reserves these items. Nothing is sent to the client.</p>
      {errorNote}
      {doneNote}
      {noClient ? (
        noClientNote
      ) : (
        <button
          type="button"
          className={TERMINAL_CLS}
          aria-disabled={busy || !settled || identityUnavailable || undefined}
          onClick={run}
        >
          {previewId ? "Preview" : "Save draft & preview"}
        </button>
      )}
    </section>
  );
  };
  return <>{previewSheet}{content()}</>;
}
