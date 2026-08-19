/**
 * Room File v0 — user-facing copy catalogue (Field Capture P1, package item 12).
 *
 * ⚠ ESCALATE-CLASS PLACEHOLDERS. Per the P1 package's authority split
 * (field-capture-p1-package.md §"bless vs escalate"), every designer-visible
 * string here — section titles, the UNVERIFIED stamp, badge legend, empty
 * states — is a design-owned decision, not a code call. They are gathered in
 * ONE place so the design session can rule on the final wording without a
 * component hunt. Treat these as provisional until that ruling lands.
 */

export const ROOM_FILE_COPY = {
  // Project-page section
  sectionTitle: "Room Files",

  // Page / header
  eyebrow: "Room File",
  // R21 dissolve: the Room File's parent is the Room (the scan), not the
  // project — `backToProject` retired with the project-nested route.
  backToRoom: (name: string) => `← ${name}`,
  scanDatePrefix: "Captured",
  unverifiedBadge: "UNVERIFIED",
  unverifiedNote:
    "Closed with fewer than three anchors — every dimension carries the widest tolerance. Confirm on site before ordering.",
  notGeneratedYet: "This scan has no finished drawing set yet.",
  notGeneratedBody:
    "The drawings are still being generated, or the last run stopped. Check back shortly.",

  // ── Present Layer (00376) — the one place `present_status` is READ ────────
  // Nothing else in the product reads this column. A version parked at
  // 'refining' after a Refine delivery was otherwise invisible: the Room View
  // readout is flag-gated AND needs its artifacts to resolve, so an operator
  // had no ungated way to tell a delivery had landed at all. This line is that
  // way. It is a status token, not a claim about accuracy — the refine readout
  // (flagged) is where the numbers live.
  presentPrefix: "Present layer",
  presentStatusLabel: {
    pending: "queued",
    refining: "poses refined",
    fusing: "mesh fusing",
    training: "splat training",
    ready: "ready",
    error: "stopped",
  } as const,
  /** Appended when `present.refine_engine` names the engine that ran. */
  presentEngineSuffix: (engine: string) => ` · ${engine}`,

  // Drawings section
  drawingsTitle: "Drawings",
  drawingsSubtitle: (n: number, date: string | null) =>
    `${n} sheet${n === 1 ? "" : "s"}${date ? ` · generated ${date}` : ""}`,
  /** Alt text for the inline floor-plan sheet (Rendered Room v2, P1). */
  planPreviewAlt: (room: string) =>
    `Floor plan of ${room}, drawn from the scan`,
  dxfLabel: "CAD drawing (DXF)",
  dxfHint: "Layered walls · openings · dimensions — opens in your CAD tool",
  sheetSvg: "SVG",
  sheetPdf: "PDF",
  downloadFailed: "Could not download that drawing. Try again.",
  drawingsEmpty: "No sheets were recorded for this version.",

  // Render gallery (Rendered Room v2, W2 finale)
  renderGalleryTitle: "Renders",
  renderGallerySubtitle: (n: number) => `${n} view${n === 1 ? "" : "s"}`,
  renderShotAlt: (room: string, shot: string) =>
    `${room}, ${shot.replace(/_/g, " ")} view`,
  renderShotLabel: {
    top_down: "Top-down",
    corner_ne: "Corner NE",
    corner_nw: "Corner NW",
    corner_se: "Corner SE",
    corner_sw: "Corner SW",
    cover: "Cover",
  } as Record<string, string>,

  // Certificate section
  certificateTitle: "Accuracy certificate",
  certScale: "Scale fit",
  certRms: "RMS residual",
  certAnchors: "Anchors",
  certFloorArea: "Floor area",
  certAnchorsTableTitle: "Anchor residuals",
  certColTyped: "Typed",
  certColModel: "Model",
  certColResidual: "Residual",
  certColUsed: "Used",
  certFlagged: "flagged",
  certToleranceModelTitle: "Tolerance model",
  certDimCountsTitle: "Dimensions by class",
  scaleIgnoredNote:
    "A single implausible anchor was ignored — scale held at 1.0.",
  certificateEmpty: "No certificate was recorded for this version.",

  // Badge legend (the triad, matching the sheets)
  legendVerified: "anchor-exact",
  legendMeasured: "anchor-corrected",
  legendEstimated: "RoomPlan estimate",

  // Measurements section
  measurementsTitle: "Measurements",
  measColLabel: "Dimension",
  measColValue: "Value",
  measColTolerance: "Tolerance",
  measColClass: "Class",
  measurementsEmpty: "No measurements were published for this version.",
  toleranceNone: "convention",

  // Capture context
  contextTitle: "Capture context",
  contextSubtitle: "Photos and notes pinned to this room during the scan",
  contextEmpty: "No photos or notes were pinned to this scan.",
  contextVoiceLabel: "Voice note",

  // Version strip
  versionCurrent: "current",
  versionReadOnly: "read-only",

  // Room View door
  roomViewDoorLabel: "Room File →",
} as const;
