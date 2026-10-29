/**
 * RC-7 E7 (X08): the shared web parsers, current and older, run over the
 * payloads the owned stack actually returned for one mixed project: legacy
 * Stage-2 approvals of every kind and disposition, legacy client decisions,
 * C4 requests (returned, replaced signer, paper, withdrawn, open), C6
 * completions (with conditions, revoked) and C5 external fulfilments.
 *
 * Payloads: e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json, written
 * by export-payloads.mjs after mixed-fixture.sql (real GoTrue sessions, real
 * PostgREST reads). "Older" = the file at `main`, transpiled and evaluated
 * with its relative imports resolved into this tree.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import {
  parseProjectApprovalReview,
  readMyServiceAcceptanceRequests,
  readMyStudioServiceCompletion,
  readProjectServiceAcceptance,
  readStudioServiceCompletion,
} from '@patina/supabase';
import payloads from '../../../e2e/round8/rc7-e7-fixtures/payloads/mixed-payloads.json';

type Recorded = { status: number; body: unknown };
type Actor = Record<string, Recorded>;
const actors = payloads.actors as unknown as Record<string, Actor>;
const { project, request } = payloads.meta;

const repoRoot = path.resolve(__dirname, '../../../../..');
const BASE_REF = 'main';
function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
const baseSha = git(['rev-parse', BASE_REF])?.trim() ?? null;
const describeBase = baseSha ? describe : describe.skip;

/** Evaluate `<BASE_REF>:<rel>` as CommonJS; relative imports resolve into this tree. */
function loadBase<T>(rel: string): T {
  const source = git(['show', `${BASE_REF}:${rel}`]);
  if (source == null) throw new Error(`${rel} is absent on ${BASE_REF}`);
  const { outputText } = ts.transpileModule(source, {
    fileName: rel,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const dir = path.join(repoRoot, path.dirname(rel));
  const mod = { exports: {} as Record<string, unknown> };
  const req = (spec: string) => require(spec.startsWith('.') ? path.join(dir, spec) : spec);
  new Function('exports', 'require', 'module', outputText)(mod.exports, req, mod);
  return mod.exports as T;
}

const APPROVALS_REL = 'packages/supabase/src/hooks/use-project-approvals.ts';
const LEGACY_KINDS = ['plan_issue', 'spec_book_artifact', 'budget_version'];
const decision = (n: number) => `e7e7a000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STAGE2 = [1, 2, 3, 4, 5].map(decision);
const STUDIO = ['studio_owner', 'studio_member', 'studio_admin'];

/** Every recorded approval-list read that returned rows to parse. */
function approvalLists(): Array<[string, string, unknown[]]> {
  const out: Array<[string, string, unknown[]]> = [];
  for (const [label, a] of Object.entries(actors)) {
    for (const [key, rec] of Object.entries(a)) {
      if ((key === 'list_my_project_decision_reviews' || key.startsWith('get_project_decision_reviews.'))
          && rec.status === 200) {
        out.push([label, key, rec.body as unknown[]]);
      }
    }
  }
  return out;
}

describe('RC7-E7 X08 recorded payloads', () => {
  it('come from the owned rc7-e7 stack and cover all ten actors', () => {
    expect(payloads.meta.api).toBe('http://127.0.0.1:59121');
    expect(Object.keys(actors)).toHaveLength(10);
    expect(approvalLists().length).toBeGreaterThanOrEqual(10 + 3 * 3 + 1);
  });
});

describeBase(`RC7-E7 X08 older approval parser (${BASE_REF})`, () => {
  const base = loadBase<{ parseProjectApprovalReview: typeof parseProjectApprovalReview }>(APPROVALS_REL);

  it('is the same blob as the current parser (so the base run is the shipped older reader)', () => {
    const atBase = git(['rev-parse', `${BASE_REF}:${APPROVALS_REL}`])?.trim();
    const atHead = git(['hash-object', path.join(repoRoot, APPROVALS_REL)])?.trim();
    expect(atBase).toMatch(/^[0-9a-f]{40}$/);
    expect(atHead).toBe(atBase);
  });

  it.each(approvalLists())('%s %s: every row parses; only legacy kinds, never a service record', (label, key, rows) => {
    const older = rows.map(base.parseProjectApprovalReview);
    const current = rows.map(parseProjectApprovalReview);
    expect(older).toEqual(current);
    for (const review of older) {
      expect(LEGACY_KINDS).toContain(review.artifactKind);
      expect(STAGE2).toContain(review.decisionId);
    }
    for (const row of rows as Record<string, unknown>[]) {
      expect(row).not.toHaveProperty('requestId');
      expect(row).not.toHaveProperty('signers');
    }
    // Readers of job 1 (its studio and its lead) see the five Stage-2 rows in
    // their inbox and on job 1; jobs 2 and 3 carry only service records.
    const reader = STUDIO.includes(label) || label === 'client_lead';
    const coversJob1 = key === 'list_my_project_decision_reviews' || key.endsWith('.job1');
    expect(rows).toHaveLength(reader && coversJob1 ? 5 : 0);
  });

  it('the older list shows the five Stage-2 rows with their recorded states', () => {
    const rows = (actors.client_lead.list_my_project_decision_reviews.body as unknown[]).map(base.parseProjectApprovalReview);
    const byId = Object.fromEntries(rows.map((r) => [r.decisionId, r]));
    expect(byId[decision(1)]).toMatchObject({ artifactKind: 'plan_issue', lifecycleStatus: 'pending', disposition: 'active', viewerRole: 'lead' });
    expect(byId[decision(2)]).toMatchObject({ artifactKind: 'spec_book_artifact', lifecycleStatus: 'draft', disposition: 'active' });
    expect(byId[decision(3)]).toMatchObject({ artifactKind: 'budget_version', lifecycleStatus: 'responded', outcome: 'approved' });
    expect(byId[decision(4)]).toMatchObject({ lifecycleStatus: 'expired', disposition: 'withdrawn' });
    expect(byId[decision(5)]).toMatchObject({ lifecycleStatus: 'expired', disposition: 'superseded' });
  });

  it('single-review reads parse for readers and are null for everyone else', () => {
    for (const [label, a] of Object.entries(actors)) {
      for (const n of [1, 2, 3, 4, 5]) {
        const rec = a[`get_project_decision_review.a${n}`];
        expect(rec.status).toBe(200);
        if (STUDIO.includes(label) || label === 'client_lead') {
          expect(base.parseProjectApprovalReview(rec.body).decisionId).toBe(decision(n));
        } else {
          expect(rec.body).toBeNull();
        }
      }
    }
  });

  it('negative control: one service record in the list would break the whole older inbox', () => {
    const service = (actors.client_lead.get_my_service_acceptance_requests.body as unknown[])[0];
    const approvals = actors.client_lead.list_my_project_decision_reviews.body as unknown[];
    expect(() => base.parseProjectApprovalReview(service)).toThrow('invalid artifactKind');
    expect(() => [...approvals, service].map(base.parseProjectApprovalReview)).toThrow('invalid artifactKind');
  });
});

describe('RC7-E7 X08 current service consumers', () => {
  const mine = (label: string) => readMyServiceAcceptanceRequests(actors[label].get_my_service_acceptance_requests.body);
  // ServiceAcceptanceDoor's predicate (client-portal service-acceptance-door.tsx:12-13).
  const actionable = (label: string) => mine(label).filter((r) => r.lifecycle === 'sent'
    && r.viewerRole === 'signer_required' && r.signers.some((s) => s.signerId === r.viewerSignerId && !s.response));

  it('each actor reads exactly its own requests, and the replaced signer loses the replaced request', () => {
    const ids = (label: string) => mine(label).map((r) => r.requestId).sort();
    expect(ids('client_lead')).toEqual([request.r1, request.r2, request.p1, request.s1, request.s2].sort());
    expect(ids('co_client')).toEqual([request.r1, request.r2, request.s1, request.s2].sort());
    expect(ids('replaced_partner')).toEqual([request.r1, request.s1, request.s2].sort());
    expect(ids('replacement_partner')).toEqual([request.r2]);
    for (const label of [...STUDIO, 'other_studio_owner', 'gc_party', 'outsider']) expect(ids(label)).toEqual([]);
  });

  it('only the open request reaches the door, and only for its required signers', () => {
    for (const label of ['client_lead', 'co_client', 'replaced_partner']) {
      expect(actionable(label).map((r) => r.requestId)).toEqual([request.s2]);
    }
    expect(actionable('replacement_partner')).toEqual([]);
    const lead = Object.fromEntries(mine('client_lead').map((r) => [r.requestId, r]));
    expect(lead[request.p1]).toMatchObject({ lifecycle: 'closed', viewerRole: 'observer', aggregateOutcome: 'accepted' });
    expect(lead[request.r2]).toMatchObject({ lifecycle: 'closed', aggregateOutcome: 'accepted_with_conditions' });
    expect(lead[request.r1]).toMatchObject({ lifecycle: 'closed', aggregateOutcome: 'returned' });
    expect(lead[request.s1].lifecycle).toBe('withdrawn');
  });

  it('client completion reads: conditional completion shows; a revoked one does not', () => {
    const read = (job: 'job1' | 'job2' | 'job3', req: string) =>
      readMyStudioServiceCompletion(actors.client_lead[`get_studio_service_completion.${job}`].body, project[job], req);
    expect(read('job1', request.r2)?.completion).toMatchObject({ state: 'completed_with_conditions', acceptanceRequestId: request.r2 });
    expect(read('job1', request.r1)?.completion).toBeNull();
    expect(read('job2', request.p1)?.completion).toBeNull();
    expect(read('job3', request.s2)?.completion).toBeNull();
  });

  it('studio reads parse for every job and keep the revoked completion visible as revoked', () => {
    for (const label of STUDIO) {
      for (const job of ['job1', 'job2', 'job3'] as const) {
        const acceptance = readProjectServiceAcceptance(actors[label][`get_project_service_acceptance.${job}`].body, project[job]);
        expect(acceptance.requests.length).toBeGreaterThan(0);
        readStudioServiceCompletion(actors[label][`get_studio_service_completion.${job}`].body, project[job]);
      }
      const job1 = readStudioServiceCompletion(actors[label]['get_studio_service_completion.job1'].body, project.job1);
      expect(job1.completions.map((c) => c.state)).toEqual(['completed_with_conditions']);
      const job2 = readStudioServiceCompletion(actors[label]['get_studio_service_completion.job2'].body, project.job2);
      expect(job2.completions).toHaveLength(1);
      expect(job2.completions[0].revokedAt).not.toBeNull();
      expect(actors[label]['get_project_external_fulfilments.job1'].body).toHaveLength(2);
    }
  });
});
