/**
 * W4/P3's data layer, pinned where it can be got wrong.
 *
 *  · E13 reads as a SENTENCE, and every clause the record does not hold is
 *    dropped rather than guessed (CRM-22's "received, not authority");
 *  · the inbound queue asks a different question from the paper table — what
 *    has ARRIVED and not been looked at, never what the studio HOLDS;
 *  · R-AD's clock is the studio's choice or the firm's own window, and the
 *    refusal when it is neither reaches the face as a sentence;
 *  · every new key is one canonical key, and each write fans out to every
 *    read its row can change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Call {
  table: string;
  op: string;
  args: Any[];
}

const calls: Call[] = [];
const rpcCalls: Array<{ name: string; args: Any }> = [];
const rpcError: { current: { message: string } | null } = { current: null };
const rpcData: { current: Any } = { current: null };
const rows: { current: Any[] } = { current: [] };
const invalidated: Any[] = [];

function builderFor(table: string): Any {
  const builder: Any = {};
  const record =
    (op: string) =>
    (...args: Any[]) => {
      calls.push({ table, op, args });
      return builder;
    };
  builder.select = record("select");
  builder.eq = record("eq");
  builder.neq = record("neq");
  builder.is = record("is");
  builder.in = record("in");
  builder.order = record("order");
  builder.limit = vi.fn((...args: Any[]) => {
    calls.push({ table, op: "limit", args });
    return Promise.resolve({ data: rows.current, error: null });
  });
  // A list read that never reaches `.limit()` still has to resolve.
  builder.then = (resolve: Any) =>
    resolve({ data: rows.current, error: null });
  return builder;
}

const from = vi.fn((table: string) => builderFor(table));
const rpc = vi.fn((name: string, args: Any) => {
  rpcCalls.push({ name, args });
  return Promise.resolve({
    data: rpcError.current ? null : rpcData.current,
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
  NO_TOUCH_SENTENCE,
  TOUCH_AUTHORITY_SENTENCES,
  asNoticeError,
  inboundDecisionSentence,
  lastInboundDecision,
  touchKeys,
  touchSentence,
  useRecordNotice,
  useTouches,
} from "../use-touches";
import {
  asPaperworkLinkError,
  firmEngagementWindowEnd,
  paperworkLinkKeys,
  paperworkLinkUrl,
  thirtyDaysOut,
  useMintPaperworkLink,
  usePaperworkLinks,
  useRevokePaperworkLink,
} from "../use-paperwork-links";
import {
  asInboundDocumentError,
  inboundDocumentKeys,
  inboundDocumentLine,
  inboundQueueHeading,
  useConfirmInboundDocument,
  useInboundDocuments,
  useRejectInboundDocument,
} from "../use-inbound-documents";
import {
  ACCESS_GRANT_REVOKE_ROUTES,
  ACCESS_GRANT_TIER_LABELS,
  ALL_ACCESS_GRANT_TIERS,
  accessGrantRevokeRoute,
  isAccessGrantRevokable,
  useRevokeAccessGrant,
} from "../use-access-grants";
import { retainedComplianceDocuments } from "../use-studio-contacts";

function queryFnOf(hook: unknown) {
  return (hook as { queryFn: () => Promise<unknown> }).queryFn;
}
function mutationFnOf(hook: unknown) {
  return (hook as { mutationFn: (input: unknown) => Promise<unknown> })
    .mutationFn;
}
function onSuccessOf(hook: unknown) {
  return (hook as { onSuccess: (data: unknown, input: unknown) => void })
    .onSuccess;
}

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  invalidated.length = 0;
  rows.current = [];
  rpcError.current = null;
  rpcData.current = null;
});

const TOUCH = {
  id: "t1",
  organization_id: "studio-1",
  subject_type: "engagement",
  subject_id: "seat-1",
  channel_kind: "sms",
  direction: "in" as const,
  occurred_at: "2026-09-12T10:00:00Z",
  actor_ref: "sms-inbound",
  decision_class: "money",
  authority_check: "failed_no_authority",
  notice_of: null,
  notified_refs: [],
  message_ref: null,
  created_at: "2026-09-12T10:00:00Z",
};

describe("E13 · the touch, in words (CRM-22)", () => {
  it("names the day, the channel, the decision and the verdict", () => {
    expect(touchSentence(TOUCH)).toBe(
      "Last touch 12 Sep 2026, by text. A money decision. Received, not authority.",
    );
  });

  it("drops the channel the record did not name rather than guessing one", () => {
    expect(touchSentence({ ...TOUCH, channel_kind: null })).toBe(
      "Last touch 12 Sep 2026. A money decision. Received, not authority.",
    );
  });

  it("says nothing about authority where no decision was filed", () => {
    expect(
      touchSentence({
        ...TOUCH,
        decision_class: "none",
        authority_check: "n/a",
      }),
    ).toBe("Last touch 12 Sep 2026, by text.");
  });

  it("prints its own sentence where there is no touch at all (R-V)", () => {
    expect(touchSentence(null)).toBe(NO_TOUCH_SENTENCE);
  });

  it("reads CRM-22's own words for an unmatched approval", () => {
    expect(TOUCH_AUTHORITY_SENTENCES.failed_no_authority).toBe(
      "Received, not authority.",
    );
  });
});

describe("the last inbound decision", () => {
  it("is the newest message that came IN and filed a class", () => {
    const older = { ...TOUCH, id: "t0", occurred_at: "2026-09-01T10:00:00Z" };
    const outbound = { ...TOUCH, id: "t2", direction: "out" as const,
      occurred_at: "2026-09-20T10:00:00Z" };
    const chatter = { ...TOUCH, id: "t3", decision_class: "none",
      authority_check: "n/a", occurred_at: "2026-09-21T10:00:00Z" };
    expect(lastInboundDecision([older, TOUCH, outbound, chatter])?.id).toBe("t1");
  });

  it("is null where nothing inbound ever decided anything", () => {
    expect(
      lastInboundDecision([{ ...TOUCH, decision_class: "none", authority_check: "n/a" }]),
    ).toBeNull();
    expect(inboundDecisionSentence(null)).toBeNull();
  });

  it("reads as the row's own sentence", () => {
    expect(inboundDecisionSentence(TOUCH)).toBe(
      "A money decision came in 12 Sep 2026, by text. Received, not authority.",
    );
  });
});

describe("useTouches", () => {
  it("asks only for the subjects it was given, newest first", async () => {
    const hook = useTouches({
      subjectIds: ["seat-1"],
      direction: "in",
      decisionsOnly: true,
      limit: 1,
    });
    await queryFnOf(hook)();
    expect(calls.map((c) => c.op)).toEqual([
      "select",
      "in",
      "eq",
      "neq",
      "order",
      "limit",
    ]);
    expect(calls[1].args).toEqual(["subject_id", ["seat-1"]]);
    expect(calls[2].args).toEqual(["direction", "in"]);
    // A plain message defaults to `decision_class = 'none'`, so this IS the
    // whole "did it decide anything" predicate.
    expect(calls[3].args).toEqual(["decision_class", "none"]);
    expect(calls[4].args).toEqual(["occurred_at", { ascending: false }]);
    expect(calls[5].args).toEqual([1]);
  });

  it("is disabled with no subject — a card asks about one identity", () => {
    expect((useTouches({ subjectIds: [] }) as Any).enabled).toBe(false);
    expect((useTouches({ subjectIds: ["a"] }) as Any).enabled).toBe(true);
  });

  it("keys on the sorted subject list, so two orders are one cache entry", () => {
    expect(touchKeys.list({ subjectIds: ["b", "a"] })).toEqual(
      touchKeys.list({ subjectIds: ["a", "b"] }),
    );
  });
});

describe("record_notice (CRM-23)", () => {
  it("sends the job, the fact and the told refs, and nothing else", async () => {
    rpcData.current = [
      { id: "t1", what: "The way in changed.", recorded_at: "x",
        recorded_by: "Leah", told_names: ["Luis Ochoa"] },
    ];
    const notice = await mutationFnOf(useRecordNotice())({
      projectId: "okonkwo",
      what: "The way in changed.",
      told: ["seat-luis"],
    });
    expect(rpcCalls).toEqual([
      {
        name: "record_notice",
        args: {
          p_project_id: "okonkwo",
          p_what: "The way in changed.",
          p_told: ["seat-luis"],
        },
      },
    ]);
    // RETURNS TABLE → a one-row array the face reads as one row.
    expect(notice).toEqual(rpcData.current[0]);
  });

  it("tells every touch reader that a new one landed", () => {
    onSuccessOf(useRecordNotice())(null, {
      projectId: "okonkwo",
      what: "x",
    });
    expect(invalidated).toContainEqual(touchKeys.all);
  });

  it("says the RPC's refusals in words, never the bare token", () => {
    expect(asNoticeError(new Error("notice_what_required"))).toContain(
      "Say what changed",
    );
    expect(asNoticeError({ message: "notice_not_authorized" })).toContain(
      "not yours to write",
    );
  });
});

describe("the paperwork door (PR-a, R-AD, R-AF)", () => {
  it("mints with the studio's named day and unwraps the one row", async () => {
    rpcData.current = [
      { id: "tok-1", token: "raw", expires_at: "2026-10-15T23:59:59Z" },
    ];
    const minted = await mutationFnOf(useMintPaperworkLink())({
      companyId: "firm-1",
      expiresAt: "2026-10-15T23:59:59Z",
    });
    expect(rpcCalls).toEqual([
      {
        name: "mint_paperwork_link",
        args: { p_company_id: "firm-1", p_expires_at: "2026-10-15T23:59:59Z" },
      },
    ]);
    expect(minted).toEqual(rpcData.current[0]);
  });

  it("hands the RPC no date at all when the firm's own window is chosen", async () => {
    rpcData.current = [{ id: "tok-1", token: "raw", expires_at: "x" }];
    await mutationFnOf(useMintPaperworkLink())({ companyId: "firm-1" });
    expect(rpcCalls[0].args.p_expires_at).toBeNull();
  });

  it("says R-AD's refusal in words — there is no clock to fall back on", async () => {
    rpcError.current = { message: "paperwork_link_window_required" };
    await expect(
      mutationFnOf(useMintPaperworkLink())({ companyId: "firm-1" }),
    ).rejects.toThrow(/no open engagement here/);
  });

  it("refuses a person's card in words (the BEFORE trigger's token)", () => {
    expect(
      asPaperworkLinkError({ message: "paperwork_token_company_required" }),
    ).toContain("never a person");
  });

  it("tells the firm's own list AND the grants list on a mint (R-AF)", () => {
    onSuccessOf(useMintPaperworkLink())(null, { companyId: "firm-1" });
    expect(invalidated).toContainEqual(paperworkLinkKeys.forCompany("firm-1"));
    expect(invalidated).toContainEqual(["access-grants"]);
  });

  it("closes a door through the RPC and keeps the row", async () => {
    rpcData.current = true;
    await mutationFnOf(useRevokePaperworkLink())({
      tokenId: "tok-1",
      companyId: "firm-1",
      reason: "  the job ended  ",
    });
    expect(rpcCalls).toEqual([
      {
        name: "revoke_paperwork_link",
        args: { p_token_id: "tok-1", p_reason: "the job ended" },
      },
    ]);
  });

  it("never asks the token table for a credential", async () => {
    await queryFnOf(usePaperworkLinks("firm-1"))();
    const selected = String(calls.find((c) => c.op === "select")?.args[0] ?? "");
    expect(selected).not.toContain("token_hash");
    expect(selected).not.toContain("token");
    expect(calls.find((c) => c.op === "eq")?.args).toEqual([
      "company_id",
      "firm-1",
    ]);
  });

  it("is an eighth guest prefix beside /field", () => {
    expect(paperworkLinkUrl("abc")).toMatch(/\/paperwork\/abc$/);
  });
});

describe("R-AD's window, read on the face", () => {
  const seats = [
    { company_id: "firm-1", off_job_at: null, on_site_to: "2026-10-01",
      warranty_until: null },
    { company_id: "firm-1", off_job_at: null, on_site_to: "2026-09-01",
      warranty_until: "2027-08-13" },
    // A seat the firm has left carries no window to borrow.
    { company_id: "firm-1", off_job_at: "2026-08-01", on_site_to: "2030-01-01",
      warranty_until: null },
    // Another firm's seat is not this firm's window.
    { company_id: "firm-2", off_job_at: null, on_site_to: "2031-01-01",
      warranty_until: null },
  ];

  it("is the latest day across the firm's OPEN seats, warranty included", () => {
    expect(firmEngagementWindowEnd(seats, "firm-1")).toBe("2027-08-13");
  });

  it("is null for a firm with nothing open — R-AD's whole case", () => {
    expect(firmEngagementWindowEnd(seats, "firm-3")).toBeNull();
  });

  it("offers thirty days as a DAY the studio picks, not a running clock", () => {
    expect(thirtyDaysOut(new Date("2026-09-15T12:00:00Z"))).toBe("2026-10-15");
  });
});

describe("the inbound queue (spec §6)", () => {
  it("asks for paper that ARRIVED and was never looked at", async () => {
    await queryFnOf(useInboundDocuments("firm-1"))();
    expect(calls.map((c) => c.args)).toEqual([
      ["*"],
      ["holder_id", "firm-1"],
      ["inbound", true],
      ["verified_at", null],
      ["rejected_at", null],
      ["created_at", { ascending: true }],
    ]);
  });

  it("is disabled with no holder", () => {
    expect((useInboundDocuments(null) as Any).enabled).toBe(false);
  });

  it("counts in the band's own words", () => {
    expect(inboundQueueHeading(1)).toBe("1 document waiting for your check");
    expect(inboundQueueHeading(3)).toBe("3 documents waiting for your check");
  });

  it("names the paper, the day and the firm", () => {
    expect(
      inboundDocumentLine(
        { doc_type: "coi_gl", doc_label: null,
          created_at: "2026-09-12T10:00:00Z" },
        "Twin Cities Drywall",
      ),
    ).toBe(
      "COI, general liability, uploaded 12 Sep 2026 by Twin Cities Drywall.",
    );
  });

  it("confirms through the RPC and fans out to every paper reader", async () => {
    rpcData.current = "doc-1";
    await mutationFnOf(useConfirmInboundDocument())({
      documentId: "doc-1",
      holderId: "firm-1",
    });
    expect(rpcCalls).toEqual([
      { name: "confirm_inbound_document", args: { p_document_id: "doc-1" } },
    ]);
    onSuccessOf(useConfirmInboundDocument())("doc-1", {
      documentId: "doc-1",
      holderId: "firm-1",
    });
    expect(invalidated).toContainEqual(inboundDocumentKeys.all);
    expect(invalidated).toContainEqual(["studio-compliance-documents"]);
    // The paper WORD prints on the Directory row and every roster row.
    expect(invalidated).toContainEqual(["people-directory"]);
    expect(invalidated).toContainEqual(["people-directory-seats"]);
  });

  it("refuses a reasonless rejection BEFORE it reaches the database", async () => {
    await expect(
      mutationFnOf(useRejectInboundDocument())({
        documentId: "doc-1",
        holderId: "firm-1",
        reason: "   ",
      }),
    ).rejects.toThrow(/cannot read is one it cannot fix/);
    expect(rpcCalls).toEqual([]);
  });

  it("sends the trimmed reason where one is written", async () => {
    rpcData.current = "doc-1";
    await mutationFnOf(useRejectInboundDocument())({
      documentId: "doc-1",
      holderId: "firm-1",
      reason: "  the certificate has no expiry  ",
    });
    expect(rpcCalls).toEqual([
      {
        name: "reject_inbound_document",
        args: {
          p_document_id: "doc-1",
          p_reason: "the certificate has no expiry",
        },
      },
    ]);
  });

  it("says R-AZ's two refusals in words, never the bare token", () => {
    expect(
      asInboundDocumentError({
        message: "compliance_confirm_needs_a_live_date",
      }),
    ).toContain("needs its own end date");
    expect(
      asInboundDocumentError(new Error("compliance_confirm_drops_a_gate")),
    ).toContain("blocks more than this one does");
  });
});

describe("v_access_grants' twelfth tier (spec §8)", () => {
  it("carries the paperwork link and its word", () => {
    expect(ALL_ACCESS_GRANT_TIERS).toHaveLength(12);
    expect(ALL_ACCESS_GRANT_TIERS).toContain("paperwork_link");
    expect(ACCESS_GRANT_TIER_LABELS.paperwork_link).toBe("Paperwork link");
  });

  it("routes Revoke to 00637's own RPC, reason optional, row kept", () => {
    expect(isAccessGrantRevokable("paperwork_link")).toBe(true);
    const route = accessGrantRevokeRoute("paperwork_link");
    expect(route).toEqual({
      rpc: "revoke_paperwork_link",
      idArg: "p_token_id",
      reasonArg: "p_reason",
      keySegment: 1,
    });
    expect(ACCESS_GRANT_REVOKE_ROUTES.paperwork_link?.reasonRequired).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// W4 round-1 review
// ─────────────────────────────────────────────────────────────────────────────
describe("MAJOR-3 · closing a door tells the band that mints it", () => {
  it("useRevokeAccessGrant invalidates the paperwork-link list too", () => {
    onSuccessOf(useRevokeAccessGrant())(null, {
      grantId: "paperwork_link:tok-1",
      tier: "paperwork_link",
    });
    expect(invalidated).toContainEqual(["paperwork-links"]);
    expect(invalidated).toContainEqual(["access-grants"]);
  });
});

describe("QA-B1 / MAJOR-2 · the browser's list is what the studio HOLDS", () => {
  const base = {
    organization_id: "studio-1",
    holder_type: "company" as const,
    holder_id: "firm-1",
    doc_label: null,
    number: null,
    issuer: null,
    issued_on: null,
    file_path: null,
    verified_by: null,
    held_by: "studio" as const,
    blocks: [] as string[],
    superseded_by: null,
    source: "studio" as const,
    inbound: false,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  it("drops an inbound upload nobody has checked, and a refused one, and keeps the studio's own record", () => {
    const rowsIn = [
      { ...base, id: "typed", doc_type: "w9", expires_on: null, verified_at: null },
      {
        ...base,
        id: "pending",
        doc_type: "coi_gl",
        expires_on: "2027-03-31",
        verified_at: null,
        source: "field_link" as const,
        inbound: true,
      },
      {
        ...base,
        id: "refused",
        doc_type: "license",
        expires_on: "2027-03-31",
        verified_at: null,
        source: "field_link" as const,
        inbound: true,
        rejected_at: "2026-09-12T10:00:00Z",
        rejection_reason: "Wrong firm.",
      },
      {
        ...base,
        id: "confirmed",
        doc_type: "coi_gl",
        expires_on: "2027-03-31",
        verified_at: "2026-09-12T10:00:00Z",
        source: "field_link" as const,
        inbound: true,
      },
    ];
    expect(
      retainedComplianceDocuments(rowsIn as never, "2026-09-15").map((d) => d.id),
    ).toEqual(["typed", "confirmed"]);
  });
});
