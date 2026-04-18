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
