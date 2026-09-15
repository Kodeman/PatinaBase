/**
 * THE HOUSEHOLD BAND READS THE SEAT THE WRITE WILL TOUCH (r16 MAJOR-1).
 *
 * `useProjectHousehold` feeds the band's money sentence. It used to read every
 * `client` / `client_rep` seat on the job with no `off_job_at` filter, so the
 * standing grant it handed the sentence could be hanging off a seat the studio
 * had CLOSED — a row `add_household_member()` does not reuse and does not
 * touch (00632 §3, r15 MAJOR-1). The face then printed "X already signs money
 * to $2,500 … recorded outside the household, and that figure stands." while
 * the write opened a NEW seat and minted the household's own figure on it.
 *
 * Three rules pinned here: closed seats say nothing about live authority; the
 * FIRST OPEN seat per (card, kind) is the one whose grant is read, whatever
 * order the grant query returns; and the grant carries the household that
 * wrote it, so the band can tell its own figure from another household's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Recorded {
  table: string;
  ins: Array<{ column: string; values: unknown[] }>;
  orders: Array<{ column: string }>;
}

const recorded: Recorded[] = [];
const tables: Record<string, Array<Record<string, Any>>> = {};

function builderFor(table: string): Any {
  const note: Recorded = { table, ins: [], orders: [] };
  recorded.push(note);
  const eqs: Array<{ column: string; value: unknown }> = [];
  let single = false;
  const builder: Any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      eqs.push({ column, value });
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      note.ins.push({ column, values });
      return builder;
    },
    is: () => builder,
    overlaps: () => builder,
    order: (column: string) => {
      note.orders.push({ column });
      return builder;
    },
    limit: () => builder,
    maybeSingle: () => {
      single = true;
      return builder;
    },
    then: (resolve: Any, reject: Any) => {
      let rows = (tables[table] ?? []).filter((row) =>
        eqs.every((f) => row[f.column] === f.value),
      );
      for (const f of note.ins) {
        rows = rows.filter((row) => f.values.includes(row[f.column] as never));
      }
      return Promise.resolve({
        data: single ? (rows[0] ?? null) : rows,
        error: null,
      }).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    from: (table: string) => builderFor(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: () => undefined }),
}));

import { householdOwnsGrant, useProjectHousehold } from "../use-households";

function queryFnOf(hook: unknown) {
  return (hook as { queryFn: () => Promise<Any> }).queryFn;
}

const HOUSEHOLD_CLAUSE = "client_households.co_threshold_cents";

beforeEach(() => {
  recorded.length = 0;
  for (const key of Object.keys(tables)) delete tables[key];
  tables.projects = [
    { id: "proj-okonkwo", designer_id: "designer-1", client_profile_id: null },
  ];
  tables.client_households = [
    {
      id: "household-okonkwo",
      organization_id: "org-1",
      designer_id: "designer-1",
      display_name: "Okonkwo household",
      member_person_ids: ["card-chidi"],
      primary_member_person_id: "card-chidi",
      co_threshold_cents: 250000,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
});

describe("useProjectHousehold and the closed seat (r16 MAJOR-1)", () => {
  it("reads no standing grant off a seat the studio closed", async () => {
    tables.project_parties = [
      {
        id: "seat-closed",
        project_id: "proj-okonkwo",
        studio_contact_id: "card-chidi",
        party_kind: "client_rep",
        created_at: "2026-02-01T00:00:00Z",
        off_job_at: "2026-08-16",
      },
      {
        id: "seat-open",
        project_id: "proj-okonkwo",
        studio_contact_id: "card-chidi",
        party_kind: "client_rep",
        created_at: "2026-09-01T00:00:00Z",
        off_job_at: null,
      },
    ];
    tables.project_party_authority = [
      {
        id: "grant-closed",
        engagement_id: "seat-closed",
        scope: "money",
        threshold_cents: 250000,
        source_clause: "the agreement",
        source_household_id: null,
      },
    ];

    const resolved = await queryFnOf(useProjectHousehold("proj-okonkwo"))();

    expect(resolved.clientSideMoneyGrants).toEqual([]);
    // and the closed seat's grant is not "authority this job records" either
    expect(resolved.clientSideHasAuthority).toBe(false);
    // the grant query never even asked about the closed seat
    const authorityRead = recorded.find(
      (r) => r.table === "project_party_authority",
    );
    expect(authorityRead?.ins[0].values).toEqual(["seat-open"]);
  });

  it("reads the FIRST OPEN seat's grant whatever order the grants arrive in", async () => {
    tables.project_parties = [
      {
        id: "seat-first",
        project_id: "proj-okonkwo",
        studio_contact_id: "card-chidi",
        party_kind: "client_rep",
        created_at: "2026-02-01T00:00:00Z",
        off_job_at: null,
      },
      {
        id: "seat-second",
        project_id: "proj-okonkwo",
        studio_contact_id: "card-chidi",
        party_kind: "client_rep",
        created_at: "2026-09-01T00:00:00Z",
        off_job_at: null,
      },
    ];
    // the LATER seat's grant first, which is what the query's own order did
    tables.project_party_authority = [
      {
        id: "grant-second",
        engagement_id: "seat-second",
        scope: "money",
        threshold_cents: 900000,
        source_clause: HOUSEHOLD_CLAUSE,
        source_household_id: "household-okonkwo",
      },
      {
        id: "grant-first",
        engagement_id: "seat-first",
        scope: "money",
        threshold_cents: 250000,
        source_clause: "Owner agreement, Exhibit B §4.2",
        source_household_id: null,
      },
    ];

    const resolved = await queryFnOf(useProjectHousehold("proj-okonkwo"))();

    expect(resolved.clientSideMoneyGrants).toHaveLength(1);
    expect(resolved.clientSideMoneyGrants[0]).toMatchObject({
      engagementId: "seat-first",
      thresholdCents: 250000,
      sourceClause: "Owner agreement, Exhibit B §4.2",
      sourceHouseholdId: null,
    });
  });

  it("carries the household that wrote the grant, and says which household it is showing", async () => {
    tables.project_parties = [
      {
        id: "seat-open",
        project_id: "proj-okonkwo",
        studio_contact_id: "card-chidi",
        party_kind: "client_rep",
        created_at: "2026-02-01T00:00:00Z",
        off_job_at: null,
      },
    ];
    tables.project_party_authority = [
      {
        id: "grant-lindqvist",
        engagement_id: "seat-open",
        scope: "money",
        threshold_cents: 1000000,
        source_clause: HOUSEHOLD_CLAUSE,
        source_household_id: "household-lindqvist",
      },
    ];

    const resolved = await queryFnOf(useProjectHousehold("proj-okonkwo"))();

    expect(resolved.clientSideMoneyGrants[0].sourceHouseholdId).toBe(
      "household-lindqvist",
    );
    // a card standing in two households: the overlap resolver names one
    const householdRead = recorded.find((r) => r.table === "client_households");
    expect(householdRead?.orders.map((o) => o.column)).toEqual([
      "created_at",
      "id",
    ]);
  });
});

describe("householdOwnsGrant (00632 §2b)", () => {
  it("is this household's only when the clause AND the household id say so", () => {
    const own = {
      sourceClause: HOUSEHOLD_CLAUSE,
      sourceHouseholdId: "household-okonkwo",
    };
    expect(householdOwnsGrant(own, "household-okonkwo")).toBe(true);
    expect(householdOwnsGrant(own, "household-lindqvist")).toBe(false);
    expect(
      householdOwnsGrant(
        { sourceClause: "the agreement", sourceHouseholdId: null },
        "household-okonkwo",
      ),
    ).toBe(false);
    // a household-clause grant no household stamped is nobody's to move
    expect(
      householdOwnsGrant(
        { sourceClause: HOUSEHOLD_CLAUSE, sourceHouseholdId: null },
        "household-okonkwo",
      ),
    ).toBe(false);
    expect(householdOwnsGrant(null, "household-okonkwo")).toBe(false);
  });
});
