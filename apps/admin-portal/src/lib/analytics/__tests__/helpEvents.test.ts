jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('../posthog', () => ({ isAnalyticsEnabled: () => true }));

import posthog from 'posthog-js';
import { helpEvents } from '../events';

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe('helpEvents — event names match spec § 10.1', () => {
  beforeEach(() => captureMock.mockClear());

  // ---- Layer 1 · Ambient --------------------------------------------------

  it('emptyState.shown fires help.empty_state.shown', () => {
    helpEvents.emptyState.shown('user_management', 'admin');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.shown', {
      surface_key: 'user_management',
      persona: 'admin',
    });
  });

  it('emptyState.ctaClicked fires help.empty_state.cta_clicked', () => {
    helpEvents.emptyState.ctaClicked('vendor_list', 'Add vendor');
    expect(captureMock).toHaveBeenCalledWith('help.empty_state.cta_clicked', {
      surface_key: 'vendor_list',
      cta_label: 'Add vendor',
    });
  });

  it('fieldHelper.rendered fires help.field_helper.rendered', () => {
    helpEvents.fieldHelper.rendered('vendor_approval');
    expect(captureMock).toHaveBeenCalledWith('help.field_helper.rendered', {
      surface_key: 'vendor_approval',
    });
  });

  // ---- Layer 2 · Reactive -------------------------------------------------

  it('tooltip.shown fires help.tooltip.shown', () => {
    helpEvents.tooltip.shown('export_data', 'bottom', 'focus');
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.shown', {
      surface_key: 'export_data',
      position: 'bottom',
      trigger_type: 'focus',
    });
  });

  it('tooltip.dismissed fires help.tooltip.dismissed', () => {
    helpEvents.tooltip.dismissed('export_data', 950);
    expect(captureMock).toHaveBeenCalledWith('help.tooltip.dismissed', {
      surface_key: 'export_data',
      duration_ms: 950,
    });
  });

  it('learnmore.expanded fires help.learnmore.expanded', () => {
    helpEvents.learnmore.expanded('role_permissions');
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.expanded', {
      surface_key: 'role_permissions',
    });
  });

  it('learnmore.collapsed fires help.learnmore.collapsed', () => {
    helpEvents.learnmore.collapsed('role_permissions', 3200);
    expect(captureMock).toHaveBeenCalledWith('help.learnmore.collapsed', {
      surface_key: 'role_permissions',
      viewed_ms: 3200,
    });
  });

  it('panel.opened fires help.panel.opened', () => {
    helpEvents.panel.opened('dashboard', 'keyboard_shortcut');
    expect(captureMock).toHaveBeenCalledWith('help.panel.opened', {
      from_surface_key: 'dashboard',
      trigger_type: 'keyboard_shortcut',
    });
  });

  it('panel.closed fires help.panel.closed', () => {
    helpEvents.panel.closed('dashboard', 5000, false);
    expect(captureMock).toHaveBeenCalledWith('help.panel.closed', {
      from_surface_key: 'dashboard',
      duration_ms: 5000,
      article_opened: false,
    });
  });

  // ---- Layer 3 · Proactive ------------------------------------------------

  it('tour.started fires help.tour.started', () => {
    helpEvents.tour.started('admin_onboarding', 'welcome_modal');
    expect(captureMock).toHaveBeenCalledWith('help.tour.started', {
      tour_key: 'admin_onboarding',
      trigger_source: 'welcome_modal',
    });
  });

  it('tour.stepAdvanced fires help.tour.step_advanced', () => {
    helpEvents.tour.stepAdvanced('admin_onboarding', 1, 'user_list');
    expect(captureMock).toHaveBeenCalledWith('help.tour.step_advanced', {
      tour_key: 'admin_onboarding',
      step_number: 1,
      step_surface_key: 'user_list',
    });
  });

  it('tour.completed fires help.tour.completed', () => {
    helpEvents.tour.completed('admin_onboarding', 25000, 4);
    expect(captureMock).toHaveBeenCalledWith('help.tour.completed', {
      tour_key: 'admin_onboarding',
      duration_ms: 25000,
      steps_viewed: 4,
    });
  });

  it('tour.abandoned fires help.tour.abandoned', () => {
    helpEvents.tour.abandoned('admin_onboarding', 2, 4);
    expect(captureMock).toHaveBeenCalledWith('help.tour.abandoned', {
      tour_key: 'admin_onboarding',
      at_step: 2,
      total_steps: 4,
    });
  });

  it('coachmark.shown fires help.coachmark.shown', () => {
    helpEvents.coachmark.shown('bulk_export');
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.shown', {
      surface_key: 'bulk_export',
    });
  });

  it('coachmark.dismissed fires help.coachmark.dismissed', () => {
    helpEvents.coachmark.dismissed('bulk_export', 1500);
    expect(captureMock).toHaveBeenCalledWith('help.coachmark.dismissed', {
      surface_key: 'bulk_export',
      viewed_ms: 1500,
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
    helpEvents.article.opened('how-to-approve-vendor', 'help_panel', false);
    expect(captureMock).toHaveBeenCalledWith('help.article.opened', {
      article_key: 'how-to-approve-vendor',
      from_surface_key: 'help_panel',
      from_search: false,
    });
  });

  it('article.scrolledToEnd fires help.article.scrolled_to_end', () => {
    helpEvents.article.scrolledToEnd('how-to-approve-vendor', 40000);
    expect(captureMock).toHaveBeenCalledWith('help.article.scrolled_to_end', {
      article_key: 'how-to-approve-vendor',
      duration_ms: 40000,
    });
  });

  it('article.feedbackGiven fires help.article.feedback_given', () => {
    helpEvents.article.feedbackGiven('how-to-approve-vendor', 'negative', true);
    expect(captureMock).toHaveBeenCalledWith('help.article.feedback_given', {
      article_key: 'how-to-approve-vendor',
      sentiment: 'negative',
      has_comment: true,
    });
  });

  it('search.performed fires help.search.performed', () => {
    helpEvents.search.performed('user roles', 3, 'help_panel');
    expect(captureMock).toHaveBeenCalledWith('help.search.performed', {
      query: 'user roles',
      result_count: 3,
      from_surface_key: 'help_panel',
    });
  });

  it('search.resultClicked fires help.search.result_clicked', () => {
    helpEvents.search.resultClicked('user roles', 'role-permissions-guide', 1);
    expect(captureMock).toHaveBeenCalledWith('help.search.result_clicked', {
      query: 'user roles',
      article_key: 'role-permissions-guide',
      position: 1,
    });
  });
});
