/**
 * WP3 workflow-gate e2e fixture driver.
 *
 * The seeds carry no Stage-2 project approvals, so the gate ceremony, the
 * margin handoffs, and the guide's gate act all have nothing to render against
 * a freshly reset stack. This shells out to `psql` and runs the sibling
 * `workflow-gate-fixture.sql`, which builds that population through the real
 * lifecycle RPCs and prints a JSON id map.
 *
 * ── DATABASE SAFETY ────────────────────────────────────────────────────────
 * Refuses anything but 127.0.0.1/localhost, mirroring `psql.ts`. The SQL runs
 * parts of its work under `session_replication_role = 'replica'` to get past
 * the append-only evidence guards, which is a thing that may only ever happen
 * against a local stack.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/(127\.0\.0\.1|localhost)/.test(DB_URL)) {
  throw new Error(
    `REFUSING to run the workflow-gate fixture against a non-local Postgres URL: "${DB_URL}".`,
  );
}

// Homebrew keeps libpq keg-only, so `psql` is often off PATH (same list as
// e2e/helpers/psql.ts).
const PSQL_CANDIDATES = [
  '/opt/homebrew/opt/libpq/bin/psql',
  '/opt/homebrew/opt/libpq@18/bin/psql',
  '/usr/local/opt/libpq/bin/psql',
  'psql',
];
const PSQL_BIN =
  PSQL_CANDIDATES.find((c) => c === 'psql' || existsSync(c)) ?? 'psql';

const SQL_DIR = __dirname;

/** The seeded project every WP3 designer surface is exercised against. */
export const WORKFLOW_GATE_PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';

/** The two plan-set editions the fixture issues, by artifact title. */
export const EDITION_ONE_TITLE = 'Issue 01 - Design Development Set';
export const EDITION_TWO_TITLE = 'Issue 02 - Design Development Set, Rev B';

/**
 * Decision ids are minted by `create_project_approval_decision`, so they rotate
 * on every fixture run — nothing may hard-code them.
 */
export interface WorkflowGateIds {
  projectId: string;
  /** Draft, no review confirmation — publish is still locked. */
  draft: string;
  /** Published and pending a household response, due in the future. */
  pending: string;
  /** Responded `approved` — settled, sealed, wearing the APPROVED stamp. */
  approved: string;
  /** Published then superseded; its successor is `successor`. */
  superseded: string;
  /** The successor edition, itself approved, so its sealed row links back. */
  successor: string;
  /** Published and past due — the terracotta overdue stamp. */
  overdue: string;
  /** Draft whose review is complete — publish is unlocked. */
  readyToPublish: string;
  /** Responded `changes_requested` — bounced, so it stays in the margin. */
  changesRequested: string;
}

function runSqlFile(file: string): string {
  return execFileSync(
    PSQL_BIN,
    ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path.join(SQL_DIR, file), DB_URL],
    { encoding: 'utf8' },
  );
}

function psqlScalar(sql: string): string {
  return execFileSync(
    PSQL_BIN,
    ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', DB_URL, '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

/**
 * The fixture is shared, not per-file.
 *
 * `fullyParallel` runs spec FILES concurrently, and `describe.configure({ mode:
 * 'serial' })` only orders tests inside one file — so two suites that each
 * rebuilt the fixture in `beforeAll` would delete and re-mint each other's
 * decision ids mid-test, and would churn the seeded project underneath every
 * unrelated Document spec at the same time. Instead the first caller builds it
 * and records the id map; everyone else reuses it after checking the rows are
 * still there. The lock directory makes "first caller" a decision one process
 * wins rather than a race several enter.
 */
const MARKER = path.join(os.tmpdir(), 'patina-workflow-gate-fixture.json');
const LOCK = path.join(os.tmpdir(), 'patina-workflow-gate-fixture.lock');
const LOCK_TIMEOUT_MS = 180_000;

function fixtureStillPresent(ids: WorkflowGateIds): boolean {
  try {
    return (
      psqlScalar(
        `SELECT count(*) FROM public.client_decisions WHERE id = '${ids.pending}'::uuid`,
      ) === '1'
    );
  } catch {
    return false;
  }
}

function readMarker(): WorkflowGateIds | null {
  if (!existsSync(MARKER)) return null;
  try {
    const ids = JSON.parse(readFileSync(MARKER, 'utf8')) as WorkflowGateIds;
    return fixtureStillPresent(ids) ? ids : null;
  } catch {
    return null;
  }
}

function withLock<T>(work: () => T): T {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      if (Date.now() > deadline) {
        // A crashed run can leave the directory behind; a stale lock must not
        // wedge every later run.
        rmSync(LOCK, { recursive: true, force: true });
        mkdirSync(LOCK);
        break;
      }
      execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']);
    }
  }
  try {
    return work();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

/**
 * Returns the workflow-gate fixture, building it if it is not already standing.
 * The SQL tears down any previous fixture before it rebuilds, so a rebuild is
 * always from a clean floor.
 */
export function seedWorkflowGateFixture(): WorkflowGateIds {
  return withLock(() => {
    const existing = readMarker();
    if (existing) return existing;

    const out = runSqlFile('workflow-gate-fixture.sql').trim();
    const json = out.slice(out.indexOf('{'));
    let parsed: WorkflowGateIds;
    try {
      parsed = JSON.parse(json) as WorkflowGateIds;
    } catch {
      throw new Error(`workflow-gate fixture did not return an id map:\n${out}`);
    }
    writeFileSync(MARKER, JSON.stringify(parsed), 'utf8');
    return parsed;
  });
}

/**
 * Removes the fixture and restores the seeded phases' unclassified state.
 *
 * Deliberately NOT called from `afterAll`: sibling spec files share one
 * fixture, so a per-file teardown would pull it out from under a suite still
 * running. Call it by hand, or let `pnpm supabase:reset` clear it; the next
 * seed also tears down first.
 */
export function teardownWorkflowGateFixture(): void {
  withLock(() => {
    runSqlFile('workflow-gate-teardown.sql');
    rmSync(MARKER, { force: true });
  });
}

/**
 * Mints one extra published gate on the same project and returns its id.
 *
 * A suite that RESPONDS to a gate consumes it — settling folds the ceremony and
 * takes the gate out of the margin — so a mutating suite must never answer one
 * of the shared fixture's gates: the fixture is reused across files and across
 * runs, and the second run would find it already settled. Call this instead and
 * answer a gate of your own. Requires {@link seedWorkflowGateFixture} first.
 */
export function mintRespondableGate(label: string): string {
  const key = `e2e-respondable:${label}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
  const out = execFileSync(
    PSQL_BIN,
    [
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `KEY=${key}`,
      '-v',
      `TITLE=Respondable gate · ${label}`,
      '-f',
      path.join(SQL_DIR, 'workflow-gate-respondable.sql'),
      DB_URL,
    ],
    { encoding: 'utf8' },
  ).trim();
  const id = out.split('\n').pop()?.trim() ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    throw new Error(`respondable gate did not return a decision id:\n${out}`);
  }
  return id;
}

/** The margin item key the rail renders for a project-approval gate. */
export function handoffKey(decisionId: string): string {
  return `project_approval-${decisionId}`;
}

/** The anchor id a gate's act publishes in the margin (`workflow-gate.ts`). */
export function handoffAnchorId(decisionId: string): string {
  return `document-handoff-${decisionId}`;
}
