'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import {
  useBoardShares,
  useCreateBoardShare,
  useRevokeShare,
  type DocumentShare,
} from '@patina/supabase';
import { Button, Input } from '@/components/ui/controls';
import { guestProposalShareUrl } from '@/lib/client-portal-url';
import { moodBoardEvents } from '@/lib/analytics/mood-board-events';

function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

function expiresAtFromDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface BoardShareDialogProps {
  boardId: string;
  boardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called only after a newly minted link has reached the clipboard. */
  onShareCreated?: (shareId: string) => void;
  /** Flushes the live room before a token can expose its composition. */
  flush?: () => Promise<void>;
}

/** Board-only, view-only share management for the full-screen room. */
export function BoardShareDialog({
  boardId,
  boardName,
  open,
  onOpenChange,
  onShareCreated,
  flush,
}: BoardShareDialogProps) {
  const { data: shares = [], isLoading, isError } = useBoardShares(open ? boardId : undefined);
  const createShare = useCreateBoardShare();
  const revokeShare = useRevokeShare();
  const [label, setLabel] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [created, setCreated] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setCopied(false);
    setError(null);
  }, [open]);

  const activeShares = useMemo(
    () => shares.filter((share) => share.status === 'active'),
    [shares],
  );

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return true;
    } catch {
      setCopied(false);
      setError('The link is ready below, but it could not be copied automatically.');
      return false;
    }
  };

  const handleCreate = async () => {
    setError(null);
    setCopied(false);
    try {
      await flush?.();
      const result = await createShare.mutateAsync({
        boardId,
        label: label.trim() || null,
        expiresAt: expiresAtFromDate(expiryDate),
      });
      const url = guestProposalShareUrl(
        result.token,
        typeof window === 'undefined' ? undefined : window.location.origin,
      );
      setCreated({ id: result.id, url });
      setLabel('');
      setExpiryDate('');
      moodBoardEvents.shared({
        board_id: boardId,
        scope: 'board',
        has_expiry: Boolean(expiresAtFromDate(expiryDate)),
        share_id: result.id,
      });
      if (await copy(url)) onShareCreated?.(result.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The share link could not be created.');
    }
  };

  const handleRevoke = async (share: DocumentShare) => {
    setError(null);
    try {
      await revokeShare.mutateAsync({ shareId: share.id, boardId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The share link could not be revoked.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share {boardName}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view this board only. They cannot edit it or leave feedback.
          </DialogDescription>
        </DialogHeader>

        {created && (
          <section className="rounded-[5px] border border-[rgba(168,181,160,0.5)] bg-[rgba(168,181,160,0.08)] p-4" aria-labelledby="created-board-link">
            <h3 id="created-board-link" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--color-sage)]">
              Link created {copied ? 'and copied' : ''}
            </h3>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              This raw link is shown once. Only its hash is stored.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Input
                readOnly
                value={created.url}
                aria-label="Board share link"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button variant="secondary" size="sm" onClick={() => void copy(created.url)}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </section>
        )}

        <section aria-labelledby="active-board-links">
          <h3 id="active-board-links" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
            Active links
          </h3>
          {isLoading ? (
            <p className="mt-2 text-[12px] text-[var(--text-muted)]">Loading links…</p>
          ) : isError ? (
            <p role="alert" className="mt-2 text-[12px] text-[var(--color-clay)]">Links could not be read.</p>
          ) : activeShares.length === 0 ? (
            <p className="mt-2 text-[12px] italic text-[var(--text-muted)]">No active links.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeShares.map((share) => (
                <li key={share.id} className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--border-default)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--text-primary)]">
                      {share.label || 'Untitled board link'}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                      {shortDate(share.created_at)} · {share.view_count} {share.view_count === 1 ? 'view' : 'views'}
                      {share.last_viewed_at ? ` · last ${shortDate(share.last_viewed_at)}` : ''}
                      {share.expires_at ? ` · expires ${shortDate(share.expires_at)}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revokeShare.isPending}
                    onClick={() => void handleRevoke(share)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t border-[var(--border-default)] pt-4" aria-labelledby="new-board-link">
          <h3 id="new-board-link" className="font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--text-muted)]">
            New link
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] text-[var(--text-muted)]">
              Label <span className="italic">(optional)</span>
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Client review"
                className="mt-1"
              />
            </label>
            <label className="text-[11px] text-[var(--text-muted)]">
              Expires <span className="italic">(optional)</span>
              <Input
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(event) => setExpiryDate(event.target.value)}
                className="mt-1"
              />
            </label>
          </div>
          <Button
            variant="primary"
            className="mt-4"
            disabled={createShare.isPending}
            onClick={() => void handleCreate()}
          >
            {createShare.isPending ? 'Creating…' : 'Create and copy link'}
          </Button>
        </section>

        {error && (
          <p role="alert" className="border-l-2 border-[var(--color-clay)] pl-3 text-[12px] text-[var(--text-primary)]">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
