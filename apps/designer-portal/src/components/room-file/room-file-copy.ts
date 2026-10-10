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
  sectionTitle: "Room survey documents",

  // Page / header
  eyebrow: "Room survey documents",
  // R21 dissolve: the Room File's parent is the Room (the scan), not the
  // project — `backToProject` retired with the project-nested route.
  backToRoom: (name: string) => `← ${name}`,
  scanDatePrefix: "Surveyed",
  unverifiedBadge: "Unverified",
  unverifiedNote:
    "Fewer than three reference measurements; all dimensions use the widest tolerance. Verify on site before ordering.",
  notGeneratedYet: "No completed drawing set is available for this survey.",
  notGeneratedBody:
    "Drawing generation is incomplete or has stopped. Check back shortly.",

  // ── Present Layer (00376) — the one place `present_status` is READ ────────
  // Nothing else in the product reads this column. A version parked at
  // 'refining' after a Refine delivery was otherwise invisible: the Room View
  // readout is flag-gated AND needs its artifacts to resolve, so an operator
  // had no ungated way to tell a delivery had landed at all. This line is that
  // way. It is a status token, not a claim about accuracy — the refine readout
  // (flagged) is where the numbers live.
  presentPrefix: "3D visualization processing",
  presentStatusLabel: {
    pending: "Queued for processing",
    refining: "Camera alignment refined",
    fusing: "Combining scan geometry",
    training: "Generating photographic 3D view",
    ready: "Visualization ready",
    error: "Visualization processing stopped",
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
  sheetSvg: "SVG drawing",
  sheetPdf: "PDF drawing",
  downloadFailed: "The drawing could not be downloaded. Try again.",
  drawingsEmpty: "No drawing sheets were recorded for this revision.",

  // Render gallery (Rendered Room v2, W2 finale)
  renderGalleryTitle: "Rendered room views",
  renderGallerySubtitle: (n: number) => `${n} view${n === 1 ? "" : "s"}`,
  renderShotAlt: (room: string, shot: string) =>
    `${room}, ${shot.replace(/_/g, " ")} view`,
  renderShotLabel: {
    top_down: "Plan view",
    corner_ne: "Northeast corner",
    corner_nw: "Northwest corner",
    corner_se: "Southeast corner",
    corner_sw: "Southwest corner",
    cover: "Cover view",
  } as Record<string, string>,

  // Certificate section
  certificateTitle: "Measurement accuracy certificate",
  certScale: "Scale fit",
  certRms: "Root-mean-square residual",
  certAnchors: "Reference measurements",
  certFloorArea: "Floor area",
  certAnchorsTableTitle: "Reference residuals",
  certColTyped: "Entered measurement",
  certColModel: "Model measurement",
  certColResidual: "Residual difference",
  certColUsed: "Used in scale fit",
  certFlagged: "Flagged",
  certToleranceModelTitle: "Tolerance model",
  certDimCountsTitle: "Dimensions by confidence class",
  scaleIgnoredNote:
    "One implausible reference measurement excluded; scale remains 1.0.",
  certificateEmpty: "No accuracy certificate was recorded for this revision.",

  // Badge legend (the triad, matching the sheets)
  legendVerified: "Reference-exact",
  legendMeasured: "Reference-corrected",
  legendEstimated: "RoomPlan estimate",

  // Measurements section
  measurementsTitle: "Dimension schedule",
  measColLabel: "Dimension",
  measColValue: "Value",
  measColTolerance: "Tolerance",
  measColClass: "Confidence class",
  measurementsEmpty: "No dimensions were published for this revision.",
  toleranceNone: "Schematic convention",

  // Capture context
  contextTitle: "Survey photos and notes",
  contextSubtitle: "Photos and notes recorded during the room survey",
  contextEmpty: "No photos or notes were recorded for this survey.",
  contextVoiceLabel: "Voice note",

  // Version strip
  versionCurrent: "Current revision",
  versionReadOnly: "Read-only",

  // Room View door
  roomViewDoorLabel: "Open survey documents →",
} as const;
