import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

export function track(
  event: string,
  properties?: Record<string, unknown>,
  options?: { transport?: 'XHR' | 'sendBeacon' }
): void {
  if (!isAnalyticsEnabled()) return;
  // Only pass a 3rd arg when actually provided — existing tests assert
  // captureMock.toHaveBeenCalledWith(event, properties) with exactly 2 args,
  // and an explicit `undefined` 3rd arg breaks that equality check.
  if (options) {
    posthog.capture(event, properties, options);
  } else {
    posthog.capture(event, properties);
  }
}

export const authEvents = {
  login: (method: string) => track('login', { method, platform: 'client' }),
  signup: (method: string) => track('signup', { method, platform: 'client' }),
  logout: () => track('logout', { platform: 'client' }),
};

export const clientEvents = {
  projectView: (projectId: string) => track('client_project_view', { project_id: projectId }),
  // requiresConsent/optionId are new — decisionApprove had zero call sites
  // before this wave, so the signature was free to extend (design plan §1.4).
  decisionApprove: (p: { decisionId: string; optionId: string; requiresConsent: boolean }) =>
    track('client_decision_approve', {
      decision_id: p.decisionId,
      option_id: p.optionId,
      requires_consent: p.requiresConsent,
    }),
  // Intentionally unwired — no reject UI exists on the client decision card.
  decisionReject: (decisionId: string) =>
    track('client_decision_reject', { decision_id: decisionId }),
  messageView: (threadId: string) => track('client_message_view', { thread_id: threadId }),
  messageSend: (threadId: string) => track('client_message_send', { thread_id: threadId }),
  productView: (productId: string) => track('client_product_view', { product_id: productId }),
  demoStart: (demoType: string) => track('client_demo_start', { demo_type: demoType }),
  demoComplete: (demoType: string) => track('client_demo_complete', { demo_type: demoType }),
  documentView: (p: { documentId: string; kind: string }) =>
    track('client_document_view', { document_id: p.documentId, kind: p.kind }),
  invoiceView: (p: { invoiceId: string; status: string }) =>
    track('client_invoice_view', { invoice_id: p.invoiceId, status: p.status }),
  // Names are LOCKED — dashboards reference client_payment_started/completed/cancelled
  // verbatim (design plan §1.4). `paymentStarted` fires immediately before the
  // Stripe Checkout redirect, so it uses sendBeacon transport to survive
  // navigation away from the page.
  paymentStarted: (p: { invoiceId: string; amountCents?: number }) =>
    track(
      'client_payment_started',
      { invoice_id: p.invoiceId, amount: p.amountCents },
      { transport: 'sendBeacon' }
    ),
  paymentCompleted: (p: { invoiceId: string; amountCents?: number }) =>
    track('client_payment_completed', { invoice_id: p.invoiceId, amount: p.amountCents }),
  paymentCancelled: (p: { invoiceId: string; amountCents?: number }) =>
    track('client_payment_cancelled', { invoice_id: p.invoiceId, amount: p.amountCents }),
};

export const navEvents = {
  ctaClick: (ctaText: string, location: string) =>
    track('nav_cta_click', { cta_text: ctaText, location, platform: 'client' }),
};

// ---------------------------------------------------------------------------
// The former typed `helpEvents` taxonomy (spec § 10.1) was dead scaffolding —
// no runtime consumer ever imported it. Help-system surfaces emit their
// events directly (HELP_EVENTS/safeCapture in @patina/help-system), so the
// block was removed in the help-desk Wave 1 pass rather than left to drift.
// ---------------------------------------------------------------------------
// aestheteQuizEvents — the §12.4 quiz funnel (Aesthete Engine, Wave 3D).
// Event names are the design-doc vocabulary verbatim (quiz_started /
// question_answered / quiz_completed / matches_viewed / match_saved) so
// dashboards aggregate across portals + the marketing site. Wire-up note:
// packages/aesthete-quiz/README.md ("Analytics"). Never put quiz free-text or
// PII in properties (product law).
// ---------------------------------------------------------------------------

export const aestheteQuizEvents = {
  /** Pass-through tap for useStyleQuiz({ onEvent }) — see the package README. */
  fromQuizHook: (e: { name: string; properties: Record<string, unknown> }) =>
    track(e.name, { ...e.properties, platform: 'client' }),
  matchesViewed: (p: { sessionKey: string | null; resultCount: number }) =>
    track('matches_viewed', {
      session_key: p.sessionKey,
      result_count: p.resultCount,
      platform: 'client',
    }),
  matchSaved: (p: { sessionKey: string | null; productId: string; isExploration?: boolean }) =>
    track('match_saved', {
      session_key: p.sessionKey,
      product_id: p.productId,
      is_exploration: p.isExploration ?? false,
      platform: 'client',
    }),
};

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
