import type { BoardOwnerRef } from '@patina/types';

export type ProposalAutosaveOwner = string | BoardOwnerRef;

/** Legacy strings are proposal owners; new room code always passes a ref. */
export function normalizeAutosaveOwner(owner: ProposalAutosaveOwner): BoardOwnerRef {
  return typeof owner === 'string' ? { kind: 'proposal', id: owner } : owner;
}

function autosaveOwnerKey(owner: ProposalAutosaveOwner): string {
  const normalized = normalizeAutosaveOwner(owner);
  return `${normalized.kind}:${normalized.id}`;
}

export interface ProposalAutosaveBufferSnapshot {
  dirty: boolean;
  flushing: boolean;
  error: string | null;
}

export interface ProposalAutosaveSnapshot extends ProposalAutosaveBufferSnapshot {
  registeredBuffers: number;
  revision: number;
}

export interface ProposalAutosaveHandle {
  getSnapshot: () => ProposalAutosaveBufferSnapshot;
  flush: () => Promise<void>;
}

interface ProposalAutosaveRegistration {
  notify: () => void;
  unregister: () => void;
}

export class ProposalAutosaveBarrierError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProposalAutosaveBarrierError';
  }
}

const handlesByProposal = new Map<
  string,
  Map<symbol, ProposalAutosaveHandle>
>();
const listenersByProposal = new Map<string, Set<() => void>>();
const snapshotsByProposal = new Map<string, ProposalAutosaveSnapshot>();
const activeFlushes = new Map<string, Promise<void>>();
const proposalActionTails = new Map<string, Promise<void>>();

function emptySnapshot(revision = 0): ProposalAutosaveSnapshot {
  return {
    dirty: false,
    flushing: false,
    error: null,
    registeredBuffers: 0,
    revision,
  };
}

function recomputeProposalAutosaves(
  proposalId: string,
): ProposalAutosaveSnapshot {
  const handles = handlesByProposal.get(proposalId);
  const previous = snapshotsByProposal.get(proposalId) ?? emptySnapshot();
  const bufferSnapshots = handles
    ? [...handles.values()].map((handle) => handle.getSnapshot())
    : [];
  const actionPending = proposalActionTails.has(proposalId);
  const next: ProposalAutosaveSnapshot = {
    dirty: actionPending || bufferSnapshots.some((snapshot) => snapshot.dirty),
    flushing: actionPending || bufferSnapshots.some((snapshot) => snapshot.flushing),
    error:
      bufferSnapshots.find((snapshot) => snapshot.error)?.error ?? null,
    registeredBuffers: bufferSnapshots.length,
    revision: previous.revision + 1,
  };
  snapshotsByProposal.set(proposalId, next);
  for (const listener of listenersByProposal.get(proposalId) ?? []) {
    listener();
  }
  return next;
}

export function registerProposalAutosave(
  owner: ProposalAutosaveOwner,
  handle: ProposalAutosaveHandle,
): ProposalAutosaveRegistration {
  const proposalId = autosaveOwnerKey(owner);
  const token = Symbol(proposalId);
  const handles = handlesByProposal.get(proposalId) ?? new Map();
  handles.set(token, handle);
  handlesByProposal.set(proposalId, handles);
  let registered = true;
  recomputeProposalAutosaves(proposalId);

  return {
    notify: () => {
      if (registered) recomputeProposalAutosaves(proposalId);
    },
    unregister: () => {
      if (!registered) return;
      registered = false;
      const current = handlesByProposal.get(proposalId);
      current?.delete(token);
      if (current?.size === 0) handlesByProposal.delete(proposalId);
      recomputeProposalAutosaves(proposalId);
    },
  };
}

/** Canonical owner-aware registration used by board-room buffers. */
export function registerBoardOwnerAutosave(
  owner: BoardOwnerRef,
  handle: ProposalAutosaveHandle,
): ProposalAutosaveRegistration {
  return registerProposalAutosave(owner, handle);
}

export function subscribeToProposalAutosaves(
  owner: ProposalAutosaveOwner,
  listener: () => void,
): () => void {
  const proposalId = autosaveOwnerKey(owner);
  const listeners = listenersByProposal.get(proposalId) ?? new Set();
  listeners.add(listener);
  listenersByProposal.set(proposalId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByProposal.delete(proposalId);
  };
}

export function getProposalAutosaveSnapshot(
  owner: ProposalAutosaveOwner,
): ProposalAutosaveSnapshot {
  const proposalId = autosaveOwnerKey(owner);
  const existing = snapshotsByProposal.get(proposalId);
  if (existing) return existing;
  const initial = emptySnapshot();
  snapshotsByProposal.set(proposalId, initial);
  return initial;
}

export function isProposalAutosaveSnapshotClean(
  snapshot: ProposalAutosaveSnapshot,
): boolean {
  return !snapshot.dirty && !snapshot.flushing && !snapshot.error;
}

/**
 * Drain buffered editors without waiting for the proposal action tail. An
 * action uses this before its mutation, so including its own tail would
 * deadlock.
 */
async function flushRegisteredAutosaves(
  proposalId: string,
): Promise<void> {
  // A patch can be queued while another buffer is draining. Make a bounded
  // second pass, then fail closed instead of reviewing an unstable draft.
  for (let pass = 0; pass < 3; pass += 1) {
    const handles = [
      ...(handlesByProposal.get(proposalId)?.values() ?? []),
    ];
    for (const handle of handles) {
      try {
        await handle.flush();
      } catch (error) {
        const snapshot = recomputeProposalAutosaves(proposalId);
        throw new ProposalAutosaveBarrierError(
          snapshot.error
            ? `Proposal edits could not be saved: ${snapshot.error}`
            : 'Proposal edits could not be saved. Review the draft and try again.',
          { cause: error },
        );
      }
    }

    const bufferSnapshots = [
      ...(handlesByProposal.get(proposalId)?.values() ?? []),
    ].map((handle) => handle.getSnapshot());
    recomputeProposalAutosaves(proposalId);
    const error = bufferSnapshots.find((snapshot) => snapshot.error)?.error;
    if (
      !error &&
      !bufferSnapshots.some((snapshot) => snapshot.dirty || snapshot.flushing)
    ) {
      return;
    }
    if (error) {
      throw new ProposalAutosaveBarrierError(
        `Proposal edits could not be saved: ${error}`,
      );
    }
  }

  throw new ProposalAutosaveBarrierError(
    'Proposal edits are still changing. Wait for saving to finish, then review again.',
  );
}

/**
 * Wait for every immediate proposal action, then flush every registered buffer
 * in registration order. Recheck the tail so an action queued while waiting is
 * part of the same Send/switch barrier.
 */
export async function flushProposalAutosaves(
  owner: ProposalAutosaveOwner,
): Promise<void> {
  const proposalId = autosaveOwnerKey(owner);
  const active = activeFlushes.get(proposalId);
  if (active) return active;

  const run = (async () => {
    for (let pass = 0; pass < 3; pass += 1) {
      const actionTail = proposalActionTails.get(proposalId);
      if (actionTail) {
        try {
          await actionTail;
        } catch (error) {
          recomputeProposalAutosaves(proposalId);
          throw new ProposalAutosaveBarrierError(
            'A proposal change could not be completed. Review the draft and try again.',
            { cause: error },
          );
        }
      }

      await flushRegisteredAutosaves(proposalId);

      if (proposalActionTails.get(proposalId) !== undefined) continue;
      const snapshot = recomputeProposalAutosaves(proposalId);
      if (isProposalAutosaveSnapshotClean(snapshot)) return;
      if (snapshot.error) {
        throw new ProposalAutosaveBarrierError(
          `Proposal edits could not be saved: ${snapshot.error}`,
        );
      }
    }

    throw new ProposalAutosaveBarrierError(
      'Proposal edits are still changing. Wait for saving to finish, then review again.',
    );
  })();

  activeFlushes.set(proposalId, run);
  try {
    await run;
  } finally {
    if (activeFlushes.get(proposalId) === run) {
      activeFlushes.delete(proposalId);
    }
  }
}

/** Flush every buffer/action for either owner leg. */
export function flushBoardOwnerAutosaves(owner: BoardOwnerRef): Promise<void> {
  return flushProposalAutosaves(owner);
}

/**
 * Serialize an immediate mutation behind the proposal's buffered editors and
 * keep it visible to concurrent Send/switch barriers until it settles.
 */
export async function runProposalAutosaveAction<Result>(
  owner: ProposalAutosaveOwner,
  action: () => Promise<Result>,
): Promise<Result> {
  const proposalId = autosaveOwnerKey(owner);
  const previous = proposalActionTails.get(proposalId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    await flushRegisteredAutosaves(proposalId);
    return action();
  });

  const settled = run.then(() => undefined);
  proposalActionTails.set(proposalId, settled);
  recomputeProposalAutosaves(proposalId);
  const clearSettledTail = () => {
    if (proposalActionTails.get(proposalId) === settled) {
      proposalActionTails.delete(proposalId);
      recomputeProposalAutosaves(proposalId);
    }
  };
  void settled.then(clearSettledTail, clearSettledTail);
  return run;
}

/** Canonical structural barrier used by project- and proposal-owned rooms. */
export function runBoardOwnerAutosaveAction<Result>(
  owner: BoardOwnerRef,
  action: () => Promise<Result>,
): Promise<Result> {
  return runProposalAutosaveAction(owner, action);
}

/** Test isolation for the module-level external store. */
export function resetProposalAutosaveRegistryForTests(): void {
  handlesByProposal.clear();
  listenersByProposal.clear();
  snapshotsByProposal.clear();
  activeFlushes.clear();
  proposalActionTails.clear();
}
