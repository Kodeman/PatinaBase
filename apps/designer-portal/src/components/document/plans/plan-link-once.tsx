'use client';

/**
 * A raw transmittal token, rendered the only time it will ever be renderable.
 *
 * The server stores the sha256 of the token and nothing else, so this string
 * exists exactly once — in one mutation result, in memory, on this screen. It
 * is never written to the query cache, to storage, or to telemetry:
 *
 *  · the URL element wears `ph-no-capture`, so PostHog's autocapture never
 *    reads the text or the element's own attributes (the before_send bearer
 *    sanitizer in lib/analytics/posthog.ts is the second line, not the first);
 *  · copying only CLAIMS success when navigator.clipboard resolves — a denied
 *    permission or an insecure context must not leave the designer believing
 *    they hold a link they never copied.
 *
 * Shared by the issue ceremony (first mint) and the transmittals ledger
 * (reissue) so both say the same thing in the same words.
 */

import { useState } from 'react';
import { DocumentAction, DocumentActionRow } from '../document-action';

export function PlanLinkOnce({
  url,
  regionKey,
}: {
  url: string;
  regionKey: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access is refusable. Say so rather than lying.
      setCopied(false);
      setCopyFailed(true);
    }
  };

  return (
    <div className="mt-2 border-l-2 border-[var(--color-golden-hour)] pl-2.5">
      <p
        data-plan-token-line
        className="ph-no-capture break-all font-mono text-[11px] text-[var(--color-charcoal)]"
      >
        {url}
      </p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-golden-hour)]">
        This link won&rsquo;t be shown again &mdash; copy it now.
      </p>
      <DocumentActionRow surfaceKey="plan-room" regionKey={regionKey}>
        <DocumentAction
          actionKey="copy-plan-link"
          variant="secondary"
          onClick={copy}
        >
          {copied ? 'Copied' : 'Copy the link'}
        </DocumentAction>
      </DocumentActionRow>
      {copyFailed && (
        <p
          role="alert"
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-terracotta-ink)]"
        >
          Copy failed &mdash; select the link text
        </p>
      )}
    </div>
  );
}
