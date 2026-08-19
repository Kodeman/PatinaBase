export {
  createClient,
  createBrowserClient,
  createServerClient,
  createMiddlewareClient,
  createAdminClient,
  SUPABASE_AUTH_STORAGE_KEY,
} from "./client";
export type { Database, Json } from "./database.types";
export * from "./hooks";
export {
  isOAuthProviderEnabled,
  getOAuthProviderLabel,
  parseOAuthProviders,
  ENABLED_OAUTH_PROVIDERS,
  type OAuthProvider,
} from "./lib/oauth-providers";
export {
  AuthFlowError,
  normalizeAuthError,
  normalizeOAuthCallbackError,
  safeAuthReturnPath,
  buildAuthCallbackUrl,
  buildVerifyOtpPath,
  buildSignInPath,
  recoveryFinalReturnPath,
  consumeAuthCallbackFragment,
  finalizeAuthCallback,
  type AuthCallbackFragment,
  type AuthCallbackMethod,
  type AuthCallbackResult,
  type AuthFailure,
  type AuthFailureKind,
  type FinalizeAuthCallbackOptions,
} from "./auth";
export { getCookieDomain } from "./lib/cookie-domain";
export {
  normalizeBoardMediaValue,
  signBoardMediaReference,
  signBoardMediaValue,
  type BoardStorageSigningClient,
} from "./lib/board-storage";
export {
  normalizeProposalBoardReference,
  proposalBoardUrlToPath,
  PROPOSAL_BOARD_BUCKET,
} from "./lib/storage-url";
export {
  invalidateProposalClientQueries,
  proposalClientQueryKeys,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from "./lib/proposal-client-query-invalidation";
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
} from "./lib/proposal-payment-schedule";
export {
  resolveVendor,
  type ResolveVendorInput,
  type ResolvedVendor,
} from "./lib/vendors";
export {
  edgeApiBaseUrl,
  fetchScanArtifact,
  ScanArtifactError,
  type ScanArtifactKind,
  type ScanCapabilityUrl,
  type ScanRendersResponse,
} from './lib/scan-artifact-url';
export {
  captureProduct,
  type CaptureProductInput,
  type CaptureProductResult,
  type CaptureProductDestination,
} from "./mutations/capture-product";
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
} from "./mutations/promotion";
export {
  nominateVendor,
  type NominateVendorInput,
  type NominateVendorResult,
  type NominationStatus,
} from "./mutations/nomination";

// Server-side auth utilities are available via '@patina/supabase/server'
// Do NOT re-export here — server.ts uses next/headers which breaks client components
