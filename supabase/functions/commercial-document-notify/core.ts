import {
  ctaButton,
  escapeHtml,
  heading,
  muted,
  paragraph,
  renderBrandedShell,
  spacer,
} from '../_shared/branded-email.ts';

export type CommercialTransition =
  | 'client_signed'
  | 'executed'
  | 'budget_published'
  | 'furnishings_sent'
  | 'furnishings_executed'
  | 'deposit_ready';

export interface CommercialEmailInput {
  transition: CommercialTransition;
  audience: 'client' | 'studio';
  documentTitle: string;
  documentKind: string;
  signerName?: string | null;
  recipientName?: string | null;
  counterpartyName?: string | null;
  portalUrl: string;
  ceilingCents?: number | null;
  retainerCents?: number | null;
}

export interface RenderedCommercialEmail {
  subject: string;
  html: string;
  message: string;
}

function money(cents?: number | null): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function renderCommercialEmail(input: CommercialEmailInput): RenderedCommercialEmail {
  const recipient = escapeHtml(input.recipientName || 'there');
  const title = escapeHtml(input.documentTitle);
  const signer = escapeHtml(input.signerName || 'Your client');
  const counterparty = escapeHtml(input.counterpartyName || 'your design team');
  const ceiling = money(input.ceilingCents);
  const retainer = money(input.retainerCents);

  let subject: string;
  let eyebrow: string;
  let headline: string;
  let body: string;
  let cta: string;
  let message: string;

  switch (input.transition) {
    case 'client_signed':
      if (input.audience === 'client') {
        subject = `Signature received: ${input.documentTitle}`;
        eyebrow = 'Your signature is recorded';
        headline = 'Studio countersignature is next';
        body = `We recorded your signature on &ldquo;<strong>${title}</strong>&rdquo;. The agreement is not executed and design work is not active until ${counterparty} countersigns.`;
        cta = 'View signed agreement';
        message = `Your signature on ${input.documentTitle} is recorded; studio countersignature is still required.`;
      } else {
        subject = `Client signed: ${input.documentTitle}`;
        eyebrow = 'Client signature received';
        headline = 'Ready for studio countersignature';
        body = `${signer} signed &ldquo;<strong>${title}</strong>&rdquo;. The agreement is not executed and no project has been created until the studio countersigns.`;
        cta = 'Review and countersign';
        message = `${input.signerName || 'The client'} signed ${input.documentTitle}; studio countersignature is required.`;
      }
      break;
    case 'executed':
      subject = `Agreement executed: ${input.documentTitle}`;
      eyebrow = 'Design services authorized';
      headline = 'Your design engagement is active';
      body = `Both you and ${counterparty} have signed &ldquo;<strong>${title}</strong>&rdquo;. Design time can now be tracked under the signed authority.`;
      cta = 'View your project';
      message = `${input.documentTitle} is fully executed and the design engagement is active.`;
      break;
    case 'budget_published':
      subject = `Working budget ready: ${input.documentTitle}`;
      eyebrow = 'Budget checkpoint';
      headline = 'Review the working budget';
      body = `${counterparty} published a room-by-room working budget for <strong>${title}</strong>. Acknowledging it confirms planning alignment; it does not authorize purchasing.`;
      cta = 'Review working budget';
      message = `A nonbinding working-budget checkpoint is ready for ${input.documentTitle}.`;
      break;
    case 'furnishings_sent':
      subject = `Furnishings authorization ready: ${input.documentTitle}`;
      eyebrow = 'FF&E authorization';
      headline = 'Review this furnishings wave';
      body = `${counterparty} prepared &ldquo;<strong>${title}</strong>&rdquo;. Only the listed quantities and client prices become purchasing authority after signature and execution.`;
      cta = 'Review authorization';
      message = `${input.documentTitle} is ready for review and signature.`;
      break;
    case 'furnishings_executed':
      subject = `Furnishings authorized: ${input.documentTitle}`;
      eyebrow = 'FF&E wave executed';
      headline = 'This furnishings wave is authorized';
      body = `&ldquo;<strong>${title}</strong>&rdquo; is signed and executed. Procurement remains limited to its immutable item, quantity, and price snapshot.`;
      cta = 'View authorization';
      message = `${input.documentTitle} is executed and its signed items are authorized.`;
      break;
    case 'deposit_ready':
      subject = `Deposit ready: ${input.documentTitle}`;
      eyebrow = 'Payment required';
      headline = 'Complete the required deposit';
      body = `The deposit for &ldquo;<strong>${title}</strong>&rdquo; is ready. Purchasing remains locked until Patina records the required payment against the internal invoice.`;
      cta = 'Review deposit';
      message = `The required deposit for ${input.documentTitle} is ready.`;
      break;
  }

  const authority = [
    ceiling ? paragraph(`<strong>Design-services ceiling:</strong> ${ceiling}`) : '',
    retainer ? paragraph(`<strong>Retainer:</strong> ${retainer}`) : '',
  ].join('');

  return {
    subject,
    message,
    html: renderBrandedShell({
      title: subject,
      preview: message,
      eyebrow,
      body: [
        heading(headline),
        paragraph(`Hi ${recipient},`),
        paragraph(body),
        authority,
        spacer(10),
        ctaButton(input.portalUrl, cta, 'ink'),
        spacer(),
        muted('— Patina'),
      ].join(''),
    }),
  };
}
