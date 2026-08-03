/**
 * MoodBoard analytics taxonomy (GA phases 1–3).
 *
 * The implementation addendum requires generic PRD names to be scoped to the
 * MoodBoard domain. Every emitted name therefore uses the `mood_board_`
 * prefix. Helpers intentionally no-op until the shared PostHog client is
 * initialized, including during SSR and in environments without a key.
 */

import posthog from "posthog-js";
import type { BoardOwnerKind, MoodBoardItemType } from "@patina/types";
import { isAnalyticsEnabled } from "./posthog";

export const MOOD_BOARD_EVENT_NAMES = {
  opened: "mood_board_opened",
  itemAdded: "mood_board_item_added",
  arranged: "mood_board_arranged",
  done: "mood_board_done",
  presented: "mood_board_presented",
  shared: "mood_board_shared",
  shareViewed: "mood_board_share_viewed",
  verdictGiven: "mood_board_verdict_given",
  projectBoardContinued: "mood_board_project_board_continued",
  exported: "mood_board_exported",
  exportFailed: "mood_board_export_failed",
  backgroundRemoved: "mood_board_bg_removed",
  backgroundRemovalBlocked: "mood_board_bg_remove_blocked",
  templateUsed: "mood_board_template_used",
  templateSaved: "mood_board_template_saved",
  urlUnfurled: "mood_board_url_unfurled",
} as const;

export type MoodBoardOpenSource =
  | "drafting_strip"
  | "desk_recents"
  | "command_bar"
  | "direct_url";

export type MoodBoardItemAddSource =
  | "rail_drag"
  | "rail_click"
  | "file_drop"
  | "paste"
  | "duplicate"
  | "suggestion";

export type MoodBoardExportFormat =
  | "png"
  | "pdf_composition"
  | "pdf_spec_sheet";

export interface MoodBoardOpenedProperties {
  source: MoodBoardOpenSource;
  board_id: string;
  item_count: number;
  owner_kind: BoardOwnerKind;
}

export interface MoodBoardItemAddedProperties {
  type: MoodBoardItemType;
  source: MoodBoardItemAddSource;
  board_id: string;
  count: number;
}

export interface MoodBoardArrangedProperties {
  scope: "selection" | "board";
  item_count: number;
  board_id: string;
}

export interface MoodBoardDoneProperties {
  duration_ms: number;
  item_count: number;
  command_count: number;
  used_undo: boolean;
  used_multiselect: boolean;
  used_tidy: boolean;
  used_handles: boolean;
  board_id: string;
}

export interface MoodBoardPresentedProperties {
  board_id: string;
  item_count: number;
  section_count: number;
  surface: "room" | "mirror";
  duration_ms: number;
}

export interface MoodBoardSharedProperties {
  board_id: string;
  scope: "board";
  has_expiry: boolean;
  share_id: string;
}

export interface MoodBoardShareViewedProperties {
  board_id: string;
  share_id: string;
}

export interface MoodBoardVerdictGivenProperties {
  verdict: "approved" | "rejected" | "comment";
  board_id: string;
  board_item_id: string;
  item_type: MoodBoardItemType;
  surface: "client_portal" | "room";
}

export interface MoodBoardProjectBoardContinuedProperties {
  project_id: string;
  source_board_id: string;
  new_board_id: string;
}

export interface MoodBoardExportedProperties {
  format: MoodBoardExportFormat;
  board_id: string;
  item_count: number;
  duration_ms: number;
  failed_image_count: number;
}

export interface MoodBoardExportFailedProperties {
  format: MoodBoardExportFormat;
  board_id: string;
  reason: string;
}

export interface MoodBoardBackgroundRemovedProperties {
  board_id: string;
  board_item_id: string;
  item_type: MoodBoardItemType;
  duration_ms: number;
}

export interface MoodBoardBackgroundRemovalBlockedProperties {
  reason: "not_configured" | "budget_exceeded";
  board_id: string;
}

export interface MoodBoardTemplateUsedProperties {
  source: "seeded" | "studio";
  template_id: string;
  board_id: string;
}

export interface MoodBoardTemplateSavedProperties {
  template_id: string;
  item_count: number;
  section_count: number;
}

export interface MoodBoardUrlUnfurledProperties {
  board_id: string;
  host: string;
  outcome: "resolved" | "failed";
}

function track(
  event: (typeof MOOD_BOARD_EVENT_NAMES)[keyof typeof MOOD_BOARD_EVENT_NAMES],
  properties: object,
) {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const moodBoardEvents = {
  opened: (properties: MoodBoardOpenedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.opened, properties),
  itemAdded: (properties: MoodBoardItemAddedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.itemAdded, properties),
  arranged: (properties: MoodBoardArrangedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.arranged, properties),
  done: (properties: MoodBoardDoneProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.done, properties),
  // Addendum correction: fire once when Present ends, with duration populated.
  presented: (properties: MoodBoardPresentedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.presented, properties),
  shared: (properties: MoodBoardSharedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.shared, properties),
  // The server-side guest resolver owns this call in production. Keeping it in
  // the taxonomy gives that surface the exact same property contract.
  shareViewed: (properties: MoodBoardShareViewedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.shareViewed, properties),
  // Only client feedback surfaces call this; designer verdict chips are read-only.
  verdictGiven: (properties: MoodBoardVerdictGivenProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.verdictGiven, properties),
  projectBoardContinued: (
    properties: MoodBoardProjectBoardContinuedProperties,
  ) => track(MOOD_BOARD_EVENT_NAMES.projectBoardContinued, properties),
  exported: (properties: MoodBoardExportedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.exported, properties),
  exportFailed: (properties: MoodBoardExportFailedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.exportFailed, properties),
  backgroundRemoved: (properties: MoodBoardBackgroundRemovedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.backgroundRemoved, properties),
  backgroundRemovalBlocked: (
    properties: MoodBoardBackgroundRemovalBlockedProperties,
  ) => track(MOOD_BOARD_EVENT_NAMES.backgroundRemovalBlocked, properties),
  templateUsed: (properties: MoodBoardTemplateUsedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.templateUsed, properties),
  templateSaved: (properties: MoodBoardTemplateSavedProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.templateSaved, properties),
  urlUnfurled: (properties: MoodBoardUrlUnfurledProperties) =>
    track(MOOD_BOARD_EVENT_NAMES.urlUnfurled, properties),
};
