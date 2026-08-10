import posthog from 'posthog-js';
import type { FfeAssignmentScope, FfeDesignDisposition } from '@patina/types';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const ffeEvents = {
  entranceOpened: (properties: {
    project_id: string;
    source: 'section' | 'command_palette' | 'empty_state';
  }) => track('ffe_entrance_opened', properties),
  routingChosen: (properties: {
    project_id: string;
    assignment_scope: FfeAssignmentScope;
    has_board: boolean;
    disposition: FfeDesignDisposition;
  }) => track('ffe_routing_chosen', properties),
  placementCompleted: (properties: {
    project_id: string;
    selection_id: string | null;
    placement_id: string | null;
    outcome: 'created' | 'reused' | 'filled' | 'held';
  }) => track('ffe_placement_completed', properties),
  reviewPublished: (properties: {
    project_id: string;
    edition_id: string;
    selection_count: number;
    board_count: number;
    delivery_status: 'not_requested' | 'queued' | 'failed';
  }) => track('ffe_review_published', properties),
  replacementStarted: (properties: {
    project_id: string;
    selection_id: string;
    placement_count: number;
  }) => track('ffe_replacement_started', properties),
  failed: (properties: {
    project_id: string;
    operation: 'place' | 'triage' | 'archive' | 'replace' | 'publish_review' | 'create_board';
    reason_code: string;
  }) => track('ffe_failure', properties),
};
