"use client";

/**
 * RoomFileView — the Room File v0 surface (Field Capture P1, package item 12).
 * A scan-grained page (rehoused to /room/[scanId]/file by the R21 dissolve;
 * formerly project-nested): the drawing set + accuracy certificate
 * + measurements + capture context for one scan's generated deliverable,
 * version-aware (a re-scan appends, never overwrites — 00341 R-f).
 *
 * Gating: fail-closed behind the PostHog `room-file` flag (house rule; the
 * procurement pattern) AND hydration-gated (the app shares one module-level
 * QueryClient — render nothing data-shaped until `hydrated`). Every hook sits
 * above the early returns (Rules of Hooks).
 *
 * Typography-first, zero shadows, quiet brand grain — the escalate-class
 * surface the P1 package flags for design (strings catalogued in
 * room-file-copy.ts).
 */

import { useState } from "react";
import Link from "next/link";
import {
  useRoomScan,
  useRoomFiles,
  useRoomFileMeasurements,
  useScanContextCaptures,
} from "@patina/supabase";
import { useHydrated } from "@/hooks/use-hydrated";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { DrawingsSection } from "./drawings-section";
import { RenderGallerySection } from "./render-gallery-section";
import { CertificateSection } from "./certificate-section";
import { MeasurementsTable } from "./measurements-table";
import { CaptureContextSection } from "./capture-context-section";
import { RoomFileVersionStrip } from "./room-file-version-strip";
import { RoomFilePresentLine } from "./room-file-present-line";
import { ROOM_FILE_COPY as C } from "./room-file-copy";

function prettyRoomType(roomType: string): string {
  return roomType.replace(/_/g, " ").trim();
}

function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface RoomFileViewProps {
  /** The SCAN id — `room_files` is UNIQUE(scan_id, version), so this is the
   *  deliverable's only true key. The owning project (when there is one) is
   *  read off the scan row below; R21 retired the projectId prop along with
   *  the project-nested route it existed to link back to. */
  scanId: string;
}

export function RoomFileView({ scanId }: RoomFileViewProps) {
  const hydrated = useHydrated();
  const { value: enabled, isLoading: flagLoading } =
    useFeatureFlag("room-file");

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  // Gate every data fetch on the flag (mirrors room-view.tsx): a flag-off
  // direct hit — or the brief flag-loading window — fetches nothing. The
  // disabled scanId is '' / undefined per each hook's own `enabled` guard.
  const { data: scan } = useRoomScan(enabled ? scanId : "");
  const { data: roomFiles, isLoading: filesLoading } = useRoomFiles(
    enabled ? scanId : undefined,
  );
  const { data: captures } = useScanContextCaptures(
    enabled ? scanId : undefined,
  );

  const versions = roomFiles ?? [];
  // Current = the selected version, else the newest `generated` row, else the
  // newest row of any status (versions come back version-desc).
  const generated = versions.filter((v) => v.status === "generated");
  const defaultCurrent = generated[0] ?? versions[0] ?? null;
  const current = selectedVersionId
    ? (versions.find((v) => v.id === selectedVersionId) ?? defaultCurrent)
    : defaultCurrent;

  const { data: measurements } = useRoomFileMeasurements(current?.id ?? null);

  // ── gates (all hooks above) ──────────────────────────────────────────────
  if (!hydrated || flagLoading) {
    return <div className="mx-auto max-w-[880px] px-1 py-16" aria-hidden />;
  }
  if (!enabled) {
    return (
      <div className="mx-auto max-w-[880px] px-1 py-24 text-center">
        <p className="font-heading text-[1.3rem] italic text-[var(--color-charcoal)]">
          Room File isn’t available yet.
        </p>
      </div>
    );
  }

  const roomLabel = scan?.name ?? "Room";
  const roomType = scan?.room_type ? prettyRoomType(scan.room_type) : null;
  const capturedIso = scan?.scanned_at ?? scan?.created_at ?? null;

  return (
    <div className="mx-auto max-w-[880px] px-1 pb-24">
      {/* Back to the room. R21: the Room File is the scan's leaf, so its parent
          is the Room View of the same scan — an address that always resolves,
          project or no project (the old link needed a projectId the deliverable
          never actually depended on). */}
      <Link
        href={`/room/${scanId}`}
        className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors hover:text-[var(--color-clay-ink)]"
      >
        {C.backToRoom(roomLabel)}
      </Link>

      {/* Header */}
      <header className="mt-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
          {C.eyebrow}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-heading text-[30px] font-medium text-[var(--color-charcoal)] sm:text-[36px]">
            {roomLabel}
            {roomType && (
              <span className="italic text-[var(--color-mocha)]">
                {" "}
                · {roomType}.
              </span>
            )}
          </h1>
          {current?.unverified && (
            <span className="rounded-[2px] border border-[var(--color-clay)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-clay-ink)]">
              {C.unverifiedBadge}
            </span>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {C.scanDatePrefix} {fmtDay(capturedIso)}
        </p>
        {/* UNGATED on purpose — the only place `present_status` is read, and
            the only trace a landed Refine delivery leaves on a page an
            operator opens without a feature flag. */}
        <RoomFilePresentLine roomFile={current} />

        {versions.length > 1 && (
          <div className="mt-4">
            <RoomFileVersionStrip
              versions={versions}
              currentId={current?.id ?? ""}
              onSelect={setSelectedVersionId}
            />
          </div>
        )}

        {current?.unverified && (
          <p className="mt-4 max-w-[560px] font-heading text-[13px] italic leading-relaxed text-[var(--color-mocha)]">
            {C.unverifiedNote}
          </p>
        )}
      </header>

      {/* Body */}
      {!current ? (
        <EmptyState />
      ) : current.status !== "generated" ? (
        <>
          <NotGeneratedState />
          <CertificateSection certificate={current.certificate} />
          <MeasurementsTable measurements={measurements ?? []} />
          <CaptureContextSection captures={captures ?? []} />
        </>
      ) : (
        <>
          <DrawingsSection
            drawings={current.drawings}
            version={current.version}
            roomName={roomLabel}
          />
          <RenderGallerySection roomFileId={current.id} roomName={roomLabel} />
          <CertificateSection certificate={current.certificate} />
          <MeasurementsTable measurements={measurements ?? []} />
          <CaptureContextSection captures={captures ?? []} />
        </>
      )}

      {filesLoading && !current && <div className="py-16" aria-hidden />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 text-center">
      <p className="font-heading text-[1.2rem] italic text-[var(--color-charcoal)]">
        {C.notGeneratedYet}
      </p>
      <p className="mt-2 font-heading text-[13px] italic text-[var(--color-mocha)]">
        {C.notGeneratedBody}
      </p>
    </div>
  );
}

function NotGeneratedState() {
  return (
    <div className="mt-8 rounded-[3px] border border-[var(--doc-ink-border)] px-5 py-4">
      <p className="font-heading text-[13px] italic text-[var(--color-mocha)]">
        {C.notGeneratedBody}
      </p>
    </div>
  );
}
