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
