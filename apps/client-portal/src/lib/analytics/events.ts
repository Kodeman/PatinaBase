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
// helpEvents — Help-system event taxonomy (spec § 10.1)
// All event-name strings are intentionally identical across portals so that
// PostHog dashboards can aggregate cleanly without per-portal filters.
// ---------------------------------------------------------------------------

/** Layer 1 · Ambient */
const helpEmptyState = {
  shown: (surfaceKey: string, persona: string) =>
    track('help.empty_state.shown', { surfaceKey, persona }),
  ctaClicked: (surfaceKey: string, ctaLabel: string) =>
    track('help.empty_state.cta_clicked', { surfaceKey, ctaLabel }),
};

const helpFieldHelper = {
  /**
   * Fired when a field-level helper renders.
   * Spec marks this "batch-counted, low priority" — batching may be added in a
   * follow-up task without changing the event name.
   */
  rendered: (surfaceKey: string) =>
    track('help.field_helper.rendered', { surfaceKey }),
};

/** Layer 2 · Reactive */
const helpTooltip = {
  shown: (
    surfaceKey: string,
    position: 'top' | 'bottom' | 'left' | 'right' | 'auto',
    triggerType: 'hover' | 'focus' | 'click',
  ) => track('help.tooltip.shown', { surfaceKey, position, triggerType }),
  dismissed: (surfaceKey: string, durationMs: number) =>
    track('help.tooltip.dismissed', { surfaceKey, durationMs }),
};

const helpLearnmore = {
  expanded: (surfaceKey: string) =>
    track('help.learnmore.expanded', { surfaceKey }),
  collapsed: (surfaceKey: string, viewedMs: number) =>
    track('help.learnmore.collapsed', { surfaceKey, viewedMs }),
};

const helpPanel = {
  opened: (fromSurfaceKey: string, triggerType: 'utility_bar' | 'keyboard_shortcut') =>
    track('help.panel.opened', { fromSurfaceKey, triggerType }),
  closed: (fromSurfaceKey: string, durationMs: number, articleOpened: boolean) =>
    track('help.panel.closed', { fromSurfaceKey, durationMs, articleOpened }),
};

/** Layer 3 · Proactive */
const helpTour = {
  started: (tourKey: string, triggerSource: string) =>
    track('help.tour.started', { tourKey, triggerSource }),
  stepAdvanced: (tourKey: string, stepNumber: number, stepSurfaceKey: string) =>
    track('help.tour.step_advanced', { tourKey, stepNumber, stepSurfaceKey }),
  completed: (tourKey: string, durationMs: number, stepsViewed: number) =>
    track('help.tour.completed', { tourKey, durationMs, stepsViewed }),
  abandoned: (tourKey: string, atStep: number, totalSteps: number) =>
    track('help.tour.abandoned', { tourKey, atStep, totalSteps }),
};

const helpCoachmark = {
  shown: (surfaceKey: string) =>
    track('help.coachmark.shown', { surfaceKey }),
  dismissed: (surfaceKey: string, viewedMs: number) =>
    track('help.coachmark.dismissed', { surfaceKey, viewedMs }),
};

const helpWelcomeModal = {
  shown: (firstSignin: boolean) =>
    track('help.welcome_modal.shown', { firstSignin }),
  action: (action: 'take_tour' | 'jump_in') =>
    track('help.welcome_modal.action', { action }),
};

/** Layer 4 · Reference */
const helpArticle = {
  opened: (articleKey: string, fromSurfaceKey: string, fromSearch: boolean) =>
    track('help.article.opened', { articleKey, fromSurfaceKey, fromSearch }),
  scrolledToEnd: (articleKey: string, durationMs: number) =>
    track('help.article.scrolled_to_end', { articleKey, durationMs }),
  feedbackGiven: (
    articleKey: string,
    sentiment: 'positive' | 'negative',
    hasComment: boolean,
  ) => track('help.article.feedback_given', { articleKey, sentiment, hasComment }),
};

const helpSearch = {
  performed: (query: string, resultCount: number, fromSurfaceKey: string) =>
    track('help.search.performed', { query, resultCount, fromSurfaceKey }),
  resultClicked: (query: string, articleKey: string, position: number) =>
    track('help.search.result_clicked', { query, articleKey, position }),
};

export const helpEvents = {
  emptyState: helpEmptyState,
  fieldHelper: helpFieldHelper,
  tooltip: helpTooltip,
  learnmore: helpLearnmore,
  panel: helpPanel,
  tour: helpTour,
  coachmark: helpCoachmark,
  welcomeModal: helpWelcomeModal,
  article: helpArticle,
  search: helpSearch,
} as const;

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
