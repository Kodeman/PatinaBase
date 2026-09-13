/**
 * W3/P2's data layer, pinned where it can be got wrong.
 *
 *  · the merge is ONE RPC and its refusals reach the face as sentences (PR-o);
 *  · a bid outcome moves the STAGE with it, so a losing bidder leaves the crew
 *    bands (direction §3.4);
 *  · Bring forward writes the seat's snapshot columns and NOTHING about
 *    consent, pricing or show-to-client (PR-b, CRM-24);
 *  · every new key is one canonical key, and every detail key sits UNDER its
 *    list root so a fan-out reaches it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const inserted: Array<{ table: string; payload: Any }> = [];
const updated: Array<{ table: string; payload: Any }> = [];
const rpcCalls: Array<{ name: string; args: Any }> = [];
const rpcError: { current: { message: string } | null } = { current: null };
const insertError: { current: { message: string } | null } = { current: null };
const invalidated: Any[] = [];

function builderFor(table: string): Any {
  const builder: Any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: { id: 'row-1' }, error: null }),
  );
  builder.single = vi.fn(() =>
    insertError.current
      ? Promise.resolve({ data: null, error: insertError.current })
      : Promise.resolve({ data: { id: 'row-1' }, error: null }),
  );
  builder.insert = vi.fn((payload: Any) => {
    inserted.push({ table, payload });
    return builder;
  });
  builder.update = vi.fn((payload: Any) => {
    updated.push({ table, payload });
    return builder;
  });
  return builder;
}

const from = vi.fn((table: string) => builderFor(table));
const rpc = vi.fn((name: string, args: Any) => {
  rpcCalls.push({ name, args });
  return Promise.resolve({
    data: rpcError.current ? null : 'survivor-1',
    error: rpcError.current,
  });
});

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({
    invalidateQueries: (args: Any) => invalidated.push(args.queryKey),
  }),
}));

import {
  SEAT_BID_OUTCOME_STAGE,
  asBidError,
  partyBidKeys,
  useBringForward,
  useSetPartyBid,
} from '../use-coordination';
import {
  asMergeError,
  complianceNoticeKeys,
  indexComplianceNotices,
  studioContactMergeKeys,
  useMergeStudioContacts,
} from '../use-studio-contacts';
import {
  asHouseholdError,
  clientHouseholdKeys,
  useAddHouseholdMember,
} from '../use-households';

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn;
}
function onSuccessOf(hook: unknown) {
  return (hook as { onSuccess: (data: unknown, input: unknown) => void }).onSuccess;
}

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  rpcCalls.length = 0;
  invalidated.length = 0;
  rpcError.current = null;
  insertError.current = null;
});

describe('merge_studio_contacts (PR-o)', () => {
  it('sends the survivor, the merged card and the evidence, and nothing else', async () => {
    await mutationFnOf(useMergeStudioContacts())({
      survivorId: 'card-older',
      mergedId: 'card-newer',
      matchedOn: 'phone',
    });
    expect(rpcCalls).toEqual([
      {
        name: 'merge_studio_contacts',
        args: {
          p_survivor: 'card-older',
          p_merged: 'card-newer',
          p_matched_on: 'phone',
        },
      },
    ]);
  });

  it('writes no consent table and no seat column of its own', async () => {
    await mutationFnOf(useMergeStudioContacts())({
      survivorId: 'a',
      mergedId: 'b',
      matchedOn: 'manual',
    });
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it('renders each named refusal as a sentence, never a Postgres string', () => {
    expect(asMergeError(new Error('merge_kind_mismatch'))).toMatch(/sole proprietor/);
    expect(asMergeError(new Error('merge_not_a_member'))).toMatch(/member of this studio/);
    expect(asMergeError(new Error('merge_already_merged'))).toMatch(/already been folded/);
  });

  it('fans out to every key a card’s facts are read through', () => {
    onSuccessOf(useMergeStudioContacts())('survivor-1', {});
    const roots = invalidated.map((key: Any) => key[0]);
    for (const root of [
      'studio-contacts',
      'studio-contact-merges',
      'people-directory',
      'people-directory-seats',
      'project-parties',
      'project-roster',
    ]) {
      expect(roots).toContain(root);
    }
  });
});

describe('the Bidding band writes a stage with its outcome', () => {
  it('moves a losing bidder out of every crew band', () => {
    expect(SEAT_BID_OUTCOME_STAGE.declined).toBe('declined');
    expect(SEAT_BID_OUTCOME_STAGE.no_response).toBe('no_response');
    expect(SEAT_BID_OUTCOME_STAGE.withdrawn).toBe('off_job');
    // Only the winner bands by window.
    expect(SEAT_BID_OUTCOME_STAGE.selected).toBe('awarded');
  });

  it('patches the stage beside the outcome, and dates a withdrawal', async () => {
    await mutationFnOf(useSetPartyBid())({
      id: 'seat-1',
      projectId: 'proj-1',
      patch: { bidOutcome: 'withdrawn' },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe('withdrawn');
    expect(patch.stage).toBe('off_job');
    expect(patch.off_job_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('leaves the stage alone when only the dates move', async () => {
    await mutationFnOf(useSetPartyBid())({
      id: 'seat-1',
      projectId: 'proj-1',
      patch: { bidDueAt: '2026-10-05' },
    });
    expect(updated[0]?.payload).toEqual({ bid_due_at: '2026-10-05' });
  });

  it('renders 00631’s guards as sentences', () => {
    expect(asBidError(new Error('party_bid_quoted_by_not_a_person'))).toMatch(
      /A firm cannot price a job/,
    );
    expect(asBidError(new Error('project_parties_bid_valid_until_check'))).toMatch(
      /before the day it was owed/,
    );
  });
});

describe('bring forward (SPEC §5.7, PR-b)', () => {
  const pick = {
    studioContactId: 'card-dana',
    partyKind: 'sub' as const,
    displayName: 'Dana Kowalski',
    trade: 'electrical',
    companyId: 'firm-northgate',
    companyName: 'Northgate Electric',
    phone: '(612) 555-0111',
    email: 'dana@northgateelectric.com',
  };

  it('stamps every seat with the rolodex card the live facts hang off', async () => {
    await mutationFnOf(useBringForward())({
      projectId: 'proj-okonkwo',
      picks: [pick],
    });
    expect(inserted[0].table).toBe('project_parties');
    expect(inserted[0].payload.studio_contact_id).toBe('card-dana');
    expect(inserted[0].payload.display_name).toBe('Dana Kowalski');
    expect(inserted[0].payload.trade).toBe('electrical');
  });

  it('writes NOTHING about consent, pricing, notes or show-to-client', async () => {
    await mutationFnOf(useBringForward())({
      projectId: 'proj-okonkwo',
      picks: [pick],
    });
    const written = Object.keys(inserted[0].payload);
    for (const forbidden of [
      'sms_consent_status',
      'sms_consented_at',
      'sms_consent_source',
      'show_to_client',
      'bid_amount_cents',
      'bid_outcome',
      'notes',
    ]) {
      expect(written).not.toContain(forbidden);
    }
  });

  it('keeps the rest when one pick is refused', async () => {
    const result = (await mutationFnOf(useBringForward())({
      projectId: 'proj-okonkwo',
      picks: [pick],
    })) as { added: unknown[]; refused: unknown[] };
    expect(result.added).toHaveLength(1);
    expect(result.refused).toHaveLength(0);

    insertError.current = { message: 'party_card_merged_away' };
    const refusedRun = (await mutationFnOf(useBringForward())({
      projectId: 'proj-okonkwo',
      picks: [pick, { ...pick, studioContactId: 'card-pete', displayName: 'Pete Rusk' }],
    })) as { added: unknown[]; refused: Array<{ name: string; reason: string }> };
    expect(refusedRun.added).toHaveLength(0);
    expect(refusedRun.refused.map((r) => r.name)).toEqual([
      'Dana Kowalski',
      'Pete Rusk',
    ]);
    expect(refusedRun.refused[0].reason).toContain('party_card_merged_away');
  });
});

describe('the household (PR-c, PR-n)', () => {
  it('omits p_project_id entirely when no job is named', async () => {
    await mutationFnOf(useAddHouseholdMember())({
      householdId: 'house-1',
      personId: 'card-chidi',
      role: 'client_rep',
    });
    expect(rpcCalls[0].args).toEqual({
      p_household_id: 'house-1',
      p_person_id: 'card-chidi',
      p_role: 'client_rep',
    });
  });

  it('says who may set a change-order figure, in the studio’s words', () => {
    expect(asHouseholdError(new Error('household_grant_forbidden'))).toMatch(
      /principal’s to set/,
    );
    expect(
      asHouseholdError(new Error('household_grant_project_has_no_studio')),
    ).toMatch(/not attached to a studio/);
  });
});

describe('the keys', () => {
  it('gives every new entity exactly one root, and no collisions', () => {
    const roots = [
      studioContactMergeKeys.all[0],
      complianceNoticeKeys.all[0],
      clientHouseholdKeys.all[0],
      partyBidKeys.all[0],
    ];
    expect(new Set(roots).size).toBe(roots.length);
  });

  it('nests every detail key under its own list root', () => {
    expect(studioContactMergeKeys.list('org')[0]).toBe(studioContactMergeKeys.all[0]);
    expect(complianceNoticeKeys.list('org')[0]).toBe(complianceNoticeKeys.all[0]);
    expect(clientHouseholdKeys.detail('h')[0]).toBe(clientHouseholdKeys.all[0]);
    expect(partyBidKeys.list('p')[0]).toBe(partyBidKeys.all[0]);
  });
});

describe('indexComplianceNotices', () => {
  const notice = (document_id: string, state: string) => ({
    id: `${document_id}:${state}`,
    organization_id: 'org',
    document_id,
    state,
    noticed_at: '2026-10-01T06:00:00Z',
  });

  it('lets a lapse outrank a warning about the same paper', () => {
    const index = indexComplianceNotices([
      notice('doc-1', 'lapses_soon'),
      notice('doc-1', 'lapsed'),
    ]);
    expect(index.get('doc-1')?.state).toBe('lapsed');
  });

  it('keeps a warning where no lapse has been recorded', () => {
    const index = indexComplianceNotices([notice('doc-2', 'lapses_soon')]);
    expect(index.get('doc-2')?.state).toBe('lapses_soon');
  });
});
