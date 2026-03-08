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
export { NewLeadDesigner } from './templates/new-lead-designer';
export type { NewLeadDesignerProps } from './templates/new-lead-designer';
export { LeadExpiring } from './templates/lead-expiring';
export type { LeadExpiringProps } from './templates/lead-expiring';
export { ClientConfirmation } from './templates/client-confirmation';
export type { ClientConfirmationProps } from './templates/client-confirmation';
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
export { FoundingCircleUpdate } from './templates/founding-circle-update';
export type { FoundingCircleUpdateProps } from './templates/founding-circle-update';

// Campaign templates
export { CampaignProductLaunch } from './templates/campaign-product-launch';
export type { CampaignProductLaunchProps, LaunchProduct } from './templates/campaign-product-launch';
export { CampaignSeasonal } from './templates/campaign-seasonal';
export type { CampaignSeasonalProps, SeasonalProduct } from './templates/campaign-seasonal';
export { CampaignMakerSpotlight } from './templates/campaign-maker-spotlight';
export type { CampaignMakerSpotlightProps, SpotlightProduct } from './templates/campaign-maker-spotlight';
export { CampaignReengagement } from './templates/campaign-reengagement';
export type { CampaignReengagementProps, PersonalizedProduct } from './templates/campaign-reengagement';

// Block renderer (pure string functions — no React dependency)
export { renderTemplate, renderBlock, renderBlocks } from './block-renderer';
export type { RenderContext } from './block-renderer';

// Send utilities
export { sendEmail, sendBatchEmails, generateUnsubscribeHeaders, SENDERS } from './send';
export type { SendEmailOptions, SendEmailResult } from './send';
