'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createBrowserClient,
  useAddBoardItemDirection,
  useResolveBoardItemDirection,
  useReopenBoardItemDirection,
  type BoardItemDirection,
} from '@patina/supabase';
import { Button, Textarea } from '@/components/ui/controls';

function formatDirectionStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** Resolve author_id (uuid) to a name, quietly — same pattern as
 * ScheduleLineUnfold's useProfileName (captured_by). DV6 is lead→junior
 * direction; an unattributed thread defeats the point. */
function useProfileName(profileId: string | null | undefined) {
  return useQuery({
    queryKey: ['profile-name', profileId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', profileId)
        .maybeSingle();
      return (data?.full_name || data?.email || null) as string | null;
    },
    enabled: !!profileId,
  });
}

/** "Kody Kochaver · Aug 1 · resolved" — omits the name segment gracefully
 * while it's loading or unknown, rather than a stray leading separator. */
function DirectionMeta({
  authorId,
  createdAt,
  resolved,
}: {
  authorId: string;
  createdAt: string;
  resolved: boolean;
}) {
  const { data: name } = useProfileName(authorId);
  const parts = [name, formatDirectionStamp(createdAt), resolved ? 'resolved' : null].filter(
    (part): part is string => Boolean(part),
  );
  return <>{parts.join(' · ')}</>;
}

/**
 * Internal studio-only direction thread on one pin (board-paths W3c, DV6) —
 * distinct from the client verdict loop (VerdictBadge / item_feedback). Edit
 * mode only: the pin inspector that mounts this already returns null in
 * Present (api.mode !== 'edit'), and this panel is never wired into the
 * Present render path (BoardComposition's renderPinOverlay stays the
 * client-facing VerdictBadge only).
 */
export function BoardItemDirectionPanel({
  boardId,
  boardItemId,
  directions,
}: {
  boardId: string;
  boardItemId: string;
  directions: readonly BoardItemDirection[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addDirection = useAddBoardItemDirection();
  const resolveDirection = useResolveBoardItemDirection();
  const reopenDirection = useReopenBoardItemDirection();

  const unresolvedCount = directions.filter((note) => !note.resolved).length;

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try {
      await addDirection.mutateAsync({ boardId, boardItemId, body });
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this note.');
    }
  };

  const toggleResolved = async (note: BoardItemDirection) => {
    setError(null);
    try {
      if (note.resolved) {
        await reopenDirection.mutateAsync({ boardId, directionId: note.id });
      } else {
        await resolveDirection.mutateAsync({ boardId, directionId: note.id });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Could not ${note.resolved ? 'reopen' : 'resolve'} this note.`,
      );
    }
  };

  return (
    <div className="rounded-[4px] border border-[var(--border-default)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-2.5 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-clay)]"
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          Direction{directions.length > 0 ? ` · ${directions.length}` : ''}
        </span>
        {unresolvedCount > 0 && (
          <span
            aria-label={`${unresolvedCount} unresolved direction note${unresolvedCount === 1 ? '' : 's'}`}
            className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-clay)] px-1 font-mono text-[8px] text-white"
          >
            {unresolvedCount}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-[var(--border-default)] px-2.5 py-2">
          {directions.length === 0 && (
            <p className="text-[10px] text-[var(--text-muted)]">
              No direction on this pin yet. Studio-only — never shown to a client or a guest link.
            </p>
          )}
          {directions.map((note) => (
            <div
              key={note.id}
              className={`rounded-[4px] border border-[var(--border-default)] p-2 text-[11px] leading-4 ${
                note.resolved ? 'opacity-60' : ''
              }`}
            >
              <p className="whitespace-pre-wrap text-[var(--text-primary)]">{note.body}</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.04em] text-[var(--text-muted)]">
                  <DirectionMeta
                    authorId={note.author_id}
                    createdAt={note.created_at}
                    resolved={note.resolved}
                  />
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={resolveDirection.isPending || reopenDirection.isPending}
                  onClick={() => void toggleResolved(note)}
                >
                  {note.resolved ? 'Reopen' : 'Resolve'}
                </Button>
              </div>
            </div>
          ))}

          <label className="block text-[9px] uppercase text-[var(--text-muted)]">
            Add direction
            <Textarea
              value={draft}
              rows={2}
              className="mt-1"
              placeholder="Direction for the studio — not visible to the client"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={!draft.trim() || addDirection.isPending}
            onClick={() => void submit()}
          >
            {addDirection.isPending ? 'Adding…' : 'Add note'}
          </Button>
          {error && <p role="alert" className="text-[10px] text-[var(--color-clay-ink)]">{error}</p>}
        </div>
      )}
    </div>
  );
}
