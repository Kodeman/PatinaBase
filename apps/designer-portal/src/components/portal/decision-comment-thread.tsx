'use client';

import { useState } from 'react';
import {
  useDecisionComments,
  useCreateDecisionComment,
  useDeleteDecisionComment,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';

interface DecisionCommentThreadProps {
  decisionId: string;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

export function DecisionCommentThread({ decisionId }: DecisionCommentThreadProps) {
  const { user } = useAuth();
  const { data: comments, isLoading } = useDecisionComments(decisionId);
  const create = useCreateDecisionComment();
  const remove = useDeleteDecisionComment();

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canPost = trimmed.length > 0 && !create.isPending;

  const handlePost = async () => {
    if (!canPost) return;
    setError(null);
    try {
      await create.mutateAsync({ decisionId, body: trimmed });
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    setError(null);
    try {
      await remove.mutateAsync({ commentId, decisionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    }
  };

  return (
    <div>
      {isLoading ? (
        <p className="type-body" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Loading comments…
        </p>
      ) : comments && comments.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3">
          {comments.map((c) => {
            const isAuthor = !!user && user.id === c.author_id;
            return (
              <div
                key={c.id}
                className="rounded-md border px-3 py-2"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="type-meta-small"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {isAuthor ? 'You' : 'Client'}
                    </span>
                    <span
                      className="type-meta-small"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {relativeTime(c.created_at)}
                    </span>
                  </div>
                  {isAuthor && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={remove.isPending}
                      className="text-[0.7rem] text-[var(--text-muted)] hover:text-[var(--color-terracotta,#D4A090)]"
                      aria-label="Delete comment"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p
                  className="type-body"
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-body)',
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {c.body}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p
          className="mb-4 type-body"
          style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}
        >
          No comments yet.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="w-full rounded-[3px] border bg-white px-2 py-1.5 font-body text-[0.82rem] outline-none"
          style={{ borderColor: 'var(--border-default)' }}
        />
        {error && (
          <p
            className="rounded-md border-2 p-2 type-body text-[0.78rem]"
            style={{ borderColor: 'var(--color-terracotta, #D4A090)' }}
          >
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handlePost}
            disabled={!canPost}
            className="rounded-[3px] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
            style={{
              background: canPost ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
          >
            {create.isPending ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
