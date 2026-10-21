import { Fragment, type ReactNode } from 'react';
import type { PresentationIdentity } from '@patina/supabase';

/* ── PRESENTED BY (US-37 #6, contract D8) ────────────────────────────────────
   Who presents an approval to the client: the studio's mark and name, and the
   lead designer's name and contact. The server resolves each field (00812):
   the studio's public email before the lead's sign-in email, the lead's
   phone before the studio's (R178). It is a quiet
   typographic footer line on every approval surface, never a banner: no
   fill, no shadow, no box.

   ABSENCE IS SILENCE. Only the fields that are present are drawn: no empty
   label, no separator standing next to nothing. With nothing at all the
   block renders nothing. The mark keeps its own ratio, height-capped. ────── */

export interface PresentedByProps {
  identity?: PresentationIdentity | null;
  className?: string;
}

const LOGO_MAX_HEIGHT = 32;

const FIELDS = ['firmName', 'logoUrl', 'website', 'designerName', 'email', 'phone'] as const;

/** Whether `PresentedBy` would draw anything — for a caller's own hairline. */
export function hasPresentation(identity?: PresentationIdentity | null): boolean {
  return FIELDS.some((field) => !!identity?.[field]?.trim());
}

/** An http(s) URL for a website the studio may have typed without a scheme. */
function websiteHref(website: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(website) ? website : `https://${website}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The website as a reader says it: no scheme, no www, no trailing slash. */
function websiteLabel(website: string): string {
  return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}

function telHref(phone: string): string | null {
  const extensionMatch = phone.match(/(?:[,;]?\s*(?:ext\.?|x|#)\s*[:.]?\s*)(\d+)\s*$/i);
  const number = extensionMatch ? phone.slice(0, extensionMatch.index) : phone;
  if (/[a-z]/i.test(number)) return null;

  const digits = number.replace(/[^\d+]/g, '');
  if (digits.replace(/\+/g, '').length === 0) return null;
  return `tel:${digits}${extensionMatch ? `;ext=${extensionMatch[1]}` : ''}`;
}

const LINK_CLASS =
  'underline decoration-[var(--border-default)] underline-offset-[3px] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/* ── CONTACT YOUR DESIGNER (CPUX-06) ─────────────────────────────────────────
   Named help near the summary, built from the same resolved fields: the lead's
   name, the phone and email the studio presented, and the reply field when this
   house has a thread to write to. Nothing is inferred — no address guessed, no
   response time promised — and with nothing presented it says where help is
   without inventing a channel. Opening it sends nothing. ─────────────────── */

export interface ContactDesignerProps {
  identity?: PresentationIdentity | null;
  /** The in-page id of the existing reply field, when a thread exists. */
  writeAnchor?: string | null;
  className?: string;
}

function joinedWithOr(parts: { key: string; node: ReactNode }[]): ReactNode {
  return parts.map((part, index) => (
    <Fragment key={part.key}>
      {index === 0 ? '' : index === parts.length - 1 ? ', or ' : ', '}
      {part.node}
    </Fragment>
  ));
}

export function ContactDesigner({ identity, writeAnchor, className }: ContactDesignerProps) {
  const designerName = identity?.designerName?.trim() || null;
  const email = identity?.email?.trim() || null;
  const phone = identity?.phone?.trim() || null;
  const phoneHref = phone ? telHref(phone) : null;

  const ways: { key: string; node: ReactNode }[] = [];
  if (phone) {
    ways.push({
      key: 'phone',
      node: (
        <>
          {'Call '}
          {phoneHref ? (
            <a className={`${LINK_CLASS} whitespace-nowrap`} href={phoneHref} data-testid="contact-phone">
              {phone}
            </a>
          ) : (
            <span className="whitespace-nowrap" data-testid="contact-phone">
              {phone}
            </span>
          )}
        </>
      ),
    });
  }
  if (email) {
    ways.push({
      key: 'email',
      node: (
        <>
          {ways.length === 0 ? 'Email ' : 'email '}
          <a className={LINK_CLASS} href={`mailto:${email}`} data-testid="contact-email">
            {email}
          </a>
        </>
      ),
    });
  }
  if (writeAnchor) {
    ways.push({
      key: 'write',
      node: (
        <a className={LINK_CLASS} href={`#${writeAnchor}`} data-testid="contact-write">
          {ways.length === 0 ? 'Write here' : 'write here'}
        </a>
      ),
    });
  }

  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      data-testid="contact-designer"
      className={className}
    >
      <h3
        id="contact-title"
        className="font-heading text-[1.25rem] font-medium leading-snug text-[var(--text-primary)]"
      >
        {designerName ? `Contact ${designerName}` : 'Contact your designer'}
      </h3>
      <p className="mt-1 text-[15px] leading-relaxed text-[var(--text-body)]">
        {ways.length > 0 ? (
          <>
            {joinedWithOr(ways)}
            {'.'}
          </>
        ) : (
          'Contact your designer using the phone number or email you already use.'
        )}
      </p>
    </section>
  );
}

export function PresentedBy({ identity, className }: PresentedByProps) {
  if (!hasPresentation(identity)) return null;

  const firmName = identity?.firmName?.trim() || null;
  const logoUrl = identity?.logoUrl?.trim() || null;
  const website = identity?.website?.trim() || null;
  const designerName = identity?.designerName?.trim() || null;
  const email = identity?.email?.trim() || null;
  const phone = identity?.phone?.trim() || null;

  const contact: { key: string; node: ReactNode }[] = [];
  if (designerName) contact.push({ key: 'name', node: designerName });
  if (email) {
    contact.push({
      key: 'email',
      node: (
        <a className={LINK_CLASS} href={`mailto:${email}`} data-testid="presented-by-email">
          {email}
        </a>
      ),
    });
  }
  if (phone) {
    const href = telHref(phone);
    // A phone number reads as one figure: it never wraps inside itself.
    contact.push({
      key: 'phone',
      node: href ? (
        <a className={`${LINK_CLASS} whitespace-nowrap`} href={href} data-testid="presented-by-phone">
          {phone}
        </a>
      ) : (
        <span className="whitespace-nowrap" data-testid="presented-by-phone">
          {phone}
        </span>
      ),
    });
  }
  if (website) {
    const href = websiteHref(website);
    contact.push({
      key: 'website',
      node: href ? (
        <a
          className={LINK_CLASS}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="presented-by-website"
        >
          {websiteLabel(website)}
        </a>
      ) : (
        <span data-testid="presented-by-website">{websiteLabel(website)}</span>
      ),
    });
  }

  return (
    <div
      data-testid="presented-by"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className ?? ''}`.trim()}
    >
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          // Decorative beside the printed name; the name itself when it is alone.
          alt={firmName ? '' : 'Studio mark'}
          data-testid="presented-by-logo"
          style={{ maxHeight: LOGO_MAX_HEIGHT, width: 'auto', height: 'auto', maxWidth: 160 }}
          decoding="async"
          loading="lazy"
        />
      )}
      {(firmName || contact.length > 0) && (
        <div className="min-w-0">
          {firmName && (
            <p
              data-testid="presented-by-firm"
              className="font-heading text-[15px] leading-[1.35] text-[var(--text-primary)]"
            >
              {firmName}
            </p>
          )}
          {contact.length > 0 && (
            <p
              data-testid="presented-by-contact"
              className="font-mono text-[11.5px] leading-[1.6] tracking-[0.04em] text-[var(--text-muted)]"
            >
              {/* Each part is one unit, so a narrow screen wraps between the
                  name, the email, the phone and the website, never inside a
                  phone number. The separator rides at the end of the part
                  before it behind a no-break space (U+00A0), so no line opens
                  on a dot. */}
              {contact.map((part, index) => (
                <Fragment key={part.key}>
                  {index > 0 && ' '}
                  <span className="inline-block max-w-full [overflow-wrap:anywhere]">
                    {part.node}
                    {index < contact.length - 1 && (
                      <span aria-hidden="true" data-testid="presented-by-separator">
                        {' ·'}
                      </span>
                    )}
                  </span>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
