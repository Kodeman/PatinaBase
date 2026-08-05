export {
  createClient,
  createBrowserClient,
  createServerClient,
  createMiddlewareClient,
  createAdminClient,
} from './client';
export type { Database, Json } from './database.types';
export * from './hooks';
export {
  isOAuthProviderEnabled,
  getOAuthProviderLabel,
  parseOAuthProviders,
  ENABLED_OAUTH_PROVIDERS,
  type OAuthProvider,
} from './lib/oauth-providers';
export {
  AuthFlowError,
  normalizeAuthError,
  safeAuthReturnPath,
  buildAuthCallbackUrl,
  buildVerifyOtpPath,
  buildSignInPath,
  finalizeAuthCallback,
  type AuthCallbackMethod,
  type AuthCallbackResult,
  type AuthFailure,
  type AuthFailureKind,
  type FinalizeAuthCallbackOptions,
} from './auth';
export { getCookieDomain } from './lib/cookie-domain';
export {
  invalidateProposalClientQueries,
  proposalClientQueryKeys,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from './lib/proposal-client-query-invalidation';
export {
  assessProposalPaymentSchedule,
  canonicalizeProposalPaymentSchedule,
  parseProposalSendSnapshot,
  proposalPaymentScheduleReviewKey,
  proposalSendSnapshotsMatch,
  type ProposalPaymentMilestoneLike,
  type ProposalPaymentScheduleAssessment,
  type ProposalPaymentScheduleIssue,
  type ProposalPaymentScheduleIssueCode,
  type ProposalSendSnapshot,
  type ProposalSendSnapshotRpcRow,
} from './lib/proposal-payment-schedule';
export {
  resolveVendor,
  type ResolveVendorInput,
  type ResolvedVendor,
} from './lib/vendors';
export {
  captureProduct,
  type CaptureProductInput,
  type CaptureProductResult,
  type CaptureProductDestination,
} from './mutations/capture-product';
export {
  promoteToStudio,
  demoteToPersonal,
  promoteBatchToStudio,
  isWithinUndoWindow,
  type PromoteToStudioInput,
  type DemoteToPersonalInput,
  type PromoteBatchToStudioInput,
  type PromoteBatchItem,
  type PaymentPattern,
} from './mutations/promotion';
export {
  nominateVendor,
  type NominateVendorInput,
  type NominateVendorResult,
  type NominationStatus,
} from './mutations/nomination';

// Server-side auth utilities are available via '@patina/supabase/server'
// Do NOT re-export here — server.ts uses next/headers which breaks client components
