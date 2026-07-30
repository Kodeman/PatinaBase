import posthog from "posthog-js";
import type {
  SpecBookAudience,
  SpecBookIssueType,
  SpecBookReadiness,
} from "@patina/supabase";
import { isAnalyticsEnabled } from "./posthog";

function capture(
  event: `spec_book_${string}`,
  properties: Record<string, unknown>,
): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const specBookEvents = {
  opened: (properties: { project_id: string; item_count: number }) =>
    capture("spec_book_workspace_opened", properties),

  readinessChanged: (properties: {
    project_id: string;
    item_id: string;
    from: SpecBookReadiness;
    to: SpecBookReadiness;
  }) => capture("spec_book_readiness_changed", properties),

  preflightCompleted: (properties: {
    project_id: string;
    audience_count: number;
    blocker_count: number;
    warning_count: number;
  }) => capture("spec_book_preflight_completed", properties),

  issueAttempted: (properties: {
    project_id: string;
    issue_type: SpecBookIssueType;
    audiences: SpecBookAudience[];
    warning_count: number;
  }) => capture("spec_book_issue_attempted", properties),

  artifactRetry: (properties: {
    project_id: string;
    artifact_id: string;
    audience: SpecBookAudience;
  }) => capture("spec_book_artifact_retry", properties),

  artifactRendered: (properties: {
    project_id: string;
    artifact_id: string;
    audience: SpecBookAudience;
    duration_ms: number;
  }) => capture("spec_book_artifact_rendered", properties),

  artifactFailed: (properties: {
    project_id: string;
    artifact_id: string;
    audience: SpecBookAudience;
    error: string;
  }) => capture("spec_book_artifact_failed", properties),

  issued: (properties: {
    project_id: string;
    revision_id: string;
    issue_type: SpecBookIssueType;
    duration_ms: number;
  }) => capture("spec_book_issued", properties),

  shareCreated: (properties: {
    project_id: string;
    artifact_id: string;
    audience: SpecBookAudience;
    expires: boolean;
  }) => capture("spec_book_share_created", properties),

  addendumStarted: (properties: {
    project_id: string;
    base_revision_id: string;
  }) => capture("spec_book_addendum_started", properties),

  driftDecision: (properties: {
    project_id: string;
    item_id: string;
    decision: "accept_source" | "preserve_override" | "acknowledge";
  }) => capture("spec_book_drift_decision", properties),
};
