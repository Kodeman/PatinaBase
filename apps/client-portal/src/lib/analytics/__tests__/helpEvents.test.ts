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
      surfaceKey: 'project_decisions',
      persona: 'client',
    });
  });

  it('emptyState.ctaClicked fires help.empty_state.cta_clicked', () => {
    helpEvents.emptyState.ctaClicked('message_thread', 'Send a message');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.cta_clicked', {
      surfaceKey: 'message_thread',
      ctaLabel: 'Send a message',
    });
  });

  it('fieldHelper.rendered fires help.field_helper.rendered', () => {
    helpEvents.fieldHelper.rendered('decision_comment');
    expect(captureMock).toHaveBeenCalledWith('help.field_helper.rendered', {
      surfaceKey: 'decision_comment',
    });
  });

  // ---- Layer 2 · Reactive -------------------------------------------------

  it('tooltip.shown fires help.tooltip.shown', () => {
    helpEvents.tooltip.shown('approval_status', 'right', 'click');
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.shown', {
      surfaceKey: 'approval_status',
      position: 'right',
      triggerType: 'click',
    });
  });

  it('tooltip.dismissed fires help.tooltip.dismissed', () => {
    helpEvents.tooltip.dismissed('approval_status', 700);
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.dismissed', {
      surfaceKey: 'approval_status',
      durationMs: 700,
    });
  });

  it('learnmore.expanded fires help.learnmore.expanded', () => {
    helpEvents.learnmore.expanded('proposal_terms');
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.expanded', {
      surfaceKey: 'proposal_terms',
    });
  });

  it('learnmore.collapsed fires help.learnmore.collapsed', () => {
    helpEvents.learnmore.collapsed('proposal_terms', 6000);
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.collapsed', {
      surfaceKey: 'proposal_terms',
      viewedMs: 6000,
    });
  });

  it('panel.opened fires help.panel.opened', () => {
    helpEvents.panel.opened('project_overview', 'utility_bar');
    expect(captureMock).toHaveBeenCalledWith('help.panel.opened', {
      fromSurfaceKey: 'project_overview',
      triggerType: 'utility_bar',
    });
  });

  it('panel.closed fires help.panel.closed', () => {
    helpEvents.panel.closed('project_overview', 12000, true);
    expect(captureMock).toHaveBeenCalledWith('help.panel.closed', {
      fromSurfaceKey: 'project_overview',
      durationMs: 12000,
      articleOpened: true,
    });
  });

  // ---- Layer 3 · Proactive ------------------------------------------------

  it('tour.started fires help.tour.started', () => {
    helpEvents.tour.started('client_onboarding', 'welcome_modal');
    expect(captureMock).toHaveBeenCalledWith('help.tour.started', {
      tourKey: 'client_onboarding',
      triggerSource: 'welcome_modal',
    });
  });

  it('tour.stepAdvanced fires help.tour.step_advanced', () => {
    helpEvents.tour.stepAdvanced('client_onboarding', 1, 'project_overview');
    expect(captureMock).toHaveBeenCalledWith('help.tour.step_advanced', {
      tourKey: 'client_onboarding',
      stepNumber: 1,
      stepSurfaceKey: 'project_overview',
    });
  });

  it('tour.completed fires help.tour.completed', () => {
    helpEvents.tour.completed('client_onboarding', 45000, 6);
    expect(captureMock).toHaveBeenCalledWith('help.tour.completed', {
      tourKey: 'client_onboarding',
      durationMs: 45000,
      stepsViewed: 6,
    });
  });

  it('tour.abandoned fires help.tour.abandoned', () => {
    helpEvents.tour.abandoned('client_onboarding', 4, 6);
    expect(captureMock).toHaveBeenCalledWith('help.tour.abandoned', {
      tourKey: 'client_onboarding',
      atStep: 4,
      totalSteps: 6,
    });
  });

  it('coachmark.shown fires help.coachmark.shown', () => {
    helpEvents.coachmark.shown('sign_proposal');
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.shown', {
      surfaceKey: 'sign_proposal',
    });
  });

  it('coachmark.dismissed fires help.coachmark.dismissed', () => {
    helpEvents.coachmark.dismissed('sign_proposal', 3000);
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.dismissed', {
      surfaceKey: 'sign_proposal',
      viewedMs: 3000,
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
    helpEvents.article.opened('how-to-approve-decision', 'help_panel', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.opened', {
      articleKey: 'how-to-approve-decision',
      fromSurfaceKey: 'help_panel',
      fromSearch: true,
    });
  });

  it('article.scrolledToEnd fires help.article.scrolled_to_end', () => {
    helpEvents.article.scrolledToEnd('how-to-approve-decision', 55000);
    expect(captureMock).toHaveBeenCalledWith('help.article.scrolled_to_end', {
      articleKey: 'how-to-approve-decision',
      durationMs: 55000,
    });
  });

  it('article.feedbackGiven fires help.article.feedback_given', () => {
    helpEvents.article.feedbackGiven('how-to-approve-decision', 'positive', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.feedback_given', {
      articleKey: 'how-to-approve-decision',
      sentiment: 'positive',
      hasComment: true,
    });
  });

  it('search.performed fires help.search.performed', () => {
    helpEvents.search.performed('approve proposal', 4, 'help_panel');
    expect(captureMock).toHaveBeenCalledWith('help.search.performed', {
      query: 'approve proposal',
      resultCount: 4,
      fromSurfaceKey: 'help_panel',
    });
  });

  it('search.resultClicked fires help.search.result_clicked', () => {
    helpEvents.search.resultClicked('approve proposal', 'signing-guide', 0);
    expect(captureMock).toHaveBeenCalledWith('help.search.result_clicked', {
      query: 'approve proposal',
      articleKey: 'signing-guide',
      position: 0,
    });
  });
});
