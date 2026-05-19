jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { helpEvents } from '../events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('helpEvents — event names match spec § 10.1', () => {
  beforeEach(() => captureMock.mockClear());

  // ---- Layer 1 · Ambient --------------------------------------------------

  it('emptyState.shown fires help.empty_state.shown', () => {
    helpEvents.emptyState.shown('project_overview', 'designer');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.shown', {
      surface_key: 'project_overview',
      persona: 'designer',
    });
  });

  it('emptyState.ctaClicked fires help.empty_state.cta_clicked', () => {
    helpEvents.emptyState.ctaClicked('product_search', 'Start exploring');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.cta_clicked', {
      surface_key: 'product_search',
      cta_label: 'Start exploring',
    });
  });

  it('fieldHelper.rendered fires help.field_helper.rendered', () => {
    helpEvents.fieldHelper.rendered('product_description');
    expect(captureMock).toHaveBeenCalledWith('help.field_helper.rendered', {
      surface_key: 'product_description',
    });
  });

  // ---- Layer 2 · Reactive -------------------------------------------------

  it('tooltip.shown fires help.tooltip.shown', () => {
    helpEvents.tooltip.shown('room_budget', 'top', 'hover');
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.shown', {
      surface_key: 'room_budget',
      position: 'top',
      trigger_type: 'hover',
    });
  });

  it('tooltip.dismissed fires help.tooltip.dismissed', () => {
    helpEvents.tooltip.dismissed('room_budget', 1200);
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.dismissed', {
      surface_key: 'room_budget',
      duration_ms: 1200,
    });
  });

  it('learnmore.expanded fires help.learnmore.expanded', () => {
    helpEvents.learnmore.expanded('scope_section');
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.expanded', {
      surface_key: 'scope_section',
    });
  });

  it('learnmore.collapsed fires help.learnmore.collapsed', () => {
    helpEvents.learnmore.collapsed('scope_section', 4500);
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.collapsed', {
      surface_key: 'scope_section',
      viewed_ms: 4500,
    });
  });

  it('panel.opened fires help.panel.opened', () => {
    helpEvents.panel.opened('vendor_search', 'utility_bar');
    expect(captureMock).toHaveBeenCalledWith('help.panel.opened', {
      from_surface_key: 'vendor_search',
      trigger_type: 'utility_bar',
    });
  });

  it('panel.closed fires help.panel.closed', () => {
    helpEvents.panel.closed('vendor_search', 8000, true);
    expect(captureMock).toHaveBeenCalledWith('help.panel.closed', {
      from_surface_key: 'vendor_search',
      duration_ms: 8000,
      article_opened: true,
    });
  });

  // ---- Layer 3 · Proactive ------------------------------------------------

  it('tour.started fires help.tour.started', () => {
    helpEvents.tour.started('onboarding_designer', 'welcome_modal');
    expect(captureMock).toHaveBeenCalledWith('help.tour.started', {
      tour_key: 'onboarding_designer',
      trigger_source: 'welcome_modal',
    });
  });

  it('tour.stepAdvanced fires help.tour.step_advanced', () => {
    helpEvents.tour.stepAdvanced('onboarding_designer', 2, 'add_product');
    expect(captureMock).toHaveBeenCalledWith('help.tour.step_advanced', {
      tour_key: 'onboarding_designer',
      step_number: 2,
      step_surface_key: 'add_product',
    });
  });

  it('tour.completed fires help.tour.completed', () => {
    helpEvents.tour.completed('onboarding_designer', 30000, 5);
    expect(captureMock).toHaveBeenCalledWith('help.tour.completed', {
      tour_key: 'onboarding_designer',
      duration_ms: 30000,
      steps_viewed: 5,
    });
  });

  it('tour.abandoned fires help.tour.abandoned', () => {
    helpEvents.tour.abandoned('onboarding_designer', 3, 5);
    expect(captureMock).toHaveBeenCalledWith('help.tour.abandoned', {
      tour_key: 'onboarding_designer',
      at_step: 3,
      total_steps: 5,
    });
  });

  it('coachmark.shown fires help.coachmark.shown', () => {
    helpEvents.coachmark.shown('proposal_send');
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.shown', {
      surface_key: 'proposal_send',
    });
  });

  it('coachmark.dismissed fires help.coachmark.dismissed', () => {
    helpEvents.coachmark.dismissed('proposal_send', 2100);
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.dismissed', {
      surface_key: 'proposal_send',
      viewed_ms: 2100,
    });
  });

  it('welcomeModal.shown fires help.welcome_modal.shown', () => {
    helpEvents.welcomeModal.shown(true);
    expect(captureMock).toHaveBeenCalledWith('help.welcome_modal.shown', {
      first_signin: true,
    });
  });

  it('welcomeModal.action fires help.welcome_modal.action for take_tour', () => {
    helpEvents.welcomeModal.action('take_tour');
    expect(captureMock).toHaveBeenCalledWith('help.welcome_modal.action', {
      action: 'take_tour',
    });
  });

  it('welcomeModal.action fires help.welcome_modal.action for jump_in', () => {
    helpEvents.welcomeModal.action('jump_in');
    expect(captureMock).toHaveBeenCalledWith('help.welcome_modal.action', {
      action: 'jump_in',
    });
  });

  // ---- Layer 4 · Reference ------------------------------------------------

  it('article.opened fires help.article.opened', () => {
    helpEvents.article.opened('how-to-create-proposal', 'help_panel', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.opened', {
      article_key: 'how-to-create-proposal',
      from_surface_key: 'help_panel',
      from_search: true,
    });
  });

  it('article.scrolledToEnd fires help.article.scrolled_to_end', () => {
    helpEvents.article.scrolledToEnd('how-to-create-proposal', 62000);
    expect(captureMock).toHaveBeenCalledWith('help.article.scrolled_to_end', {
      article_key: 'how-to-create-proposal',
      duration_ms: 62000,
    });
  });

  it('article.feedbackGiven fires help.article.feedback_given', () => {
    helpEvents.article.feedbackGiven('how-to-create-proposal', 'positive', false);
    expect(captureMock).toHaveBeenCalledWith('help.article.feedback_given', {
      article_key: 'how-to-create-proposal',
      sentiment: 'positive',
      has_comment: false,
    });
  });

  it('search.performed fires help.search.performed', () => {
    helpEvents.search.performed('budget tracking', 5, 'help_panel');
    expect(captureMock).toHaveBeenCalledWith('help.search.performed', {
      query: 'budget tracking',
      result_count: 5,
      from_surface_key: 'help_panel',
    });
  });

  it('search.resultClicked fires help.search.result_clicked', () => {
    helpEvents.search.resultClicked('budget tracking', 'budget-overview', 2);
    expect(captureMock).toHaveBeenCalledWith('help.search.result_clicked', {
      query: 'budget tracking',
      article_key: 'budget-overview',
      position: 2,
    });
  });
});
