import { beforeEach, describe, expect, it, vi } from "vitest";

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  limit: any;
  order: any;
  or: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  chain: Array<{ method: string; args: unknown[] }>;
  result: BuilderResult;
}

function makeBuilder(result: BuilderResult): MockBuilder {
  const builder = { chain: [], result } as unknown as MockBuilder;
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      builder.chain.push({ method, args });
      return builder;
    });
  builder.select = record("select");
  builder.eq = record("eq");
  builder.limit = record("limit");
  builder.order = record("order");
  builder.or = record("or");
  builder.then = (resolve) => Promise.resolve(builder.result).then(resolve);
  return builder;
}

let productsBuilder = makeBuilder({ data: [], error: null });
const supabaseClient = { from: vi.fn(() => productsBuilder) };

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
}));

import {
  useLayerProducts,
  type UseLayerProductsOptions,
} from "../use-layer-products";

function queryFnFor(options: UseLayerProductsOptions) {
  return (
    useLayerProducts(options) as unknown as {
      queryFn: () => Promise<unknown>;
    }
  ).queryFn;
}

beforeEach(() => {
  productsBuilder = makeBuilder({ data: [], error: null });
  supabaseClient.from.mockClear();
});

describe("useLayerProducts configuration summaries", () => {
  it("selects the denormalized configuration mode and summary in the family query", async () => {
    await queryFnFor({ layer: "studio" })();

    const select = productsBuilder.chain.find(
      (call) => call.method === "select",
    );
    expect(select?.args[0]).toContain("configuration_mode");
    expect(select?.args[0]).toContain("configuration_summary");
    expect(productsBuilder.chain).toContainEqual({
      method: "eq",
      args: ["layer", "studio"],
    });
  });

  it("returns the summary without child-definition lookups", async () => {
    productsBuilder = makeBuilder({
      data: [
        {
          id: "sectional-1",
          name: "Hearth Sectional",
          layer: "studio",
          configuration_mode: "configured",
          configuration_summary: {
            activeComponentCount: 7,
            minRetailPriceCents: 185000,
          },
        },
      ],
      error: null,
    });

    const rows = (await queryFnFor({ layer: "studio" })()) as Array<{
      configuration_mode: string;
      configuration_summary: { activeComponentCount: number };
    }>;

    expect(rows[0].configuration_mode).toBe("configured");
    expect(rows[0].configuration_summary.activeComponentCount).toBe(7);
    expect(supabaseClient.from).toHaveBeenCalledWith("products");
    expect(supabaseClient.from).toHaveBeenCalledTimes(1);
  });

  it("selects the Field provenance columns the Library chip reads (Wave 1P)", async () => {
    await queryFnFor({ layer: "personal" })();

    const select = productsBuilder.chain.find(
      (call) => call.method === "select",
    );
    expect(select?.args[0]).toContain("capture_source");
    expect(select?.args[0]).toContain("captured_at");
    expect(select?.args[0]).toContain("field_capture_id");
  });
});
