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
/** What a single-row read comes back with — the seat `useCloseProjectPartySeat`
 *  looks at before it writes (r20 major-1). */
const standingRow: { current: Any } = { current: { id: "row-1" } };
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
    Promise.resolve({ data: standingRow.current, error: null }),
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
  useAddProjectParty,
  useBringForward,
  useCloseProjectPartySeat,
  useRemoveProjectParty,
  useSetPartyAuthority,
  useSetPartyBid,
  useUpdateProjectParty,
  bidStageOutcome,
  seatClosedByHand,
  asSeatCloseError,
  seatCloseIsHeldForMoney,
  SEAT_CLOSE_MONEY_HELD_REASON,
  partyAuthorityKeys,
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
  standingRow.current = { id: "row-1" };
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
    // r11 MAJOR-2 — a seat on a job that records no studio. 00624's guard used
    // to abort the merge with its own raw token, which asMergeError had no
    // sentence for, so a schema word landed in the sheet's alert paragraph.
    expect(
      asMergeError(new Error("merge_seat_on_studioless_project")),
    ).toMatch(/records no studio/);
    // and where the RPC names the job in `details`, the sentence names it too
    expect(
      asMergeError({
        message: "merge_seat_on_studioless_project",
        details: "Okonkwo residence",
      }),
    ).toBe(
      "One of these cards holds a seat on Okonkwo residence, which records no studio, " +
        "so the seat cannot be moved. Record that job\u2019s studio first, then merge.",
    );
    // r13 MAJOR-1 — the SAME guard's third door, refused by name now
    expect(asMergeError(new Error("merge_seat_card_other_studio"))).toMatch(
      /another studio\u2019s book/,
    );
    expect(
      asMergeError({
        message: "merge_seat_card_other_studio",
        details: "Okonkwo residence",
      }),
    ).toBe(
      "One of these cards holds a seat on Okonkwo residence, a job in another " +
        "studio\u2019s book, so the seat cannot be moved. Ask that studio to take " +
        "the card off the seat, then merge.",
    );
    // r18 MAJOR-1 — both cards hold an OPEN seat of the same kind on one job.
    // The fold would stamp one card on both rows and each can carry its own
    // open money grant, so the merge refuses by name and the sheet says which
    // seat to close.
    expect(asMergeError(new Error("merge_seat_collision"))).toMatch(
      /Close one of these two seats first/,
    );
    expect(
      asMergeError({
        message: "merge_seat_collision",
        details: "Okonkwo residence · client_rep",
      }),
    ).toBe(
      "Both cards hold an open Client Rep seat on Okonkwo residence, and one " +
        "person cannot hold the job twice. Close one of these two seats " +
        "first, then merge.",
    );
    // r22 MAJOR-1 — the same refusal asked of the GRANT. R-BS clamps 00634's
    // end-authority trigger off the withdrawal path, so a seat dated by "They
    // withdrew" keeps its open money grant and the open-seats-only gate above
    // cannot see it.
    //
    // r23 MAJOR-1 — AND THE ACT IS THE DATED SEAT'S, never the live one's:
    // closing the seat that is still open was measured to lift the gate while
    // leaving the standing grant standing. DETAIL carries a third word naming
    // which card holds the seat that left, so the sentence can point at it.
    expect(asMergeError(new Error("merge_seat_authority_collision"))).toMatch(
      /Put the seat that left back in the bidding/,
    );
    expect(asMergeError(new Error("merge_seat_authority_collision"))).not.toMatch(
      /Close the seat that is still open/,
    );
    expect(
      asMergeError({
        message: "merge_seat_authority_collision",
        details: "Okonkwo residence · sub · merged",
      }),
    ).toBe(
      "One of these two Subcontractor seats on Okonkwo residence has left the job but " +
        "still signs for something, so folding the cards would leave one " +
        "person holding two standing grants on the same job. Put the seat on " +
        "the card you are folding in back in the bidding, then close it by " +
        "hand — closing a seat ends what it signed for — and merge.",
    );
    expect(
      asMergeError({
        message: "merge_seat_authority_collision",
        details: "Okonkwo residence · sub · survivor",
      }),
    ).toContain("Put the seat on the card you are keeping back in the bidding");
    expect(
      asMergeError({
        message: "merge_seat_authority_collision",
        details: "Okonkwo residence · sub · both",
      }),
    ).toBe(
      "Both of these Subcontractor seats on Okonkwo residence have left the " +
        "job and both still sign for something, so folding the cards would " +
        "leave one person holding two standing grants on the same job. Put " +
        "one of them back in the bidding, then close it by hand — closing a " +
        "seat ends what it signed for — and merge.",
    );
    // r13 MAJOR-1 — and no guard token reaches a face, named or not. Every
    // trigger the merge fires raises its own bare schema word, and they all
    // used to fall through to `return message` into the sheet's alert
    // paragraph.
    for (const token of [
      "party_studio_contact_other_studio",
      "party_company_other_studio",
      "party_warranty_contact_other_studio",
      "designated_person_is_self",
      "household_member_not_a_live_person_card",
    ]) {
      const rendered = asMergeError(new Error(token));
      expect(rendered).not.toContain(token);
      expect(rendered).toBe("The merge did not go through, and nothing was changed.");
    }
    // prose still comes back as prose
    expect(asMergeError(new Error("network request failed"))).toBe(
      "network request failed",
    );
    // and no refusal reaches a face as its own token
    for (const token of [
      "merge_two_logins",
      "merge_contact_rule_conflict",
      "merge_kind_mismatch",
      "merge_survivor_archived",
      "merge_seat_on_studioless_project",
      "merge_seat_card_other_studio",
    ]) {
      expect(asMergeError(new Error(token))).not.toContain(token);
      expect(
        asMergeError({ message: token, details: "Okonkwo residence" }),
      ).not.toContain(token);
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
      // r13 MAJOR-3 — the two roots THIS WAVE minted and 00629 writes through:
      // `bid_quoted_by_person_id` (read by `['project-party-bids']`, a
      // different root from `['project-parties']`) and
      // `client_households.member_person_ids`. With `staleTime` at five
      // minutes and `refetchOnWindowFocus: false`, an open Call Sheet kept the
      // folded estimator's id while the rolodex beside it refetched without
      // him — the blank "Priced by" face out of a cache.
      "project-party-bids",
      "client-households",
      // and the forward map both ids resolve through (PR-o)
      "resolved-studio-contact",
    ]) {
      expect(roots).toContain(root);
    }
    // the keys are the exported factories, not hand-typed literals
    expect(roots).toContain(partyBidKeys.all[0]);
    expect(roots).toContain(clientHouseholdKeys.all[0]);
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

  /**
   * R-BR (r17) — correcting a withdrawal puts the seat back in the bidding,
   * and a seat back in the bidding is not a seat that left the job. The stamp
   * was one-way, so the row banded into Bidding while the window clause went
   * on printing "Off the job 15 Sep 2026." and the household's open-seat
   * filter went on counting it closed.
   */
  it("clears the off-the-job date when a withdrawal is corrected", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "quoted" },
      previous: { bidOutcome: "withdrawn", stage: "off_job" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("quoted");
    expect(patch.stage).toBe("bidding");
    expect(patch.off_job_at).toBeNull();
    expect(patch.off_job_reason).toBeNull();
  });

  /**
   * r18 BLOCKING-1 — and ONLY a seat leaving `withdrawn`, which is R-BR's own
   * scope. A seat the studio closed by hand ("Close this seat" writes
   * stage='off_job' plus the dated reason, never a bid withdrawal) keeps that
   * record when its bid outcome is corrected: the earlier guard asked only
   * whether a stage was written, and `off_job` is deliberately absent from
   * SEAT_STAGES_PAST_THE_BID, so one press of "They declined" NULLed the
   * studio's own closing date and sentence and put the seat back on the job.
   */
  it("leaves a HAND-CLOSED seat's date and reason alone (r18 BLOCKING-1)", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "declined" },
      previous: { bidOutcome: null, stage: "off_job" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("declined");
    expect(patch.stage).toBe("declined");
    expect(patch.off_job_at).toBeUndefined();
    expect(patch.off_job_reason).toBeUndefined();
  });

  /**
   * And only when a stage is actually written: a correction that moves no
   * stage leaves a genuine "Close this seat" date exactly where it is.
   */
  it("leaves a closed seat's own date alone when no stage moves", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "selected" },
      previous: { bidOutcome: "quoted", stage: "active" },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.stage).toBeUndefined();
    expect(patch.off_job_at).toBeUndefined();
    expect(patch.off_job_reason).toBeUndefined();
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

  /**
   * r19 major-1 — AND THE OTHER BRANCH OF THE SAME `if`. r18 narrowed the
   * CLEARING leg to a seat leaving `withdrawn` and left the STAMPING leg
   * ungated, on the same population: a seat the studio closed by hand still
   * carries its bid, so the editor stays on the row, and recording "They
   * withdrew" a week later rewrote `off_job_at` to today — the window clause
   * then printing a closing date a week later than the record, beside the
   * studio's own untouched reason, with nothing anywhere holding the original.
   */
  it("never moves a date the seat already carries (r19 major-1)", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "withdrawn" },
      previous: {
        bidOutcome: "quoted",
        stage: "off_job",
        offJobAt: "2026-09-10",
      },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.bid_outcome).toBe("withdrawn");
    expect(patch.stage).toBe("off_job");
    expect(patch.off_job_at).toBeUndefined();
    expect(patch.off_job_reason).toBeUndefined();
  });

  it("still dates a withdrawal on a seat carrying no date (r19 major-1)", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "proj-1",
      patch: { bidOutcome: "withdrawn" },
      previous: { bidOutcome: "quoted", stage: "bidding", offJobAt: null },
    });
    const patch = updated[0]?.payload ?? {};
    expect(patch.stage).toBe("off_job");
    expect(patch.off_job_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it("does not retire a lapse whose successor was RETYPED (r12 MAJOR-1)", () => {
    // 00623's retired CTE asks three questions — in force, carries the root's
    // gates, and `s.doc_type = c.root_doc_type` (W3 r8 B-1). The supersede
    // trigger judges a row against its own successor and never against the
    // rows pointing at it, so retyping the SUCCESSOR is judged by nothing and
    // any active studio member may do it in one PATCH. The reducer asked only
    // the first two, so the browser dropped a lapsed gating certificate the
    // database still counts as `lapsed`.
    const today = "2026-09-13";
    const rows = [
      {
        id: "lapsed-coi",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2026-03-31",
        blocks: ["site_access"],
        superseded_by: "retyped",
      },
      {
        // in force, carries the gates — and is no longer the same paper
        id: "retyped",
        holder_id: "firm-1",
        doc_type: "w9",
        expires_on: "2027-03-31",
        blocks: ["site_access"],
        superseded_by: null,
      },
    ] as Any;
    expect(
      retainedComplianceDocuments(rows, today).map((d: Any) => d.id),
    ).toEqual(["lapsed-coi", "retyped"]);
  });

  it("still retires it when the successor is the same paper (control)", () => {
    const today = "2026-09-13";
    const rows = [
      {
        id: "lapsed-coi",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2026-03-31",
        blocks: ["site_access"],
        superseded_by: "renewal",
      },
      {
        id: "renewal",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2027-03-31",
        blocks: ["site_access"],
        superseded_by: null,
      },
    ] as Any;
    expect(
      retainedComplianceDocuments(rows, today).map((d: Any) => d.id),
    ).toEqual(["renewal"]);
  });

  it("carries the ROOT's doc_type down the chain, as the SQL recursion does", () => {
    // 00623 carries `c.root_doc_type` forward unchanged at every hop, so a
    // retyped middle link does not end the walk: hop 2 is still judged against
    // the root's own paper and still retires it.
    const today = "2026-09-13";
    const rows = [
      {
        id: "root",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2026-03-31",
        blocks: ["site_access"],
        superseded_by: "middle",
      },
      {
        id: "middle",
        holder_id: "firm-1",
        doc_type: "w9",
        expires_on: "2027-03-31",
        blocks: ["site_access"],
        superseded_by: "head",
      },
      {
        id: "head",
        holder_id: "firm-1",
        doc_type: "coi_gl",
        expires_on: "2027-06-30",
        blocks: ["site_access"],
        superseded_by: null,
      },
    ] as Any;
    expect(
      retainedComplianceDocuments(rows, today).map((d: Any) => d.id),
    ).toEqual(["middle", "head"]);
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

/**
 * r15 MAJOR (code) — the household band reads `project_parties` and
 * `project_party_authority` under its own root, and nothing that writes those
 * two tables told it. With `staleTime` five minutes and the band mounted for
 * the whole visit, the door stayed held over a client row two elements above,
 * and the add sentence promised the household's figure over a foreign grant
 * `add_household_member()` leaves standing.
 */
describe("every seat and authority write reaches the household band", () => {
  const seatWriters: Array<[string, () => unknown]> = [
    ["useAddProjectParty", useAddProjectParty],
    ["useUpdateProjectParty", useUpdateProjectParty],
    ["useCloseProjectPartySeat", useCloseProjectPartySeat],
    ["useRemoveProjectParty", useRemoveProjectParty],
    ["useSetPartyAuthority", useSetPartyAuthority],
    ["useBringForward", useBringForward],
    // r21 major-1 / minor-5 (R-BS) — the seventh seat writer. "They withdrew"
    // closes a seat and correcting it away from `withdrawn` re-opens one, so
    // `useProjectHousehold`'s open-seat filter has to be told like the rest.
    ["useSetPartyBid", useSetPartyBid],
  ];

  for (const [name, hook] of seatWriters) {
    it(`${name} invalidates the client-households root`, () => {
      onSuccessOf(hook())({ project_id: "p" }, { projectId: "p" });
      const roots = invalidated.map((key: Any) => key[0]);
      expect(roots).toContain(clientHouseholdKeys.all[0]);
    });
  }
});

describe("useCloseProjectPartySeat — the day a seat left is written once (r20)", () => {
  it("writes today and the studio's reason on a seat still on the job", async () => {
    await mutationFnOf(useCloseProjectPartySeat())({
      id: "seat-1",
      projectId: "p",
      reason: "  The slab program went to Stonehaven.  ",
    });
    const write = updated.find((u) => u.table === "project_parties");
    expect(write?.payload).toEqual({
      stage: "off_job",
      off_job_at: new Date().toISOString().slice(0, 10),
      off_job_reason: "The slab program went to Stonehaven.",
    });
  });

  it("keeps the recorded day and the recorded reason when the seat has already left", async () => {
    standingRow.current = {
      id: "seat-1",
      off_job_at: "2026-08-20",
      off_job_reason: "Picked another HVAC sub.",
    };
    await mutationFnOf(useCloseProjectPartySeat())({
      id: "seat-1",
      projectId: "p",
      reason: "",
    });
    const write = updated.find((u) => u.table === "project_parties");
    expect(write?.payload).toEqual({
      stage: "off_job",
      off_job_at: "2026-08-20",
      off_job_reason: "Picked another HVAC sub.",
    });
  });

  it("lets a correction restate the sentence without moving the day", async () => {
    standingRow.current = {
      id: "seat-1",
      off_job_at: "2026-08-20",
      off_job_reason: "Picked another HVAC sub.",
    };
    await mutationFnOf(useCloseProjectPartySeat())({
      id: "seat-1",
      projectId: "p",
      reason: "Picked another HVAC sub — Northgate took it.",
    });
    const write = updated.find((u) => u.table === "project_parties");
    expect(write?.payload).toEqual({
      stage: "off_job",
      off_job_at: "2026-08-20",
      off_job_reason: "Picked another HVAC sub — Northgate took it.",
    });
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

/**
 * r21 major-1 / MAJOR-1 (R-BS) — CLOSING A SEAT ENDS ITS MONEY IN THE
 * DATABASE, SO THE BROWSER HAS TO BE TOLD.
 *
 * 00634's trigger ends every open grant on the seat at the close. Neither
 * close door invalidated `partyAuthorityKeys.all` — the root
 * `projectAuthorityKeys.project` nests under — so with `staleTime` five
 * minutes the Call Sheet went on printing "Signs money to $2,500." in the
 * present tense over a grant the same transaction closed, while the household
 * band two elements down refetched and dropped the clause.
 */
describe("the two doors that date a seat reach the authority root", () => {
  const doors: Array<[string, () => unknown]> = [
    ["useCloseProjectPartySeat", useCloseProjectPartySeat],
    ["useSetPartyBid", useSetPartyBid],
  ];
  for (const [name, hook] of doors) {
    it(`${name} invalidates partyAuthorityKeys.all`, () => {
      onSuccessOf(hook())({ project_id: "p" }, { projectId: "p" });
      const roots = invalidated.map((key: Any) => key[0]);
      expect(roots).toContain(partyAuthorityKeys.all[0]);
    });
  }
});

/**
 * r21 MAJOR-1 / major-2 (R-BS) — 00634's two refusals are SENTENCES on every
 * face. They are raised as bare tokens with no SQLSTATE on an object whose
 * prototype chain says `Error`, so every `e.message` catch printed the token.
 */
describe("asSeatCloseError", () => {
  it("says the PR-n rule in the household band's own words", () => {
    expect(
      asSeatCloseError({ message: "seat_close_money_authority_forbidden" }),
    ).toContain("principal");
    expect(
      asSeatCloseError({ message: "seat_close_money_authority_forbidden" }),
    ).not.toContain("seat_close");
  });

  it("says whose book a cross-tenant grant sits in", () => {
    const said = asSeatCloseError({
      message: "seat_close_authority_forbidden",
    });
    expect(said).toContain("another studio");
    expect(said).not.toContain("forbidden");
  });

  it("keeps a message it does not know, and falls back on an empty one", () => {
    expect(asSeatCloseError({ message: "network down" })).toBe("network down");
    expect(asSeatCloseError({ message: "" })).toBe("Could not close the seat.");
  });
});

/**
 * r21 MAJOR-1 / major-2 — AND THE ACT IS HELD BEFORE THE PRESS, with the
 * reason on the face, exactly as `householdAddIsHeld` holds the figure.
 */
describe("seatCloseIsHeldForMoney", () => {
  const open = (scope: string) => ({ scope, effective_to: null });

  it("holds a money-bearing seat for a caller who is not the principal", () => {
    expect(seatCloseIsHeldForMoney([open("money")], false)).toBe(true);
    expect(seatCloseIsHeldForMoney([open("draw_certify")], false)).toBe(true);
  });

  it("never holds it for an owner or an admin", () => {
    expect(seatCloseIsHeldForMoney([open("money")], true)).toBe(false);
  });

  it("stays as narrow as 00634's own gate", () => {
    // a scope outside PR-n's two
    expect(seatCloseIsHeldForMoney([open("schedule")], false)).toBe(false);
    // a money grant already ENDED gates nothing (effective_to IS NULL is the
    // trigger's own predicate)
    expect(
      seatCloseIsHeldForMoney(
        [{ scope: "money", effective_to: "2026-01-01" }],
        false,
      ),
    ).toBe(false);
    expect(seatCloseIsHeldForMoney([], false)).toBe(false);
    expect(seatCloseIsHeldForMoney(undefined, false)).toBe(false);
  });

  it("carries a reason a studio can act on", () => {
    expect(SEAT_CLOSE_MONEY_HELD_REASON).toContain("owner or an admin");
  });
});

/**
 * r21 major-3 / major-4 — WHICH HAND DATED THIS SEAT.
 *
 * "Close this seat" writes the day AND the studio's own reason; "They
 * withdrew" writes the day alone. Without that discrimination, recording any
 * other outcome on a hand-closed seat put the person back in a crew band
 * beside their own closing clause, and one more press NULLed the sentence.
 */
describe("seatClosedByHand", () => {
  it("reads a seat with no date as open", () => {
    expect(
      seatClosedByHand({ bidOutcome: "quoted", offJobAt: null }),
    ).toBe(false);
  });

  it("reads a dated seat whose outcome is not withdrawn as hand-closed", () => {
    expect(
      seatClosedByHand({ bidOutcome: "quoted", offJobAt: "2026-09-10" }),
    ).toBe(true);
  });

  it("reads a withdrawal's own date as the withdrawal's, so R-BR still clears it", () => {
    expect(
      seatClosedByHand({ bidOutcome: "withdrawn", offJobAt: "2026-09-10" }),
    ).toBe(false);
  });

  it("keeps a hand-written reason beside a withdrawal out of R-BR's reach", () => {
    expect(
      seatClosedByHand({
        bidOutcome: "withdrawn",
        offJobAt: "2026-09-10",
        offJobReason: "Picked another electrician",
      }),
    ).toBe(true);
  });
});

describe("bidStageOutcome on a seat the studio closed by hand (r21 major-3)", () => {
  const handClosed = {
    bidOutcome: "quoted" as const,
    stage: "off_job",
    offJobAt: "2026-09-10",
    offJobReason: "Picked another electrician",
  };

  it("records what came back and moves no band", () => {
    const written = bidStageOutcome(handClosed, "selected");
    expect(written.moved).toBe(true);
    expect(written.pastTheBid).toBe(true);
    expect(written.stage).toBeNull();
  });

  it("leaves the withdrawal's own record inside R-BR", () => {
    const withdrawn = {
      bidOutcome: "withdrawn" as const,
      stage: "off_job",
      offJobAt: "2026-09-10",
      offJobReason: null,
    };
    const written = bidStageOutcome(withdrawn, "quoted");
    expect(written.pastTheBid).toBe(false);
    expect(written.stage).toBe("bidding");
  });
});

describe("useSetPartyBid clears only what the withdrawal wrote (r21 major-4)", () => {
  it("leaves a hand-written day and reason standing", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "p",
      previous: {
        bidOutcome: "withdrawn",
        stage: "off_job",
        offJobAt: "2026-09-10",
        offJobReason: "Picked another electrician",
      },
      patch: { bidOutcome: "quoted" },
    });
    const patch = updated[updated.length - 1].payload;
    expect(patch.bid_outcome).toBe("quoted");
    expect("off_job_at" in patch).toBe(false);
    expect("off_job_reason" in patch).toBe(false);
  });

  it("still clears the day the withdrawal itself wrote (R-BR)", async () => {
    await mutationFnOf(useSetPartyBid())({
      id: "seat-1",
      projectId: "p",
      previous: {
        bidOutcome: "withdrawn",
        stage: "off_job",
        offJobAt: "2026-09-10",
        offJobReason: null,
      },
      patch: { bidOutcome: "quoted" },
    });
    const patch = updated[updated.length - 1].payload;
    expect(patch.stage).toBe("bidding");
    expect(patch.off_job_at).toBeNull();
    expect(patch.off_job_reason).toBeNull();
  });
});
