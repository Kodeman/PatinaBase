import { shareLinkUrl } from '@patina/utils';

/**
 * Canonical client-portal origin used by browser-authored guest links.
 *
 * Production should set NEXT_PUBLIC_CLIENT_PORTAL_URL explicitly. The fallback
 * is intentionally the public client host, never the current designer host;
 * the designer portal does not own any of the guest routes.
 */
export const DEFAULT_CLIENT_PORTAL_ORIGIN = 'https://client.patina.cloud';

function httpOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveClientPortalOrigin(currentOrigin?: string): string {
  // Keep the direct member expression: Next.js statically inlines public env
  // variables into the browser bundle.
  const configured = httpOrigin(process.env.NEXT_PUBLIC_CLIENT_PORTAL_URL);
  if (configured) return configured;

  const current = httpOrigin(currentOrigin);
  if (current) {
    const local = new URL(current);
    if (local.hostname === 'localhost' || local.hostname === '127.0.0.1') {
      local.port = '3002';
      return local.origin;
    }
  }

  return DEFAULT_CLIENT_PORTAL_ORIGIN;
}

export function guestProposalShareUrl(
  token: string,
  currentOrigin?: string,
): string {
  return shareLinkUrl(resolveClientPortalOrigin(currentOrigin), token);
}
