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
import { MilestoneDecisions } from './milestone-decisions';
import {
  formatCurrency,
  formatDate,
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
          role: message.authorRole as ThreadMessage['author']['role'],
        },
        timestamp: new Date(message.createdAt),
        body: message.body,
        attachments:
          message.attachments?.map((attachment) => ({
            id: attachment.id,
            name: attachment.title ?? 'Attachment',
            url: attachment.url,
            type: attachment.type as any,
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
      {/* Collapsed — typography-first, no card container */}
      <button
        type="button"
        className="group relative flex w-full flex-col gap-3 border-b border-[var(--border-default)] py-6 text-left transition hover:bg-[rgba(196,165,123,0.03)]"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={`mt-2 flex h-2.5 w-2.5 flex-none rounded-full ${statusDot}`}
            />
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="type-meta">
                  Milestone {milestone.index + 1}
                </span>
                {milestone.phase ? (
                  <span className="type-meta">· {milestone.phase}</span>
                ) : null}
              </div>
              <h3 className="font-heading text-xl text-[var(--text-primary)]">
                {milestone.title}
              </h3>
              {milestone.description ? (
                <p className="type-body-small max-w-2xl">
                  {milestone.description}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className={`type-meta font-medium ${statusClass}`}>
                  {formatStatusLabel(milestone.status)}
                </span>
                {summary.targetDate ? (
                  <span className="type-meta flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {summary.targetDate}
                  </span>
                ) : null}
                {summary.relative ? <span className="type-meta">({summary.relative})</span> : null}
              </div>
            </div>
          </div>

          {/* Progress numeral + chevron */}
          <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-2">
            <div className="flex items-baseline gap-1">
              <span className="font-heading text-2xl font-bold text-[var(--text-primary)]">
                {Math.round(milestone.progressPercentage)}
              </span>
              <span className="type-meta-small">%</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-[var(--text-muted)] transition ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </div>
        </div>
      </button>

      {/* Expanded details — left border accent, no card */}
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="border-l-2 border-[var(--accent-primary)] ml-1 pl-8 pb-8 pt-4"
          >
            <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
              <div className="space-y-8">
                {/* Checklist */}
                {milestone.checklist.length > 0 ? (
                  <section>
                    <h4 className="type-meta mb-3">Progress checklist</h4>
                    <ul className="space-y-0">
                      {milestone.checklist.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-2.5 text-sm"
                        >
                          {item.completed ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-patina-sage" aria-hidden />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 text-[var(--border-default)]" aria-hidden />
                          )}
                          <div>
                            <p className="text-[var(--text-primary)]">{item.label}</p>
                            {item.completedAt ? (
                              <p className="type-meta-small mt-0.5">
                                Wrapped {formatRelativeTime(item.completedAt) ?? ''}
                              </p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* Documents */}
                {milestone.documents.length > 0 ? (
                  <section>
                    <h4 className="type-meta mb-3">Documents & deliverables</h4>
                    <ul className="space-y-0">
                      {milestone.documents.map((document) => (
                        <li key={document.id}>
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] py-3 transition hover:bg-[rgba(196,165,123,0.04)]"
                          >
                            <div className="min-w-0">
                              <span className="text-sm font-medium text-[var(--text-primary)]">{document.title}</span>
                              {document.description ? (
                                <p className="type-body-small mt-0.5 line-clamp-2">{document.description}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <FileText className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
                              <span className="type-meta-small">{document.uploadedBy ?? 'Patina Team'}</span>
                              {document.uploadedAt ? <span className="type-meta-small">{formatDate(document.uploadedAt)}</span> : null}
                            </div>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* Conversation */}
                <section>
                  <h4 className="type-meta mb-3">Conversation</h4>
                  <div className="border border-[var(--border-default)] rounded-[3px] overflow-hidden">
                    <MessageThread
                      className="h-64 rounded-none border-0"
                      messages={conversationMessages}
                      currentUserId={conversationUserId}
                      showDaySeparators={false}
                      emptyState={
                        <p className="type-body-small px-4 py-6 text-center">
                          There are no messages yet. Use the composer below to ask a question or share feedback.
                        </p>
                      }
                    />
                  </div>
                  <div className="mt-4 border-t border-[var(--border-default)] pt-4">
                    <div className="flex items-center gap-2 type-meta mb-3">
                      <MessageCircle className="h-3.5 w-3.5" />
                      Send a message to your Patina team
                    </div>
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
                    <div className="mt-2 flex items-center justify-between">
                      {error ? (
                        <span className="type-meta text-patina-terracotta">{error}</span>
                      ) : (
                        <span className="type-meta-small">Messages are shared with the Patina delivery team.</span>
                      )}
                    </div>
                  </div>
                </section>
              </div>

              {/* Sidebar */}
              <aside className="space-y-8">
                {/* Approval */}
                {milestone.approval ? (
                  <section className="border-l-2 border-patina-terracotta pl-4">
                    <p className="type-meta text-patina-terracotta flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Your approval is requested
                    </p>
                    {milestone.approval.summary ? (
                      <p className="type-body-small mt-2">{milestone.approval.summary}</p>
                    ) : null}
                    {typeof milestone.approval.totalValue === 'number' ? (
                      <p className="type-data-large mt-3">
                        {formatCurrency(milestone.approval.totalValue, milestone.approval.currency)}
                      </p>
                    ) : null}
                    {milestone.approval.dueDate ? (
                      <p className="type-meta mt-2">
                        Decision requested by {formatDate(milestone.approval.dueDate)}
                      </p>
                    ) : null}
                    <textarea
                      value={decisionComment}
                      onChange={(event) => setDecisionComment(event.target.value)}
                      placeholder="Share optional feedback or revision notes"
                      className="mt-4 w-full resize-none rounded-[3px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:focus-ring"
                      rows={3}
                    />
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision('approved')}
                        disabled={approvalPending}
                        className="inline-flex items-center justify-center gap-2 rounded-[3px] bg-patina-charcoal px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approvalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve milestone
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision('changes_requested')}
                        disabled={approvalPending}
                        className="inline-flex items-center justify-center gap-2 rounded-[3px] border border-[var(--border-default)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {approvalPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-patina-terracotta" />}
                        Request changes
                      </button>
                    </div>
                  </section>
                ) : null}

                <MilestoneDecisions
                  projectId={projectId}
                  phase={milestone.phase ?? milestone.title}
                />

                {/* Activity moments */}
                {milestone.messages.length > 0 ? (
                  <section>
                    <h5 className="type-meta mb-3">Activity moments</h5>
                    <ul className="space-y-0">
                      {milestone.messages.slice(0, 3).map((message) => (
                        <li key={`moment-${message.id}`} className="flex items-start gap-2 border-b border-[var(--border-subtle)] py-2">
                          <MessageCircle className="mt-0.5 h-3.5 w-3.5 text-[var(--accent-primary)]" />
                          <span className="type-meta-small">
                            <span className="font-medium text-[var(--text-primary)]">{message.authorName}</span> shared an update
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
