export {
  useProducts,
  useProduct,
  useProductsWithVendorPricing,
  useProductWithVendorPricing,
  useCreateProduct,
  useUpdateProduct,
} from './use-products';
export type { ProductWithVendorPricing, VendorPricingInfo, ProductSort } from './use-products';
export { useStyles, useCreateStyle } from './use-styles';
export {
  useProjects,
  useProject,
  useCreateProject,
  useProjectProducts,
  useAddProductToProject,
  useRemoveProductFromProject,
  useUpdateProjectProductNotes,
} from './use-projects';
export {
  useSession,
  useUser,
  useUserWithRoles,
  useSignIn,
  useSignUp,
  useSignOut,
  useResetPassword,
  useUpdatePassword,
  // OAuth & Magic Link (Phase 2)
  useSignInWithOAuth,
  useSendMagicLink,
  useResendVerification,
  useLinkOAuthAccount,
  useUnlinkOAuthAccount,
  useLinkedIdentities,
  useVerifyOtp,
  // MFA & Session Management (Phase 3)
  useMfaFactors,
  useEnrollMfa,
  useVerifyMfaEnrollment,
  useChallengeMfa,
  useUnenrollMfa,
  useMfaAssuranceLevel,
  useCurrentSession,
  useRefreshSession,
  useSignOutAllDevices,
  useSignOutOtherDevices,
} from './use-auth';
export type { OAuthProvider, MfaFactorType, MfaFactor, UserSession } from './use-auth';
export {
  // Designer Onboarding (Phase 3)
  useMyDesignerApplication,
  useSubmitDesignerApplication,
  useUpdateDesignerApplication,
  useDesignerApplications,
  useDesignerApplication,
  useApproveDesignerApplication,
  useRejectDesignerApplication,
  useMarkApplicationUnderReview,
  useDesignerApplicationStats,
} from './use-onboarding';
export type {
  DesignerApplicationStatus,
  DesignerApplication,
  DesignerApplicationInput,
  DesignerApplicationWithProfile,
} from './use-onboarding';
export {
  useStyleArchetypes,
  useAllStyles,
  useClientArchetypes,
  useAppealSignals,
  useTeachingQueue,
  useClaimNextProduct,
  useProductSpectrum,
  useSaveSpectrum,
  useProductStyles,
  useAssignStyle,
  useRemoveStyle,
  useValidationQueue,
  useSubmitValidation,
  useDesignerTeachingStats,
  useSubmitTeaching,
} from './use-teaching';
export {
  useSimilarProducts,
  useProductEmbeddingStatus,
  useProductsNeedingEmbeddings,
  useEmbeddingStats,
  useProductsForStyle,
} from './use-similarity';
export {
  useGenerateProductEmbedding,
  useBatchGenerateEmbeddings,
  useCheckOllamaHealth,
  useGenerateTextEmbedding,
} from './use-embeddings';
export {
  useVendors,
  useVendor,
  useVendorProducts,
  useTradeAccounts,
  useVendorReviews,
  useToggleVendorSave,
  useSubmitVendorReview,
  useVoteOnSpecialization,
  useFindOrCreateVendor,
  useSearchVendors,
} from './use-vendors';
export type { FindOrCreateVendorInput, FindOrCreateVendorResult } from './use-vendors';
export {
  useLeads,
  useLead,
  useLeadStats,
  useUpdateLeadStatus,
  useMarkLeadViewed,
  useAcceptLead,
  useDeclineLead,
} from './use-leads';
export type { Lead, LeadFilters } from './use-leads';
export {
  useClients,
  useClient,
  useClientStats,
  useUpdateClientStatus,
  useUpdateClientNotes,
  useClientMessages,
  useSendClientMessage,
  useClientProjects,
  useAddClient,
} from './use-clients';
export type { DesignerClient, ClientMessage, ClientFilters } from './use-clients';
export {
  useProposals,
  useProposal,
  useProposalStats,
  useCreateProposal,
  useUpdateProposal,
  useAddProposalItem,
  useUpdateProposalItem,
  useRemoveProposalItem,
  useSendProposal,
  useDeleteProposal,
} from './use-proposals';
export type { Proposal, ProposalItem, ProposalFilters } from './use-proposals';
export {
  useEarnings,
  useEarningsStats,
  useMonthlyEarnings,
  usePayouts,
  usePayoutStats,
} from './use-earnings';
export type { DesignerEarning, DesignerPayout, EarningsFilters } from './use-earnings';
export {
  useProfile,
  useUpdateProfile,
  useSettings,
  useUpdateSettings,
  useUploadAvatar,
} from './use-settings';
export type { UserProfile, UserSettings } from './use-settings';
export {
  useRoomScans,
  useRoomScan,
  useClientRoomScans,
  useRoomScanStats,
  useUpdateRoomScan,
  useDeleteRoomScan,
  useAssociateRoomScanWithProject,
  useProjectRoomScans,
} from './use-room-scans';
export type {
  RoomScan,
  RoomScanDimensions,
  RoomScanFeatures,
  RoomScanStyleSignals,
  RoomScanFilters,
} from './use-room-scans';
export {
  useRooms,
  useRoom,
  useClientRooms,
  useRoomStats,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useRoomFeatures,
  useFeaturesByType,
  useUserStyleSignals,
  useClientStyleSignals,
  useRecalculateStyleSignals,
  useScanModelUrl,
} from './use-rooms';
export type {
  Room,
  RoomFeature,
  RoomStyleSignals,
  UserStyleSignals,
  RoomFilters,
  RoomType,
} from './use-rooms';
export {
  useRoomScanAssociations,
  useRoomScanAssociation,
  useDesignerSharedScans,
  useConsumerSharedScans,
  useLeadSharedScans,
  useHomeownerScans,
  useShareRoomScan,
  useRequestScanAccess,
  useApproveAccessRequest,
  useDenyAccessRequest,
  useRevokeScanAccess,
  useUpdateAccessLevel,
} from './use-room-scan-associations';
export {
  useSaveMeasurements,
  useSaveAnnotations,
  useSaveRoomScanData,
} from './use-room-scan-data';
export {
  useOrganizations,
  useOrganization,
  useOrganizationMembers,
  usePendingInvitations,
  useCreateOrganization,
  useUpdateOrganization,
  useInviteMember,
  useAcceptInvitation,
  useDeclineInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
} from './use-organizations';
export type {
  Organization,
  OrganizationType,
  OrganizationStatus,
  SubscriptionTier,
  OrganizationMember,
  MemberRole,
  MemberStatus,
  OrganizationWithMembership,
  OrganizationMemberWithProfile,
  CreateOrganizationInput,
  InviteMemberInput,
} from './use-organizations';
export {
  useUserRoles,
  useUserPermissions,
  useHasPermission,
  useHasAnyPermission,
  useAllRoles,
  useSystemRoles,
  useAllPermissions,
  useRolePermissions,
  useIsDesigner,
  useIsManufacturer,
  useIsAdmin,
  useIsSuperAdmin,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './use-permissions';
export type {
  Role,
  RoleDomain,
  Permission,
  UserRoleAssignment,
  PermissionContext,
} from './use-permissions';
export {
  // API Key Management (Phase 4)
  useOrganizationApiKeys,
  useApiKey,
  useApiKeyStats,
  useCreateApiKey,
  useUpdateApiKey,
  useRevokeApiKey,
  useRegenerateApiKey,
  API_KEY_SCOPES,
} from './use-api-keys';
export type {
  ApiKey,
  ApiKeyEnvironment,
  ApiKeyStatus,
  ApiKeyScope,
  CreateApiKeyInput,
  CreateApiKeyResult,
} from './use-api-keys';
export {
  // Audit Logging (Phase 4)
  useAuditLogs,
  useMyAuditLogs,
  useOrganizationAuditLogs,
  useAuditLogStats,
  useCreateAuditLog,
  useLogAction,
} from './use-audit-logs';
export type {
  AuditAction,
  AuditResource,
  AuditLog,
  AuditLogWithUser,
  AuditLogFilters,
  CreateAuditLogInput,
} from './use-audit-logs';
export {
  // GDPR Compliance (Phase 4)
  useMyDataExportRequests,
  useLatestDataExportRequest,
  useRequestDataExport,
  useExportMyData,
  useMyAccountDeletionRequest,
  useRequestAccountDeletion,
  useCancelAccountDeletion,
  useMyConsents,
  useHasConsent,
  useGrantConsent,
  useRevokeConsent,
  CONSENT_TYPES,
} from './use-gdpr';
export type {
  DataExportStatus,
  DataExportRequest,
  AccountDeletionStatus,
  AccountDeletionRequest,
  DataExportContent,
  ConsentRecord,
  ConsentType,
} from './use-gdpr';
export {
  // Engagement Tracking
  useEngagementScore,
  useMyEngagementScore,
  useRecentEngagementEvents,
  useTrackEngagementEvent,
} from './use-engagement';
export type {
  AnalyticsPlatform,
  EngagementTier,
  EngagementScore,
  EngagementEvent,
  EngagementEventFilters,
} from './use-engagement';
export {
  // Waitlist Management
  useWaitlistEntries,
  useWaitlistStats,
  useWaitlistEntry,
  useInsertWaitlistEntry,
} from './use-waitlist';
export type {
  WaitlistEntry,
  WaitlistFilters,
  WaitlistStats,
  WaitlistInsertInput,
} from './use-waitlist';
export {
  // Insights Dashboard (Admin)
  useInsightsOverview,
  useWaitlistTimeSeries,
  useUtmAttribution,
  useEngagementScoreDistribution,
  useTopEngagedUsers,
  useActiveUsersByPlatform,
  useConversionFunnel,
  useDesignerFunnel,
  useConsumerFunnel,
} from './use-insights';
export type {
  InsightsOverview,
  WaitlistTimeSeriesPoint,
  UtmAttributionRow,
  EngagementTierDistribution,
  TopEngagedUser,
  PlatformActiveUsers,
  FunnelStep,
} from './use-insights';
export {
  // Notification Preferences
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from './use-notification-preferences';
export {
  // Campaigns
  useCampaigns,
  useCampaign,
  useCreateCampaign,
  useUpdateCampaign,
  useSendCampaign,
  useCancelCampaign,
} from './use-campaigns';
export {
  // Communications Dashboard
  useCommsDashboard,
  useRecentActivity,
  useUpcomingSends,
} from './use-comms-dashboard';
export type {
  CommsDashboardStats,
  CommsDashboardData,
  SendVolumePoint,
  RecentActivity,
  ScheduledSend,
} from './use-comms-dashboard';
export {
  // Email Templates
  useTemplates,
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useTemplatePreview,
} from './use-templates';
export {
  // Audience Segments
  useAudienceSegments,
  useAudienceSegment,
  useCreateAudienceSegment,
  useUpdateAudienceSegment,
  useDeleteAudienceSegment,
  useEstimateAudienceSize,
} from './use-audience-segments';
export {
  // Communications Analytics
  useAnalyticsOverview,
  useCampaignComparison,
  useRevenueAttribution,
  useEngagementCohorts,
  useDeliveryHealth,
} from './use-analytics';
export type {
  TimeSeriesPoint,
  TopCampaign,
  AnalyticsOverviewData,
  CampaignComparisonItem,
  CampaignComparisonData,
  AttributionFunnelStep,
  RevenueAttributionData,
  EngagementCohortTier,
  EngagementCohortsData,
  DeliveryHealthData,
} from './use-analytics';
export {
  // Automations
  useAutomations,
  useAutomation,
  useCreateAutomation,
  useUpdateAutomation,
  useDeleteAutomation,
  useActivateAutomation,
  usePauseAutomation,
  useSequenceEnrollments,
} from './use-automations';
