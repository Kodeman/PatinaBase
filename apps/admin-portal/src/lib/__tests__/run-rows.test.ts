import {
  buildRunRows,
  compareRuns,
  isRunView,
  mapAgentTaskRun,
  mapJobRun,
  matchesView,
  type AgentTaskSource,
  type JobRunSource,
  type RunRow,
} from '@/lib/run-rows';

function jobRun(overrides: Partial<JobRunSource> = {}): JobRunSource {
  return {
    id: 1,
    job_name: 'queue-groom',
    status: 'succeeded',
    started_at: '2026-07-12T10:00:00Z',
    finished_at: '2026-07-12T10:00:03Z',
    error: null,
    cost_usd: null,
    ...overrides,
  };
}

function agentTask(overrides: Partial<AgentTaskSource> = {}): AgentTaskSource {
  return {
    id: 'aaaa1111-2222-3333-4444-555566667777',
    task_type: 'vendor_qualification',
    status: 'done',
    source: 'cowork:vendor',
    attempts: 1,
    max_attempts: 5,
    started_at: '2026-07-12T09:00:00Z',
    completed_at: '2026-07-12T09:01:00Z',
    last_error: null,
    artifacts: {},
    parent_task_id: null,
    flagged_stale_at: null,
    ...overrides,
  };
}

describe('mapJobRun', () => {
  it('maps a job_runs row to a job RunRow with computed duration', () => {
    const r = mapJobRun(jobRun({ id: 7, cost_usd: '1.25' }));
    expect(r).toMatchObject({
      id: 'job-7',
      kind: 'job',
      name: 'queue-groom',
      source: 'job',
      status: 'succeeded',
      durationMs: 3000,
      costUsd: 1.25,
      retryCount: null,
      maxAttempts: null,
      parentTaskId: null,
      flaggedStaleAt: null,
    });
  });

  it('leaves duration null while the job is still running', () => {
    expect(mapJobRun(jobRun({ status: 'running', finished_at: null })).durationMs).toBeNull();
  });

  it('surfaces the job error text', () => {
    expect(mapJobRun(jobRun({ status: 'failed', error: 'boom' })).error).toBe('boom');
  });
});

describe('mapAgentTaskRun', () => {
  it('maps a plain agent task to an agent RunRow', () => {
    const r = mapAgentTaskRun(
      agentTask({ artifacts: { cost_usd: 0.42 }, attempts: 2, max_attempts: 5 }),
    );
    expect(r).toMatchObject({
      kind: 'agent',
      name: 'vendor_qualification',
      source: 'cowork:vendor',
      status: 'done',
      durationMs: 60000,
      costUsd: 0.42,
      retryCount: 2,
      maxAttempts: 5,
    });
    expect(r.id).toBe('agent-aaaa1111-2222-3333-4444-555566667777');
  });

  it('classifies a job-typed task (task_type job:*) as a job run', () => {
    expect(mapAgentTaskRun(agentTask({ task_type: 'job:catalog' })).kind).toBe('job');
  });

  it('reads cost_usd out of artifacts (string or number) and null when absent', () => {
    expect(mapAgentTaskRun(agentTask({ artifacts: { cost_usd: '3.14' } })).costUsd).toBe(3.14);
    expect(mapAgentTaskRun(agentTask({ artifacts: {} })).costUsd).toBeNull();
    expect(mapAgentTaskRun(agentTask({ artifacts: null })).costUsd).toBeNull();
  });

  it('carries parentTaskId (re-run lineage) and flaggedStaleAt', () => {
    const r = mapAgentTaskRun(
      agentTask({ parent_task_id: 'parent-uuid', flagged_stale_at: '2026-07-12T12:00:00Z' }),
    );
    expect(r.parentTaskId).toBe('parent-uuid');
    expect(r.flaggedStaleAt).toBe('2026-07-12T12:00:00Z');
  });

  it('surfaces last_error as the failure text', () => {
    expect(mapAgentTaskRun(agentTask({ status: 'failed', last_error: 'rpc exploded' })).error).toBe(
      'rpc exploded',
    );
  });
});

describe('matchesView', () => {
  const jobRow: RunRow = mapJobRun(jobRun());
  const agentRow: RunRow = mapAgentTaskRun(agentTask());
  const failedRow: RunRow = mapJobRun(jobRun({ status: 'failed', error: 'x' }));
  const staleRow: RunRow = mapAgentTaskRun(agentTask({ flagged_stale_at: '2026-07-12T12:00:00Z' }));

  it('all matches everything', () => {
    for (const r of [jobRow, agentRow, failedRow, staleRow]) {
      expect(matchesView(r, 'all')).toBe(true);
    }
  });
  it('jobs matches kind job only', () => {
    expect(matchesView(jobRow, 'jobs')).toBe(true);
    expect(matchesView(agentRow, 'jobs')).toBe(false);
  });
  it('agents matches kind agent only', () => {
    expect(matchesView(agentRow, 'agents')).toBe(true);
    expect(matchesView(jobRow, 'agents')).toBe(false);
  });
  it('failed matches status failed only', () => {
    expect(matchesView(failedRow, 'failed')).toBe(true);
    expect(matchesView(jobRow, 'failed')).toBe(false);
  });
  it('stale matches flaggedStaleAt set only', () => {
    expect(matchesView(staleRow, 'stale')).toBe(true);
    expect(matchesView(agentRow, 'stale')).toBe(false);
  });
});

describe('compareRuns / ordering', () => {
  it('sorts startedAt descending with nulls last', () => {
    const rows: RunRow[] = [
      mapJobRun(jobRun({ id: 1, started_at: '2026-07-12T08:00:00Z' })),
      mapJobRun(jobRun({ id: 2, started_at: null, finished_at: null })),
      mapJobRun(jobRun({ id: 3, started_at: '2026-07-12T11:00:00Z' })),
    ];
    const sorted = [...rows].sort(compareRuns);
    expect(sorted.map((r) => r.id)).toEqual(['job-3', 'job-1', 'job-2']);
  });
});

describe('buildRunRows', () => {
  const jobRuns: JobRunSource[] = [
    jobRun({ id: 1, started_at: '2026-07-12T08:00:00Z' }),
    jobRun({ id: 2, status: 'failed', error: 'kaput', started_at: '2026-07-12T12:00:00Z' }),
  ];
  const agentTasks: AgentTaskSource[] = [
    agentTask({ id: 'a1', started_at: '2026-07-12T10:00:00Z' }),
    agentTask({
      id: 'a2',
      task_type: 'job:catalog',
      started_at: '2026-07-12T09:00:00Z',
    }),
    agentTask({ id: 'a3', started_at: '2026-07-12T13:00:00Z', flagged_stale_at: '2026-07-12T14:00:00Z' }),
  ];

  it('unions both sources and sorts by startedAt desc', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'all', limit: 100 });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.id)).toEqual(['agent-a3', 'job-2', 'agent-a1', 'agent-a2', 'job-1']);
  });

  it('view=jobs keeps job_runs plus job-typed agent tasks', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'jobs', limit: 100 });
    expect(rows.map((r) => r.id).sort()).toEqual(['agent-a2', 'job-1', 'job-2']);
  });

  it('view=agents keeps only non-job agent tasks', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'agents', limit: 100 });
    expect(rows.map((r) => r.id).sort()).toEqual(['agent-a1', 'agent-a3']);
  });

  it('view=failed keeps only failed runs', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'failed', limit: 100 });
    expect(rows.map((r) => r.id)).toEqual(['job-2']);
  });

  it('view=stale keeps only flagged rows', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'stale', limit: 100 });
    expect(rows.map((r) => r.id)).toEqual(['agent-a3']);
  });

  it('clamps to the limit after sorting (newest first)', () => {
    const rows = buildRunRows({ jobRuns, agentTasks, view: 'all', limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(['agent-a3', 'job-2']);
  });

  it('clamps an over-large limit to 100', () => {
    const many: JobRunSource[] = Array.from({ length: 150 }, (_, i) =>
      jobRun({ id: i, started_at: new Date(Date.now() - i * 1000).toISOString() }),
    );
    expect(buildRunRows({ jobRuns: many, agentTasks: [], view: 'all', limit: 999 })).toHaveLength(
      100,
    );
  });
});

describe('isRunView', () => {
  it('accepts the five known views', () => {
    for (const v of ['all', 'jobs', 'agents', 'failed', 'stale']) {
      expect(isRunView(v)).toBe(true);
    }
  });
  it('rejects anything else', () => {
    expect(isRunView('bogus')).toBe(false);
    expect(isRunView(null)).toBe(false);
    expect(isRunView(undefined)).toBe(false);
  });
});
