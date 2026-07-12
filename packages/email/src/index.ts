// Components
export { BaseEmailLayout } from './components/BaseEmailLayout';
export type { BaseEmailLayoutProps } from './components/BaseEmailLayout';
export { Button } from './components/Button';
export type { ButtonProps } from './components/Button';
export { ProvenanceBar } from './components/ProvenanceBar';
export type { ProvenanceBarProps } from './components/ProvenanceBar';

// Templates
export { WelcomeVerification } from './templates/welcome-verification';
export type { WelcomeVerificationProps } from './templates/welcome-verification';
export { PasswordReset } from './templates/password-reset';
export type { PasswordResetProps } from './templates/password-reset';
export { SecurityAlert } from './templates/security-alert';
export type { SecurityAlertProps } from './templates/security-alert';

// Designer templates
export { ReviewRequest } from './templates/review-request';
export type { ReviewRequestProps } from './templates/review-request';
export { NewLeadDesigner } from './templates/new-lead-designer';
export type { NewLeadDesignerProps } from './templates/new-lead-designer';
export { LeadExpiring } from './templates/lead-expiring';
export type { LeadExpiringProps } from './templates/lead-expiring';
export { ClientConfirmation } from './templates/client-confirmation';
export type { ClientConfirmationProps } from './templates/client-confirmation';
export { WorkspaceInvite } from './templates/workspace-invite';
export type { WorkspaceInviteProps } from './templates/workspace-invite';
export { OrderConfirmation } from './templates/order-confirmation';
export type { OrderConfirmationProps, OrderItem } from './templates/order-confirmation';
export { PaymentReceipt } from './templates/payment-receipt';
export type { PaymentReceiptProps } from './templates/payment-receipt';

// Consumer templates
export { PriceDrop } from './templates/price-drop';
export type { PriceDropProps } from './templates/price-drop';
export { BackInStock } from './templates/back-in-stock';
export type { BackInStockProps } from './templates/back-in-stock';
export { WeeklyInspiration } from './templates/weekly-inspiration';
export type { WeeklyInspirationProps, InspirationProduct } from './templates/weekly-inspiration';
export { WeeklyPulse } from './templates/weekly-pulse';
export type { WeeklyPulseProps } from './templates/weekly-pulse';
export { FoundingCircleUpdate } from './templates/founding-circle-update';
export type { FoundingCircleUpdateProps } from './templates/founding-circle-update';
export { ManufacturerOutreach } from './templates/manufacturer-outreach';
export type { ManufacturerOutreachProps } from './templates/manufacturer-outreach';

// Campaign templates
export { CampaignProductLaunch } from './templates/campaign-product-launch';
export type { CampaignProductLaunchProps, LaunchProduct } from './templates/campaign-product-launch';
export { CampaignSeasonal } from './templates/campaign-seasonal';
export type { CampaignSeasonalProps, SeasonalProduct } from './templates/campaign-seasonal';
export { CampaignMakerSpotlight } from './templates/campaign-maker-spotlight';
export type { CampaignMakerSpotlightProps, SpotlightProduct } from './templates/campaign-maker-spotlight';
export { CampaignReengagement } from './templates/campaign-reengagement';
export type { CampaignReengagementProps, PersonalizedProduct } from './templates/campaign-reengagement';

// In-app messaging templates (in-app-messaging-prd v1.0)
export { InAppMessage } from './templates/in-app-message';
export type { InAppMessageProps } from './templates/in-app-message';
export { InAppMessageMention } from './templates/in-app-message-mention';
export type { InAppMessageMentionProps } from './templates/in-app-message-mention';

// Designer onboarding templates (Founding Onboarding — Wave 3a)
// Invite track (T0/N1/N2)
export { DesignerInvite } from './templates/designer-invite';
export { DesignerInviteNudge1 } from './templates/designer-invite-nudge-1';
export { DesignerInviteNudge2 } from './templates/designer-invite-nudge-2';
// Spine (W0, E2-E10)
export { DesignerWelcome } from './templates/designer-welcome';
export { OnboardingDocumentModel } from './templates/onboarding-document-model';
export { OnboardingCapture } from './templates/onboarding-capture';
export { OnboardingLibrary } from './templates/onboarding-library';
export { OnboardingDraftingRoom } from './templates/onboarding-drafting-room';
export { OnboardingOpenRequests } from './templates/onboarding-open-requests';
export { OnboardingHours } from './templates/onboarding-hours';
export { OnboardingBooks } from './templates/onboarding-books';
export { OnboardingAesthete } from './templates/onboarding-aesthete';
export { OnboardingSixWeeks } from './templates/onboarding-six-weeks';
// Milestones (M1-M4)
export { MilestoneProposalSent } from './templates/milestone-proposal-sent';
export { MilestoneProposalSigned } from './templates/milestone-proposal-signed';
export { MilestoneRequestClaimed } from './templates/milestone-request-claimed';
export { MilestoneFirstPayment } from './templates/milestone-first-payment';

// Block renderer (pure string functions — no React dependency)
export { renderTemplate, renderBlock, renderBlocks, interpolate } from './block-renderer';
export type { RenderContext } from './block-renderer';

// Send utilities
export { sendEmail, sendHtmlEmail, sendBatchEmails, generateUnsubscribeHeaders, SENDERS } from './send';
export type { SendEmailOptions, SendHtmlEmailOptions, SendEmailResult } from './send';
