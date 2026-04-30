'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Paperclip } from 'lucide-react';
import {
  PageHeader,
  Section,
} from '@/components/portal';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { useAdminThread } from '@/hooks/use-admin-comms';

const ROLE_VARIANT: Record<'designer' | 'client' | 'vendor' | 'admin', 'default' | 'secondary' | 'outline'> = {
  designer: 'default',
  client: 'secondary',
  vendor: 'outline',
  admin: 'outline',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CommsThreadDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data, isLoading, isError, error } = useAdminThread(id);

  return (
    <div>
      <div className="pt-6">
        <Link
          href={'/communications/threads' as any}
          className="inline-flex items-center gap-1 type-meta-small text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to threads
        </Link>
      </div>

      <PageHeader
        title={data?.title ?? 'Thread'}
        accent={data?.kind?.replace('_', ' ') ?? ''}
        description={
          data
            ? `Created ${formatDateTime(data.createdAt)} · last activity ${formatDateTime(data.lastMessageAt)}`
            : undefined
        }
      />

      {isError ? (
        <Section className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load thread: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : isLoading || !data ? (
        <Section className="mt-10">
          <p className="type-body-small text-[var(--text-muted)]">Loading thread…</p>
        </Section>
      ) : (
        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr,280px]">
          <Section title={`Messages (${data.messages.length})`}>
            {data.messages.length === 0 ? (
              <p className="type-body italic text-[var(--text-muted)] py-8 text-center">
                No messages in this thread.
              </p>
            ) : (
              <div className="space-y-4">
                {data.messages.map((m) => {
                  if (m.system) {
                    return (
                      <div
                        key={m.id}
                        className="text-center py-2 type-meta-small italic text-[var(--text-muted)]"
                      >
                        {m.body} · {formatDateTime(m.createdAt)}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={m.id}
                      className="border-l-2 border-[var(--border-subtle)] pl-4 py-2"
                    >
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="type-label">
                          {m.senderName ?? <span className="italic">unknown sender</span>}
                        </span>
                        <span className="type-meta-small text-[var(--text-muted)]">
                          {formatDateTime(m.createdAt)}
                        </span>
                        {m.editedAt && (
                          <span className="type-meta-small italic text-[var(--text-muted)]">
                            edited
                          </span>
                        )}
                        {m.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-0.5 type-meta-small text-[var(--text-muted)]">
                            <Paperclip className="h-3 w-3" />
                            {m.attachmentCount}
                          </span>
                        )}
                      </div>
                      {m.deletedAt ? (
                        <p className="type-body-small italic text-[var(--text-muted)]">
                          [deleted {formatDateTime(m.deletedAt)}]
                        </p>
                      ) : (
                        <p className="type-body-small whitespace-pre-wrap">{m.body}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {data.messages.length >= 500 && (
              <p className="mt-6 type-meta-small italic text-[var(--text-muted)]">
                Showing the first 500 messages. Older messages are not loaded in v1.
              </p>
            )}
          </Section>

          <div className="space-y-6">
            <Section title="Participants">
              <div className="space-y-3">
                {data.participants.map((p) => (
                  <div
                    key={p.profileId}
                    className="border-b border-[var(--border-subtle)] pb-2 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="type-label truncate">
                        {p.displayName ?? p.email ?? '?'}
                      </span>
                      <Badge variant={ROLE_VARIANT[p.role]} className="capitalize">
                        {p.role}
                      </Badge>
                    </div>
                    {p.email && p.displayName && (
                      <p className="type-meta-small text-[var(--text-muted)] mt-0.5">
                        {p.email}
                      </p>
                    )}
                    <p className="type-meta-small text-[var(--text-muted)] mt-1">
                      Joined {formatDateTime(p.joinedAt)}
                      {p.leftAt && ` · Left ${formatDateTime(p.leftAt)}`}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Linked">
              {data.projectId ? (
                <div className="type-meta-small mb-2">
                  Project:{' '}
                  <Link
                    href={`/projects/${data.projectId}` as any}
                    className="underline font-mono"
                  >
                    {data.projectId.slice(0, 8)}
                  </Link>
                </div>
              ) : null}
              {data.proposalId ? (
                <div className="type-meta-small mb-2">
                  Proposal: <span className="font-mono">{data.proposalId.slice(0, 8)}</span>
                </div>
              ) : null}
              {!data.projectId && !data.proposalId && (
                <p className="type-meta-small italic text-[var(--text-muted)]">
                  Not linked to a project or proposal.
                </p>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
