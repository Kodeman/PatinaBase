'use client';

import { MessageComposer, MessageThread, type ThreadMessage } from '@patina/design-system';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  FileText,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';

import { postMessageAction, submitApprovalAction } from '@/app/projects/[projectId]/actions';
import {
  formatCurrency,
  formatDate,
  formatPercentage,
  formatRelativeTime,
  formatStatusLabel,
  statusAccentClass,
  statusDotClass,
} from '@/lib/utils/format';
import type { MilestoneDetail } from '@/types/project';

interface MilestoneCardProps {
  projectId: string;
  milestone: MilestoneDetail;
  isExpanded: boolean;
  onToggle: () => void;
}

export function MilestoneCard({ projectId, milestone, isExpanded, onToggle }: MilestoneCardProps) {
  const [decisionComment, setDecisionComment] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [messagePending, startMessageTransition] = useTransition();
  const [approvalPending, startApprovalTransition] = useTransition();

  const summary = useMemo(() => {
    const targetDate = formatDate(milestone.targetDate);
    const completionDate = formatDate(milestone.completionDate);
    const relative = formatRelativeTime(milestone.completionDate ?? milestone.targetDate);

    return {
      targetDate,
      completionDate,
      relative,
    };
  }, [milestone.completionDate, milestone.targetDate]);
  const conversationUserId = 'client';

  const conversationMessages = useMemo<ThreadMessage[]>(() => {
    return milestone.messages
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((message) => ({
        id: message.id,
        author: {
          id: message.authorId,
          name: message.authorName,
          role: message.authorRole,
        },
        timestamp: new Date(message.createdAt),
        body: message.body,
        attachments:
          message.attachments?.map((attachment) => ({
            id: attachment.id,
            name: attachment.title ?? 'Attachment',
            url: attachment.url,
            type: attachment.type,
          })) ?? [],
        variant: message.isSystem
          ? 'system'
          : message.authorRole === 'client'
            ? 'outgoing'
            : 'incoming',
      }));
  }, [milestone.messages]);

  const canPostMessage = Boolean(milestone.threadId);

  const handlePostMessage = (body: string) =>
    new Promise<void>((resolve, reject) => {
      if (!milestone.threadId) {
        setError('Messaging is unavailable for this milestone.');
        reject(new Error('Thread unavailable'));
        return;
      }

      setError(undefined);
      startMessageTransition(() => {
        (async () => {
          const result = await postMessageAction({
            projectId,
            threadId: milestone.threadId!,
            body,
          });

          if (!result.success) {
            setError(result.error);
            reject(new Error(result.error ?? 'Unable to send message'));
            return;
          }

          resolve();
        })();
      });
    });

  const handleDecision = (decision: 'approved' | 'changes_requested') => {
    if (!milestone.approval) {
      return;
    }

    if (decision === 'changes_requested' && decisionComment.trim().length === 0) {
      setError('Please share a short note so our team knows what to adjust.');
      return;
    }

    setError(undefined);
    startApprovalTransition(async () => {
      const result = await submitApprovalAction({
        projectId,
        approvalId: milestone.approval!.id,
        decision,
        comment: decision === 'changes_requested' ? decisionComment : undefined,
      });

      if (!result.success) {
        setError(result.error);
      }
    });
  };

  const statusClass = statusAccentClass(milestone.status);
  const statusDot = statusDotClass(milestone.status);

  return (
    <article className="relative">
      <button
        type="button"
        className="group relative flex w-full flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)]/90 px-6 py-5 text-left shadow-lg transition hover:border-[var(--color-accent)] focus-visible:focus-ring"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className={`mt-1 flex h-3 w-3 flex-none rounded-full ${statusDot} shadow-inner shadow-black/20 transition group-hover:scale-110`}
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">
                  Milestone {milestone.index + 1}
                </span>
                {milestone.phase ? (
                  <span className="text-xs text-[var(--color-muted)]">{milestone.phase}</span>
                ) : null}
              </div>
              <h3 className="font-[var(--font-playfair)] text-xl text-[var(--color-text)]">
                {milestone.title}
              </h3>
              {milestone.description ? (
                <p className="max-w-2xl text-sm text-[var(--color-muted)]">
                  {milestone.description}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${statusClass}`}>
                  <Circle className="h-3 w-3" />
                  {formatStatusLabel(milestone.status)}
                </span>
                {summary.targetDate ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-[var(--color-muted)]">
                    <CalendarDays className="h-3 w-3" />
                    {summary.targetDate}
                  </span>
                ) : null}
                {summary.relative ? <span className="text-[var(--color-muted)]">({summary.relative})</span> : null}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="flex items-center gap-2 text-[var(--color-muted)]">
              <span className="font-medium text-[var(--color-text)]">{formatPercentage(milestone.progressPercentage)}</span>
              <div className="h-2 w-32 overflow-hidden rounded-full bg-white/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-text)] transition-[width] duration-300"
                  style={{ width: `${Math.max(6, Math.round(milestone.progressPercentage))}%` }}
                />
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-[var(--color-muted)] transition ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="mt-2 rounded-3xl border border-[var(--color-border)] bg-white px-6 py-6 shadow-inner"
          >
            <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
              <div className="space-y-8">
                {milestone.checklist.length > 0 ? (
                  <section>
                    <h4 className="font-semibold text-[var(--color-text)]">Progress checklist</h4>
                    <ul className="mt-3 space-y-3">
                      {milestone.checklist.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2 text-sm"
                        >
                          {item.completed ? (
                            <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" aria-hidden />
                          ) : (
                            <Circle className="mt-1 h-5 w-5 text-[var(--color-border)]" aria-hidden />
                          )}
                          <div>
                            <p className="text-[var(--color-text)]">{item.label}</p>
                            {item.completedAt ? (
                              <p className="text-xs text-[var(--color-muted)]">
                                Wrapped {formatRelativeTime(item.completedAt) ?? ''}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {milestone.documents.length > 0 ? (
                  <section>
                    <h4 className="font-semibold text-[var(--color-text)]">Documents & deliverables</h4>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {milestone.documents.map((document) => (
                        <li key={document.id}>
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-full flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-3 text-sm text-[var(--color-text)] shadow-sm transition hover:border-[var(--color-accent)] focus-visible:focus-ring"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-medium">{document.title}</span>
                              <FileText className="h-4 w-4 text-[var(--color-muted)]" aria-hidden />
                            </div>
                            {document.description ? (
                              <p className="line-clamp-2 text-xs text-[var(--color-muted)]">{document.description}</p>
                            ) : null}
                            <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                              <span>{document.uploadedBy ?? 'Patina Team'}</span>
                              {document.uploadedAt ? <span>{formatDate(document.uploadedAt)}</span> : null}
                            </div>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <h4 className="font-semibold text-[var(--color-text)]">Conversation</h4>
                  <div className="mt-3 rounded-3xl border border-[var(--color-border)] bg-white/90 p-2 shadow-inner">
                    <MessageThread
                      className="h-64 rounded-[1.5rem] border border-transparent"
                      messages={conversationMessages}
                      currentUserId={conversationUserId}
                      showDaySeparators={false}
                      emptyState={
                        <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-6 text-sm text-[var(--color-muted)]">
                          There are no messages yet. Use the composer below to ask a question or share feedback.
                        </p>
                      }
                    />
                  </div>
                  <div className="mt-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-canvas)]/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                      <MessageCircle className="h-4 w-4" />
                      Send a message to your Patina team
                    </div>
                    <div className="mt-2 rounded-2xl border border-[var(--color-border)] bg-white/90 p-3">
                      <MessageComposer
                        disabled={!canPostMessage}
                        busy={messagePending}
                        placeholder={
                          canPostMessage
                            ? 'Share feedback, ask a question, or celebrate this milestone.'
                            : 'Messaging is unavailable for this milestone.'
                        }
                        onSend={({ body }) => handlePostMessage(body)}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-muted)]">
                      {error ? (
                        <span className="text-[var(--color-danger)]">{error}</span>
                      ) : (
                        <span>Messages are shared with the Patina delivery team.</span>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                {milestone.approval ? (
                  <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-canvas)] px-4 py-4 shadow-inner">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                      <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
                      Your approval is requested
                    </div>
                    {milestone.approval.summary ? (
                      <p className="mt-2 text-sm text-[var(--color-muted)]">{milestone.approval.summary}</p>
                    ) : null}
                    {typeof milestone.approval.totalValue === 'number' ? (
                      <p className="mt-3 text-sm font-medium text-[var(--color-text)]">
                        {formatCurrency(milestone.approval.totalValue, milestone.approval.currency)}
                      </p>
                    ) : null}
                    {milestone.approval.dueDate ? (
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        Decision requested by {formatDate(milestone.approval.dueDate)}
                      </p>
                    ) : null}
                    <textarea
                      value={decisionComment}
                      onChange={(event) => setDecisionComment(event.target.value)}
                      placeholder="Share optional feedback or revision notes"
                      className="mt-3 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white/90 px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus-visible:focus-ring"
                      rows={3}
                    />
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision('approved')}
                        disabled={approvalPending}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approvalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve milestone
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('changes_requested')}
                        disabled={approvalPending}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-text)] shadow transition hover:border-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approvalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />}
                        Request changes
                      </button>
                    </div>
                  </section>
                ) : null}

                {milestone.messages.length > 0 ? (
                  <section className="rounded-3xl border border-[var(--color-border)] bg-white px-4 py-4 shadow-inner">
                    <h5 className="text-sm font-semibold text-[var(--color-text)]">Activity moments</h5>
                    <ul className="mt-2 space-y-2 text-xs text-[var(--color-muted)]">
                      {milestone.messages.slice(0, 3).map((message) => (
                        <li key={`moment-${message.id}`} className="flex items-start gap-2">
                          <MessageCircle className="mt-0.5 h-3.5 w-3.5 text-[var(--color-accent)]" />
                          <span>
                            <span className="font-medium text-[var(--color-text)]">{message.authorName}</span> shared an update
                            <br />
                            {formatRelativeTime(message.createdAt) ?? ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </aside>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
