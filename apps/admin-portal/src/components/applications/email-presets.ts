import type { ApplicationType } from '@/services/applications';

export interface EmailPreset {
  slug: string;
  label: string;
  subject: string;
  html: string;
}

const signOff = `<p style="margin-top:24px">Warmly,<br/>The Patina Team</p>`;

const designerApproved: EmailPreset = {
  slug: 'designer_approved',
  label: 'Designer — Approved',
  subject: 'Welcome to the Founding 50, {{first_name}}',
  html: `<p>Hi {{first_name}},</p>
<p>Thank you for applying to join the Founding 50. We'd love to have you.</p>
<p>You'll receive a separate email with a link to activate your account and set your password. Once you're in, reach out any time — Leah and Kody read every note.</p>
${signOff}`,
};

const designerRejected: EmailPreset = {
  slug: 'designer_rejected',
  label: 'Designer — Not this cohort',
  subject: 'Your Patina application',
  html: `<p>Hi {{first_name}},</p>
<p>Thank you for applying to the Founding 50. We reviewed your submission carefully and, for this cohort, we aren't moving forward.</p>
<p>This isn't a reflection of your craft — we're being very selective about fit for this first group. We'd welcome a future application as Patina grows.</p>
${signOff}`,
};

const designerReceived: EmailPreset = {
  slug: 'designer_received',
  label: 'Designer — Received / follow-up',
  subject: 'We received your Patina application',
  html: `<p>Hi {{first_name}},</p>
<p>A quick note to confirm we've received your Founding 50 application. We review submissions weekly and will be in touch within 7 days.</p>
<p>In the meantime, if there's anything you'd like to add about your practice or what drew you to Patina, just reply to this email.</p>
${signOff}`,
};

const makerApproved: EmailPreset = {
  slug: 'maker_approved',
  label: 'Maker — Approved',
  subject: 'Welcome to Patina, {{contact_name}}',
  html: `<p>Hi {{contact_name}},</p>
<p>We'd love to have {{brand_name}} as a Founding Partner. Thank you for applying.</p>
<p>You'll receive a separate email with an invite to set up your account. Once you're in, our team will walk you through onboarding your catalog and collections.</p>
${signOff}`,
};

const makerRejected: EmailPreset = {
  slug: 'maker_rejected',
  label: 'Maker — Not this cohort',
  subject: 'Your Patina Founding Partner application',
  html: `<p>Hi {{contact_name}},</p>
<p>Thank you for sharing {{brand_name}} with us. We reviewed your application carefully and, for our launch cohort of 15 makers, we aren't able to move forward at this time.</p>
<p>We're being very selective about the initial launch group. We'd be glad to revisit as we expand.</p>
${signOff}`,
};

const makerReceived: EmailPreset = {
  slug: 'maker_received',
  label: 'Maker — Received / follow-up',
  subject: 'We received your Patina application',
  html: `<p>Hi {{contact_name}},</p>
<p>Confirming we received your application for {{brand_name}}. Leah reviews every submission personally — expect to hear from our maker relations team within 2 weeks.</p>
${signOff}`,
};

export const EMAIL_PRESETS: Record<ApplicationType, EmailPreset[]> = {
  designer: [designerReceived, designerApproved, designerRejected],
  maker: [makerReceived, makerApproved, makerRejected],
};
