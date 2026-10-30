import { beforeEach, describe, expect, it, vi } from 'vitest';

// K14 review — the open-Direction read is scoped to the reader's own studios.
// The scenario is SQ-1852's: designer Xan sits in studios A and B; Yara sits in A
// only. Person-pair co-member RLS lets Yara read Xan's studio-B relationship and
// its Discovery seed, so the tables below answer as that RLS would, and the
// proposals read is filtered here by the `.or()` the hook sends.

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let viewer = 'yara';
const calls: Record<string, Array<[string, ...unknown[]]>> = {};

/** Evaluates the two PostgREST `or` forms the hook sends. */
function matchesOr(row: Row, expr: string): boolean {
  const own = /and\(studio_id\.is\.null,designer_id\.eq\.([^)]+)\)/.exec(expr);
  const studios = /studio_id\.in\.\(([^)]*)\)/.exec(expr);
  const inStudio = studios ? studios[1].split(',').includes(row.studio_id as string) : false;
  const ownUnstamped = own ? row.studio_id === null && row.designer_id === own[1] : false;
  return inStudio || ownUnstamped;
}

/** PostgREST embeds: `organizations!inner(...)` joins `organizations` on
 *  `organization_id`. A filter on an embedded column drops the parent row only
 *  for an `!inner` embed; a plain embed keeps the row and nulls the embed. */
function builder(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const embeds = new Map<string, { inner: boolean }>();
  const log = (calls[table] ??= []);
  const chain: Record<string, unknown> = {};
  const add = (name: string, fn?: (...args: unknown[]) => (row: Row) => boolean) =>
    (chain[name] = vi.fn((...args: unknown[]) => {
      log.push([name, ...args]);
      if (fn) filters.push(fn(...args));
      return chain;
    }));
  const embedded = (row: Row, embed: string): Row | undefined =>
    (tables[embed] ?? []).find((r) => r.id === row[`${embed.replace(/s$/, '')}_id`]);
  add('select', (columns) => {
    for (const m of (columns as string).matchAll(/(\w+)(!inner)?\(/g)) embeds.set(m[1], { inner: !!m[2] });
    return () => true;
  });
  add('eq', (col, val) => (row) => {
    const [embed, column] = (col as string).split('.');
    if (!column) return row[embed] === val;
    const join = embeds.get(embed);
    if (!join) throw new Error(`filter on ${col as string} without embedding ${embed}`);
    return !join.inner || embedded(row, embed)?.[column] === val;
  });
  add('neq', (col, val) => (row) => row[col as string] !== val);
  add('in', (col, vals) => (row) => (vals as unknown[]).includes(row[col as string]));
  add('not', (col) => (row) => row[col as string] != null);
  add('or', (expr) => (row) => matchesOr(row, expr as string));
  add('order');
  add('limit');
  const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  chain.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  chain.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
  return chain;
}

vi.mock('../../client', () => ({ createBrowserClient: () => ({ from: (t: string) => builder(t) }) }));
vi.mock('../../auth/session-user', () => ({ getSessionUserId: () => Promise.resolve(viewer) }));

import { openDirectionQuery } from '../use-discovery';

const DIRECTION = {
  title: 'Holloway — Direction',
  commercial_state: 'draft',
  designer_id: 'xan',
};

beforeEach(() => {
  viewer = 'yara';
  for (const key of Object.keys(calls)) delete calls[key];
  tables = {
    organization_members: [
      { user_id: 'yara', organization_id: 'studio-a', status: 'active', role: 'member' },
      { user_id: 'xan', organization_id: 'studio-a', status: 'active', role: 'member' },
      { user_id: 'xan', organization_id: 'studio-b', status: 'active', role: 'owner' },
    ],
    organizations: [
      { id: 'studio-a', type: 'design_studio', status: 'active' },
      { id: 'studio-b', type: 'design_studio', status: 'active' },
      { id: 'studio-old', type: 'design_studio', status: 'archived' },
      { id: 'maker-co', type: 'manufacturer', status: 'active' },
    ],
    client_discovery: [{ designer_client_id: 'rel-b', seeded_proposal_id: 'direction-b' }],
    proposals: [{ ...DIRECTION, id: 'direction-b', studio_id: 'studio-b', designer_client_id: 'rel-b' }],
  };
});

describe('openDirectionQuery — studio isolation', () => {
  it('never surfaces a studio-B Direction to a colleague who shares only studio A', async () => {
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toBeNull();
    expect(calls.proposals).toContainEqual([
      'or',
      'studio_id.in.(studio-a),and(studio_id.is.null,designer_id.eq.yara)',
    ]);
    expect(calls.organization_members).toEqual(
      expect.arrayContaining([
        ['eq', 'user_id', 'yara'],
        ['eq', 'status', 'active'],
        ['neq', 'role', 'guest'],
        ['eq', 'organizations.type', 'design_studio'],
        ['eq', 'organizations.status', 'active'],
      ]),
    );
  });

  it('surfaces it to the designer who sits in studio B', async () => {
    viewer = 'xan';
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toMatchObject({ id: 'direction-b' });
  });

  it('surfaces a studio-A Direction to the studio-A colleague', async () => {
    tables.proposals = [{ ...DIRECTION, id: 'direction-b', studio_id: 'studio-a', designer_client_id: 'rel-b' }];
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toMatchObject({ id: 'direction-b' });
  });

  it('an unstamped Direction counts only for its own designer', async () => {
    tables.proposals = [{ ...DIRECTION, id: 'direction-b', studio_id: null, designer_client_id: 'rel-b' }];
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toBeNull();
    viewer = 'xan';
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toMatchObject({ id: 'direction-b' });
  });

  it('a seat in an archived studio or a non-studio organization opens nothing', async () => {
    tables.organization_members.push(
      { user_id: 'yara', organization_id: 'studio-old', status: 'active', role: 'member' },
      { user_id: 'yara', organization_id: 'maker-co', status: 'active', role: 'member' },
    );
    for (const studio of ['studio-old', 'maker-co']) {
      tables.proposals = [{ ...DIRECTION, id: 'direction-b', studio_id: studio, designer_client_id: 'rel-b' }];
      await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toBeNull();
    }
    expect(calls.proposals).toContainEqual([
      'or',
      'studio_id.in.(studio-a),and(studio_id.is.null,designer_id.eq.yara)',
    ]);
    expect(calls.organization_members).toContainEqual([
      'select',
      'organization_id, organizations!inner(type, status)',
    ]);
  });

  it('a reader with no studio seat sends only her own unstamped arm', async () => {
    viewer = 'solo';
    await expect(openDirectionQuery(['rel-b']).queryFn()).resolves.toBeNull();
    expect(calls.proposals).toContainEqual(['or', 'and(studio_id.is.null,designer_id.eq.solo)']);
  });
});
