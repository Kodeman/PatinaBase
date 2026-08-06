import posthog from "posthog-js";
import { isAnalyticsEnabled } from "./posthog";

/**
 * Plan Room telemetry. Ids and counts only — never a sheet number, a sheet
 * title, a recipient name, or a filename. What a studio is drawing is theirs.
 */
function capture(
  event: `plan_room_${string}`,
  properties: Record<string, unknown>,
): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const planRoomEvents = {
  opened: (properties: {
    project_id: string;
    sheet_count: number;
    has_amber_holders: boolean;
  }) => capture("plan_room_opened", properties),

  bandOpened: (properties: { project_id: string; sheet_count: number }) =>
    capture("plan_room_band_opened", properties),

  lightTableStaged: (properties: {
    project_id: string;
    page_count: number;
    proposed_revisions: number;
    proposed_new: number;
    proposed_current: number;
    unmatched: number;
  }) => capture("plan_room_light_table_staged", properties),

  lightTableConfirmed: (properties: {
    project_id: string;
    batch_id: string;
    new_sheet_count: number;
    revision_count: number;
    confirmed_current_count: number;
    loose_count: number;
    duration_ms: number;
  }) => capture("plan_room_light_table_confirmed", properties),

  lightTableFailed: (properties: {
    project_id: string;
    stage: string;
    error: string;
  }) => capture("plan_room_light_table_failed", properties),

  sheetOpened: (properties: { project_id: string; sheet_id: string }) =>
    capture("plan_room_sheet_opened", properties),

  printViewed: (properties: {
    project_id: string;
    print_id: string;
    is_current: boolean;
  }) => capture("plan_room_print_viewed", properties),

  sheetStateChanged: (properties: {
    project_id: string;
    sheet_id: string;
    from: string;
    to: string;
  }) => capture("plan_room_sheet_state_changed", properties),

  issueStarted: (properties: { project_id: string; sheet_count: number }) =>
    capture("plan_room_issue_started", properties),

  issueFinalized: (properties: {
    project_id: string;
    issue_id: string;
    sheet_count: number;
    recipient_count: number;
    duration_ms: number;
  }) => capture("plan_room_issue_finalized", properties),

  transmittalCreated: (properties: {
    project_id: string;
    issue_id: string;
    purpose: string;
  }) => capture("plan_room_transmittal_created", properties),

  transmittalRevoked: (properties: {
    project_id: string;
    transmittal_id: string;
  }) => capture("plan_room_transmittal_revoked", properties),
};
