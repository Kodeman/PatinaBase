import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const authEvents = {
  login: (method: string) => track('login', { method, platform: 'admin' }),
  logout: () => track('logout', { platform: 'admin' }),
};

export const adminEvents = {
  userManagementView: (view: string) => track('admin_user_management_view', { view }),
  userInvite: (role: string) => track('admin_user_invite', { role }),
  userRoleChange: (userId: string, newRole: string) =>
    track('admin_user_role_change', { user_id: userId, new_role: newRole }),
  productApprove: (productId: string) => track('admin_product_approve', { product_id: productId }),
  productReject: (productId: string) => track('admin_product_reject', { product_id: productId }),
  vendorApprove: (vendorId: string) => track('admin_vendor_approve', { vendor_id: vendorId }),
  vendorReject: (vendorId: string) => track('admin_vendor_reject', { vendor_id: vendorId }),
  exportData: (exportType: string, recordCount: number) =>
    track('admin_export_data', { export_type: exportType, record_count: recordCount }),
  dashboardView: (dashboardName: string) => track('admin_dashboard_view', { dashboard: dashboardName }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location, platform: 'admin' }),
};

// ---------------------------------------------------------------------------
// helpEvents — Help-system event taxonomy (spec § 10.1)
// All event-name strings are intentionally identical across portals so that
// PostHog dashboards can aggregate cleanly without per-portal filters.
// ---------------------------------------------------------------------------

/** Layer 1 · Ambient */
const helpEmptyState = {
  shown: (surfaceKey: string, persona: string) =>
    track('help.empty_state.shown', { surface_key: surfaceKey, persona }),
  ctaClicked: (surfaceKey: string, ctaLabel: string) =>
    track('help.empty_state.cta_clicked', {
      surface_key: surfaceKey,
      cta_label: ctaLabel,
    }),
};

const helpFieldHelper = {
  /**
   * Fired when a field-level helper renders.
   * Spec marks this "batch-counted, low priority" — batching may be added in a
   * follow-up task without changing the event name.
   */
  rendered: (surfaceKey: string) =>
    track('help.field_helper.rendered', { surface_key: surfaceKey }),
};

/** Layer 2 · Reactive */
const helpTooltip = {
  shown: (
    surfaceKey: string,
    position: 'top' | 'bottom' | 'left' | 'right' | 'auto',
    triggerType: 'hover' | 'focus' | 'click',
  ) =>
    track('help.tooltip.shown', {
      surface_key: surfaceKey,
      position,
      trigger_type: triggerType,
    }),
  dismissed: (surfaceKey: string, durationMs: number) =>
    track('help.tooltip.dismissed', {
      surface_key: surfaceKey,
      duration_ms: durationMs,
    }),
};

const helpLearnmore = {
  expanded: (surfaceKey: string) =>
    track('help.learnmore.expanded', { surface_key: surfaceKey }),
  collapsed: (surfaceKey: string, viewedMs: number) =>
    track('help.learnmore.collapsed', {
      surface_key: surfaceKey,
      viewed_ms: viewedMs,
    }),
};

const helpPanel = {
  opened: (fromSurfaceKey: string, triggerType: 'utility_bar' | 'keyboard_shortcut') =>
    track('help.panel.opened', {
      from_surface_key: fromSurfaceKey,
      trigger_type: triggerType,
    }),
  closed: (fromSurfaceKey: string, durationMs: number, articleOpened: boolean) =>
    track('help.panel.closed', {
      from_surface_key: fromSurfaceKey,
      duration_ms: durationMs,
      article_opened: articleOpened,
    }),
};

/** Layer 3 · Proactive */
const helpTour = {
  started: (tourKey: string, triggerSource: string) =>
    track('help.tour.started', {
      tour_key: tourKey,
      trigger_source: triggerSource,
    }),
  stepAdvanced: (tourKey: string, stepNumber: number, stepSurfaceKey: string) =>
    track('help.tour.step_advanced', {
      tour_key: tourKey,
      step_number: stepNumber,
      step_surface_key: stepSurfaceKey,
    }),
  completed: (tourKey: string, durationMs: number, stepsViewed: number) =>
    track('help.tour.completed', {
      tour_key: tourKey,
      duration_ms: durationMs,
      steps_viewed: stepsViewed,
    }),
  abandoned: (tourKey: string, atStep: number, totalSteps: number) =>
    track('help.tour.abandoned', {
      tour_key: tourKey,
      at_step: atStep,
      total_steps: totalSteps,
    }),
};

const helpCoachmark = {
  shown: (surfaceKey: string) =>
    track('help.coachmark.shown', { surface_key: surfaceKey }),
  dismissed: (surfaceKey: string, viewedMs: number) =>
    track('help.coachmark.dismissed', {
      surface_key: surfaceKey,
      viewed_ms: viewedMs,
    }),
};

const helpWelcomeModal = {
  shown: (firstSignin: boolean) =>
    track('help.welcome_modal.shown', { first_signin: firstSignin }),
  action: (action: 'take_tour' | 'jump_in') =>
    track('help.welcome_modal.action', { action }),
};

/** Layer 4 · Reference */
const helpArticle = {
  opened: (articleKey: string, fromSurfaceKey: string, fromSearch: boolean) =>
    track('help.article.opened', {
      article_key: articleKey,
      from_surface_key: fromSurfaceKey,
      from_search: fromSearch,
    }),
  scrolledToEnd: (articleKey: string, durationMs: number) =>
    track('help.article.scrolled_to_end', {
      article_key: articleKey,
      duration_ms: durationMs,
    }),
  feedbackGiven: (
    articleKey: string,
    sentiment: 'positive' | 'negative',
    hasComment: boolean,
  ) =>
    track('help.article.feedback_given', {
      article_key: articleKey,
      sentiment,
      has_comment: hasComment,
    }),
};

const helpSearch = {
  performed: (query: string, resultCount: number, fromSurfaceKey: string) =>
    track('help.search.performed', {
      query,
      result_count: resultCount,
      from_surface_key: fromSurfaceKey,
    }),
  resultClicked: (query: string, articleKey: string, position: number) =>
    track('help.search.result_clicked', {
      query,
      article_key: articleKey,
      position,
    }),
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
