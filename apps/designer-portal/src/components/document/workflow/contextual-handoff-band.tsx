'use client';

import { useState } from 'react';
import {
  useApproveSiteRequestItem,
  useCloseSiteRequest,
  useNudgeSiteRequest,
  useProjectContextualHandoffs,
  useRequestSiteRequestRedo,
  useSiteRequestActionDetail,
  type ContextualHandoffActor,
  type ProjectContextualHandoff,
  type SiteRequestContextualHandoff,
} from '@patina/supabase';

import { DocumentAction, DocumentActionRow } from '../document-action';
import { focusProjectApproval } from '../approvals/project-approval-navigation';

const STAGE_LABELS: Record<string, string> = {
  inquiry_qualification: '01 · Inquiry & qualification',
  discovery_programming: '02 · Discovery & programming',
  scope_engagement: '03 · Scope & engagement',
  kickoff_existing_conditions: '04 · Kickoff & existing conditions',
  concept_schematic: '05 · Concept / schematic',
  design_development: '06 · Design development',
  documentation_authorization: '07 · Documentation & authorization',
  bidding_permitting_procurement: '08 · Bidding, permitting & procurement',
  contract_administration: '09 · Contract administration',
  delivery_installation: '10 · Delivery & installation',
  closeout_post_occupancy: '11 · Closeout & post-occupancy',
};

function sentence(value: string): string {
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function actorLabel(actor: ContextualHandoffActor): string {
  if (actor.label) return actor.label;
  if (actor.kind === 'site_party') return 'Site party';
  return sentence(actor.kind);
}

function stageLabel(handoff: ProjectContextualHandoff): string {
  const stage = handoff.canonicalStageKey
    ? (STAGE_LABELS[handoff.canonicalStageKey] ??
      sentence(handoff.canonicalStageKey))
    : 'Project phase';
  const track = handoff.workflowTrack
    ? ` · ${
        handoff.workflowTrack === 'ffe'
          ? 'FF&E'
          : sentence(handoff.workflowTrack)
      }`
    : '';
  return `${stage}${track}`;
}

function formatDue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Due date unavailable';
  return `Due ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)}`;
}

function dueContext(handoff: ProjectContextualHandoff): string | null {
  if (!handoff.isOverdue) return null;
  if (
    handoff.sourceKind === 'site_request' &&
    (handoff.sourceState === 'delivered' || handoff.sourceState === 'completed')
  ) {
    return 'Request due date passed';
  }
  if (handoff.sourceKind === 'project_approval') {
    return 'Client response due date passed';
  }
  return 'Due date passed';
}

function HandoffContext({ handoff }: { handoff: ProjectContextualHandoff }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-heading text-[16px] text-[var(--color-charcoal)]">
        {actorLabel(handoff.responsibility.sender)} →{' '}
        {actorLabel(handoff.responsibility.recipient)}
      </p>
      <p className="mt-1 break-words text-[12px] text-[var(--text-muted)]">
        Current owner · {actorLabel(handoff.responsibility.currentOwner)}
      </p>
      <p className="mt-1 break-words font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--color-quiet-ink)]">
        {stageLabel(handoff)} ·{' '}
        {handoff.stageAttribution === 'exact_project_phase'
          ? 'Exact phase'
          : 'Source domain'}
      </p>
      <p className="mt-2 break-words text-[13px] text-[var(--color-charcoal)]">
        Expected · {sentence(handoff.expectedResponse)}
      </p>
      <p className="mt-1 break-words text-[12px] text-[var(--text-muted)]">
        {formatDue(handoff.dueAt)}
        {dueContext(handoff) ? ` · ${dueContext(handoff)}` : ''}
      </p>
      {handoff.sourceKind === 'project_approval' ? (
        <p className="mt-1 break-words text-[12px] text-[var(--text-muted)]">
          {handoff.artifact.title} · v{handoff.artifact.version} ·{' '}
          {sentence(handoff.artifact.kind)} · proof{' '}
          {handoff.artifact.checksum.slice(0, 8)}
        </p>
      ) : (
        <div className="mt-1 min-w-0 text-[12px] text-[var(--text-muted)]">
          <p className="break-words">
            {handoff.artifact.itemCount}{' '}
            {handoff.artifact.itemCount === 1 ? 'item' : 'items'}
            {handoff.artifact.dueContext
              ? ` · ${handoff.artifact.dueContext}`
              : ''}
          </p>
          <p className="mt-1 break-words">
            {handoff.escalation.nudgeSent ? 'Nudge sent' : 'No nudge sent'} ·{' '}
            {handoff.escalation.dueReminderSent
              ? 'Due reminder sent'
              : 'No due reminder sent'}
          </p>
          <ul aria-label="Site Request artifact items" className="mt-1 min-w-0">
            {handoff.artifact.items.map((item) => (
              <li
                key={`${item.kitCode}-${item.version}-${item.title}`}
                className="break-words"
              >
                {item.title} · v{item.version} · {sentence(item.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProjectApprovalHandoffRow({
  handoff,
}: {
  handoff: Extract<
    ProjectContextualHandoff,
    { sourceKind: 'project_approval' }
  >;
}) {
  return (
    <li className="min-w-0 border-b border-[var(--border-subtle)] py-4 last:border-b-0">
      <article className="grid min-w-0 grid-cols-1 gap-2 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-start">
        <HandoffContext handoff={handoff} />
        <DocumentAction
          actionKey="focus-project-approval-handoff"
          surfaceKey="open-document"
          regionKey="contextual-handoffs"
          variant="primary"
          onClick={() => focusProjectApproval(handoff.sourceId)}
        >
          Open approval
        </DocumentAction>
      </article>
    </li>
  );
}

function SiteRequestHandoffRow({
  handoff,
}: {
  handoff: SiteRequestContextualHandoff;
}) {
  const needsDetail = ['sent', 'in_progress', 'delivered'].includes(
    handoff.sourceState,
  );
  const [open, setOpen] = useState(false);
  const detailQuery = useSiteRequestActionDetail(
    handoff.projectId,
    open && needsDetail ? handoff.sourceId : undefined,
  );
  const nudge = useNudgeSiteRequest();
  const approve = useApproveSiteRequestItem();
  const redo = useRequestSiteRequestRedo();
  const close = useCloseSiteRequest();
  const [nudgeNote, setNudgeNote] = useState('');
  const [redoNotes, setRedoNotes] = useState<Record<string, string>>({});
  const [approvalRooms, setApprovalRooms] = useState<Record<string, string>>(
    {},
  );
  const [feedback, setFeedback] = useState<{
    kind: 'status' | 'error';
    text: string;
  } | null>(null);
  const detailRegionId = `site-request-detail-${handoff.sourceId}`;

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setFeedback(null);
    try {
      await operation();
      setFeedback({ kind: 'status', text: success });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'The action failed.',
      });
    }
  };

  const primaryLabel =
    handoff.sourceState === 'completed'
      ? 'Close Site Request'
      : handoff.sourceState === 'delivered'
        ? 'Review Site Request'
        : 'View Site Request';

  const onPrimaryAction = () => {
    if (handoff.sourceState === 'completed') {
      void run(
        () =>
          close.mutateAsync({
            projectId: handoff.projectId,
            requestId: handoff.sourceId,
          }),
        'Site Request closed.',
      );
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <li className="min-w-0 border-b border-[var(--border-subtle)] py-4 last:border-b-0">
      <article className="grid min-w-0 grid-cols-1 gap-2 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-start">
        <HandoffContext handoff={handoff} />
        <DocumentAction
          actionKey={handoff.actionKind}
          surfaceKey="open-document"
          regionKey="contextual-handoffs"
          variant="primary"
          aria-expanded={handoff.sourceState === 'completed' ? undefined : open}
          aria-controls={
            handoff.sourceState === 'completed' ? undefined : detailRegionId
          }
          loading={close.isPending}
          loadingLabel="Closing…"
          onClick={onPrimaryAction}
        >
          {primaryLabel}
        </DocumentAction>
      </article>

      {open && handoff.sourceState !== 'awaiting_consent' && (
        <div
          id={detailRegionId}
          className="mt-3 min-w-0 border-l-2 border-[var(--color-pearl)] pl-3"
        >
          {detailQuery.isLoading && (
            <p role="status" className="text-[12px] text-[var(--text-muted)]">
              Reading exact Site Request evidence…
            </p>
          )}
          {detailQuery.isError && (
            <p
              role="alert"
              className="text-[12px] text-[var(--color-charcoal)]"
            >
              Site Request detail could not be read. No action was taken.
            </p>
          )}
          {detailQuery.data && !detailQuery.data.coherent && (
            <p
              role="alert"
              className="text-[12px] text-[var(--color-charcoal)]"
            >
              Exact current-version delivery evidence is unavailable. Approve
              and redo are disabled.
            </p>
          )}

          {detailQuery.data?.coherent && (
            <div className="grid min-w-0 grid-cols-1 gap-4">
              {detailQuery.data.items.map((item) => {
                const approvalRoomId =
                  item.roomId ?? approvalRooms[item.itemId] ?? '';
                return (
                  <div
                    key={item.itemId}
                    className="min-w-0 border-b border-[var(--border-subtle)] pb-3 last:border-b-0"
                  >
                    <p className="break-words text-[13px] font-medium text-[var(--color-charcoal)]">
                      {item.title}
                    </p>
                    <p className="mt-1 break-words font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {item.kitCode} · v{item.version} · {sentence(item.status)}
                    </p>
                    {item.status === 'delivered' && item.deliverableId && (
                      <>
                        {item.roomId === null && (
                          <div className="mt-3 min-w-0">
                            <label
                              htmlFor={`site-room-${item.itemId}`}
                              className="block text-[12px] text-[var(--color-charcoal)]"
                            >
                              Room for {item.title}
                            </label>
                            <select
                              id={`site-room-${item.itemId}`}
                              required
                              value={approvalRooms[item.itemId] ?? ''}
                              onChange={(event) =>
                                setApprovalRooms((current) => ({
                                  ...current,
                                  [item.itemId]: event.target.value,
                                }))
                              }
                              className="mt-1 min-h-11 w-full min-w-0 max-w-full rounded-[3px] border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[14px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] focus-visible:ring-2 focus-visible:ring-[var(--color-clay)]/30"
                            >
                              <option value="">Select a project room</option>
                              {detailQuery.data.rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                            {detailQuery.data.rooms.length === 0 && (
                              <p
                                role="alert"
                                className="mt-1 text-[12px] text-[var(--color-charcoal)]"
                              >
                                No same-project room is available. Approval is
                                disabled.
                              </p>
                            )}
                          </div>
                        )}
                        <DocumentActionRow
                          surfaceKey="open-document"
                          regionKey={`site-request-${handoff.sourceId}-${item.itemId}`}
                          className="mt-2 flex-wrap"
                          aria-label={`${item.title} review actions`}
                        >
                          <DocumentAction
                            actionKey="approve-site-request-item"
                            variant="primary"
                            loading={approve.isPending}
                            loadingLabel="Approving…"
                            disabled={!approvalRoomId}
                            aria-label={`Approve ${item.title}`}
                            onClick={() => {
                              if (!approvalRoomId) {
                                setFeedback({
                                  kind: 'error',
                                  text: `Choose a project room before approving ${item.title}.`,
                                });
                                return;
                              }
                              void run(
                                () =>
                                  approve.mutateAsync({
                                    projectId: handoff.projectId,
                                    requestId: handoff.sourceId,
                                    itemId: item.itemId,
                                    deliverableId: item.deliverableId as string,
                                    roomId: approvalRoomId,
                                  }),
                                `${item.title} approved.`,
                              );
                            }}
                          >
                            Approve
                          </DocumentAction>
                        </DocumentActionRow>
                        <label
                          htmlFor={`site-redo-${item.itemId}`}
                          className="mt-3 block text-[12px] text-[var(--color-charcoal)]"
                        >
                          Redo note for {item.title}
                        </label>
                        <textarea
                          id={`site-redo-${item.itemId}`}
                          required
                          maxLength={4000}
                          value={redoNotes[item.itemId] ?? ''}
                          onChange={(event) =>
                            setRedoNotes((current) => ({
                              ...current,
                              [item.itemId]: event.target.value,
                            }))
                          }
                          className="mt-1 min-h-[88px] w-full min-w-0 max-w-full resize-y rounded-[3px] border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[14px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] focus-visible:ring-2 focus-visible:ring-[var(--color-clay)]/30"
                        />
                        <DocumentAction
                          actionKey="redo-site-request-item"
                          surfaceKey="open-document"
                          regionKey={`site-request-${handoff.sourceId}-${item.itemId}`}
                          variant="danger"
                          loading={redo.isPending}
                          loadingLabel="Requesting…"
                          aria-label={`Request redo for ${item.title}`}
                          onClick={() => {
                            const note = redoNotes[item.itemId] ?? '';
                            if (!note.trim()) {
                              setFeedback({
                                kind: 'error',
                                text: 'A redo note is required.',
                              });
                              return;
                            }
                            void run(
                              () =>
                                redo.mutateAsync({
                                  projectId: handoff.projectId,
                                  requestId: handoff.sourceId,
                                  itemId: item.itemId,
                                  note,
                                }),
                              `Redo requested for ${item.title}.`,
                            );
                          }}
                        >
                          Request redo
                        </DocumentAction>
                      </>
                    )}
                  </div>
                );
              })}

              {['sent', 'in_progress', 'delivered'].includes(
                handoff.sourceState,
              ) && (
                <div className="min-w-0">
                  <label
                    htmlFor={`site-nudge-${handoff.sourceId}`}
                    className="block text-[12px] text-[var(--color-charcoal)]"
                  >
                    Nudge note
                  </label>
                  <textarea
                    id={`site-nudge-${handoff.sourceId}`}
                    required
                    maxLength={4000}
                    value={nudgeNote}
                    onChange={(event) => setNudgeNote(event.target.value)}
                    className="mt-1 min-h-[88px] w-full min-w-0 max-w-full resize-y rounded-[3px] border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-[14px] text-[var(--color-charcoal)] outline-none focus-visible:border-[var(--color-clay)] focus-visible:ring-2 focus-visible:ring-[var(--color-clay)]/30"
                  />
                  <DocumentAction
                    actionKey="nudge-site-request"
                    surfaceKey="open-document"
                    regionKey={`site-request-${handoff.sourceId}`}
                    variant="secondary"
                    loading={nudge.isPending}
                    loadingLabel="Sending…"
                    onClick={() => {
                      if (!nudgeNote.trim()) {
                        setFeedback({
                          kind: 'error',
                          text: 'A nudge note is required.',
                        });
                        return;
                      }
                      void run(
                        () =>
                          nudge.mutateAsync({
                            projectId: handoff.projectId,
                            requestId: handoff.sourceId,
                            note: nudgeNote,
                          }),
                        'Site Request nudge queued.',
                      );
                    }}
                  >
                    Nudge site party
                  </DocumentAction>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {open && handoff.sourceState === 'awaiting_consent' && (
        <p
          id={detailRegionId}
          role="status"
          className="mt-2 text-[12px] text-[var(--text-muted)]"
        >
          Waiting for the site party’s consent. This handoff is informational;
          no studio lifecycle action is available.
        </p>
      )}

      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 break-words text-[12px] ${
            feedback.kind === 'error'
              ? 'text-[var(--color-charcoal)]'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </li>
  );
}

export function ContextualHandoffBand({ projectId }: { projectId: string }) {
  const handoffsQuery = useProjectContextualHandoffs(projectId);

  if (handoffsQuery.isLoading) {
    return (
      <section
        aria-label="Project handoffs"
        aria-busy="true"
        className="mt-6 min-w-0 max-w-full border-y border-[var(--border-subtle)] py-4"
      >
        <p className="text-[12px] text-[var(--text-muted)]">
          Reading project handoffs…
        </p>
      </section>
    );
  }

  if (handoffsQuery.isError) {
    return (
      <section
        aria-label="Project handoffs"
        className="mt-6 min-w-0 max-w-full border-y border-[var(--border-subtle)] py-4"
      >
        <p role="alert" className="text-[12px] text-[var(--color-charcoal)]">
          Project handoffs could not be read. No workflow state was changed.
        </p>
      </section>
    );
  }

  const handoffs = handoffsQuery.data ?? [];
  if (handoffs.length === 0) return null;

  return (
    <section
      aria-labelledby="project-handoffs-title"
      className="mt-6 min-w-0 max-w-full border-y border-[var(--border-subtle)] py-4"
      data-contextual-handoff-band
    >
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
          Responsibility in context
        </p>
        <h2
          id="project-handoffs-title"
          className="font-heading text-[20px] font-medium text-[var(--color-charcoal)]"
        >
          Project handoffs
        </h2>
      </div>
      <ol className="mt-2 grid min-w-0 grid-cols-1">
        {handoffs.map((handoff) =>
          handoff.sourceKind === 'project_approval' ? (
            <ProjectApprovalHandoffRow
              key={`${handoff.sourceKind}-${handoff.sourceId}`}
              handoff={handoff}
            />
          ) : (
            <SiteRequestHandoffRow
              key={`${handoff.sourceKind}-${handoff.sourceId}`}
              handoff={handoff}
            />
          ),
        )}
      </ol>
    </section>
  );
}
