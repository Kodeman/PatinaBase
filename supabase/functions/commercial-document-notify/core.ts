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
  | 'deposit_ready'
  | 'trade_scope_sent'
  | 'trade_scope_executed'
  | 'trade_scope_accepted'
  | 'trade_draw_ready';

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
  /** Set only for the executed-family transitions when the act was recorded
   * from a paper original rather than an online signature — see the
   * paper-notify route. Absent (the default) renders the ordinary online
   * copy unchanged. */
  channel?: 'paper';
  /** Only meaningful alongside channel:'paper' — true when the recording
   * designer attached a scan of the signed original. */
  hasScan?: boolean;
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
  const scanNote = input.hasScan
    ? ' A scanned copy of the signed paper original is available on the document.'
    : '';

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
      if (input.channel === 'paper') {
        eyebrow = 'Signed on paper';
        headline = 'Your design engagement is active';
        body = `You signed a printed copy of &ldquo;<strong>${title}</strong>&rdquo;; ${counterparty} recorded it and has countersigned. The agreement is executed.${scanNote}`;
        cta = 'View your project';
        message = `You signed a printed copy of ${input.documentTitle}; ${input.counterpartyName || 'your studio'} recorded it and has countersigned. The agreement is executed.`;
      } else {
        eyebrow = 'Design services authorized';
        headline = 'Your design engagement is active';
        body = `Both you and ${counterparty} have signed &ldquo;<strong>${title}</strong>&rdquo;. Design time can now be tracked under the signed authority.`;
        cta = 'View your project';
        message = `${input.documentTitle} is fully executed and the design engagement is active.`;
      }
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
      if (input.channel === 'paper') {
        eyebrow = 'Signed on paper';
        headline = 'This furnishings wave is authorized';
        body = `${counterparty} recorded your signed printed copy of &ldquo;<strong>${title}</strong>&rdquo;. Procurement remains limited to its immutable item, quantity, and price snapshot.${scanNote}`;
        cta = 'View authorization';
        message = `${input.counterpartyName || 'Your studio'} recorded your signed printed copy of ${input.documentTitle}.`;
      } else {
        eyebrow = 'FF&E wave executed';
        headline = 'This furnishings wave is authorized';
        body = `&ldquo;<strong>${title}</strong>&rdquo; is signed and executed. Procurement remains limited to its immutable item, quantity, and price snapshot.`;
        cta = 'View authorization';
        message = `${input.documentTitle} is executed and its signed items are authorized.`;
      }
      break;
    case 'deposit_ready':
      subject = `Deposit ready: ${input.documentTitle}`;
      eyebrow = 'Payment required';
      headline = 'Complete the required deposit';
      body = `The deposit for &ldquo;<strong>${title}</strong>&rdquo; is ready. Purchasing remains locked until Patina records the required payment against the internal invoice.`;
      cta = 'Review deposit';
      message = `The required deposit for ${input.documentTitle} is ready.`;
      break;
    case 'trade_scope_sent':
      subject = `Trade scope ready for review: ${input.documentTitle}`;
      eyebrow = 'Trade scope';
      headline = 'Review this trade scope';
      body = `${counterparty} prepared &ldquo;<strong>${title}</strong>&rdquo; for your review. Signing authorizes the scope of work, draws, and pricing described inside &mdash; nothing more.`;
      cta = 'Review trade scope';
      message = `${input.documentTitle} is ready for your review and signature.`;
      break;
    case 'trade_scope_executed':
      if (input.audience === 'client' && input.channel === 'paper') {
        subject = `Trade scope authorized: ${input.documentTitle}`;
        eyebrow = 'Signed on paper';
        headline = 'Your trade scope is signed and active';
        body = `${counterparty} recorded your signed printed copy of &ldquo;<strong>${title}</strong>&rdquo;. The first draw invoice is on its way &mdash; the trade begins once it is paid.${scanNote}`;
        cta = 'View trade scope';
        message = `${input.counterpartyName || 'Your studio'} recorded your signed printed copy of ${input.documentTitle}; the deposit draw is being issued.`;
      } else if (input.audience === 'client') {
        subject = `Trade scope authorized: ${input.documentTitle}`;
        eyebrow = 'Trade scope authorized';
        headline = 'Your trade scope is signed and active';
        body = `&ldquo;<strong>${title}</strong>&rdquo; is signed and executed. The first draw invoice is on its way &mdash; the trade begins once it is paid.`;
        cta = 'View trade scope';
        message = `${input.documentTitle} is executed; the deposit draw is being issued.`;
      } else {
        subject = `Trade scope executed: ${input.documentTitle}`;
        eyebrow = 'Trade scope executed';
        headline = 'Client authorization is in';
        body = `${signer} signed &ldquo;<strong>${title}</strong>&rdquo;. The deposit draw invoice has been issued &mdash; the trade is cleared to begin once it is paid.`;
        cta = 'View trade scope';
        message = `${input.documentTitle} is executed and the deposit draw invoice is out.`;
      }
      break;
    case 'trade_scope_accepted':
      subject = `Trade scope accepted: ${input.documentTitle}`;
      if (input.audience === 'client' && input.channel === 'paper') {
        eyebrow = 'Accepted on paper';
        headline = 'Your acceptance is recorded';
        body = `${counterparty} recorded your signed acceptance of the finished work on &ldquo;<strong>${title}</strong>&rdquo; &mdash; the final payment follows.${scanNote}`;
        cta = 'View trade scope';
        message = `${input.counterpartyName || 'Your studio'} recorded your signed acceptance of the finished work — the final payment follows.`;
      } else {
        eyebrow = 'Substantial completion accepted';
        headline = 'The client signed off on this trade';
        body = `${signer} accepted &ldquo;<strong>${title}</strong>&rdquo; as substantially complete. The final draw is ready to invoice.`;
        cta = 'View trade scope';
        message = `${input.documentTitle} was accepted by the client; the final draw can now be invoiced.`;
      }
      break;
    case 'trade_draw_ready':
      subject = `Draw invoice ready: ${input.documentTitle}`;
      eyebrow = 'Payment required';
      headline = 'A trade draw is ready to pay';
      body = `The next draw for &ldquo;<strong>${title}</strong>&rdquo; is ready. The trade continues once Patina records the required payment against the internal invoice.`;
      cta = 'Review draw';
      message = `A trade scope draw invoice for ${input.documentTitle} is ready.`;
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
