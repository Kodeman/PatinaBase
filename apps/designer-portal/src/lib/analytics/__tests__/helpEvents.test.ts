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
      surfaceKey: 'project_overview',
      persona: 'designer',
    });
  });

  it('emptyState.ctaClicked fires help.empty_state.cta_clicked', () => {
    helpEvents.emptyState.ctaClicked('product_search', 'Start exploring');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.cta_clicked', {
      surfaceKey: 'product_search',
      ctaLabel: 'Start exploring',
    });
  });

  it('fieldHelper.rendered fires help.field_helper.rendered', () => {
    helpEvents.fieldHelper.rendered('product_description');
    expect(captureMock).toHaveBeenCalledWith('help.field_helper.rendered', {
      surfaceKey: 'product_description',
    });
  });

  // ---- Layer 2 · Reactive -------------------------------------------------

  it('tooltip.shown fires help.tooltip.shown', () => {
    helpEvents.tooltip.shown('room_budget', 'top', 'hover');
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.shown', {
      surfaceKey: 'room_budget',
      position: 'top',
      triggerType: 'hover',
    });
  });

  it('tooltip.dismissed fires help.tooltip.dismissed', () => {
    helpEvents.tooltip.dismissed('room_budget', 1200);
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.dismissed', {
      surfaceKey: 'room_budget',
      durationMs: 1200,
    });
  });

  it('learnmore.expanded fires help.learnmore.expanded', () => {
    helpEvents.learnmore.expanded('scope_section');
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.expanded', {
      surfaceKey: 'scope_section',
    });
  });

  it('learnmore.collapsed fires help.learnmore.collapsed', () => {
    helpEvents.learnmore.collapsed('scope_section', 4500);
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.collapsed', {
      surfaceKey: 'scope_section',
      viewedMs: 4500,
    });
  });

  it('panel.opened fires help.panel.opened', () => {
    helpEvents.panel.opened('vendor_search', 'utility_bar');
    expect(captureMock).toHaveBeenCalledWith('help.panel.opened', {
      fromSurfaceKey: 'vendor_search',
      triggerType: 'utility_bar',
    });
  });

  it('panel.closed fires help.panel.closed', () => {
    helpEvents.panel.closed('vendor_search', 8000, true);
    expect(captureMock).toHaveBeenCalledWith('help.panel.closed', {
      fromSurfaceKey: 'vendor_search',
      durationMs: 8000,
      articleOpened: true,
    });
  });

  // ---- Layer 3 · Proactive ------------------------------------------------

  it('tour.started fires help.tour.started', () => {
    helpEvents.tour.started('onboarding_designer', 'welcome_modal');
    expect(captureMock).toHaveBeenCalledWith('help.tour.started', {
      tourKey: 'onboarding_designer',
      triggerSource: 'welcome_modal',
    });
  });

  it('tour.stepAdvanced fires help.tour.step_advanced', () => {
    helpEvents.tour.stepAdvanced('onboarding_designer', 2, 'add_product');
    expect(captureMock).toHaveBeenCalledWith('help.tour.step_advanced', {
      tourKey: 'onboarding_designer',
      stepNumber: 2,
      stepSurfaceKey: 'add_product',
    });
  });

  it('tour.completed fires help.tour.completed', () => {
    helpEvents.tour.completed('onboarding_designer', 30000, 5);
    expect(captureMock).toHaveBeenCalledWith('help.tour.completed', {
      tourKey: 'onboarding_designer',
      durationMs: 30000,
      stepsViewed: 5,
    });
  });

  it('tour.abandoned fires help.tour.abandoned', () => {
    helpEvents.tour.abandoned('onboarding_designer', 3, 5);
    expect(captureMock).toHaveBeenCalledWith('help.tour.abandoned', {
      tourKey: 'onboarding_designer',
      atStep: 3,
      totalSteps: 5,
    });
  });

  it('coachmark.shown fires help.coachmark.shown', () => {
    helpEvents.coachmark.shown('proposal_send');
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.shown', {
      surfaceKey: 'proposal_send',
    });
  });

  it('coachmark.dismissed fires help.coachmark.dismissed', () => {
    helpEvents.coachmark.dismissed('proposal_send', 2100);
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.dismissed', {
      surfaceKey: 'proposal_send',
      viewedMs: 2100,
    });
  });

  it('welcomeModal.shown fires help.welcome_modal.shown', () => {
    helpEvents.welcomeModal.shown(true);
    expect(captureMock).toHaveBeenCalledWith('help.welcome_modal.shown', {
      firstSignin: true,
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
      articleKey: 'how-to-create-proposal',
      fromSurfaceKey: 'help_panel',
      fromSearch: true,
    });
  });

  it('article.scrolledToEnd fires help.article.scrolled_to_end', () => {
    helpEvents.article.scrolledToEnd('how-to-create-proposal', 62000);
    expect(captureMock).toHaveBeenCalledWith('help.article.scrolled_to_end', {
      articleKey: 'how-to-create-proposal',
      durationMs: 62000,
    });
  });

  it('article.feedbackGiven fires help.article.feedback_given', () => {
    helpEvents.article.feedbackGiven('how-to-create-proposal', 'positive', false);
    expect(captureMock).toHaveBeenCalledWith('help.article.feedback_given', {
      articleKey: 'how-to-create-proposal',
      sentiment: 'positive',
      hasComment: false,
    });
  });

  it('search.performed fires help.search.performed', () => {
    helpEvents.search.performed('budget tracking', 5, 'help_panel');
    expect(captureMock).toHaveBeenCalledWith('help.search.performed', {
      query: 'budget tracking',
      resultCount: 5,
      fromSurfaceKey: 'help_panel',
    });
  });

  it('search.resultClicked fires help.search.result_clicked', () => {
    helpEvents.search.resultClicked('budget tracking', 'budget-overview', 2);
    expect(captureMock).toHaveBeenCalledWith('help.search.result_clicked', {
      query: 'budget tracking',
      articleKey: 'budget-overview',
      position: 2,
    });
  });
});
