import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const authEvents = {
  login: (method: string) => track('login', { method }),
  signup: (method: string) => track('signup', { method }),
  logout: () => track('logout'),
};

export const productEvents = {
  create: (properties?: Record<string, unknown>) => track('product_create', properties),
  view: (productId: string) => track('product_view', { product_id: productId }),
  update: (productId: string) => track('product_update', { product_id: productId }),
  search: (queryLength: number, resultCount: number) =>
    track('product_search', { query_length: queryLength, result_count: resultCount }),
  filterChange: (filterType: string) =>
    track('product_filter_change', { filter_type: filterType }),
  addToProject: (productId: string) =>
    track('product_add_to_project', { product_id: productId }),
};

export const projectEvents = {
  create: (properties?: Record<string, unknown>) => track('project_create', properties),
  view: (projectId: string) => track('project_view', { project_id: projectId }),
};

export const clientEvents = {
  create: (properties?: Record<string, unknown>) => track('client_create', properties),
  view: (clientId: string) => track('client_view', { client_id: clientId }),
  interaction: (properties?: Record<string, unknown>) => track('client_interaction', properties),
};

export const vendorEvents = {
  search: (queryLength: number, resultCount: number) =>
    track('vendor_search', { query_length: queryLength, result_count: resultCount }),
  filterChange: (filterType: string) =>
    track('vendor_filter_change', { filter_type: filterType }),
  save: (vendorId: string) => track('vendor_save', { vendor_id: vendorId }),
  view: (vendorId: string) => track('vendor_view', { vendor_id: vendorId }),
};

export const teachingEvents = {
  startSession: (mode: string) => track('teaching_session_start', { mode }),
  completeSession: (mode: string) => track('teaching_session_complete', { mode }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location }),
  commandPaletteOpen: () => track('command_palette_open'),
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

export const proposalEvents = {
  created: (p: { proposalId: string; templateId?: string; hasProject: boolean }) =>
    track('proposal_created', {
      proposal_id: p.proposalId,
      template_id: p.templateId,
      has_project: p.hasProject,
    }),
  sectionSaved: (p: { proposalId: string; sectionType: string; bodyLength: number }) =>
    track('proposal_section_saved', {
      proposal_id: p.proposalId,
      section_type: p.sectionType,
      body_length: p.bodyLength,
    }),
  itemAdded: (p: {
    proposalId: string;
    itemType: 'fixed' | 'allowance' | 'tbd';
    hasProduct: boolean;
    lineTotal: number;
  }) =>
    track('proposal_item_added', {
      proposal_id: p.proposalId,
      item_type: p.itemType,
      has_product: p.hasProduct,
      line_total: p.lineTotal,
    }),
  scopeUpdated: (p: {
    proposalId: string;
    field: 'room' | 'phase' | 'exclusion' | 'milestone';
    action: 'add' | 'update' | 'remove';
  }) =>
    track('proposal_scope_updated', {
      proposal_id: p.proposalId,
      field: p.field,
      action: p.action,
    }),
  sent: (p: {
    proposalId: string;
    hasPersonalMessage: boolean;
    hasCcEmail: boolean;
    itemCount: number;
    totalAmount: number;
  }) =>
    track('proposal_sent', {
      proposal_id: p.proposalId,
      has_personal_message: p.hasPersonalMessage,
      has_cc_email: p.hasCcEmail,
      item_count: p.itemCount,
      total_amount: p.totalAmount,
    }),
  revisionCreated: (p: {
    sourceProposalId: string;
    newProposalId: string;
    version: number;
  }) =>
    track('proposal_revision_created', {
      source_proposal_id: p.sourceProposalId,
      new_proposal_id: p.newProposalId,
      version: p.version,
    }),
};
