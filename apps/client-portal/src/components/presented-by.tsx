import type { ReactNode } from 'react';
import type { PresentationIdentity } from '@patina/supabase';

/* ── PRESENTED BY (US-37 #6, contract D8) ────────────────────────────────────
   Who presents an approval to the client: the studio's mark and name, and the
   lead designer's name and contact, with the studio's email and phone where
   the lead left hers blank (the server resolves that, 00812). It is a quiet
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
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\+/g, '').length > 0 ? `tel:${digits}` : null;
}

const LINK_CLASS =
  'underline decoration-[var(--border-default)] underline-offset-[3px] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--threshold-accent,#8A5F19)]';

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
    contact.push({
      key: 'phone',
      node: href ? (
        <a className={LINK_CLASS} href={href} data-testid="presented-by-phone">
          {phone}
        </a>
      ) : (
        <span data-testid="presented-by-phone">{phone}</span>
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
              className="font-mono text-[11.5px] leading-[1.6] tracking-[0.04em] text-[var(--text-muted)] [overflow-wrap:anywhere]"
            >
              {contact.map((part, index) => (
                <span key={part.key}>
                  {index > 0 && (
                    <span aria-hidden="true" data-testid="presented-by-separator">
                      {' · '}
                    </span>
                  )}
                  {part.node}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
