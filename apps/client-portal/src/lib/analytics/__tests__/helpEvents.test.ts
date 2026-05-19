jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { helpEvents } from '../events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('helpEvents — event names match spec § 10.1', () => {
  beforeEach(() => captureMock.mockClear());

  // ---- Layer 1 · Ambient --------------------------------------------------

  it('emptyState.shown fires help.empty_state.shown', () => {
    helpEvents.emptyState.shown('project_decisions', 'client');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.shown', {
      surface_key: 'project_decisions',
      persona: 'client',
    });
  });

  it('emptyState.ctaClicked fires help.empty_state.cta_clicked', () => {
    helpEvents.emptyState.ctaClicked('message_thread', 'Send a message');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.cta_clicked', {
      surface_key: 'message_thread',
      cta_label: 'Send a message',
    });
  });

  it('fieldHelper.rendered fires help.field_helper.rendered', () => {
    helpEvents.fieldHelper.rendered('decision_comment');
    expect(captureMock).toHaveBeenCalledWith('help.field_helper.rendered', {
      surface_key: 'decision_comment',
    });
  });

  // ---- Layer 2 · Reactive -------------------------------------------------

  it('tooltip.shown fires help.tooltip.shown', () => {
    helpEvents.tooltip.shown('approval_status', 'right', 'click');
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.shown', {
      surface_key: 'approval_status',
      position: 'right',
      trigger_type: 'click',
    });
  });

  it('tooltip.dismissed fires help.tooltip.dismissed', () => {
    helpEvents.tooltip.dismissed('approval_status', 700);
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.dismissed', {
      surface_key: 'approval_status',
      duration_ms: 700,
    });
  });

  it('learnmore.expanded fires help.learnmore.expanded', () => {
    helpEvents.learnmore.expanded('proposal_terms');
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.expanded', {
      surface_key: 'proposal_terms',
    });
  });

  it('learnmore.collapsed fires help.learnmore.collapsed', () => {
    helpEvents.learnmore.collapsed('proposal_terms', 6000);
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.collapsed', {
      surface_key: 'proposal_terms',
      viewed_ms: 6000,
    });
  });

  it('panel.opened fires help.panel.opened', () => {
    helpEvents.panel.opened('project_overview', 'utility_bar');
    expect(captureMock).toHaveBeenCalledWith('help.panel.opened', {
      from_surface_key: 'project_overview',
      trigger_type: 'utility_bar',
    });
  });

  it('panel.closed fires help.panel.closed', () => {
    helpEvents.panel.closed('project_overview', 12000, true);
    expect(captureMock).toHaveBeenCalledWith('help.panel.closed', {
      from_surface_key: 'project_overview',
      duration_ms: 12000,
      article_opened: true,
    });
  });

  // ---- Layer 3 · Proactive ------------------------------------------------

  it('tour.started fires help.tour.started', () => {
    helpEvents.tour.started('client_onboarding', 'welcome_modal');
    expect(captureMock).toHaveBeenCalledWith('help.tour.started', {
      tour_key: 'client_onboarding',
      trigger_source: 'welcome_modal',
    });
  });

  it('tour.stepAdvanced fires help.tour.step_advanced', () => {
    helpEvents.tour.stepAdvanced('client_onboarding', 1, 'project_overview');
    expect(captureMock).toHaveBeenCalledWith('help.tour.step_advanced', {
      tour_key: 'client_onboarding',
      step_number: 1,
      step_surface_key: 'project_overview',
    });
  });

  it('tour.completed fires help.tour.completed', () => {
    helpEvents.tour.completed('client_onboarding', 45000, 6);
    expect(captureMock).toHaveBeenCalledWith('help.tour.completed', {
      tour_key: 'client_onboarding',
      duration_ms: 45000,
      steps_viewed: 6,
    });
  });

  it('tour.abandoned fires help.tour.abandoned', () => {
    helpEvents.tour.abandoned('client_onboarding', 4, 6);
    expect(captureMock).toHaveBeenCalledWith('help.tour.abandoned', {
      tour_key: 'client_onboarding',
      at_step: 4,
      total_steps: 6,
    });
  });

  it('coachmark.shown fires help.coachmark.shown', () => {
    helpEvents.coachmark.shown('sign_proposal');
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.shown', {
      surface_key: 'sign_proposal',
    });
  });

  it('coachmark.dismissed fires help.coachmark.dismissed', () => {
    helpEvents.coachmark.dismissed('sign_proposal', 3000);
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.dismissed', {
      surface_key: 'sign_proposal',
      viewed_ms: 3000,
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
    helpEvents.article.opened('how-to-approve-decision', 'help_panel', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.opened', {
      article_key: 'how-to-approve-decision',
      from_surface_key: 'help_panel',
      from_search: true,
    });
  });

  it('article.scrolledToEnd fires help.article.scrolled_to_end', () => {
    helpEvents.article.scrolledToEnd('how-to-approve-decision', 55000);
    expect(captureMock).toHaveBeenCalledWith('help.article.scrolled_to_end', {
      article_key: 'how-to-approve-decision',
      duration_ms: 55000,
    });
  });

  it('article.feedbackGiven fires help.article.feedback_given', () => {
    helpEvents.article.feedbackGiven('how-to-approve-decision', 'positive', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.feedback_given', {
      article_key: 'how-to-approve-decision',
      sentiment: 'positive',
      has_comment: true,
    });
  });

  it('search.performed fires help.search.performed', () => {
    helpEvents.search.performed('approve proposal', 4, 'help_panel');
    expect(captureMock).toHaveBeenCalledWith('help.search.performed', {
      query: 'approve proposal',
      result_count: 4,
      from_surface_key: 'help_panel',
    });
  });

  it('search.resultClicked fires help.search.result_clicked', () => {
    helpEvents.search.resultClicked('approve proposal', 'signing-guide', 0);
    expect(captureMock).toHaveBeenCalledWith('help.search.result_clicked', {
      query: 'approve proposal',
      article_key: 'signing-guide',
      position: 0,
    });
  });
});
