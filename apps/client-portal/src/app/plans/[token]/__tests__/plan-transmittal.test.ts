import {
  resolvePlanTransmittal,
  signResolvedPlanPrint,
  PLAN_SIGNED_URL_TTL_SECONDS,
} from "../plan-transmittal";
import { createServiceClient } from "@patina/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("@patina/supabase/server", () => ({
  createServiceClient: jest.fn(),
}));

const TOKEN = "a".repeat(64);
const PRINT_ID = "50000000-0000-4000-8000-000000000001";
const OTHER_PRINT_ID = "50000000-0000-4000-8000-000000000002";
const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";
const SHEET_ID = "70000000-0000-4000-8000-000000000001";
const STORAGE_PATH = "project-1/plans/a-101-rev-b.pdf";

const resolvedTransmittal = {
  studioName: "Middle West Studio",
  recipientName: "Sal Reyes",
  recipientCompany: "Reyes Tile Co.",
  purpose: "pricing",
  sentAt: "2026-08-01T15:00:00+00:00",
  projectLabel: "Aspen Loft Refresh",
  issueName: "Pricing Set",
  issueDate: "2026-08-01",
  setSha256: "c".repeat(64),
  isCurrentSet: true,
  supersededByName: null,
  supersededAt: null,
  sheets: [
    {
      printId: PRINT_ID,
      number: "A-101",
      title: "First Floor Plan",
      revLetter: "B",
      revDate: "2026-07-30",
      sha256: "d".repeat(64),
      sizeBytes: 204800,
      isCurrent: true,
    },
  ],
};

type FakeRows = Record<string, unknown>;

function serviceClient({
  rpcData = resolvedTransmittal,
  rpcError = null,
  rows = {},
  signedUrl = "https://storage.example.test/signed.pdf",
}: {
  rpcData?: unknown;
  rpcError?: unknown;
  rows?: FakeRows;
  signedUrl?: string | null;
} = {}) {
  const tableReads: string[] = [];
  const rpc = jest.fn().mockResolvedValue({ data: rpcData, error: rpcError });
  const from = jest.fn((table: string) => {
    tableReads.push(table);
    const query = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({
        data: rows[table] ?? null,
        error: null,
      }),
    };
    return query;
  });
  const createSignedUrl = jest.fn().mockResolvedValue({
    data: signedUrl ? { signedUrl } : null,
    error: signedUrl ? null : { message: "sign failed" },
  });
  const storageFrom = jest.fn(() => ({ createSignedUrl }));
  const client = {
    rpc,
    from,
    storage: { from: storageFrom },
  };
  return { client, rpc, from, tableReads, storageFrom, createSignedUrl };
}

describe("resolvePlanTransmittal", () => {
  beforeEach(() => {
    jest.mocked(createServiceClient).mockReset();
  });

  it("resolves a valid transmittal exclusively through resolve_plan_transmittal", async () => {
    const fake = serviceClient();
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolvePlanTransmittal(TOKEN)).resolves.toEqual(
      resolvedTransmittal,
    );
    expect(fake.rpc).toHaveBeenCalledWith("resolve_plan_transmittal", {
      p_token: TOKEN,
    });
    expect(fake.from).not.toHaveBeenCalled();
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it("rejects a malformed token before creating a service client", async () => {
    await expect(resolvePlanTransmittal("not-a-token")).resolves.toBeNull();
    await expect(resolvePlanTransmittal("A".repeat(64))).resolves.toBeNull();
    await expect(resolvePlanTransmittal("a".repeat(63))).resolves.toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("fails closed when the RPC answers with a miss", async () => {
    const fake = serviceClient({ rpcData: null });
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolvePlanTransmittal(TOKEN)).resolves.toBeNull();
  });

  it("fails closed when the RPC itself errors", async () => {
    const fake = serviceClient({ rpcData: null, rpcError: { message: "boom" } });
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolvePlanTransmittal(TOKEN)).resolves.toBeNull();
  });

  const sheet = resolvedTransmittal.sheets[0];
  it.each([
    ["a purpose outside the four", { ...resolvedTransmittal, purpose: "bidding" }],
    ["a non-hex set checksum", { ...resolvedTransmittal, setSha256: "z".repeat(64) }],
    ["a short set checksum", { ...resolvedTransmittal, setSha256: "c".repeat(63) }],
    [
      "a missing sheets array",
      (() => {
        const { sheets: _sheets, ...rest } = resolvedTransmittal;
        return rest;
      })(),
    ],
    ["an empty sheets array", { ...resolvedTransmittal, sheets: [] }],
    ["sheets that are not an array", { ...resolvedTransmittal, sheets: {} }],
    ["a missing studio name", { ...resolvedTransmittal, studioName: "" }],
    ["a non-string recipient", { ...resolvedTransmittal, recipientName: 7 }],
    ["a non-boolean isCurrentSet", { ...resolvedTransmittal, isCurrentSet: "yes" }],
    ["an unparseable sentAt", { ...resolvedTransmittal, sentAt: "yesterday" }],
    [
      "a storage_path smuggled at the top level",
      { ...resolvedTransmittal, storage_path: STORAGE_PATH },
    ],
    [
      "a storagePath smuggled at the top level",
      { ...resolvedTransmittal, storagePath: STORAGE_PATH },
    ],
    [
      "a storage_path smuggled inside a sheet",
      {
        ...resolvedTransmittal,
        sheets: [{ ...sheet, storage_path: STORAGE_PATH }],
      },
    ],
    [
      "a superseding name on a current set",
      { ...resolvedTransmittal, supersededByName: "Issue 3" },
    ],
    [
      "a superseding date on a current set",
      { ...resolvedTransmittal, supersededAt: "2026-08-05T12:00:00+00:00" },
    ],
    [
      "a sheet whose printId is not a uuid",
      { ...resolvedTransmittal, sheets: [{ ...sheet, printId: "print-1" }] },
    ],
    [
      "a sheet with a lowercase rev letter",
      { ...resolvedTransmittal, sheets: [{ ...sheet, revLetter: "b" }] },
    ],
    [
      "a sheet with a three-letter rev",
      { ...resolvedTransmittal, sheets: [{ ...sheet, revLetter: "ABC" }] },
    ],
    [
      "a sheet with a non-hex sha256",
      { ...resolvedTransmittal, sheets: [{ ...sheet, sha256: "nope" }] },
    ],
    [
      "a sheet with an unparseable revDate",
      { ...resolvedTransmittal, sheets: [{ ...sheet, revDate: "soonish" }] },
    ],
    [
      "a sheet with a negative sizeBytes",
      { ...resolvedTransmittal, sheets: [{ ...sheet, sizeBytes: -1 }] },
    ],
    [
      "a sheet with a non-boolean isCurrent",
      { ...resolvedTransmittal, sheets: [{ ...sheet, isCurrent: "true" }] },
    ],
    [
      "a sheet with an empty number",
      { ...resolvedTransmittal, sheets: [{ ...sheet, number: "  " }] },
    ],
  ])("fails closed on %s", async (_name, payload) => {
    const fake = serviceClient({ rpcData: payload });
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolvePlanTransmittal(TOKEN)).resolves.toBeNull();
  });

  it("accepts a superseded (non-current) set with the superseding issue named", async () => {
    const superseded = {
      ...resolvedTransmittal,
      isCurrentSet: false,
      supersededByName: "Issue 3",
      supersededAt: "2026-08-05T12:00:00+00:00",
      sheets: [{ ...sheet, isCurrent: false }],
    };
    const fake = serviceClient({ rpcData: superseded });
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolvePlanTransmittal(TOKEN)).resolves.toEqual(superseded);
  });
});

describe("signResolvedPlanPrint", () => {
  const readyRows = {
    plan_prints: {
      id: PRINT_ID,
      project_document_id: DOCUMENT_ID,
      sheet_id: SHEET_ID,
    },
    project_documents: {
      id: DOCUMENT_ID,
      storage_path: STORAGE_PATH,
      doc_type: "pdf",
      status: "ready",
    },
  };

  it("re-resolves, reads only the addressed print and document, and signs for 120 seconds", async () => {
    const fake = serviceClient({ rows: readyRows });

    await expect(
      signResolvedPlanPrint(TOKEN, PRINT_ID, false, fake.client as never),
    ).resolves.toEqual({
      signedUrl: "https://storage.example.test/signed.pdf",
    });
    expect(fake.rpc).toHaveBeenCalledWith("resolve_plan_transmittal", {
      p_token: TOKEN,
    });
    expect(fake.tableReads).toEqual(["plan_prints", "project_documents"]);
    expect(fake.storageFrom).toHaveBeenCalledWith("project-documents");
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      STORAGE_PATH,
      PLAN_SIGNED_URL_TTL_SECONDS,
      undefined,
    );
    expect(PLAN_SIGNED_URL_TTL_SECONDS).toBe(120);
  });

  it("adds only a sanitized sheet filename when download is requested", async () => {
    const fake = serviceClient({ rows: readyRows });

    await signResolvedPlanPrint(TOKEN, PRINT_ID, true, fake.client as never);
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      STORAGE_PATH,
      PLAN_SIGNED_URL_TTL_SECONDS,
      { download: "A-101 Rev B.pdf" },
    );
  });

  it("refuses a printId the resolved transmittal does not carry", async () => {
    const fake = serviceClient({ rows: readyRows });

    await expect(
      signResolvedPlanPrint(TOKEN, OTHER_PRINT_ID, false, fake.client as never),
    ).resolves.toBeNull();
    expect(fake.tableReads).toEqual([]);
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it("does not read any table when capability resolution fails", async () => {
    const fake = serviceClient({ rpcData: null, rows: readyRows });

    await expect(
      signResolvedPlanPrint(TOKEN, PRINT_ID, false, fake.client as never),
    ).resolves.toBeNull();
    expect(fake.tableReads).toEqual([]);
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing print row", { ...readyRows, plan_prints: null }],
    [
      "a print pointing at a different document than the one loaded",
      {
        ...readyRows,
        plan_prints: {
          ...readyRows.plan_prints,
          project_document_id: "60000000-0000-4000-8000-00000000000f",
        },
      },
    ],
    ["a missing document row", { ...readyRows, project_documents: null }],
    [
      "a document with no storage path",
      {
        ...readyRows,
        project_documents: { ...readyRows.project_documents, storage_path: "" },
      },
    ],
    [
      "a document not yet ready",
      {
        ...readyRows,
        project_documents: { ...readyRows.project_documents, status: "processing" },
      },
    ],
  ])("fails closed on %s without signing", async (_name, rows) => {
    const fake = serviceClient({ rows: rows as FakeRows });

    await expect(
      signResolvedPlanPrint(TOKEN, PRINT_ID, false, fake.client as never),
    ).resolves.toBeNull();
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it("fails closed when the signed URL cannot be minted", async () => {
    const fake = serviceClient({ rows: readyRows, signedUrl: null });

    await expect(
      signResolvedPlanPrint(TOKEN, PRINT_ID, false, fake.client as never),
    ).resolves.toBeNull();
  });
});
