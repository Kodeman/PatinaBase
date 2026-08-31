export {
  useProducts,
  useProduct,
  useProductPrices,
  useProductsWithVendorPricing,
  useProductWithVendorPricing,
  useCreateProduct,
  useUpdateProduct,
  useCreateDraftProduct,
} from "./use-products";
export {
  productConfigurationKeys,
  useProductConfigurationDefinition,
  useProductConfiguration,
  useSavedProductConfigurations,
  useUpsertProductConfigurationDefinition,
  useEvaluateProductConfiguration,
  useSaveProductConfiguration,
  useApproveProductConfiguration,
  usePromoteConfigurationToLibrary,
  useInstantiateProductConfigurationTemplate,
  useCustomCommissionRevisions,
  useCustomCommissionMilestones,
  useRecordCustomCommissionMilestone,
  useCreateCustomCommissionRevision,
  useTransitionCustomCommissionRevision,
  usePrepareConfigurationQuoteRequest,
  usePlaceProductConfiguration,
  useReviseProjectFFEConfiguration,
} from "./use-product-configurations";
export {
  useLayerProducts,
  useLayerCounts,
  type LayerProductLayer,
  type LayerProductRow,
  type UseLayerProductsOptions,
} from "./use-layer-products";
export {
  useCaptureProduct,
  type UseCaptureProductOptions,
} from "./use-capture-product";
export {
  usePromotionCandidates,
  type PromotionCandidate,
  type UsePromotionCandidatesOptions,
} from "./use-promotion-candidates";
export {
  useCrossLayerSearch,
  buildCrossLayerOrFilter,
  DEFAULT_CROSS_LAYER_FIELDS,
  type CrossLayerSearchResult,
  type UseCrossLayerSearchOptions,
  type CrossLayerSearchField,
} from "./use-cross-layer-search";
export {
  usePromoteToStudio,
  useDemoteToPersonal,
  usePromoteBatchToStudio,
  type UsePromoteToStudioOptions,
  type UseDemoteToPersonalOptions,
  type UsePromoteBatchToStudioOptions,
} from "./use-promote-to-studio";
export {
  useNominateVendor,
  useLatestVendorNomination,
  type UseNominateVendorOptions,
  type VendorNominationRow,
} from "./use-nominate-vendor";
export {
  useVendorStudioStats,
  computeSignalStrength,
  type VendorStudioStats,
  type SignalStrength,
} from "./use-vendor-studio-stats";
export {
  useAdminNominations,
  useSetNominationStatus,
  type AdminNominationRow,
  type SetNominationStatusInput,
  type UseAdminNominationsOptions,
} from "./use-admin-nominations";
export { useLibraryPilotEnabled } from "./use-library-pilot-flag";
export type {
  ProductWithVendorPricing,
  VendorPricingInfo,
  ProductSort,
  UseProductsOptions,
  CreateDraftProductInput,
  ProductPrice,
} from "./use-products";
export {
  useFFECategories,
  useCreateFFECategory,
  useDeleteFFECategory,
  slugifyFFECategoryLabel,
} from "./use-ffe-categories";
export type {
  FFECategory,
  UseFFECategoriesOptions,
  CreateFFECategoryInput,
} from "./use-ffe-categories";
export { useStyles, useCreateStyle } from "./use-styles";
export {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useProjectProducts,
  useAddProductToProject,
  useRemoveProductFromProject,
  useUpdateProjectProductNotes,
} from "./use-projects";
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
  useSendEmailOtp,
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
} from "./use-auth";
export type {
  OAuthProvider,
  MfaFactorType,
  MfaFactor,
  UserSession,
} from "./use-auth";
export {
  usePortalQrAuth,
  type PortalQrAuthFailure,
  type PortalQrAuthOptions,
  type PortalQrAuthResult,
  type PortalQrAuthSnapshot,
  type PortalQrAuthState,
} from "./use-portal-qr-auth";
export {
  useAmbientQrAuth,
  type AmbientQrAuthOptions,
  type AmbientQrAuthResult,
  type AmbientQrPhase,
} from "./use-ambient-qr-auth";
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
} from "./use-onboarding";
export type {
  DesignerApplicationStatus,
  DesignerApplication,
  DesignerApplicationInput,
  DesignerApplicationWithProfile,
} from "./use-onboarding";
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
  useDesignerTaughtToday,
  useSubmitTeaching,
} from "./use-teaching";
export {
  useSimilarProducts,
  useProductEmbeddingStatus,
  useProductsNeedingEmbeddings,
  useEmbeddingStats,
  useProductsForStyle,
} from "./use-similarity";
export {
  useVendors,
  useVendor,
  useVendorProducts,
  useTradeAccounts,
  useVendorReviews,
  useToggleVendorSave,
  useSaveVendor,
  useSavedVendorIds,
  useSubmitVendorReview,
  useVoteOnSpecialization,
  useFindOrCreateVendor,
  useSearchVendors,
} from "./use-vendors";
export type {
  FindOrCreateVendorInput,
  FindOrCreateVendorResult,
} from "./use-vendors";
export {
  useLeads,
  useLead,
  useLeadStats,
  useCreateLead,
  useUpdateLeadStatus,
  useMarkLeadViewed,
  useAcceptLead,
  useBeginDiscovery,
  useNurtureLead,
  useDeclineLead,
} from "./use-leads";
export type { Lead, LeadFilters } from "./use-leads";
export {
  useDiscovery,
  useUpsertDiscovery,
  useBeginDirection,
} from "./use-discovery";
export {
  useCeremonyForRelationship,
  useRefreshOfferedSlots,
} from "./use-match-ceremony";
export type {
  CeremonyForRelationship,
  CeremonyOfferedSlot,
  RefreshOfferedSlotsInput,
} from "./use-match-ceremony";
export type {
  ClientDiscovery,
  DiscoveryRead,
  DiscoveryRoom,
  LifestyleRow,
  KeepItem,
  AvoidItem,
  DecisionMaker,
  UpsertDiscoveryInput,
} from "./use-discovery";
export {
  useClients,
  useClient,
  useDesignerClientForClientUser,
  useClientStats,
  useUpdateClientStatus,
  useUpdateClientNotes,
  useUpdateClientContact,
  useClientMessages,
  useSendClientMessage,
  useClientProjects,
  useAddClient,
  useInviteAndLinkClient,
} from "./use-clients";
export type {
  DesignerClient,
  ClientLifecycleStage,
  ClientMessage,
  ClientFilters,
} from "./use-clients";
export {
  // Client Decisions
  useClientDecisions,
  useDecision,
  useAllDecisions,
  useDecisionsByProject,
  useDecisionMetrics,
  useCreateDecision,
  useUpdateDecision,
  useExtendAndReopenDecision,
  useDeleteDecision,
  usePublishDraftDecision,
  useDecisionRealtime,
  useUpdateDecisionStatus,
  isValidDecisionTransition,
  useSelectDecisionOption,
  useApplyDecisionOverride,
  useDecisionOverrides,
  useSendDecisionReminder,
  useMarkDecisionViewed,
  useDecisionAnalyticsByType,
  useDecisionAnalyticsByClient,
  useDecisionBottleneckPhases,
  useDecisionComments,
  useCreateDecisionComment,
  useUpdateDecisionComment,
  useDeleteDecisionComment,
} from "./use-decisions";
export type {
  ClientDecision,
  ClientDecisionOption,
  CreateDecisionInput,
  UpdateDecisionInput,
  ExtendAndReopenDecisionInput,
  DecisionType,
  BlockingStatus,
  DecisionStatus,
  DecisionFilters,
  DecisionMetrics,
  DecisionTypeAnalytics,
  DecisionClientAnalytics,
  DecisionPhaseAnalytics,
  DecisionComment,
  DecisionOverride,
  ConsentMethod,
} from "./use-decisions";
export {
  PROJECT_APPROVAL_CONTRACT,
  projectApprovalKeys,
  invalidateProjectApprovalQueries,
  parseProjectApprovalArtifactCandidate,
  parseProjectApprovalReview,
  useProjectApprovalArtifactCandidates,
  useProjectApprovals,
  useProjectApproval,
  useProjectApprovalByDecision,
  useMyProjectApprovalReviews,
  useProjectDecisionAuthority,
  useSetProjectDecisionAuthority,
  useCreateProjectApproval,
  useConfirmProjectApprovalReview,
  usePublishProjectApproval,
  useRespondProjectApproval,
  useWithdrawProjectApproval,
  useSupersedeProjectApproval,
} from "./use-project-approvals";
export type {
  ProjectApprovalArtifactKind,
  ProjectApprovalArtifactCandidate,
  ProjectApprovalLifecycleStatus,
  ProjectApprovalOutcome,
  ProjectApprovalDisposition,
  ProjectApprovalReview,
  ProjectDecisionAuthority,
  ProjectApprovalCreatePayload,
  ProjectApprovalActionResult,
  ProjectApprovalInvalidationScope,
} from "./use-project-approvals";
export {
  projectContextualHandoffKeys,
  invalidateProjectContextualHandoffs,
  parseProjectContextualHandoff,
  useProjectContextualHandoffs,
  useSiteRequestActionDetail,
  useNudgeSiteRequest,
  useApproveSiteRequestItem,
  useRequestSiteRequestRedo,
  useCloseSiteRequest,
} from "./use-project-contextual-handoffs";
export type {
  ContextualHandoffSourceKind,
  ContextualHandoffActorKind,
  ContextualHandoffStageAttribution,
  ContextualHandoffActor,
  ContextualHandoffResponsibility,
  ProjectApprovalHandoffArtifact,
  SiteRequestHandoffArtifactItem,
  SiteRequestHandoffArtifact,
  ProjectApprovalContextualHandoff,
  SiteRequestContextualHandoff,
  ProjectContextualHandoff,
  SiteRequestActionItem,
  SiteRequestRoomChoice,
  SiteRequestActionDetail,
  ProjectContextualHandoffInvalidationScope,
} from "./use-project-contextual-handoffs";
export {
  // Project Coordination (Track 5 — the ball-in-court)
  useCoordinationItems,
  useCourtSummary,
  useProjectParties,
  useItemRevisions,
  useResolveCoordinationItem,
  useCreateCoordinationItem,
  useUpdateCoordinationItem,
  usePublishCoordinationItem,
  useDeleteCoordinationItem,
  useNudgeCoordinationItem,
  useExtendCoordinationItem,
  useReassignCoordinationItem,
  useSubmitCoordinationRevision,
  useCoordinationRealtime,
  useAddProjectParty,
  useUpdateProjectParty,
  useRemoveProjectParty,
  useRecordPartySmsConsent,
  useProjectRoster,
  isProjectArtifactApproval,
  excludeProjectArtifactApprovals,
} from "./use-coordination";
export type {
  Court,
  CoordinationKind,
  BlocksKind,
  CoordinationStatus,
  CoordinationItem,
  CoordinationItemRevision,
  CoordinationThreadPost,
  ProjectParty,
  PartyKind,
  CourtCount,
  CreateCoordinationItemInput,
  UpdateCoordinationItemInput,
  ExtendCoordinationItemInput,
  ReassignCoordinationItemInput,
  SubmitCoordinationRevisionInput,
  ResolveCoordinationItemInput,
  AddProjectPartyInput,
  UpdateProjectPartyPatch,
  UpdateProjectPartyInput,
  RemoveProjectPartyInput,
  RecordPartySmsConsentInput,
  ProjectRosterRow,
} from "./use-coordination";
// Field Coordination (Wave 5) — SMS triage, cross-project field rollup, and the
// per-party thread / composer / field-link data layer.
export {
  useSmsReviewQueue,
  useReviewSmsMessage,
  smsReviewKeys,
} from "./use-sms-review";
export type {
  SmsReviewMessage,
  FieldParsedIntent,
  ReviewSmsInput,
} from "./use-sms-review";
export { useFieldActivity, fieldActivityKeys } from "./use-field-activity";
export type { FieldActivityRow } from "./use-field-activity";
export {
  usePartySmsThread,
  useSendPartySms,
  useActiveFieldLink,
  useCreateFieldLink,
  useRevokeFieldLink,
  useFieldMediaUrl,
  fieldLinkUrl,
  partySmsKeys,
} from "./use-party-sms";
export type { PartySmsMessage, FieldLinkToken } from "./use-party-sms";
export {
  usePeopleDirectory,
  usePerson,
  peopleKeys,
  FIELD_ROSTER_ROLES,
  isFieldRosterRole,
} from "./use-people";
export type {
  PartyRole,
  PeopleDirectoryRow,
  PeopleFilters,
} from "./use-people";
export {
  // Client Reviews
  useClientReviews,
  useReviewStats,
  useCreateReviewRequest,
  useSubmitReview,
  useTogglePortfolioPublish,
  useCompletedProjectsWithoutReview,
} from "./use-reviews";
export type {
  ClientReview,
  ReviewFilters,
  ReviewStats,
  CompletedProject,
} from "./use-reviews";
export {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
} from "./use-client-side-reviews";
export type { ClientPendingReview } from "./use-client-side-reviews";
export {
  // Client Nurture
  useNurtureTouchpoints,
  useUpdateTouchpoint,
  useCreateTouchpoint,
} from "./use-nurture";
export type {
  ClientNurtureTouchpoint,
  NurtureFilters,
  TouchpointType,
  TouchpointStatus,
} from "./use-nurture";
export {
  // Client Activity
  useClientActivity,
  useProjectActivityFromLog,
  useLogActivity,
} from "./use-activity";
export type { ClientActivity, ActivityType } from "./use-activity";
export {
  useProposals,
  useProposal,
  useClientSafeProposals,
  useClientSafeProposalBundle,
  useProposalStats,
  useCreateProposal,
  useUpdateProposal,
  useAddProposalItem,
  useProposalScheduleItems,
  useUpdateProposalItem,
  useRemoveProposalItem,
  useSendProposal,
  useRetryProposalSend,
  useProposalSendDispatchStatus,
  useNudgeProposal,
  useDeleteProposal,
  // Sections
  useProposalSections,
  useUpsertProposalSection,
  useDeleteProposalSection,
  // Templates
  useProposalTemplates,
  // Engagement
  useProposalEngagement,
  useProposalEngagementStats,
  // Versions & Revisions
  useProposalVersions,
  useEnterRevision,
  useCreateProposalRevision,
  useDuplicateProposal,
  // Signing
  useSignProposal,
  useRecordOfflineSignature,
  useDeclineProposal,
  useRequestProposalChange,
} from "./use-proposals";
export type {
  ProposalEmailDeliveryState,
  ProposalEmailDispatchOutcome,
  ProposalEmailDispatchStatus,
} from "./use-proposals";
export { commercialKeys } from "./use-commercial-documents";
export type {
  Proposal,
  ProposalItem,
  ProposalItemProductSnapshot,
  ClientProposalBundle,
  ClientProposalBoard,
  ClientProposalBoardItem,
  ProposalItemType,
  ProposalFilters,
  ProposalSection,
  ProposalTemplate,
  ProposalEngagementEvent,
  ProposalEngagementStats,
} from "./use-proposals";
export {
  useEarnings,
  useEarningsStats,
  useMonthlyEarnings,
  usePayouts,
  usePayoutStats,
} from "./use-earnings";
export type {
  DesignerEarning,
  DesignerPayout,
  EarningsFilters,
} from "./use-earnings";
export {
  useProfile,
  useUpdateProfile,
  useSettings,
  useUpdateSettings,
  useUploadAvatar,
} from "./use-settings";
export type { UserProfile, UserSettings } from "./use-settings";
export {
  useAvailability,
  useSetAvailability,
  useAvailabilityRealtime,
  availabilityKeys,
  AVAILABILITY_STATUSES,
} from "./use-availability";
export type { AvailabilityStatus } from "./use-availability";
export {
  useRoomScans,
  useRoomScan,
  useClientRoomScans,
  useRoomScanStats,
  useUpdateRoomScan,
  useDeleteRoomScan,
  useAssociateRoomScanWithProject,
  useProjectRoomScans,
  useSignedScanModelUrl,
} from "./use-room-scans";
export type {
  RoomScan,
  RoomScanDimensions,
  RoomScanFeatures,
  RoomScanStyleSignals,
  RoomScanFilters,
} from "./use-room-scans";
export type { RoomScanOwnerKind, RoomScanWithProvenance } from "./use-room-scans";
export {
  useRoomScanPhotos,
  useRoomScanCovers,
  resolveCoverPhoto,
  dedupeRoomScanPhotos,
  publicUrlToPath,
} from "./use-room-scan-photos";
export type { RoomScanPhotoRow, RoomScanPhoto } from "./use-room-scan-photos";
export {
  useRoomFiles,
  useGeneratedRoomFilesByScan,
  useRoomFileMeasurements,
  useScanContextCaptures,
} from "./use-room-files";
export type {
  RoomFile,
  RoomFileListItem,
  RoomFileStatus,
  RoomFilePresent,
  RoomFilePresentStatus,
  RoomFileDrawings,
  RoomFileDrawingSheet,
  RoomFileCertificate,
  RoomFileCertificateAnchor,
  RoomFileToleranceModel,
  RoomFileDimensionCounts,
  RoomFileMeasurement,
  ScanContextCapture,
  ToleranceClass,
} from "./use-room-files";
export {
  useSplatUrl,
  readSplatArtifactRef,
  SPLAT_ARTIFACT_KIND,
} from "./use-splat-url";
export type {
  SplatArtifactRef,
  SplatSource,
  SplatUnavailableReason,
  UseSplatUrlOptions,
} from "./use-splat-url";
export {
  useRenderShots,
  readRendersArtifactPresence,
  RENDERS_ARTIFACT_KIND,
} from "./use-render-shots";
export type {
  RenderShotsSource,
  RenderShotsUnavailableReason,
  UseRenderShotsOptions,
} from "./use-render-shots";
export {
  useOpenDesignRequests,
  useClaimDesignRequest,
  useLeadScans,
  useAcceptDesignRequest,
  useCeremony,
  useSaveCeremonyDraft,
  useCeremonyComplete,
} from "./use-design-requests";
export type {
  OpenDesignRequest,
  ClaimDesignRequestResult,
  LeadRoomScan,
  CeremonySlot,
  MatchCeremony,
  AcceptDesignRequestResult,
  CeremonyCompleteResult,
  CeremonyDraftPatch,
  CeremonyCompleteInput,
} from "./use-design-requests";
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
} from "./use-rooms";
export type {
  Room,
  RoomFeature,
  RoomStyleSignals,
  UserStyleSignals,
  RoomFilters,
  RoomType,
} from "./use-rooms";
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
} from "./use-room-scan-associations";
export {
  useSaveMeasurements,
  useSaveAnnotations,
  useSaveRoomScanData,
} from "./use-room-scan-data";
export { useRoomGeometry } from "./use-room-geometry";
export type {
  RoomGeometryDocument,
  RoomGeometryHeader,
  RoomGeometryElement,
  RoomGeometryData,
} from "./use-room-geometry";
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
  useTransferOrganizationOwnership,
  useSetMyMemberTitle,
  useUpdateMemberStaffRole,
} from "./use-organizations";
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
} from "./use-organizations";
export { useStudioIdentity } from "./use-studio-identity";
export type {
  StudioIdentity,
  StudioIdentitySource,
  UseStudioIdentityParams,
} from "./use-studio-identity";
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
  useIsStudioOwner,
  isStudioOwnerFromRoles,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from "./use-permissions";
export type {
  Role,
  RoleDomain,
  Permission,
  UserRoleAssignment,
  PermissionContext,
} from "./use-permissions";
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
} from "./use-api-keys";
export type {
  ApiKey,
  ApiKeyEnvironment,
  ApiKeyStatus,
  ApiKeyScope,
  CreateApiKeyInput,
  CreateApiKeyResult,
} from "./use-api-keys";
export {
  // Audit Logging (Phase 4)
  useAuditLogs,
  useMyAuditLogs,
  useOrganizationAuditLogs,
  useAuditLogStats,
  useCreateAuditLog,
  useLogAction,
} from "./use-audit-logs";
export type {
  AuditAction,
  AuditResource,
  AuditLog,
  AuditLogWithUser,
  AuditLogFilters,
  CreateAuditLogInput,
} from "./use-audit-logs";
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
} from "./use-gdpr";
export type {
  DataExportStatus,
  DataExportRequest,
  AccountDeletionStatus,
  AccountDeletionRequest,
  DataExportContent,
  ConsentRecord,
  ConsentType,
} from "./use-gdpr";
export {
  // Engagement Tracking
  useEngagementScore,
  useMyEngagementScore,
  useRecentEngagementEvents,
  useTrackEngagementEvent,
} from "./use-engagement";
export type {
  AnalyticsPlatform,
  EngagementTier,
  EngagementScore,
  EngagementEvent,
  EngagementEventFilters,
} from "./use-engagement";
export {
  // Waitlist Management
  useWaitlistEntries,
  useWaitlistStats,
  useWaitlistEntry,
  useInsertWaitlistEntry,
} from "./use-waitlist";
export type {
  WaitlistEntry,
  WaitlistFilters,
  WaitlistStats,
  WaitlistInsertInput,
} from "./use-waitlist";
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
} from "./use-insights";
export type {
  InsightsOverview,
  WaitlistTimeSeriesPoint,
  UtmAttributionRow,
  EngagementTierDistribution,
  TopEngagedUser,
  PlatformActiveUsers,
  FunnelStep,
} from "./use-insights";
export {
  // Notification Preferences
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "./use-notification-preferences";
export {
  // Campaigns
  useCampaigns,
  useCampaign,
  useCreateCampaign,
  useUpdateCampaign,
  useSendCampaign,
  useArchiveCampaign,
  useDeleteCampaign,
  useCancelCampaign,
  useAbVariantStats,
} from "./use-campaigns";
export type { AbVariantStats } from "./use-campaigns";
export {
  // Communications Dashboard
  useCommsDashboard,
  useRecentActivity,
  useUpcomingSends,
} from "./use-comms-dashboard";
export type {
  CommsDashboardStats,
  CommsDashboardData,
  SendVolumePoint,
  RecentActivity,
  ScheduledSend,
} from "./use-comms-dashboard";
export {
  // Email Templates
  useTemplates,
  useTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useTemplatePreview,
} from "./use-templates";
export {
  // Audience Segments
  useAudienceSegments,
  useAudienceSegment,
  useCreateAudienceSegment,
  useUpdateAudienceSegment,
  useDeleteAudienceSegment,
  useEstimateAudienceSize,
} from "./use-audience-segments";
export {
  // Communications Analytics
  useAnalyticsOverview,
  useCampaignComparison,
  useRevenueAttribution,
  useEngagementCohorts,
  useDeliveryHealth,
} from "./use-analytics";
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
} from "./use-analytics";
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
  useAutomationEnrollments,
  useEnrollInAutomation,
  useUnenrollFromAutomation,
} from "./use-automations";
export type {
  AutomationEnrollment,
  AutomationEnrollmentsPage,
} from "./use-automations";
export {
  // Scope Builder
  useProposalScopeRooms,
  useAddScopeRoom,
  useUpdateScopeRoom,
  useRemoveScopeRoom,
  useReorderProposalItems,
  useReorderProposalScopeRooms,
  useProposalPhases,
  useAddProposalPhase,
  useUpdateProposalPhase,
  useRemoveProposalPhase,
  useProposalExclusions,
  useAddExclusion,
  useRemoveExclusion,
  useProposalPaymentMilestones,
  useAddPaymentMilestone,
  useUpdatePaymentMilestone,
  useRemovePaymentMilestone,
  useProposalChangeOrderTerms,
  useUpsertChangeOrderTerms,
  useScopeBuilderSummary,
  // Proposal Schedule Milestones (00324 — Schedule Compose)
  useProposalScheduleMilestones,
  useAddProposalScheduleMilestone,
  useUpdateProposalScheduleMilestone,
  useRemoveProposalScheduleMilestone,
  mapProposalPhaseRowToScheduleInput,
  mapProposalScheduleMilestoneRowToScheduleInput,
} from "./use-scope-builder";
export type {
  ProposalScopeRoom,
  ProposalPhase,
  ProposalExclusion,
  ProposalPaymentMilestone,
  ProposalScheduleMilestone,
} from "./use-scope-builder";
export {
  // Project v2 (scope-aware)
  useProjectV2,
  useProjectNarrativeSections,
  useProjectPalettes,
  useProjectRooms,
  useProjectFFEItems,
  useUpdateFFEItemStatus,
  useUpdateFFEItemPricing,
  useBulkReassignFfeVendor,
  useProjectPhases,
  useCreateProjectPhase,
  useUpdateProjectPhaseStatus,
  useProjectPaymentMilestones,
  useUpdatePaymentMilestoneStatus,
  useProjectFinancials,
} from "./use-project-v2";
export {
  useArchiveProjectSelection,
  useCreateNamedProjectNeed,
  useCreateProjectBoard,
  usePlaceProductInProjectV2,
  useProjectFfeReadiness,
  useProjectReviewAttention,
  usePromoteBoardReferenceToSelection,
  usePublishProjectReview,
  useSupersedeProjectSelection,
  useTriageProjectFfeItems,
} from "./use-project-ffe-ga";
export type {
  ProjectFfeReadiness,
  ProjectReviewAttention,
} from "./use-project-ffe-ga";
export type {
  FFEItemFilters,
  ProjectNarrativeSection,
  ProjectPalette,
  ProjectPaletteSwatch,
  CreateProjectPhaseInput,
  ProjectPhaseTransitionInput,
  ProjectPhaseTransitionReceipt,
  UpdateFFEItemPricingInput,
  BulkReassignFfeVendorInput,
  BulkReassignFfeVendorResult,
} from "./use-project-v2";
export {
  specBookKeys,
  useProjectSpecBook,
  useSpecBookWorkbench,
  useUpdateProjectFfeSpec,
  useUpdateSpecBookChapter,
  useUpdateSpecBookItemSetting,
  usePrepareSpecBookIssue,
  useRenderSpecBookArtifact,
  useCreateSpecBookShare,
  useRevokeDocumentShare,
} from "./use-spec-books";
export type {
  SpecBookAudience,
  SpecBookIssueType,
  SpecBookReadiness,
  SpecBookArtifactStatus,
  SpecBook,
  SpecBookChapter,
  ProjectFfeSpec,
  SpecBookItemSetting,
  SpecBookRevision,
  SpecBookArtifact,
  SpecBookWorkItem,
  SpecBookWorkbench,
  UpdateProjectFfeSpecInput,
  PrepareSpecBookIssueInput,
} from "./use-spec-books";
export {
  // Proposal Activation
  useActivateProposal,
} from "./use-proposal-activation";
export {
  // Proposal Captures (Wave 2)
  useProposalCaptures,
  useAssignCapture,
  useConsumeCapture,
  useDismissCapture,
  // Phase 3 / C-A2 (migration 00516)
  useCommitProposalCapture,
} from "./use-proposal-captures";
export type {
  ProposalCapture,
  UseProposalCapturesOptions,
  AssignCaptureInput,
  ConsumeCaptureInput,
  ConsumeCaptureResult,
  DismissCaptureInput,
  CommitProposalCapturePayload,
  CommitProposalCaptureInput,
  CommitProposalCaptureResult,
} from "./use-proposal-captures";
export {
  // Project Team & Permissions (00084)
  useProjectTeamMembers,
  useAddProjectTeamMember,
  useRemoveProjectTeamMember,
  useProjectPermissions,
  useReassignLead,
} from "./use-project-team";
export type {
  ProjectRole,
  ProjectTeamMember,
  ProjectPermissions,
} from "./use-project-team";
export {
  // Proposal Team (00137)
  useProposalTeamMembers,
  useAddProposalTeamMember,
  useRemoveProposalTeamMember,
} from "./use-proposal-team";
export type { ProposalRole, ProposalTeamMember } from "./use-proposal-team";
export {
  // Scope Changes
  COMPLETED_PROJECT_SCOPE_CHANGE_ERROR,
  useScopeChangeRequests,
  useScopeChangeRequest,
  useCreateScopeChangeRequest,
  useSendScopeChangeRequest,
  useApproveScopeChange,
  useAcceptClientScopeChangeRequest,
  useDeclineScopeChange,
  useApplyScopeChange,
  useCreateClientScopeChangeRequest,
  useCancelClientScopeChangeRequest,
} from "./use-scope-changes";
export type { ClientScopeChangeRequestReceipt } from "./use-scope-changes";
export { useProjectDocuments } from "./use-project-documents";
export type {
  ProjectDocument,
  ProjectDocumentKind,
} from "./use-project-documents";
export {
  useClientNotifications,
  useMarkClientNotificationRead,
  useMarkAllClientNotificationsRead,
} from "./use-client-notifications";
export type {
  ClientNotification,
  ClientNotificationKind,
} from "./use-client-notifications";
export {
  useUploadCommsAttachment,
  useSignedCommsAttachmentUrl,
} from "./use-comms-attachments";
export { useProductBySourceUrl } from "./use-product-source-url";
export {
  // Duplicate Detection
  useDuplicateCheck,
  useDuplicateReport,
  useBulkDuplicateScan,
  useDismissDuplicate,
  useMarkAsDuplicate,
  useMergeDuplicates,
} from "./use-duplicate-detection";
export type {
  DuplicateMatch,
  DuplicateCheckResult,
  DuplicateGroup,
  DuplicateReport,
} from "./use-duplicate-detection";
export {
  // Notification DLQ (admin)
  useDlqEntries,
  useFailedNotificationCount,
  useRetryDlqEntry,
  useBulkRetryDlq,
  dlqKeys,
} from "./use-dlq";
export type {
  DlqEntry,
  DlqFilters,
  DlqListResult,
  RetryDlqResult,
  BulkRetryDlqResult,
} from "./use-dlq";
export {
  useCompanionConversation,
  useCompanionHistory,
  useSendCompanionMessage,
  useCompanionQuickActions,
} from "./use-companion";
export {
  useInboxNotifications,
  useInboxMessages,
  useUnreadInboxCount,
  useInboxNotificationsRealtime,
  inboxKeys,
} from "./use-inbox";
export type {
  InboxNotification,
  InboxNotificationFilters,
  InboxNotificationMetadata,
  InboxNotificationStatus,
  InboxNotificationChannel,
  InboxMessage,
} from "./use-inbox";
export type {
  CompanionMessage,
  CompanionResponse,
  QuickAction,
  CompanionContext,
  CompanionConversation,
} from "./use-companion";

// ═══════════════════════════════════════════════════════════════════════════
// In-app messaging (Phase 2 — see docs/prds/in-app-messaging-prd.md)
// ═══════════════════════════════════════════════════════════════════════════
export {
  useThreads,
  useThread,
  useThreadMessages,
  useSendMessage,
  useEditMessage,
  useDeleteMessage,
  useMarkThreadRead,
  useArchiveThread,
  useMuteThread,
  useThreadParticipants,
  useAddParticipant,
  useRemoveParticipant,
  useUnreadCount,
  useThreadRealtime,
  useInboxRealtime,
  useTypingIndicator,
  useQuickReplies,
  useUpsertQuickReply,
  useDeleteQuickReply,
  useStartDirectThread,
  useStartProjectThread,
  useStartVendorBrief,
  useVendorProfiles,
  useMyThreadOverrides,
  useUpdateThreadNotificationPref,
  useCoordinationItemThread,
  useEnsureCoordinationItemThread,
  commsKeys,
} from "./use-comms";
export type {
  ThreadKind,
  ParticipantRole,
  NotificationPref,
  CommsThread,
  CommsParticipant,
  CommsMessage,
  CommsMessageAttachment,
  ThreadSummary,
  UnreadSummaryRow,
  QuickReply,
  TypingUser,
  UseThreadsParams,
  SendMessageInput,
  ThreadOverride,
  EnsureItemThreadInput,
} from "./use-comms";

// ═══════════════════════════════════════════════════════════════════════════
// Phase deliverables + gates (Wave 4 — see migrations 00133, 00134)
// ═══════════════════════════════════════════════════════════════════════════
export {
  usePhaseDeliverables,
  useAddDeliverable,
  useUpdateDeliverable,
  useToggleDeliverableCompleted,
  useReorderDeliverables,
  useDeleteDeliverable,
} from "./use-phase-deliverables";
export type { PhaseDeliverable } from "./use-phase-deliverables";

export {
  usePhaseGates,
  useAddGate,
  useUpdateGate,
  useRemoveGate,
  useSatisfyGate,
  useDesignerOverrideGate,
  computePhaseGateStatus,
} from "./use-phase-gates";
export type {
  PhaseGate,
  PhaseGateKind,
  PhaseGateStatus,
} from "./use-phase-gates";

// ═══════════════════════════════════════════════════════════════════════════
// Phase templates (Wave 5 — see migration 00135)
// ═══════════════════════════════════════════════════════════════════════════
export {
  usePhaseTemplates,
  useApplyPhaseTemplate,
} from "./use-phase-templates";
export type {
  PhaseTemplate,
  PhaseTemplatePhase,
  PhaseTemplateDeliverable,
  PhaseTemplateGate,
} from "./use-phase-templates";

// ═══════════════════════════════════════════════════════════════════════════
// Color palette + paint colors (Wave 3 — see migrations 00131, 00132)
// ═══════════════════════════════════════════════════════════════════════════
export {
  usePalettes,
  usePalette,
  useUpsertPalette,
  useDeletePalette,
  useUpsertSwatch,
  useDeleteSwatch,
  useReorderSwatches,
} from "./use-palettes";
export type {
  PaletteSwatchRole,
  ProposalPalette,
  PaletteSwatch,
  PaletteWithSwatches,
  UpsertPaletteInput,
  UpsertSwatchInput,
} from "./use-palettes";
export { useSearchPaintColors, usePaintColor } from "./use-paint-colors";
export type { PaintColor, PaintColorBrand } from "./use-paint-colors";

// ═══════════════════════════════════════════════════════════════════════════
// Procurement Workspace v1 (Wave 1.2 — see migration 00148)
// + Sprint 2 / Wave 2.2 (Receiving, damage claims, calendar — migration 00150)
// + Sprint 3 / Wave 3.2 (QBO Bookkeeper Export — supabase/functions/qbo-export)
// ═══════════════════════════════════════════════════════════════════════════
export {
  usePurchaseOrders,
  // W1-T5 — cross-project FF&E items (rows-per-item By Status view)
  useProcurementItems,
  usePOPayments,
  fetchPOPayments,
  useVendorPaymentTerms,
  useUpdateVendorPaymentTerms,
  useCreatePurchaseOrder,
  // W3-T1 — atomic create RPC + vendor acknowledgment (migration 00186)
  useLogPOAcknowledgment,
  useLogPaymentPaid,
  useAdvancePaymentToDue,
  useUpdatePurchaseOrderETA,
  // Wave 1 procurement overhaul — DB triggers (00184) own state propagation
  useUpdatePurchaseOrderStatus,
  invalidateFfeCaches,
  // Phase 4 — Stripe Checkout, designer pays at order time (Order via Patina)
  useStartPoCheckout,
  // Sprint 2 — Receiving, damage claims, calendar
  useReceivingInspections,
  useDamageClaims,
  useDeliveryCalendar,
  useTodayProcurementCounts,
  useCreateReceivingInspection,
  useUpdateDamageClaim,
  autoDraftDamageClaimDescription,
  // Sprint 3 / Wave 3.2 — QBO Bookkeeper Export
  useQboExport,
  useQboExportPreview,
  // Wave 4 / W4-T3 — po-send edge function (PO PDFs + vendor email)
  useSendPurchaseOrder,
  // Sprint 3 / Wave 3.2 — Procurement notifications (migration 00151)
  useProcurementNotifications,
  useProcurementUnreadCount,
  useMarkProcurementNotificationRead,
  // Sprint 3 / Wave 3.3 — Capture-to-slot integration
  useAssignProductToFfeSlot,
} from "./use-procurement";
export type {
  PaymentPattern,
  POPaymentKind,
  POPaymentState,
  POStatus,
  PurchaseOrder,
  POPayment,
  POFilters,
  // W1-T5 — cross-project FF&E items (rows-per-item By Status view)
  FFEItemStatus,
  ProcurementItemRow,
  ProcurementItemFilters,
  CreatePurchaseOrderInput,
  LogPOAcknowledgmentInput,
  UpdatePurchaseOrderStatusInput,
  // Sprint 2 — Receiving, damage claims, calendar
  ReceivingInspectionOutcome,
  DamageClaimState,
  ReceivingInspection,
  DamageClaim,
  DeliveryEvent,
  ReceivingInspectionFilters,
  DamageClaimFilters,
  CreateReceivingInspectionInput,
  // W5-T2 — partial receiving (per-item received quantities)
  ReceivingInspectionItemInput,
  CreateReceivingInspectionResult,
  UpdateDamageClaimInput,
  TodayProcurementCounts,
  // Sprint 3 / Wave 3.2 — QBO Bookkeeper Export
  QboExportInput,
  QboExportPreview,
  // Wave 4 / W4-T3 — po-send edge function (PO PDFs + vendor email)
  PurchaseOrderSendMode,
  SendPurchaseOrderInput,
  SendPurchaseOrderResult,
  // Sprint 3 / Wave 3.2 — Procurement notifications (migration 00151)
  ProcurementNotificationKind,
  ProcurementNotification,
} from "./use-procurement";

// ═══════════════════════════════════════════════════════════════════════════
// Mood boards (Wave 1 — see migration 00179)
// ═══════════════════════════════════════════════════════════════════════════
export {
  useBoards,
  useBoard,
  useBoardsWithItems,
  useUpsertBoard,
  useDuplicateBoard,
  useDeleteBoard,
  useAddBoardItem,
  useUpdateBoardItem,
  useDeleteBoardItem,
  useApplyBoardRoomState,
  useSaveBoardLayout,
  useProjectBoards,
  // B8 (00272/00273) — project-owned live boards
  useProjectOwnedBoards,
  useContinueBoardInProject,
  // Pure helper (00264 — exported for unit tests + reuse)
  summarizeBoard,
  normalizeBoardOwner,
  boardOwnerQueryKeys,
} from "./use-boards";
export type {
  BoardOwnerInput,
  BoardItemType,
  BoardStatus,
  BoardSection,
  ProposalBoard,
  ProposalBoardSummary,
  ProposalBoardItem,
  BoardWithItems,
  ProjectBoard,
  ProjectBoardItem,
  UpsertBoardInput,
  AddBoardItemInput,
  UpdateBoardItemInput,
  ApplyBoardRoomStateInput,
  BoardLayoutPosition,
} from "./use-boards";
export {
  emptyBoardVerdictCounts,
  summarizeBoardVerdicts,
  deriveBoardReactionStatus,
  deriveApprovedBoardItemIds,
  verdictAuthor,
  latestVerdictByAuthor,
} from "./board-verdicts";
export type {
  BoardVerdictCounts,
  BoardVerdictProjection,
  BoardItemVerdictProjection,
  BoardReactionStatus,
  BoardItemFeedbackRow,
} from "./board-verdicts";
export { useBoardReactionStatuses } from "./use-board-reaction-status";
export {
  useBoardsReactionRollup,
} from "./use-board-reaction-rollup";
export type {
  BoardReactionRollupEntry,
  BoardsReactionRollup,
} from "./use-board-reaction-rollup";

// ═══════════════════════════════════════════════════════════════════════════
// Invoicing money core (Wave 1 — see migration 00178)
// ═══════════════════════════════════════════════════════════════════════════
export {
  useInvoices,
  useInvoice,
  useProjectInvoices,
  useCreateDraftInvoice,
  useUpdateDraftInvoice,
  useDeleteDraftInvoice,
  useUpsertLineItems,
  useDeleteLineItem,
  useIssueInvoice,
  useSendInvoice,
  useChaseInvoice,
  useRecordPayment,
  useStartCheckout,
  InvoiceCheckoutError,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useVoidInvoice,
  useArAging,
  useFfeInvoiceCoverage,
  computeArAging,
  invoiceDaysOverdue,
  AR_BUCKET_LABELS,
} from "./use-invoices";
export type {
  Invoice,
  ArAging,
  ArAgingBucket,
  ArBucketKey,
  InvoiceStatus,
  InvoiceLineKind,
  InvoiceLineItem,
  InvoicePayment,
  InvoicePaymentMethod,
  InvoicePaymentStatus,
  InvoiceCheckoutReceipt,
  InvoiceCheckoutEvidence,
  InvoiceFilters,
  DraftLineInput,
  CreateDraftInvoiceInput,
  UpdateDraftInvoiceInput,
  FfeCoverageState,
  FfeItemCoverage,
  FfeInvoiceCoverageMap,
  OnlinePaymentMethod,
  InvoicePaymentOptions,
  NotifyCheckIntentResult,
} from "./use-invoices";

// ═══════════════════════════════════════════════════════════════════════════
// Studio billing settings (invoice payment-method surcharge config —
// migration 00428)
// ═══════════════════════════════════════════════════════════════════════════
export {
  useStudioBillingSettings,
  useUpdateStudioBillingSettings,
} from "./use-studio-billing";
export type { StudioBillingSettings } from "./use-studio-billing";

// ═══════════════════════════════════════════════════════════════════════════
// Direct orders — client "buy now" on Patina-managed products, the third
// payable_type on the consolidated Stripe rail (migration 00267)
// ═══════════════════════════════════════════════════════════════════════════
export {
  useDirectOrders,
  useCreateDirectOrder,
  useStartDirectOrderCheckout,
} from "./use-direct-orders";
export type {
  DirectOrder,
  DirectOrderStatus,
  DirectOrderShipping,
} from "./use-direct-orders";

// Aesthete Engine — Wave 3B hooks batch (design §5.2 prefill, §8 taste, §8.5 Your Eye)
export {
  useProductDnaDraft,
  resolveSpectrumPrefill,
  summarizeDraftFacts,
} from "./use-product-dna";
export type {
  ProductDnaDraft,
  DnaDraftBody,
  DnaDraftStyle,
  DnaDraftMaterial,
  DnaDraftPatina,
  SpectrumPrefill,
  SpectrumPrefillSource,
} from "./use-product-dna";
export {
  useDueTasteProbes,
  useJudgmentPool,
  useMyJudgmentCount,
  useSubmitTasteJudgment,
  useSubmitTasteCorrection,
  useMyTasteProfile,
  useMySignatureBiases,
  useUpdateMyBiases,
  useMyStyleConfidence,
  buildJudgmentDeck,
  nudgeBiasStrength,
} from "./use-aesthete-taste";
export type {
  JudgmentChoice,
  JudgmentContext,
  JudgmentProduct,
  JudgmentPair,
  TasteProbeRow,
  SubmitJudgmentInput,
  SubmitJudgmentResult,
  SubmitCorrectionInput,
  TasteProfileRow,
  BiasStatus,
  SignatureBiasRow,
  BiasOverride,
  StyleConfidenceRow,
} from "./use-aesthete-taste";
// 3C — the Engine's ask path (aesthete-ask edge fn). Appended at the END per
// the wave-3 barrel contention rule (3B owns this file's body this wave;
// conductor resolves the export list on merge).
export { useEngineAsk } from "./use-engine-ask";
export type {
  EngineAskItem,
  EngineAskMatchSource,
  EngineAskResult,
  UseEngineAskOptions,
} from "./use-engine-ask";
// Feedback layer (docs/ledger/patina-feedback-layer-prd.md) — capture, ledger,
// triage, close-the-loop.
export {
  useFeedback,
  useFeedbackNote,
  useUnseenShipped,
  useSignedScreenshotUrl,
  useCreateFeedback,
  useSetFeedbackStatus,
  useReactToFeedback,
  useReplyToFeedback,
  useMarkFeedbackSeen,
} from "./use-feedback";
export type {
  Feedback,
  FeedbackBucket,
  FeedbackWeight,
  FeedbackStatus,
  FeedbackEvent,
  FeedbackEventKind,
  FeedbackFilters,
  CreateFeedbackInput,
} from "./use-feedback";

// Schedule & Boards Wave 2 · Track C — document shares (C2) + per-line verdicts (C3)
export {
  useProposalShares,
  useBoardShares,
  useCreateShare,
  useCreateBoardShare,
  useRevokeShare,
  useActiveBoardShareIds,
  fetchActiveBoardShareIds,
} from "./use-document-shares";
export type { DocumentShare, CreatedShare } from "./use-document-shares";

export {
  useBoardTemplates,
  useSaveBoardAsTemplate,
  useMaterializeBoardTemplate,
  useRenameBoardTemplate,
  useDeleteBoardTemplate,
} from "./use-board-templates";
export type { BoardTemplate } from "./use-board-templates";

export { useRecentBoards } from "./use-recent-boards";
export type { RecentBoard } from "./use-recent-boards";
export {
  useProposalFeedback,
  useClientProposalFeedback,
  useBoardFeedback,
  useBoardItemFeedbackByBoard,
  useClientBoardFeedback,
  useItemFeedbackThread,
  useSubmitVerdict,
  useReplyToItemFeedback,
  useResolveFeedback,
} from "./use-item-feedback";
export type {
  ItemFeedback,
  ItemFeedbackEvent,
  Verdict,
} from "./use-item-feedback";

// Schedule & Boards Wave 3 · Track A — Designer-Taught Intelligence (A1/C4/B6/A3)
export {
  useTaughtAlternatives,
  useLogSuggestionEvent,
  useSwapLineToProduct,
  useEscalateFeedbackToDecision,
} from "./use-taught-alternatives";
export type {
  TaughtAlternative,
  SuggestionContext,
  SuggestionAction,
  SuggestionEventInput,
} from "./use-taught-alternatives";
export { useCaptureFromUrl } from "./use-capture-from-url";
export type { CaptureFromUrlResult } from "./use-capture-from-url";

// The Document · Schedule (C4) — the Spine's data layer: read-only
// schedule_milestones/schedule_revisions + useResolvedSchedule, the single
// door the ScheduleSpine UI consumes.
export {
  useScheduleMilestones,
  useScheduleRevisions,
  useProjectStartDate,
  useResolvedSchedule,
  mapPhaseRowToScheduleInput,
  mapMilestoneRowToScheduleInput,
} from "./use-schedule";
export type {
  PhaseRow,
  MilestoneRow,
  ScheduleRevisionRow,
  UseResolvedScheduleResult,
} from "./use-schedule";

export {
  invalidateProjectWorkflow,
  projectWorkflowQueryKey,
  useProjectWorkflow,
  type ProjectWorkflowRow,
} from "./use-project-workflow";

// The Document · Schedule (C4) — Slice 03 (Compose): write paths for
// schedule_milestones + the project_phases chain columns, delete-with-relink,
// and the two birth RPCs (seed_project_schedule_from_template /
// copy_schedule_as_built). use-schedule.ts above stays read-only.
export {
  useProjectPhaseCounts,
  useAddScheduleMilestone,
  useUpdateScheduleMilestone,
  useRemoveScheduleMilestone,
  useUpdateProjectPhaseChain,
  useDeletePhaseWithRelink,
  useSeedProjectScheduleFromTemplate,
  useCopyScheduleAsBuilt,
  useCommitScheduleEdit,
  serializeRippleEditForRpc,
} from "./use-schedule-compose";
export type {
  DeleteProjectPhaseReceipt,
  RipplePendingEditInput,
  SerializedRippleEdit,
} from "./use-schedule-compose";

// The shared invalidate-then-materialize tail every schedule-shaping
// mutation hook above calls in its onSuccess (00480).
export { settleScheduleWrite } from "./schedule-write-settle";

// The Document · Schedule — Wave 2 (R109/R110, I130): schedule_proposals, the
// one home for every proposed anchor, and its two designer acts.
export {
  useScheduleProposals,
  useCommitScheduleProposal,
  useDismissScheduleProposal,
  SCHEDULE_PROPOSAL_READ_LIMIT,
} from "./use-schedule-proposals";
export type { ScheduleProposalRow } from "./use-schedule-proposals";

// The Document · Schedule — Wave 3 (R112, I126): the install window's three
// faces. Hold is studio-only and moves nothing; confirm writes the anchor;
// release unpins it, both through the same disclosed-impact door.
export {
  useInstallWindow,
  useHoldInstallWindow,
  useConfirmInstallWindow,
  useReleaseInstallWindow,
} from "./use-install-window";
export type {
  InstallWindowRow,
  ScheduleDisclosedImpactInput,
} from "./use-install-window";

// The Room View (W2-T2) — The Rooms roster's data hook: room_scan_documents
// rows + their geometry elements, one query per scan set.
export { useRoomRoster } from "./use-room-roster";
export type {
  RoomRosterScan,
  RoomRosterScanRow,
  RoomRosterGeometryElementRow,
} from "./use-room-roster";

// Field Capture P2 (Layer 3) — Refine's published artifacts: the delivery
// record in `room_files.present.refine` (an OBJECT — `present.refine_engine`
// beside it is the engine NAME as TEXT, which is what 00377's admin view
// reads) plus the documents it points at. Gate at the QUERY level
// (`enabled: false`) so a flag-off costs zero database and zero Storage calls.
export {
  useScanRefineArtifacts,
  parseScanRefineRecord,
  DEFAULT_REFINE_ARTIFACT_NAMES,
  REFINE_PRESENT_KEY,
  REFINE_DELIVERY_CONTRACT,
} from "./use-scan-refine-artifacts";
export type {
  ScanRefineArtifacts,
  ScanRefineArtifactSet,
  UseScanRefineArtifactsOptions,
} from "./use-scan-refine-artifacts";

// The Rolodex (Call Sheet Wave 2, R1) — the shared studio contact book:
// `studio_contacts` (00417), fully shared at the studio, plus the
// party→rolodex promote flow.
export {
  useStudioContacts,
  useStudioContact,
  useAddStudioContact,
  useUpdateStudioContact,
  useArchiveStudioContact,
  useRestoreStudioContact,
  usePromoteToStudioContact,
  useStudioContactHistory,
  studioContactKeys,
} from "./use-studio-contacts";
export type {
  StudioContact,
  AddStudioContactInput,
  UpdateStudioContactInput,
  StudioContactFilters,
  StudioContactHistory,
  PromoteToStudioContactInput,
} from "./use-studio-contacts";

// The Plan Room (00429) — sheets, prints, batches, issues, transmittals: the
// bundle query, the ceremonies, and the client-portal shared set.
export {
  planRoomKeys,
  usePlanRoom,
  usePlanRoomHoldings,
  usePlanIssuePreview,
  useFilePlanPrints,
  useSetPlanSheetState,
  useDeletePlanSheet,
  useCreatePlanIssue,
  useCreatePlanTransmittal,
  useReissuePlanTransmittalLink,
  useRevokePlanTransmittalLink,
  useClientPlanSet,
} from "./use-plan-room";
export type {
  PlanSheet,
  PlanPrint,
  PlanPrintBatch,
  PlanIssue,
  PlanIssuePrint,
  PlanTransmittal,
  PlanTransmittalTokenSafe,
  PlanRoomBundle,
  FilePlanPrintsResult,
  PlanIssuePreview,
  CreatePlanIssueResult,
  CreatePlanTransmittalResult,
  PlanRoomHoldings,
  PrintUploadInput,
  FilePlanPrintEntry,
  ClientPlanSheet,
} from "./use-plan-room";
export {
  useCaptureMediaUrls,
  captureMediaUrlsKey,
  CAPTURE_MEDIA_BUCKET,
  CAPTURE_MEDIA_TTL_SECONDS,
} from "./use-capture-media";
export { useCaptureVenueLabels } from "./use-capture-venues";
