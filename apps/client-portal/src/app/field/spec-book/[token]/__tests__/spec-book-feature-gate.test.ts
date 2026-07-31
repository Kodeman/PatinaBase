import {
  isSpecBookGuestEntryEnabled,
  parseSpecBookFlagOverride,
  SPEC_BOOK_WORKSPACE_FLAG,
  type SpecBookFeatureFlagClient,
} from "../spec-book-feature-gate";

jest.mock("server-only", () => ({}));

const ARTIFACT_ID = "40000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";
const BOOK_ID = "20000000-0000-4000-8000-000000000001";
const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const CREATOR_ID = "50000000-0000-4000-8000-000000000001";
const STUDIO_ID = "80000000-0000-4000-8000-000000000001";

function serviceClient(
  rows: Record<string, unknown> = {
    spec_book_artifacts: { revision_id: REVISION_ID },
    spec_book_revisions: {
      created_by: CREATOR_ID,
      spec_book_id: BOOK_ID,
    },
    spec_books: { project_id: PROJECT_ID },
    projects: { studio_id: STUDIO_ID },
  },
) {
  const tableReads: string[] = [];
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
  return { client: { from } as never, tableReads };
}

function featureClient(result: boolean | undefined | Promise<never>) {
  const isFeatureEnabled = jest
    .fn()
    .mockImplementation(() =>
      result instanceof Promise ? result : Promise.resolve(result),
    );
  const shutdown = jest.fn().mockResolvedValue(undefined);
  const client: SpecBookFeatureFlagClient = {
    isFeatureEnabled,
    shutdown,
  };
  return { client, isFeatureEnabled, shutdown };
}

describe("spec-book anonymous server feature gate", () => {
  it("parses the Designer Playwright override format only outside production", () => {
    const raw = `other:false, ${SPEC_BOOK_WORKSPACE_FLAG}:true`;
    expect(parseSpecBookFlagOverride(raw, "test")).toBe(true);
    expect(parseSpecBookFlagOverride(raw, "development")).toBe(true);
    expect(parseSpecBookFlagOverride(raw, "production")).toBeUndefined();
    expect(
      parseSpecBookFlagOverride(`${SPEC_BOOK_WORKSPACE_FLAG}:false`, "test"),
    ).toBe(false);
  });

  it("short-circuits local/test overrides without loading private identity", async () => {
    const fake = serviceClient();
    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        nodeEnv: "test",
        overrideRaw: `${SPEC_BOOK_WORKSPACE_FLAG}:true`,
      }),
    ).resolves.toBe(true);
    expect(fake.tableReads).toEqual([]);

    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        nodeEnv: "test",
        overrideRaw: `${SPEC_BOOK_WORKSPACE_FLAG}:false`,
      }),
    ).resolves.toBe(false);
    expect(fake.tableReads).toEqual([]);
  });

  it("fails closed when PostHog configuration is missing", async () => {
    const fake = serviceClient();
    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        nodeEnv: "production",
        posthogKey: "",
      }),
    ).resolves.toBe(false);
    expect(fake.tableReads).toEqual([]);
  });

  it("evaluates the live flag for the internal creator and studio identity", async () => {
    const fake = serviceClient();
    const posthog = featureClient(true);
    const createPostHogClient = jest.fn(() => posthog.client);

    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        createPostHogClient,
        nodeEnv: "production",
        posthogKey: "phc_test",
      }),
    ).resolves.toBe(true);

    expect(fake.tableReads).toEqual([
      "spec_book_artifacts",
      "spec_book_revisions",
      "spec_books",
      "projects",
    ]);
    expect(posthog.isFeatureEnabled).toHaveBeenCalledWith(
      SPEC_BOOK_WORKSPACE_FLAG,
      CREATOR_ID,
      {
        groups: { studio: STUDIO_ID },
        sendFeatureFlagEvents: false,
        disableGeoip: true,
      },
    );
    expect(posthog.shutdown).toHaveBeenCalledWith(100);
  });

  it.each([
    ["disabled", false],
    ["SDK error", new Error("PostHog unavailable")],
  ])("fails closed when the live flag is %s", async (_label, outcome) => {
    const fake = serviceClient();
    const posthog = featureClient(false);
    if (outcome instanceof Error) {
      posthog.isFeatureEnabled.mockRejectedValue(outcome);
    }

    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        createPostHogClient: () => posthog.client,
        nodeEnv: "production",
        posthogKey: "phc_test",
      }),
    ).resolves.toBe(false);
  });

  it("fails closed when PostHog times out", async () => {
    const fake = serviceClient();
    const posthog = featureClient(new Promise<never>(() => {}));

    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        createPostHogClient: () => posthog.client,
        nodeEnv: "production",
        posthogKey: "phc_test",
        timeoutMs: 5,
      }),
    ).resolves.toBe(false);
    expect(posthog.shutdown).toHaveBeenCalledWith(100);
  });

  it("fails closed before PostHog when internal identity cannot be resolved", async () => {
    const fake = serviceClient({ spec_book_artifacts: null });
    const createPostHogClient = jest.fn();

    await expect(
      isSpecBookGuestEntryEnabled(ARTIFACT_ID, fake.client, {
        createPostHogClient,
        nodeEnv: "production",
        posthogKey: "phc_test",
      }),
    ).resolves.toBe(false);
    expect(createPostHogClient).not.toHaveBeenCalled();
  });
});
