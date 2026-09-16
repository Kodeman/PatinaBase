/**
 * CR13-5 — the mistaken-add hard delete, and the question its guard asks.
 *
 * The face refuses on `row.paper` — `identity_paper_state(card,
 * COALESCE(seat.company_id, card.company_id))` (R-BA / R-BJ), the person's own
 * paper AND their firm's. The guard used to select the card's own
 * `studio_compliance_documents` rows instead, over a PostgREST read that
 * returns `[]` rather than raising when RLS refuses it: "no paper held",
 * asserted exactly where the guard could see least, on the one surviving hard
 * delete in the build.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const seatRow: { current: Record<string, unknown> | null } = { current: null };
const cardRow: { current: Record<string, unknown> | null } = { current: null };
const rpcResults: { current: Record<string, unknown> } = { current: {} };
const deleted = vi.fn();

function builderFor(table: string): Any {
  const builder: Any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: table === 'project_parties' ? seatRow.current : cardRow.current,
      error: null,
    }),
  );
  builder.delete = vi.fn(() => {
    deleted(table);
    return { eq: () => Promise.resolve({ error: null }) };
  });
  return builder;
}

const from = vi.fn((table: string) => builderFor(table));
const rpc = vi.fn((name: string) =>
  Promise.resolve({ data: rpcResults.current[name] ?? null, error: null }),
);

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useRemoveProjectParty } from '../use-coordination';

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn;
}

beforeEach(() => {
  deleted.mockClear();
  rpc.mockClear();
  cardRow.current = { company_id: null };
  seatRow.current = {
    phone_e164: null,
    stage: 'active',
    studio_contact_id: 'card-dana',
    company_id: 'firm-northgate',
    project_id: 'proj-okonkwo',
  };
  rpcResults.current = { identity_paper_state: 'not_on_file' };
});

describe('the hard-delete guard reads the paper the FACE reads', () => {
  it("asks identity_paper_state with the seat's own firm (R-BJ)", async () => {
    await mutationFnOf(useRemoveProjectParty())({
      id: 'seat-1',
      projectId: 'proj-okonkwo',
    });
    expect(rpc).toHaveBeenCalledWith('identity_paper_state', {
      p_card_id: 'card-dana',
      p_company_id: 'firm-northgate',
    });
    expect(deleted).toHaveBeenCalledWith('project_parties');
  });

  it("falls back to the card's firm when the seat names none", async () => {
    (seatRow.current as Record<string, unknown>).company_id = null;
    cardRow.current = { company_id: 'firm-marrow' };
    await mutationFnOf(useRemoveProjectParty())({
      id: 'seat-1',
      projectId: 'proj-okonkwo',
    });
    expect(rpc).toHaveBeenCalledWith('identity_paper_state', {
      p_card_id: 'card-dana',
      p_company_id: 'firm-marrow',
    });
  });

  it("refuses when the FIRM holds paper the card itself does not", async () => {
    rpcResults.current = { identity_paper_state: 'lapsed' };
    await expect(
      mutationFnOf(useRemoveProjectParty())({
        id: 'seat-1',
        projectId: 'proj-okonkwo',
      }),
    ).rejects.toThrow(/paperwork the studio holds/);
    expect(deleted).not.toHaveBeenCalled();
  });

  it('refuses when the read cannot answer, rather than reading it as no paper', async () => {
    rpcResults.current = {};
    await expect(
      mutationFnOf(useRemoveProjectParty())({
        id: 'seat-1',
        projectId: 'proj-okonkwo',
      }),
    ).rejects.toThrow(/paperwork the studio holds/);
    expect(deleted).not.toHaveBeenCalled();
  });
});
