'use client';

/**
 * Project Detail Zone 11 — Communications.
 * Spec: docs/prds/in-app-messaging-prd.md §7.4
 *
 * Embeds the project's group thread on the project detail page:
 * three most-recent messages + inline composer. "View full thread →"
 * deep-links to /portal/messages/:threadId.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  useStartProjectThread,
  useThreadMessages,
  useSendMessage,
  useThreadRealtime,
  type CommsMessage,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Button, Input } from '@/components/ui/controls';

interface Props {
  projectId: string;
  className?: string;
}

const RECENT_LIMIT = 3;

export function ProjectCommunicationsPanel({ projectId, className }: Props) {
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const startThread = useStartProjectThread();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Resolve / create the project thread on mount.
  useEffect(() => {
    let cancelled = false;
    startThread
      .mutateAsync(projectId)
      .then((id) => {
        if (!cancelled) setThreadId(id);
      })
      .catch((err) => {
        if (!cancelled) {
          setResolveError(
            err instanceof Error ? err.message : 'Could not open project thread'
          );
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useThreadRealtime(threadId ?? undefined);
  const { data: pages } = useThreadMessages(threadId ?? undefined);
  const sendMessage = useSendMessage();

  const recent = useMemo<CommsMessage[]>(() => {
    const all = (pages?.pages ?? []).flat();
    // Already returned newest-first; show top N.
    return all.slice(0, RECENT_LIMIT);
  }, [pages]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!threadId || !body) return;
    await sendMessage.mutateAsync({ threadId, body });
    setDraft('');
  };

  return (
    <section
      className={
        className ??
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5'
      }
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="type-section-title">Communications</h3>
        {threadId && (
          <Link
            href={`/portal/messages/${threadId}`}
            className="type-meta-small text-patina-clay hover:underline inline-flex items-center gap-1"
          >
            View full thread <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {resolveError ? (
        <p className="type-body-small text-patina-terracotta">{resolveError}</p>
      ) : !threadId ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="type-body-small text-[var(--text-muted)]">
          No messages yet. Kick off the conversation.
        </p>
      ) : (
        <ul className="space-y-3">
          {recent
            .slice()
            .reverse()
            .map((msg) => (
              <li
                key={msg.id}
                className="rounded-md border border-[var(--border-subtle)] px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="type-meta-small font-medium">
                    {msg.system
                      ? 'System'
                      : msg.sender_id === myId
                        ? 'You'
                        : (msg.sender?.full_name ?? 'Unknown')}
                  </span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {new Date(msg.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 type-body-small whitespace-pre-wrap">
                  {msg.deleted_at ? <em>(message deleted)</em> : msg.body}
                </p>
              </li>
            ))}
        </ul>
      )}

      {threadId && (
        <div className="mt-4 flex gap-2">
          <Input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Reply…"
            className="flex-1"
            disabled={sendMessage.isPending}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSend()}
            disabled={sendMessage.isPending || !draft.trim()}
          >
            Send
          </Button>
        </div>
      )}
    </section>
  );
}
