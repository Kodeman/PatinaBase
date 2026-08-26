'use client';

/**
 * ShareSheet (Schedule & Boards Wave 2 · C2) — the designer's tokenized
 * share-link instrument. A charcoal DocSheet (D8) that slides up over the open
 * proposal (never a route, never an unmount — D1). Same grammar as SendSheet:
 * charcoal, hairlines, clay accents, zero shadows (D4), inline errors at the act
 * (R83 — no toasts).
 *
 * A share link opens a VIEW-ONLY copy of the proposal for anyone holding it (no
 * account needed). The visibility matrix is seeded from the proposal's
 * client-visibility tier, then edited per-field. The raw token is returned by
 * create EXACTLY once and never persisted (only sha256(token) is stored), so:
 *   · a just-created link shows its URL once, with a Copy button;
 *   · existing links can only be reviewed (views, last-viewed) and revoked —
 *     there is no copy for them (the URL is unrecoverable by design);
 *   · "regenerate" = revoke + create anew.
 */

import { useEffect, useState } from 'react';
import {
  useProposalShares,
  useCreateShare,
  useRevokeShare,
  type DocumentShare,
} from '@patina/supabase';
import {
  SHARE_VISIBILITY_FIELDS,
  shareVisibilityForTier,
  type ShareVisibility,
  type ClientVisibilityTier,
} from '@patina/utils';
import { guestProposalShareUrl } from '@/lib/client-portal-url';
import { DocSheet } from './doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';

const labelCls =
  'font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]';

const fieldCls =
  'min-h-11 w-full rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[16px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none';

// Guests are always view-only, so the feedback toggle is meaningless on a share
// link (it is forced off for tokenized guests). Omit it from the matrix.
const MATRIX_FIELDS = SHARE_VISIBILITY_FIELDS.filter(
  (f) => f.key !== 'feedbackEnabled',
);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );

export function ShareSheet({
  proposalId,
  tier,
  open,
  onClose,
}: {
  proposalId: string;
  tier?: ClientVisibilityTier | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: shares = [] } = useProposalShares(proposalId);
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();

  const [visibility, setVisibility] = useState<ShareVisibility>(() =>
    shareVisibilityForTier(tier),
  );
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the matrix and clear transient state each time the sheet opens (or
  // when the tier resolves while open) — a fresh link starts from the tier's
  // defaults, not a previous session's edits.
  useEffect(() => {
    if (open) {
      setVisibility(shareVisibilityForTier(tier));
      setCreated(null);
      setCopied(false);
      setError(null);
    }
  }, [open, tier]);

  const activeShares = shares.filter((s) => s.status === 'active');

  const handleCreate = async () => {
    setError(null);
    setCopied(false);
    try {
      const res = await createShare.mutateAsync({
        proposalId,
        label: label.trim() || null,
        visibility,
      });
      setCreated({
        url: guestProposalShareUrl(
          res.token,
          typeof window !== 'undefined' ? window.location.origin : undefined,
        ),
      });
      setLabel('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create the share link. Please try again.',
      );
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      setError(
        'Could not copy automatically — select the link above and copy it manually.',
      );
    }
  };

  const handleRevoke = async (share: DocumentShare) => {
    setError(null);
    try {
      await revokeShare.mutateAsync({ shareId: share.id, proposalId });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not revoke the link. Please try again.',
      );
    }
  };

  return (
    <DocSheet open={open} onClose={onClose} title="Share links">
      <div data-overlay-share className="mx-auto max-w-xl">
        <p className={labelCls}>Share links</p>
        <h2 className="mt-1 font-heading text-xl text-[var(--color-charcoal)]">
          Share this proposal
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
          A share link opens a <b>view-only</b> copy of this proposal for anyone
          who has it — no account needed. Choose what the link reveals; feedback
          stays off on shared links.
        </p>

        {/* ── The just-created link — shown ONCE ── */}
        {created && (
          <div className="mt-5 rounded-[4px] border border-[rgba(168,181,160,0.4)] bg-[rgba(168,181,160,0.08)] p-3.5">
            <p className="mb-1 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-sage)]">
              Link created
            </p>
            <p className="mb-2 text-[14px] leading-relaxed text-[var(--color-charcoal)]">
              Copy this link now — it is shown only once and can&rsquo;t be
              retrieved later.
            </p>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={created.url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className={`${fieldCls} font-mono`}
              />
              <DocumentAction
                actionKey="copy-share-link"
                surfaceKey="open-document"
                regionKey="share-link-created"
                variant="secondary"
                onClick={handleCopy}
              >
                {copied ? 'Copied' : 'Copy'}
              </DocumentAction>
            </div>
          </div>
        )}

        {/* ── Existing links ── */}
        <div className="mt-6">
          <p className={labelCls}>Existing links</p>
          {shares.length === 0 ? (
            <p className="mt-2 text-[14px] italic text-[var(--text-body)]">
              No share links yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {shares.map((s) => {
                const revoked = s.status === 'revoked';
                return (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 rounded-[4px] border border-[var(--color-pearl)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-[var(--color-charcoal)]">
                        {s.label || 'Untitled link'}
                        {revoked && (
                          <span className="ml-2 font-mono text-[12px] uppercase tracking-[0.06em] text-[var(--text-body)]">
                            revoked
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 font-mono text-[12px] uppercase tracking-[0.04em] text-[var(--text-body)]">
                        {fmtDate(s.created_at)} · {s.view_count} view
                        {s.view_count === 1 ? '' : 's'}
                        {s.last_viewed_at
                          ? ` · last ${fmtDate(s.last_viewed_at)}`
                          : ''}
                      </p>
                    </div>
                    {!revoked && (
                      <DocumentAction
                        actionKey="revoke-share-link"
                        surfaceKey="open-document"
                        regionKey="existing-share-links"
                        variant="tertiary"
                        onClick={() => handleRevoke(s)}
                        loading={revokeShare.isPending}
                        loadingLabel="Revoking…"
                        className="shrink-0 self-center text-[var(--color-terracotta-ink)] decoration-[var(--color-terracotta)]"
                      >
                        Revoke
                      </DocumentAction>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {activeShares.length > 0 && (
            <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-body)]">
              An existing link&rsquo;s URL can&rsquo;t be shown again (only its
              hash is stored). To regenerate one, revoke it and create a new
              link — the old URL stops working at once.
            </p>
          )}
        </div>

        {/* ── Create a new link ── */}
        <div className="mt-6 border-t border-[var(--color-pearl)] pt-5">
          <p className={labelCls}>New link · what it reveals</p>
          <div className="mt-2 space-y-1.5">
            {MATRIX_FIELDS.map((f) => {
              const on = visibility[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setVisibility((v) => ({ ...v, [f.key]: !v[f.key] }))
                  }
                  className="flex min-h-11 w-full items-start justify-between gap-3 rounded-[4px] border border-[var(--color-pearl)] px-3 py-2 text-left transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] text-[var(--color-charcoal)]">
                      {f.label}
                    </span>
                    <span className="block text-[14px] leading-snug text-[var(--text-body)]">
                      {f.description}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 self-center font-mono text-[12px] uppercase tracking-[0.08em] ${
                      on
                        ? 'text-[var(--color-clay-ink)]'
                        : 'text-[var(--color-aged-oak)]'
                    }`}
                  >
                    {on ? 'Shown' : 'Hidden'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label className={labelCls} htmlFor="share-sheet-label">
              Label (optional)
            </label>
            <input
              id="share-sheet-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. For the Hendersons"
              className={fieldCls}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="mt-4 border-l-2 border-[var(--color-terracotta)] p-3 text-[14px] text-[var(--color-charcoal)]"
            >
              {error}
            </div>
          )}

          <DocumentActionGroup
            surfaceKey="open-document"
            regionKey="create-share-link"
            className="mt-4"
            aria-label="Share link actions"
          >
            <DocumentAction
              actionKey="create-share-link"
              variant="primary"
              onClick={handleCreate}
              loading={createShare.isPending}
              loadingLabel="Creating…"
              trailing="→"
            >
              Create link
            </DocumentAction>
            <DocumentAction
              actionKey="close-share-links"
              variant="tertiary"
              onClick={onClose}
            >
              Done
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      </div>
    </DocSheet>
  );
}
