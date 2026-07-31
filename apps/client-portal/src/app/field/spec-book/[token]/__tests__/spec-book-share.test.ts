import {
  resolveSpecBookShare,
  signResolvedSpecBookArtifact,
  SPEC_BOOK_SIGNED_URL_TTL_SECONDS,
} from "../spec-book-share";
import { createServiceClient } from "@patina/supabase/server";

jest.mock("server-only", () => ({}));
jest.mock("@patina/supabase/server", () => ({
  createServiceClient: jest.fn(),
}));

const TOKEN = "a".repeat(64);
const ARTIFACT_ID = "40000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "60000000-0000-4000-8000-000000000001";
const STORAGE_PATH = "project-1/spec-books/revision-1/client.pdf";

const resolvedShare = {
  shareId: "70000000-0000-4000-8000-000000000001",
  artifactId: ARTIFACT_ID,
  audience: "client",
  format: "pdf",
  label: "For the homeowners",
  title: "Lakeside Residence — Client Edition",
  sizeBytes: 248012,
  checksumSha256: "b".repeat(64),
  issuedAt: "2026-07-30T18:00:00.000Z",
  shareExpiresAt: "2026-08-30T18:00:00.000Z",
  downloadUrl: `/field/spec-book/${TOKEN}/download`,
};

const forbiddenWorkingTables = new Set([
  "spec_books",
  "spec_book_revisions",
  "spec_book_revision_items",
  "project_ffe_items",
  "project_ffe_specs",
  "products",
  "vendors",
]);

type FakeRows = Record<string, unknown>;

function serviceClient({
  rpcData = resolvedShare,
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
  const maybeSingle = jest.fn();
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
    maybeSingle.mockImplementation(query.maybeSingle);
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

describe("resolveSpecBookShare", () => {
  beforeEach(() => {
    jest.mocked(createServiceClient).mockReset();
  });

  it("resolves a valid share exclusively through resolve_spec_book_share", async () => {
    const fake = serviceClient();
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolveSpecBookShare(TOKEN)).resolves.toEqual({
      artifactId: ARTIFACT_ID,
      audience: "client",
      format: "pdf",
      label: "For the homeowners",
      title: "Lakeside Residence — Client Edition",
      sizeBytes: 248012,
      checksumSha256: "b".repeat(64),
      issuedAt: "2026-07-30T18:00:00.000Z",
      shareExpiresAt: "2026-08-30T18:00:00.000Z",
    });
    expect(fake.rpc).toHaveBeenCalledWith("resolve_spec_book_share", {
      p_token: TOKEN,
    });
    expect(fake.from).not.toHaveBeenCalled();
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it("rejects malformed credentials before creating a service client", async () => {
    await expect(resolveSpecBookShare("not-a-token")).resolves.toBeNull();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each(["unknown", "expired", "revoked", "wrong-audience", "non-ready"])(
    "fails closed for a %s RPC result without querying any table",
    async () => {
      const fake = serviceClient({ rpcData: null });
      jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

      await expect(resolveSpecBookShare(TOKEN)).resolves.toBeNull();
      expect(fake.from).not.toHaveBeenCalled();
      expect(fake.storageFrom).not.toHaveBeenCalled();
    },
  );

  it("fails closed if the RPC payload is not the frozen metadata contract", async () => {
    const fake = serviceClient({
      rpcData: {
        ...resolvedShare,
        audience: "private-price-export",
        storagePath: STORAGE_PATH,
      },
    });
    jest.mocked(createServiceClient).mockReturnValue(fake.client as never);

    await expect(resolveSpecBookShare(TOKEN)).resolves.toBeNull();
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe("signResolvedSpecBookArtifact", () => {
  const readyRows = {
    spec_book_artifacts: {
      id: ARTIFACT_ID,
      audience: "client",
      format: "pdf",
      status: "ready",
      project_document_id: DOCUMENT_ID,
      storage_bucket: "project-documents",
      storage_path: STORAGE_PATH,
    },
    project_documents: {
      id: DOCUMENT_ID,
      title: resolvedShare.title,
      doc_type: "pdf",
      status: "ready",
      storage_path: STORAGE_PATH,
    },
  };

  it("re-resolves the capability, reads only the addressed immutable artifact/document, and signs briefly", async () => {
    const fake = serviceClient({ rows: readyRows });

    await expect(
      signResolvedSpecBookArtifact(TOKEN, false, fake.client as never),
    ).resolves.toEqual({
      signedUrl: "https://storage.example.test/signed.pdf",
      title: resolvedShare.title,
    });
    expect(fake.tableReads).toEqual([
      "spec_book_artifacts",
      "project_documents",
    ]);
    expect(
      fake.tableReads.some((table) => forbiddenWorkingTables.has(table)),
    ).toBe(false);
    expect(fake.storageFrom).toHaveBeenCalledWith("project-documents");
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      STORAGE_PATH,
      SPEC_BOOK_SIGNED_URL_TTL_SECONDS,
      undefined,
    );
  });

  it("adds only a sanitized filename when download is requested", async () => {
    const fake = serviceClient({
      rows: readyRows,
      rpcData: { ...resolvedShare, title: "Lakeside / Residence" },
    });

    await signResolvedSpecBookArtifact(TOKEN, true, fake.client as never);
    expect(fake.createSignedUrl).toHaveBeenCalledWith(
      STORAGE_PATH,
      SPEC_BOOK_SIGNED_URL_TTL_SECONDS,
      { download: "Lakeside  Residence.pdf" },
    );
  });

  it("does not query artifacts when capability resolution fails", async () => {
    const fake = serviceClient({ rpcData: null, rows: readyRows });
    await expect(
      signResolvedSpecBookArtifact(TOKEN, false, fake.client as never),
    ).resolves.toBeNull();
    expect(fake.tableReads).toEqual([]);
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong audience", { audience: "vendor" }],
    ["non-ready artifact", { status: "failed" }],
    ["wrong bucket", { storage_bucket: "public-assets" }],
  ])(
    "fails closed for a %s without loading the document or signing",
    async (_name, patch) => {
      const fake = serviceClient({
        rows: {
          ...readyRows,
          spec_book_artifacts: { ...readyRows.spec_book_artifacts, ...patch },
        },
      });

      await expect(
        signResolvedSpecBookArtifact(TOKEN, false, fake.client as never),
      ).resolves.toBeNull();
      expect(fake.tableReads).toEqual(["spec_book_artifacts"]);
      expect(fake.storageFrom).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the project document does not match the artifact storage path", async () => {
    const fake = serviceClient({
      rows: {
        ...readyRows,
        project_documents: {
          ...readyRows.project_documents,
          storage_path: "project-1/spec-books/revision-2/client.pdf",
        },
      },
    });

    await expect(
      signResolvedSpecBookArtifact(TOKEN, false, fake.client as never),
    ).resolves.toBeNull();
    expect(fake.tableReads).toEqual([
      "spec_book_artifacts",
      "project_documents",
    ]);
    expect(fake.storageFrom).not.toHaveBeenCalled();
  });
});
