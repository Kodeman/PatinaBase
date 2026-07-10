import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const authEvents = {
  login: (method: string) => track('login', { method, platform: 'client' }),
  signup: (method: string) => track('signup', { method, platform: 'client' }),
  logout: () => track('logout', { platform: 'client' }),
};

export const clientEvents = {
  projectView: (projectId: string) => track('client_project_view', { project_id: projectId }),
  decisionApprove: (decisionId: string) =>
    track('client_decision_approve', { decision_id: decisionId }),
  decisionReject: (decisionId: string) =>
    track('client_decision_reject', { decision_id: decisionId }),
  messageView: (threadId: string) => track('client_message_view', { thread_id: threadId }),
  messageSend: (threadId: string) => track('client_message_send', { thread_id: threadId }),
  productView: (productId: string) => track('client_product_view', { product_id: productId }),
  demoStart: (demoType: string) => track('client_demo_start', { demo_type: demoType }),
  demoComplete: (demoType: string) => track('client_demo_complete', { demo_type: demoType }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location, platform: 'client' }),
};

// ---------------------------------------------------------------------------
// The former typed `helpEvents` taxonomy (spec § 10.1) was dead scaffolding —
// no runtime consumer ever imported it. Help-system surfaces emit their
// events directly (HELP_EVENTS/safeCapture in @patina/help-system), so the
// block was removed in the help-desk Wave 1 pass rather than left to drift.
// ---------------------------------------------------------------------------
// aestheteQuizEvents — the §12.4 quiz funnel (Aesthete Engine, Wave 3D).
// Event names are the design-doc vocabulary verbatim (quiz_started /
// question_answered / quiz_completed / matches_viewed / match_saved) so
// dashboards aggregate across portals + the marketing site. Wire-up note:
// packages/aesthete-quiz/README.md ("Analytics"). Never put quiz free-text or
// PII in properties (product law).
// ---------------------------------------------------------------------------

export const aestheteQuizEvents = {
  /** Pass-through tap for useStyleQuiz({ onEvent }) — see the package README. */
  fromQuizHook: (e: { name: string; properties: Record<string, unknown> }) =>
    track(e.name, { ...e.properties, platform: 'client' }),
  matchesViewed: (p: { sessionKey: string | null; resultCount: number }) =>
    track('matches_viewed', {
      session_key: p.sessionKey,
      result_count: p.resultCount,
      platform: 'client',
    }),
  matchSaved: (p: { sessionKey: string | null; productId: string; isExploration?: boolean }) =>
    track('match_saved', {
      session_key: p.sessionKey,
      product_id: p.productId,
      is_exploration: p.isExploration ?? false,
      platform: 'client',
    }),
};

export const proposalClientEvents = {
  viewedByClient: (p: { proposalId: string }) =>
    track('proposal_viewed_by_client', { proposal_id: p.proposalId, platform: 'client' }),
  sectionViewed: (p: { proposalId: string; sectionType: string; durationSeconds: number }) =>
    track('proposal_section_viewed', {
      proposal_id: p.proposalId,
      section_type: p.sectionType,
      duration_seconds: p.durationSeconds,
      platform: 'client',
    }),
  signed: (p: { proposalId: string; signedByName: string }) =>
    track('proposal_signed', {
      proposal_id: p.proposalId,
      signed_by_name: p.signedByName,
      platform: 'client',
    }),
};
