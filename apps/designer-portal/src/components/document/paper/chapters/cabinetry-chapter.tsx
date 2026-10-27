"use client";

import {
  useCoordinationItems,
  useExternalFulfilmentReadings,
  usePlanRoom,
  usePlanRoomComposition,
  useProjectRooms,
  useProjectRoster,
} from "@patina/supabase";
import { DocumentAction, DocumentActionRow } from "../../document-action";
import { PackageReading } from "../../cabinetry/package-reading";

export interface CabinetryChapterProps {
  projectId: string;
}

/**
 * 03 Cabinetry — the job's GC-bought cabinet packages (CP-01), each read from
 * the native external-fulfilment record. Other external kinds (client-bought
 * furnishings) are read by FF&E, not here.
 */
export function CabinetryChapter({ projectId }: CabinetryChapterProps) {
  const readings = useExternalFulfilmentReadings(projectId);
  const native = usePlanRoom(projectId);
  const composition = usePlanRoomComposition(projectId);
  // Package reading joins the native bundle with its composition; either failing reads as unread.
  const plans = {
    data: native.data && composition.data ? { ...native.data, packages: composition.data.packages } : undefined,
    isError: native.isError || composition.isError,
  };
  const roster = useProjectRoster(projectId);
  const decisions = useCoordinationItems(projectId);
  const rooms = useProjectRooms(projectId);
  const packages = (readings.data ?? []).filter((row) => row.kind === "gc_cabinetry");

  return (
    <div data-cabinetry-chapter>
      {readings.isError ? (
        <div role="alert" className="t-body-sm py-3">
          <p>Cabinet packages could not be read. Your place is kept.</p>
          <DocumentActionRow surfaceKey="cabinetry" regionKey="packages-retry">
            <DocumentAction
              actionKey="retry-cabinet-packages"
              variant="secondary"
              onClick={() => void readings.refetch()}
            >
              Retry cabinet packages
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : readings.isPending ? (
        <p role="status" className="t-body-sm py-3">
          Reading cabinet packages…
        </p>
      ) : packages.length === 0 ? (
        <p className="t-body-sm py-3">No GC-bought cabinet package is recorded for this job.</p>
      ) : (
        packages.map((row) => (
          <PackageReading
            key={row.id}
            row={row}
            joins={{ plans, roster, decisions, rooms }}
          />
        ))
      )}
    </div>
  );
}
