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

const handlesByProposal = new Map<string, Map<symbol, ProposalAutosaveHandle>>();
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

function recomputeProposalAutosaves(proposalId: string): ProposalAutosaveSnapshot {
  const handles = handlesByProposal.get(proposalId);
  const previous = snapshotsByProposal.get(proposalId) ?? emptySnapshot();
  const bufferSnapshots = handles ? [...handles.values()].map((handle) => handle.getSnapshot()) : [];
  const next: ProposalAutosaveSnapshot = {
    dirty: bufferSnapshots.some((snapshot) => snapshot.dirty),
    flushing: bufferSnapshots.some((snapshot) => snapshot.flushing),
    error: bufferSnapshots.find((snapshot) => snapshot.error)?.error ?? null,
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
  proposalId: string,
  handle: ProposalAutosaveHandle,
): ProposalAutosaveRegistration {
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

export function subscribeToProposalAutosaves(proposalId: string, listener: () => void): () => void {
  const listeners = listenersByProposal.get(proposalId) ?? new Set();
  listeners.add(listener);
  listenersByProposal.set(proposalId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByProposal.delete(proposalId);
  };
}

export function getProposalAutosaveSnapshot(proposalId: string): ProposalAutosaveSnapshot {
  const existing = snapshotsByProposal.get(proposalId);
  if (existing) return existing;
  const initial = emptySnapshot();
  snapshotsByProposal.set(proposalId, initial);
  return initial;
}

export function isProposalAutosaveSnapshotClean(snapshot: ProposalAutosaveSnapshot): boolean {
  return !snapshot.dirty && !snapshot.flushing && !snapshot.error;
}

/**
 * Flush every buffer registered to a proposal in registration order. The
 * ordering matters when a failed, detached editor and its remounted successor
 * both own a patch for the same row: the newer buffer must write last.
 */
export async function flushProposalAutosaves(proposalId: string): Promise<void> {
  const active = activeFlushes.get(proposalId);
  if (active) return active;

  const run = (async () => {
    // A patch can be queued while another buffer is draining. Make a bounded
    // second pass, then fail closed instead of reviewing an unstable draft.
    for (let pass = 0; pass < 3; pass += 1) {
      const handles = [...(handlesByProposal.get(proposalId)?.values() ?? [])];
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

      const snapshot = recomputeProposalAutosaves(proposalId);
      if (isProposalAutosaveSnapshotClean(snapshot)) return;
      if (snapshot.error) {
        throw new ProposalAutosaveBarrierError(`Proposal edits could not be saved: ${snapshot.error}`);
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

/**
 * Serialize an immediate proposal mutation behind every buffered editor, then
 * expose that mutation as a temporary barrier handle until it settles. This
 * keeps board/item structural actions ordered with each other and prevents a
 * concurrent Send or board switch from passing while an immediate write is in
 * flight.
 */
export async function runProposalAutosaveAction<Result>(
  proposalId: string,
  action: () => Promise<Result>,
): Promise<Result> {
  const previous = proposalActionTails.get(proposalId) ?? Promise.resolve();

  const run = previous
    .catch(() => undefined)
    .then(async () => {
      await flushProposalAutosaves(proposalId);

      let actionPromise!: Promise<Result>;
      const registration = registerProposalAutosave(proposalId, {
        getSnapshot: () => ({ dirty: true, flushing: true, error: null }),
        flush: async () => {
          await actionPromise;
        },
      });
      actionPromise = Promise.resolve().then(action);

      try {
        return await actionPromise;
      } finally {
        registration.unregister();
      }
    });

  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  proposalActionTails.set(proposalId, settled);
  try {
    return await run;
  } finally {
    if (proposalActionTails.get(proposalId) === settled) {
      proposalActionTails.delete(proposalId);
    }
  }
}

/** Test isolation for the module-level external store. */
export function resetProposalAutosaveRegistryForTests(): void {
  handlesByProposal.clear();
  listenersByProposal.clear();
  snapshotsByProposal.clear();
  activeFlushes.clear();
  proposalActionTails.clear();
}
