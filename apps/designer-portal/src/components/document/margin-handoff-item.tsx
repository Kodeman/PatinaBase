'use client';

/**
 * Handoffs in the margin (ratified Ruling III).
 *
 * The contextual handoff band is dissolved. Every row its projection produces
 * is a thing waiting on a named party, which is the definition of a margin
 * item — so each one renders here, in the rail, under the same paper grammar as
 * every other margin item: lane attribution, one need line, stage provenance as
 * microtext, and exactly one act.
 *
 * The 00442/00443 projection is untouched and read whole. What comes off is
 * register, not fact: no artifact checksum, no "Exact phase / Source domain",
 * no escalation booleans on the face of the item.
 *
 * Metadata here sits at the portal's 12px floor rather than reusing MItemContent's
 * 8px kind line, per the shipped-size note on mockup M4.
 */

import { useMemo, useState } from 'react';
import {
  useApproveSiteRequestItem,
  useCloseSiteRequest,
  useNudgeSiteRequest,
  useProjectContextualHandoffs,
  useRequestSiteRequestRedo,
  useSendDecisionReminder,
  useSiteRequestActionDetail,
  type ProjectContextualHandoff,
  type SiteRequestContextualHandoff,
} from '@patina/supabase';

import {
  deriveGates,
  handoffAnchorId,
  type WorkflowGate,
} from '@/lib/document/workflow-gate';
import { overdueStampLabel } from '@/lib/document/overdue-condition';
import { DocumentAction, DocumentActionRow } from './document-action';
import { focusProjectApproval } from './approvals/project-approval-navigation';

function sentence(value: string): string {
  const text = value.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The terracotta stamp — one of overdue's three renderings. */
function OverdueStamp({ gate }: { gate: WorkflowGate }) {
  const label = overdueStampLabel(gate.overdue);
  if (!label) return null;
  return (
    <span
      className="inline-block shrink-0 rounded-[2px] border px-1.5 py-px font-mono text-[12px] font-semibold uppercase tracking-[0.04em]"
      style={{
        borderColor: 'var(--color-terracotta)',
        color: 'var(--color-charcoal)',
      }}
    >
      {label}
    </span>
  );
}

function HandoffShell({
  gate,
  children,
  action,
}: {
  gate: WorkflowGate;
  children?: React.ReactNode;
  action: React.ReactNode;
}) {
  // The stamp is a mark on the item, not a sibling competing with the act for
  // the right-hand grid column. Sharing that column forced the need line's
  // column to a hard 0px at the ≥1440px rail width (item ~195px) once both a
  // stamp and an act needed to fit beside it. Its own row, above the need
  // line, keeps the stamp legible without taxing the text column at all.
  const stampLabel = overdueStampLabel(gate.overdue);
  return (
    <div
      className="mb-2 rounded-[5px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] transition-colors duration-150 hover:border-[var(--border-warm)]"
      style={{ borderLeft: '2.5px solid var(--color-golden-hour)' }}
      data-margin-handoff={gate.id}
    >
      <div className="px-3 py-2.5">
        {stampLabel && (
          <div className="mb-1.5 flex justify-end">
            <OverdueStamp gate={gate} />
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto] min-[360px]:items-start">
          <div className="min-w-0">
            <p className="break-words text-[13px] font-medium leading-snug text-[var(--color-charcoal)]">
              {gate.lane} · {gate.terms}
            </p>
            <p className="mt-1 break-words font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              {gate.provenance}
            </p>
          </div>
          <div className="flex shrink-0 items-center">{action}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Feedback({
  feedback,
}: {
  feedback: { kind: 'status' | 'error'; text: string } | null;
}) {
  if (!feedback) return null;
  return (
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
  );
}

/**
 * A project-approval gate. Its one act is either the nudge — the same reminder
 * RPC the decision rail already owns, keyed on the decision the projection
 * reports as this handoff's source — or a handoff to the approval ceremony,
 * which owns publishing and outcome selection.
 */
function ProjectApprovalHandoffItem({
  gate,
  approvalSurfaceMounted,
}: {
  gate: WorkflowGate;
  approvalSurfaceMounted: boolean;
}) {
  const remind = useSendDecisionReminder();
  const [feedback, setFeedback] = useState<{
    kind: 'status' | 'error';
    text: string;
  } | null>(null);

  // `open` dispatches a window event the approval ceremony listens for, and
  // that ceremony mounts only on a project engagement. Offering the act where
  // nothing is listening would be a button that silently does nothing.
  if (!gate.act || (gate.act.kind === 'open' && !approvalSurfaceMounted)) {
    return <HandoffShell gate={gate} action={null} />;
  }

  if (gate.act.kind === 'nudge') {
    return (
      <HandoffShell
        gate={gate}
        action={
          <DocumentAction
            actionKey="nudge-project-approval"
            surfaceKey="open-document"
            regionKey="margin-handoffs"
            variant="primary"
            id={handoffAnchorId(gate.sourceId)}
            loading={remind.isPending}
            loadingLabel="Sending…"
            onClick={() => {
              setFeedback(null);
              remind.mutate(
                { decisionId: gate.sourceId },
                {
                  onSuccess: () =>
                    setFeedback({ kind: 'status', text: 'Nudge recorded.' }),
                  onError: (error: unknown) =>
                    setFeedback({
                      kind: 'error',
                      text:
                        error instanceof Error
                          ? error.message
                          : 'The nudge failed.',
                    }),
                },
              );
            }}
          >
            {gate.act.label}
          </DocumentAction>
        }
      >
        {feedback && (
          <div className="px-3 pb-3">
            <Feedback feedback={feedback} />
          </div>
        )}
      </HandoffShell>
    );
  }

  return (
    <HandoffShell
      gate={gate}
      action={
        <DocumentAction
          actionKey="focus-project-approval-handoff"
          surfaceKey="open-document"
          regionKey="margin-handoffs"
          variant="primary"
          id={handoffAnchorId(gate.sourceId)}
          onClick={() => focusProjectApproval(gate.sourceId)}
        >
          {gate.act.label}
        </DocumentAction>
      }
    />
  );
}

/**
 * A Site Request gate. Close runs straight from the act; the acts that need
 * their own terms — nudge, approve, redo — unfold the item and collect them
 * there, so the face of the margin still carries one act.
 */
function SiteRequestHandoffItem({
  gate,
  handoff,
}: {
  gate: WorkflowGate;
  handoff: SiteRequestContextualHandoff;
}) {
  const [open, setOpen] = useState(false);
  const detailQuery = useSiteRequestActionDetail(
    handoff.projectId,
    open && handoff.sourceState !== 'awaiting_consent'
      ? handoff.sourceId
      : undefined,
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
  const foldId = `site-request-detail-${handoff.sourceId}`;

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

  if (!gate.act) {
    return (
      <HandoffShell gate={gate} action={null}>
        <p className="px-3 pb-3 text-[12px] text-[var(--text-muted)]">
          Waiting for the site party&rsquo;s consent. No studio act is
          available.
        </p>
      </HandoffShell>
    );
  }

  if (gate.act.kind === 'close') {
    return (
      <HandoffShell
        gate={gate}
        action={
          <DocumentAction
            actionKey="close-site-request"
            surfaceKey="open-document"
            regionKey="margin-handoffs"
            variant="primary"
            id={handoffAnchorId(gate.sourceId)}
            loading={close.isPending}
            loadingLabel="Closing…"
            onClick={() =>
              void run(
                () =>
                  close.mutateAsync({
                    projectId: handoff.projectId,
                    requestId: handoff.sourceId,
                  }),
                'Site Request closed.',
              )
            }
          >
            {gate.act.label}
          </DocumentAction>
        }
      >
        {feedback && (
          <div className="px-3 pb-3">
            <Feedback feedback={feedback} />
          </div>
        )}
      </HandoffShell>
    );
  }

  const canNudge = ['sent', 'in_progress', 'delivered'].includes(
    handoff.sourceState,
  );

  return (
    <HandoffShell
      gate={gate}
      action={
        <DocumentAction
          actionKey={handoff.actionKind}
          surfaceKey="open-document"
          regionKey="margin-handoffs"
          variant="primary"
          id={handoffAnchorId(gate.sourceId)}
          aria-expanded={open}
          aria-controls={foldId}
          onClick={() => setOpen((current) => !current)}
        >
          {gate.act.label}
        </DocumentAction>
      }
    >
      {open && (
        <div
          id={foldId}
          className="mx-3 mb-3 min-w-0 border-l-2 border-[var(--color-pearl)] pl-3"
        >
          {detailQuery.isLoading && (
            <p role="status" className="text-[12px] text-[var(--text-muted)]">
              Reading Site Request evidence…
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
              Current-version delivery evidence is unavailable. Approve and redo
              are disabled.
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
                    <p className="mt-1 break-words font-mono text-[12px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
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

              {canNudge && (
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

          <Feedback feedback={feedback} />
        </div>
      )}
    </HandoffShell>
  );
}

export function MarginHandoffItem({
  gate,
  handoff,
  approvalSurfaceMounted,
}: {
  gate: WorkflowGate;
  handoff: ProjectContextualHandoff;
  approvalSurfaceMounted: boolean;
}) {
  return handoff.sourceKind === 'project_approval' ? (
    <ProjectApprovalHandoffItem
      gate={gate}
      approvalSurfaceMounted={approvalSurfaceMounted}
    />
  ) : (
    <SiteRequestHandoffItem gate={gate} handoff={handoff} />
  );
}

/**
 * The project's gates, ordered. One clock is threaded in from the caller so the
 * margin stamp and the guide sentence cannot disagree across a midnight.
 *
 * The rail, the mobile chips, and the mobile spine summary all read this, so no
 * surface can under-report what the margin holds.
 */
export function useHandoffGates({
  projectId,
  clientName,
  now,
}: {
  projectId: string | null;
  clientName: string;
  now: Date;
}): {
  gates: WorkflowGate[];
  handoffsById: Map<string, ProjectContextualHandoff>;
  isError: boolean;
} {
  const handoffsQuery = useProjectContextualHandoffs(projectId);
  const handoffs = handoffsQuery.data ?? [];
  return useMemo(
    () => ({
      gates: projectId ? deriveGates(handoffs, now, clientName) : [],
      handoffsById: new Map(
        handoffs.map((handoff) => [
          `${handoff.sourceKind}-${handoff.sourceId}`,
          handoff,
        ]),
      ),
      isError: Boolean(projectId) && handoffsQuery.isError,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, clientName, now, handoffsQuery.data, handoffsQuery.isError],
  );
}

/**
 * Every handoff on the project, as margin items. There is no titled region and
 * no count: the margin already is the band.
 */
export function MarginHandoffs({
  gates,
  handoffsById,
  isError,
  approvalSurfaceMounted,
}: {
  gates: readonly WorkflowGate[];
  handoffsById: Map<string, ProjectContextualHandoff>;
  isError: boolean;
  approvalSurfaceMounted: boolean;
}) {
  if (isError) {
    return (
      <p role="alert" className="mb-2 text-[12px] text-[var(--color-charcoal)]">
        Project handoffs could not be read. No workflow state was changed.
      </p>
    );
  }

  return (
    <>
      {gates.map((gate) => {
        const handoff = handoffsById.get(gate.id);
        if (!handoff) return null;
        return (
          <MarginHandoffItem
            key={gate.id}
            gate={gate}
            handoff={handoff}
            approvalSurfaceMounted={approvalSurfaceMounted}
          />
        );
      })}
    </>
  );
}
