"use client";

import Link from "next/link";
import { useState } from "react";
import {
  useProjectRooms,
  useProjectRoomScans,
  useGeneratedRoomFilesByScan,
  useScanContextCaptures,
  useRoomConceptRenderRecord,
  usePlanRoom,
  usePlanRoomComposition,
  useRoomScanCovers,
  type Database,
  type RoomScan,
  type RoomFileListItem,
  type RoomScanPhoto,
} from "@patina/supabase";
import { InlineErrorSurface } from "@/components/feedback/inline-error-surface";
import { CaptureContextSection } from "@/components/room-file/capture-context-section";
import { DocumentAction, DocumentActionRow } from "../../document-action";
import { PlanIssueHistory, PlanSheetComposition, PlanPrintProvenance } from "../../plans/plan-room-set";

type ProjectRoom = Database["public"]["Tables"]["project_rooms"]["Row"];
// The existing SELECT * includes this linkage; RoomScan predates migration 00265.
type LinkedScan = RoomScan &
  Partial<
    Pick<Database["public"]["Tables"]["room_scans"]["Row"], "project_room_id">
  >;

export interface DesignChapterProps {
  projectId: string;
  routeId: string;
  onWorkRoom: (roomId: string, opener: HTMLButtonElement) => void;
}

function stamp(value: string | null): string {
  if (!value) return "Date not recorded";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ReadNotice({
  label,
  query,
}: {
  label: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
}) {
  if (query.isError) {
    return (
      <div role="alert" className="t-body-sm py-3">
        <p>{label} could not be read. Your place is kept.</p>
        <DocumentActionRow surfaceKey="design" regionKey="evidence-retry">
          <DocumentAction
            actionKey="retry-design-evidence"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            Retry {label.toLowerCase()}
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }
  return query.isPending ? (
    <p role="status" className="t-body-sm py-3">
      Reading {label.toLowerCase()}…
    </p>
  ) : null;
}

function EvidenceImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div role="alert" className="t-body-sm py-3">
        <p>Evidence image could not be loaded. Your place is kept.</p>
        <DocumentActionRow surfaceKey="design" regionKey="image-retry">
          <DocumentAction
            actionKey="retry-evidence-image"
            variant="secondary"
            onClick={() => setFailed(false)}
          >
            Retry evidence image
          </DocumentAction>
        </DocumentActionRow>
      </div>
    );
  }
  return (
     
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-[4/3] w-full object-contain"
    />
  );
}

function ScanEvidence({
  scan,
  roomFile,
  filesReady,
  cover,
}: {
  scan: LinkedScan;
  roomFile?: RoomFileListItem;
  filesReady: boolean;
  cover?: RoomScanPhoto | null;
}) {
  const captures = useScanContextCaptures(scan.id);
  const image =
    cover?.signedPreviewUrl ?? cover?.signedThumbUrl ?? cover?.signedImageUrl;
  const sheets =
    roomFile?.drawings?.sheet_count ?? roomFile?.drawings?.sheets?.length ?? 0;
  return (
    <div
      className="border-t border-[var(--border-default)] py-4"
      data-survey-scan={scan.id}
    >
      {image && (
        <EvidenceImage
          key={image}
          src={image}
          alt={`Survey of ${scan.name || "room"}, not installed condition`}
        />
      )}
      <p className="t-body-sm font-medium">{scan.name || "Room survey"}</p>
      <p className="t-meta text-[var(--color-survey-blue-ink)]">
        Survey, not installed · {stamp(scan.scanned_at ?? scan.created_at)}
      </p>
      {filesReady &&
        (roomFile ? (
          <>
            <p className="t-meta mt-2">
              {roomFile.unverified
                ? "Measurements unverified — confirm on site."
                : "Survey measurements — check tolerances in the Room File."}
            </p>
            <Link
              className="t-body-sm inline-flex min-h-11 items-center underline"
              href={`/room/${scan.id}/file`}
            >
              Open Room File · {sheets} {sheets === 1 ? "sheet" : "sheets"}
            </Link>
          </>
        ) : (
          <p className="t-meta mt-2">
            No generated Room File available. Measurements are not verified
            here.
          </p>
        ))}
      <ReadNotice label="Field captures" query={captures} />
      {!captures.isError &&
        !captures.isPending &&
        (captures.data?.length ? (
          <div>
            <p className="t-meta mt-3">
              Field captures · survey evidence, not installed condition.
              Visibility follows your existing Field access.
            </p>
            <CaptureContextSection captures={captures.data} />
          </div>
        ) : (
          <p className="t-meta mt-3">
            No Field captures available to you for this survey.
          </p>
        ))}
    </div>
  );
}

function ConceptEvidence({
  projectId,
  roomId,
}: {
  projectId: string;
  roomId: string;
}) {
  const concept = useRoomConceptRenderRecord({ projectId, roomId });
  return (
    <div className="py-4">
      <ReadNotice label="Concept rendering" query={concept} />
      {!concept.isError && concept.data && (
        <figure>
          {concept.data.url ? (
            <EvidenceImage
              key={concept.data.url}
              src={concept.data.url}
              alt="Concept rendering, not installed condition"
            />
          ) : (
            <p className="t-body-sm">Concept image unavailable.</p>
          )}
          <figcaption className="t-meta mt-2">
            Concept, not installed · {stamp(concept.data.uploadedAt)} · Private room evidence; not product media.
            {concept.data.caption && (
              <span className="block">{concept.data.caption}</span>
            )}
          </figcaption>
          {!concept.data.url && (
            <DocumentActionRow surfaceKey="design" regionKey="concept-retry">
              <DocumentAction
                actionKey="retry-concept-image"
                variant="secondary"
                onClick={() => void concept.refetch()}
              >
                Retry concept image
              </DocumentAction>
            </DocumentActionRow>
          )}
        </figure>
      )}
    </div>
  );
}

function ProjectPrints({
  projectId,
  routeId,
  rooms,
}: {
  projectId: string;
  routeId: string;
  rooms: ProjectRoom[];
}) {
  const plans = usePlanRoom(projectId);
  const composition = usePlanRoomComposition(projectId);
  const grouping = composition.isError ? undefined : composition.data;
  return (
    <section
      aria-label="Project drawings"
      className="mt-8 border-t border-[var(--border-default)] pt-4"
    >
      <h3 className="font-heading text-xl">Project drawings</h3>
      <p className="t-meta mt-2">
        Room and package links use exact saved identities. Names do not assign drawings.
      </p>
      <ReadNotice label="Project drawings" query={plans} />
      <ReadNotice label="Drawing rooms and packages" query={composition} />
      {/* SQ-2213 — the native drawings, issue history and the drawing-room
          link stand on the native read alone; the room/package grouping is
          additive and appears only once the composition read lands. */}
      {!plans.isError && plans.data && (
        <>
          {plans.data.sheets.length === 0 ? (
            <p className="t-body-sm mt-3">No project drawings filed yet.</p>
          ) : (
            <div className="mt-3">
              {(grouping
                ? [
                    ...rooms.map((room) => ({ id: room.id, name: room.name })),
                    { id: 'whole-job', name: 'Drawings for the whole job' },
                    { id: 'unavailable-room', name: 'Drawings with an unavailable room' },
                  ]
                : [{ id: 'all-drawings', name: null }]
              ).map((group) => {
                const sheets = plans.data.sheets.filter((sheet) => {
                  if (!grouping) return true;
                  const links = grouping.sheetRooms.filter((link) => link.sheet_id === sheet.id);
                  if (group.id === 'whole-job') return links.length === 0;
                  if (group.id === 'unavailable-room') return links.some((link) => !rooms.some((room) => room.id === link.project_room_id));
                  return links.some((link) => link.project_room_id === group.id);
                });
                if (sheets.length === 0) return null;
                return (
                  <section key={group.id} aria-label={group.name ?? 'Drawings'}>
                    {group.name && <h4 className="font-heading text-lg">{group.name}</h4>}
                    <ul className="divide-y divide-[var(--border-default)]">
                      {sheets.map((sheet) => {
                        const current = plans.data.prints.find((print) => print.id === sheet.current_print_id);
                        return (
                          <li key={sheet.id} className="t-body-sm py-3" data-drawing-sheet-id={sheet.id}>
                            {sheet.sheet_number} · {sheet.title}
                            <span className="t-meta block">
                              {current
                                ? `Current print ${current.print_number} · revision ${current.rev_letter} · ${stamp(current.created_at)}`
                                : "No current print recorded"}
                              {sheet.state === "shared" ? " · Client-shared current" : " · Studio only"}
                            </span>
                            {current && <PlanPrintProvenance print={current} projectId={projectId} />}
                            {grouping && (
                              <PlanSheetComposition composition={grouping} sheetId={sheet.id} rooms={rooms} />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
          <PlanIssueHistory bundle={plans.data} projectId={projectId} />
          <DocumentActionRow surfaceKey="design" regionKey="project-drawings">
            <DocumentAction
              actionKey="open-project-drawings"
              variant="secondary"
              href={`/doc/${routeId}/plans`}
            >
              Open project drawing sets
            </DocumentAction>
          </DocumentActionRow>
        </>
      )}
    </section>
  );
}

export function DesignChapter({
  projectId,
  routeId,
  onWorkRoom,
}: DesignChapterProps) {
  const rooms = useProjectRooms(projectId);
  const scans = useProjectRoomScans(projectId);
  const scanRows: LinkedScan[] = scans.data ?? [];
  const files = useGeneratedRoomFilesByScan(scanRows.map((scan) => scan.id));
  const covers = useRoomScanCovers(scanRows.map((scan) => scan.id));
  const roomRows: ProjectRoom[] = rooms.data ?? [];
  const roomIds = new Set(roomRows.map((room) => room.id));
  const unassigned = scanRows.filter(
    (scan) => !scan.project_room_id || !roomIds.has(scan.project_room_id),
  );

  return (
    <div data-design-chapter>
      <InlineErrorSurface />
      <ReadNotice label="Rooms" query={rooms} />
      <ReadNotice label="Room surveys" query={scans} />
      {scanRows.length > 0 && (
        <ReadNotice label="Survey images" query={covers} />
      )}
      {scanRows.length > 0 && <ReadNotice label="Room Files" query={files} />}
      {!rooms.isError && !rooms.isPending && (
        <>
          {roomRows.length === 0 && (
            <p className="t-body-sm py-4">No rooms recorded yet.</p>
          )}
          {roomRows.map((room) => (
            <section
              key={room.id}
              aria-labelledby={`design-room-${room.id}`}
              data-room-id={room.id}
              className="border-t border-[var(--border-default)] py-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3
                  id={`design-room-${room.id}`}
                  tabIndex={-1}
                  className="font-heading text-2xl"
                >
                  {room.name}
                </h3>
                <DocumentActionRow
                  surfaceKey="design"
                  regionKey={`room-${room.id}`}
                >
                  <DocumentAction
                    actionKey="work-this-room"
                    variant="secondary"
                    onClick={(event) =>
                      onWorkRoom(
                        room.id,
                        event.currentTarget as HTMLButtonElement,
                      )
                    }
                  >
                    Work this room
                  </DocumentAction>
                </DocumentActionRow>
              </div>
              {room.concept_render_url ? (
                <ConceptEvidence projectId={projectId} roomId={room.id} />
              ) : (
                <p className="t-meta py-3">No concept rendering recorded.</p>
              )}
              {!scans.isError &&
                !scans.isPending &&
                (scanRows.some((scan) => scan.project_room_id === room.id) ? (
                  scanRows
                    .filter((scan) => scan.project_room_id === room.id)
                    .map((scan) => (
                      <ScanEvidence
                        key={scan.id}
                        scan={scan}
                        roomFile={files.data?.get(scan.id)}
                        filesReady={!files.isError && !files.isPending}
                        cover={
                          covers.isError ? null : covers.data?.get(scan.id)
                        }
                      />
                    ))
                ) : (
                  <p className="t-body-sm py-3">
                    No survey evidence linked to this room.
                  </p>
                ))}
            </section>
          ))}
          {!scans.isError && unassigned.length > 0 && (
            <section
              aria-label="Surveys without a current room"
              className="mt-6"
            >
              <h3 className="font-heading text-xl">
                Surveys without a current room
              </h3>
              <p className="t-meta mt-2">
                These surveys have no matching room link. Names are not used to
                assign evidence.
              </p>
              {unassigned.map((scan) => (
                <ScanEvidence
                  key={scan.id}
                  scan={scan}
                  roomFile={files.data?.get(scan.id)}
                  filesReady={!files.isError && !files.isPending}
                  cover={covers.isError ? null : covers.data?.get(scan.id)}
                />
              ))}
            </section>
          )}
        </>
      )}
      <ProjectPrints projectId={projectId} routeId={routeId} rooms={roomRows} />
    </div>
  );
}
