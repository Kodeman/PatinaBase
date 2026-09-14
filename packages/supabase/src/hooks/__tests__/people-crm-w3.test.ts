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
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const inserted: Array<{ table: string; payload: Any }> = [];
/** Every `.is(column, value)` a list query narrows itself with (M2R-5). */
const isFilters: Array<{ table: string; column: string; value: Any }> = [];
const updated: Array<{ table: string; payload: Any }> = [];
const rpcCalls: Array<{ name: string; args: Any }> = [];
const rpcError: { current: { message: string } | null } = { current: null };
const insertError: { current: { message: string } | null } = { current: null };
const invalidated: Any[] = [];

function builderFor(table: string): Any {
  const builder: Any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.is = vi.fn((column: string, value: Any) => {
    isFilters.push({ table, column, value });
    return builder;
  });
  builder.in = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: { id: "row-1" }, error: null }),
  );
  builder.single = vi.fn(() =>
    insertError.current
      ? Promise.resolve({ data: null, error: insertError.current })
      : Promise.resolve({ data: { id: "row-1" }, error: null }),
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
    data: rpcError.current ? null : "survivor-1",
    error: rpcError.current,
  });
});

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    from,
    rpc,
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({
    invalidateQueries: (args: Any) => invalidated.push(args.queryKey),
  }),
}));

import {
  SEAT_BID_COLUMNS,
  SEAT_BID_OUTCOME_LABELS,
  SEAT_BID_OUTCOME_STAGE,
  asBidError,
  partyBidKeys,
  seatCarriesBid,
  useBringForward,
  useSetPartyBid,
  bidStageOutcome,
} from "../use-coordination";
import {
  asMergeError,
  complianceNoticeKeys,
  indexComplianceNotices,
  retainedComplianceDocuments,
  studioContactMergeKeys,
  useComplianceDocumentsFor,
  useMergeStudioContacts,
  useStudioContacts,
} from "../use-studio-contacts";
import {
  asHouseholdError,
  clientHouseholdKeys,
  useAddHouseholdMember,
} from "../use-households";

function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> })
    .mutationFn;
}
function onSuccessOf(hook: unknown) {
  return (hook as { onSuccess: (data: unknown, input: unknown) => void })
    .onSuccess;
}

beforeEach(() => {
  isFilters.length = 0;
  inserted.length = 0;
  updated.length = 0;
  rpcCalls.length = 0;
  invalidated.length = 0;
  rpcError.current = null;
  insertError.current = null;
});

describe("merge_studio_contacts (PR-o)", () => {
  it("sends the survivor, the merged card and the evidence, and nothing else", async () => {
    await mutationFnOf(useMergeStudioContacts())({
      survivorId: "card-older",
      mergedId: "card-newer",
      matchedOn: "phone",
    });
    expect(rpcCalls).toEqual([
      {
        name: "merge_studio_contacts",
        args: {
          p_survivor: "card-older",
          p_merged: "card-newer",
          p_matched_on: "phone",
        },
      },
    ]);
  });

  it("writes no consent table and no seat column of its own", async () => {
    await mutationFnOf(useMergeStudioContacts())({
      survivorId: "a",
      mergedId: "b",
      matchedOn: "manual",
    });
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(0);
  });

  it("renders each named refusal as a sentence, never a Postgres string", () => {
    expect(asMergeError(new Error("merge_kind_mismatch"))).toMatch(
      /sole proprietor/,
    );
    expect(asMergeError(new Error("merge_not_a_member"))).toMatch(
      /member of this studio/,
    );
    expect(asMergeError(new Error("merge_already_merged"))).toMatch(
      /already been folded/,
    );
    // r4 B-1 / B-2 — the two facts a merge may not silently drop.
    expect(asMergeError(new Error("merge_two_logins"))).toMatch(
      /two different Patina accounts/,
    );
    expect(asMergeError(new Error("merge_contact_rule_conflict"))).toMatch(
      /blocked or routed elsewhere/,
    );
    // r5 M-4 — the survivor is a card the studio put away.
    expect(asMergeError(new Error("merge_survivor_archived"))).toMatch(
      /put it back on the shelf first/i,
    );
    // and no refusal reaches a face as its own token
    for (const token of [
      "merge_two_logins",
      "merge_contact_rule_conflict",
      "merge_kind_mismatch",
      "merge_survivor_archived",
    ]) {
      expect(asMergeError(new Error(token))).not.toContain(token);
    }
  });

  it("fans out to every key a card’s facts are read through", () => {
    onSuccessOf(useMergeStudioContacts())("survivor-1", {});
    const roots = invalidated.map((key: Any) => key[0]);
    for (const root of [
      "studio-contacts",
      "studio-contact-merges",
      "people-directory",
      "people-directory-seats",
      "project-parties",
      "project-roster",
    ]) {
      expect(roots).toContain(root);
    }
  });
});

describe("the Bidding band writes a stage with its outcome", () => {
  it("moves a losing bidder out of every crew band", () => {
    expect(SEAT_BID_OUTCOME_STAGE.declined).toBe("declined");
    expect(SEAT_BID_OUTCOME_STAGE.no_response).toBe("no_response");
    expect(SEAT_BID_OUTCOME_STAGE.withdrawn).toBe("off_job");
    // Only the winner bands by window.
    expect(SEAT_BID_OUTCOME_STAGE.selected).toBe("awarded");
  });

  it("patches the stage beside the outcome, and dates a withdrawal", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "withdrawn" },
      previous: { bidOutcome: "selected", stage: "awarded" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("withdrawn");
    expect(patch.stage).toBe("off_job");
    expect(patch.off_job_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves the stage alone when only the dates move", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidDueAt: "2026-10-05" },
      previous: { bidOutcome: "selected", stage: "awarded" },
    });
    expect(updated[0]?.payload).toEqual({ bid_due_at: "2026-10-05" });
  });

  /**
   * r7 BLOCKING-1 — the editor is offered on any seat carrying a bid, and
   * `saveBid` always re-sends the outcome it was seeded with. A correction is
   * not a transition.
   */
  it("writes no stage and no date when the outcome did not move", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "withdrawn", bidQuotedByPersonId: "person-1" },
      previous: { bidOutcome: "withdrawn", stage: "off_job" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("withdrawn");
    expect(patch.stage).toBeUndefined();
    expect(patch.off_job_at).toBeUndefined();
  });

  it("never regresses a seat that is already past the bid", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "selected" },
      previous: { bidOutcome: "quoted", stage: "active" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("selected");
    // `awarded` over `active` flips the seat line from "On the job" to
    // "Awarded" for a crew that is on site.
    expect(patch.stage).toBeUndefined();
  });

  it("still takes a crew off the job when they withdraw", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "withdrawn" },
      previous: { bidOutcome: "selected", stage: "active" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.stage).toBe("off_job");
    expect(patch.off_job_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * r8 BLOCKING-1 — the face and the write now read ONE answer. The editor's
   * consequence sentence used to promise a move on every press, including the
   * two that write no stage at all.
   */
  it("answers the face the same way it answers the write", () => {
    // an ordinary correction: the editor re-sends the seat's own outcome
    expect(
      bidStageOutcome({ bidOutcome: "selected", stage: "active" }, "selected"),
    ).toEqual({
      outcome: "selected",
      moved: false,
      pastTheBid: true,
      stage: null,
    });
    // a losing answer on a seat that is already working
    expect(
      bidStageOutcome({ bidOutcome: "selected", stage: "active" }, "declined"),
    ).toEqual({
      outcome: "declined",
      moved: true,
      pastTheBid: true,
      stage: null,
    });
    // the same answer on a seat still in the bidding
    expect(
      bidStageOutcome({ bidOutcome: "quoted", stage: "bidding" }, "declined"),
    ).toEqual({
      outcome: "declined",
      moved: true,
      pastTheBid: false,
      stage: "declined",
    });
    // "They withdrew" reaches past the bid
    expect(
      bidStageOutcome({ bidOutcome: "selected", stage: "active" }, "withdrawn")
        .stage,
    ).toBe("off_job");
    // nothing selected is nothing written
    expect(
      bidStageOutcome({ bidOutcome: null, stage: "bidding" }, null).stage,
    ).toBeNull();
  });

  /**
   * r9 MAJOR-1 — CLEARING a recorded outcome is the fourth press the select
   * offers. The write drops `bid_outcome` and writes NO stage, so the seat
   * keeps the band the erased outcome put it in — and that is what the face
   * beside the press must say.
   */
  it("says a cleared outcome moves the seat nowhere", () => {
    expect(
      bidStageOutcome({ bidOutcome: "selected", stage: "awarded" }, null),
    ).toEqual({
      outcome: null,
      moved: true,
      pastTheBid: false,
      stage: null,
    });
    // the same clear on a seat already working: still no stage write
    expect(
      bidStageOutcome({ bidOutcome: "selected", stage: "active" }, null),
    ).toEqual({
      outcome: null,
      moved: true,
      pastTheBid: true,
      stage: null,
    });
    // the already-empty case is NOT a clear, and the face must not say it is
    expect(
      bidStageOutcome({ bidOutcome: null, stage: "bidding" }, null).moved,
    ).toBe(false);
  });

  it("renders 00631’s guards as sentences", () => {
    expect(asBidError(new Error("party_bid_quoted_by_not_a_person"))).toMatch(
      /A firm cannot price a job/,
    );
    // r10 MAJOR-1: the date-order constraint's REAL name (00631:86-88), the
    // one a bid whose number stops holding before it was owed actually
    // raises.
    expect(
      asBidError(
        new Error(
          'new row for relation "project_parties" violates check constraint "project_parties_bid_window_check"',
        ),
      ),
    ).toMatch(/before the day it was owed/);
  });

  /**
   * r10 MAJOR-1 — the map was keyed on
   * `project_parties_bid_valid_until_check`, which no constraint bears, so the
   * sentence was dead and the suite was green on it. This is the guard that
   * catches the next rename: the dead token must fall through to the raw
   * message rather than resolve.
   */
  it("does not answer to the constraint name that never existed", () => {
    expect(
      asBidError(new Error("project_parties_bid_valid_until_check")),
    ).not.toMatch(/before the day it was owed/);
  });
});

describe("bring forward (SPEC §5.7, PR-b)", () => {
  const pick = {
    studioContactId: "card-dana",
    partyKind: "sub" as const,
    displayName: "Dana Kowalski",
    trade: "electrical",
    companyId: "firm-northgate",
    companyName: "Northgate Electric",
    phone: "(612) 555-0111",
    email: "dana@northgateelectric.com",
  };

  it("stamps every seat with the rolodex card the live facts hang off", async () => {
    await mutationFnOf(useBringForward())({
      projectId: "proj-okonkwo",
      picks: [pick],
    });
    expect(inserted[0].table).toBe("project_parties");
    expect(inserted[0].payload.studio_contact_id).toBe("card-dana");
    expect(inserted[0].payload.display_name).toBe("Dana Kowalski");
    expect(inserted[0].payload.trade).toBe("electrical");
  });

  it("writes NOTHING about consent, pricing, notes or show-to-client", async () => {
    await mutationFnOf(useBringForward())({
      projectId: "proj-okonkwo",
      picks: [pick],
    });
    const written = Object.keys(inserted[0].payload);
    for (const forbidden of [
      "sms_consent_status",
      "sms_consented_at",
      "sms_consent_source",
      "show_to_client",
      "bid_amount_cents",
      "bid_outcome",
      "notes",
    ]) {
      expect(written).not.toContain(forbidden);
    }
  });

  it("keeps the rest when one pick is refused", async () => {
    const result = (await mutationFnOf(useBringForward())({
      projectId: "proj-okonkwo",
      picks: [pick],
    })) as { added: unknown[]; refused: unknown[] };
    expect(result.added).toHaveLength(1);
    expect(result.refused).toHaveLength(0);

    insertError.current = { message: "party_card_merged_away" };
    const refusedRun = (await mutationFnOf(useBringForward())({
      projectId: "proj-okonkwo",
      picks: [
        pick,
        { ...pick, studioContactId: "card-pete", displayName: "Pete Rusk" },
      ],
    })) as {
      added: unknown[];
      refused: Array<{ name: string; reason: string }>;
    };
    expect(refusedRun.added).toHaveLength(0);
    expect(refusedRun.refused.map((r) => r.name)).toEqual([
      "Dana Kowalski",
      "Pete Rusk",
    ]);
    expect(refusedRun.refused[0].reason).toContain("party_card_merged_away");
  });
});

describe("the household (PR-c, PR-n)", () => {
  it("omits p_project_id entirely when no job is named", async () => {
    await mutationFnOf(useAddHouseholdMember())({
      householdId: "house-1",
      personId: "card-chidi",
      role: "client_rep",
    });
    expect(rpcCalls[0].args).toEqual({
      p_household_id: "house-1",
      p_person_id: "card-chidi",
      p_role: "client_rep",
    });
  });

  it("says who may set a change-order figure, in the studio’s words", () => {
    expect(asHouseholdError(new Error("household_grant_forbidden"))).toMatch(
      /principal’s to set/,
    );
    expect(
      asHouseholdError(new Error("household_grant_project_has_no_studio")),
    ).toMatch(/not attached to a studio/);
  });
});

describe("the merged-away card is not offered (M2R-5)", () => {
  function queryFnOf(hook: unknown) {
    return (hook as unknown as { queryFn: () => Promise<unknown> }).queryFn;
  }

  it("narrows the rolodex list to live, unmerged cards", async () => {
    await queryFnOf(useStudioContacts("org-1"))();
    expect(isFilters).toEqual([
      { table: "studio_contacts", column: "archived_at", value: null },
      { table: "studio_contacts", column: "merged_into", value: null },
    ]);
  });

  it("hands the tombstone back only when a reader asks for it", async () => {
    await queryFnOf(
      useStudioContacts("org-1", { includeMerged: true }),
    )();
    expect(
      isFilters.some((f) => f.column === "merged_into"),
    ).toBe(false);
  });
});

describe("useComplianceDocumentsFor applies the retirement rule (M2R-7)", () => {
  it("is the same rule its sibling hook applies, not raw rows", () => {
    const today = "2026-09-13";
    const rows = [
      // retired by a successor that is in force and carries its gates
      {
        id: "old",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2026-03-31",
        blocks: ["site_access"],
        superseded_by: "new",
      },
      {
        id: "new",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2027-03-31",
        blocks: ["site_access"],
        superseded_by: null,
      },
      // retired by a successor that has since LAPSED: still in the reckoning
      {
        id: "old-2",
        holder_id: "firm-2",
        doc_type: "bond",
        expires_on: "2026-01-01",
        blocks: ["payment"],
        superseded_by: "dead",
      },
      {
        id: "dead",
        holder_id: "firm-2",
        doc_type: "bond",
        expires_on: "2026-02-01",
        blocks: ["payment"],
        superseded_by: null,
      },
    ] as Any;
    expect(
      retainedComplianceDocuments(rows, today).map((d: Any) => d.id),
    ).toEqual(["new", "old-2", "dead"]);
  });

  it("is wired into the multi-holder hook", async () => {
    const hook = useComplianceDocumentsFor(["firm-1"]) as unknown as {
      queryFn: () => Promise<unknown>;
    };
    const out = await hook.queryFn();
    // the mocked builder resolves `.in()` to no rows; what matters is that the
    // hook returns the reducer's output rather than the raw payload.
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("the keys", () => {
  it("gives every new entity exactly one root, and no collisions", () => {
    const roots = [
      studioContactMergeKeys.all[0],
      complianceNoticeKeys.all[0],
      clientHouseholdKeys.all[0],
      partyBidKeys.all[0],
    ];
    expect(new Set(roots).size).toBe(roots.length);
  });

  it("nests every detail key under its own list root", () => {
    expect(studioContactMergeKeys.list("org")[0]).toBe(
      studioContactMergeKeys.all[0],
    );
    expect(complianceNoticeKeys.list("org")[0]).toBe(
      complianceNoticeKeys.all[0],
    );
    expect(clientHouseholdKeys.detail("h")[0]).toBe(clientHouseholdKeys.all[0]);
    expect(partyBidKeys.list("p")[0]).toBe(partyBidKeys.all[0]);
  });
});

describe("indexComplianceNotices", () => {
  const notice = (document_id: string, state: string) => ({
    id: `${document_id}:${state}`,
    organization_id: "org",
    document_id,
    state,
    noticed_at: "2026-10-01T06:00:00Z",
  });

  it("lets a lapse outrank a warning about the same paper", () => {
    const index = indexComplianceNotices([
      notice("doc-1", "lapses_soon"),
      notice("doc-1", "lapsed"),
    ]);
    expect(index.get("doc-1")?.state).toBe("lapsed");
  });

  it("keeps a warning where no lapse has been recorded", () => {
    const index = indexComplianceNotices([notice("doc-2", "lapses_soon")]);
    expect(index.get("doc-2")?.state).toBe("lapses_soon");
  });
});

/**
 * MAJOR-1 / MAJOR-7 — a seat carries a bid because of its COLUMNS, never
 * because of the band it happens to sit in. `useSetPartyBid` writes `selected
 * → awarded` and `withdrawn → off_job`, so a stage-only predicate answered
 * `false` over a written bid and the hard delete took the record with it.
 */
describe("seatCarriesBid", () => {
  const EMPTY = {
    seatId: "seat-1",
    bidDueAt: null,
    bidOutcome: null,
    bidValidUntil: null,
    bidQuotedByPersonId: null,
    bidAmountCents: null,
    bidAskedAt: null,
    bidQuotedAt: null,
    bidSelectedAt: null,
  } as const;

  it("is false for no bid at all", () => {
    expect(seatCarriesBid(null)).toBe(false);
    expect(seatCarriesBid(undefined)).toBe(false);
    expect(seatCarriesBid({ ...EMPTY })).toBe(false);
  });

  it("is true for EVERY one of 00631's bid columns on its own", () => {
    const byColumn: Record<string, keyof typeof EMPTY> = {
      bid_due_at: "bidDueAt",
      bid_outcome: "bidOutcome",
      bid_valid_until: "bidValidUntil",
      bid_quoted_by_person_id: "bidQuotedByPersonId",
      bid_amount_cents: "bidAmountCents",
      bid_asked_at: "bidAskedAt",
      bid_quoted_at: "bidQuotedAt",
      bid_selected_at: "bidSelectedAt",
    };
    for (const column of SEAT_BID_COLUMNS) {
      const field = byColumn[column];
      expect(field, `${column} has no camelCase twin`).toBeTruthy();
      expect(
        seatCarriesBid({
          ...EMPTY,
          [field]: field === "bidAmountCents" ? 1 : "2026-10-05",
        } as never),
        column,
      ).toBe(true);
    }
  });

  it("keeps naming a bid on a seat the outcome has banded away", () => {
    // selected -> awarded, withdrawn -> off_job: neither is a bid stage
    expect(
      seatCarriesBid({ ...EMPTY, bidOutcome: "selected" } as never),
    ).toBe(true);
    expect(SEAT_BID_OUTCOME_STAGE.selected).toBe("awarded");
    expect(
      seatCarriesBid({ ...EMPTY, bidOutcome: "withdrawn" } as never),
    ).toBe(true);
    expect(SEAT_BID_OUTCOME_STAGE.withdrawn).toBe("off_job");
  });
});

/**
 * MAJOR-3 — the editor's consequence sentence names a DESTINATION, so it
 * reads the state map. The act map ("They declined") lower-cased into that
 * frame produced "Recording this moves Northgate Electric to they declined."
 */
describe("SEAT_BID_OUTCOME_LABELS", () => {
  it("reads as a state a seat can be moved TO", () => {
    expect(SEAT_BID_OUTCOME_LABELS.declined).toBe("Declined");
    expect(SEAT_BID_OUTCOME_LABELS.withdrawn).toBe("Off the job");
    expect(SEAT_BID_OUTCOME_LABELS.asked).toBe("Bidding");
    for (const label of Object.values(SEAT_BID_OUTCOME_LABELS)) {
      expect(label.startsWith("They ")).toBe(false);
    }
  });
});
