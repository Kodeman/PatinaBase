import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({ rpc }),
}));

const invalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  useEvaluateProductConfiguration,
  useInstantiateProductConfigurationTemplate,
  useCustomCommissionMilestones,
  usePrepareConfigurationQuoteRequest,
  usePlaceProductConfiguration,
  useProductConfiguration,
  useReviseProjectFFEConfiguration,
  useRecordCustomCommissionMilestone,
  useSaveProductConfiguration,
  useUpsertProductConfigurationDefinition,
} from "../use-product-configurations";

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
});

describe("product configuration RPC hooks", () => {
  it("loads the exact configuration version pinned to a project line", async () => {
    const pinned = {
      id: "configuration-v2",
      configurationKey: "lineage-1",
      version: 2,
      status: "superseded",
    };
    rpc.mockResolvedValue({ data: pinned, error: null });
    const query = useProductConfiguration("configuration-v2") as any;

    await expect(query.queryFn()).resolves.toEqual(pinned);
    expect(query.enabled).toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_product_configuration", {
      p_configuration_id: "configuration-v2",
    });
  });

  it("authors the whole definition with optimistic concurrency", async () => {
    const definition = {
      productId: "product-1",
      mode: "variant",
      pricingStrategy: "base_plus_adjustments",
      revision: 3,
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    };
    rpc.mockResolvedValue({ data: definition, error: null });
    const mutation = useUpsertProductConfigurationDefinition(
      "product-1",
    ) as any;
    const input = {
      mode: "variant",
      pricingStrategy: "base_plus_adjustments",
      expectedRevision: 2,
      optionGroups: [],
      variants: [],
      components: [],
      rules: [],
    };

    await expect(mutation.mutationFn(input)).resolves.toEqual(definition);
    expect(mutation.retry).toBe(false);
    expect(rpc).toHaveBeenCalledWith("upsert_product_configuration_schema", {
      p_product_id: "product-1",
      p_input: input,
      p_expected_revision: 2,
    });
  });

  it("preserves handedness in evaluation and never retries mutations", async () => {
    const evaluation = { valid: true, complete: true, snapshot: {} };
    rpc.mockResolvedValue({ data: evaluation, error: null });
    const mutation = useEvaluateProductConfiguration() as any;
    const input = {
      productId: "sectional-1",
      optionValueIds: [],
      components: [
        { componentId: "left-arm", quantity: 1, handedness: "left" },
      ],
    };

    await expect(mutation.mutationFn(input)).resolves.toEqual(evaluation);
    expect(mutation.retry).toBe(false);
    expect(rpc).toHaveBeenCalledWith("evaluate_product_configuration", {
      p_product_id: "sectional-1",
      p_variant_id: null,
      p_option_value_ids: [],
      p_components: input.components,
    });
  });

  it("returns the auto-created custom revision from save", async () => {
    const result = {
      configuration: {
        id: "configuration-1",
        productId: "cabinet-1",
        projectId: "project-1",
      },
      customRevision: { id: "revision-1", configurationId: "configuration-1" },
    };
    rpc.mockResolvedValue({ data: result, error: null });
    const mutation = useSaveProductConfiguration() as any;
    const input = {
      productId: "cabinet-1",
      projectId: "project-1",
      selections: {},
      components: [],
      customBrief: { summary: "Wall-to-wall cabinet" },
    };

    await expect(mutation.mutationFn(input)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("save_product_configuration", {
      p_input: input,
    });

    await mutation.onSuccess(result);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["product-configurations", "saved", "cabinet-1"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "product-configurations",
        "custom-revisions",
        "configuration-1",
      ],
    });
  });

  it("prepares a draft-only RFQ through the dedicated RPC", async () => {
    const prepared = {
      id: "rfq-1",
      configurationId: "configuration-1",
      projectId: "project-1",
      vendorId: "vendor-1",
      designerId: "designer-1",
      status: "draft",
      configurationSnapshot: {},
      configurationSnapshotHash: "a".repeat(64),
      createdAt: "2026-08-02T00:00:00Z",
      updatedAt: "2026-08-02T00:00:00Z",
    };
    rpc.mockResolvedValue({ data: prepared, error: null });
    const mutation = usePrepareConfigurationQuoteRequest() as any;

    await expect(
      mutation.mutationFn({
        configurationId: "configuration-1",
        vendorId: "vendor-1",
        scope: "Cabinet fabrication",
      }),
    ).resolves.toEqual(prepared);
    expect(rpc).toHaveBeenCalledWith("prepare_configuration_quote_request", {
      p_configuration_id: "configuration-1",
      p_vendor_id: "vendor-1",
      p_scope: "Cabinet fabrication",
      p_timeline: null,
      p_message: null,
    });
  });

  it("refreshes project rollups and procurement after configured placement", async () => {
    const placed = { productId: "sectional-1", ffeItemId: "ffe-1" };
    rpc.mockResolvedValue({ data: placed, error: null });
    const mutation = usePlaceProductConfiguration() as any;
    const input = {
      projectId: "project-1",
      configurationId: "configuration-1",
    };

    await expect(mutation.mutationFn(input)).resolves.toEqual(placed);
    await mutation.onSuccess(placed, input);

    const invalidatedKeys = invalidateQueries.mock.calls.map(
      ([value]) => value.queryKey,
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ["project-ffe-items", "project-1"],
        ["project", "project-1"],
        ["projects"],
        ["projects", "project-1"],
        ["procurement-items"],
      ]),
    );
  });

  it("instantiates a reusable template into an explicit project", async () => {
    const result = {
      configuration: {
        id: "configuration-2",
        productId: "cabinet-1",
        projectId: "project-1",
      },
      templateConfigurationId: "template-1",
      customRevision: { id: "revision-1" },
    };
    rpc.mockResolvedValue({ data: result, error: null });
    const mutation = useInstantiateProductConfigurationTemplate() as any;

    await expect(
      mutation.mutationFn({
        templateConfigurationId: "template-1",
        projectId: "project-1",
        name: "Library wall cabinetry",
      }),
    ).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith(
      "instantiate_product_configuration_template",
      {
        p_template_configuration_id: "template-1",
        p_project_id: "project-1",
        p_name: "Library wall cabinetry",
      },
    );
  });

  it("replaces an un-ordered project snapshot with optimistic concurrency", async () => {
    const result = {
      projectId: "project-1",
      ffeItemId: "ffe-1",
      specId: "spec-1",
      configurationId: "configuration-2",
      configurationVersion: 1,
      configurationSnapshotHash: "b".repeat(64),
      status: "specified",
      requiresApproval: true,
    };
    rpc.mockResolvedValue({ data: result, error: null });
    const mutation = useReviseProjectFFEConfiguration() as any;
    const input = {
      projectId: "project-1",
      ffeItemId: "ffe-1",
      expectedConfigurationId: "configuration-1",
      expectedConfigurationVersion: 4,
      expectedSnapshotHash: "a".repeat(64),
      newConfigurationId: "configuration-2",
      expectedNewVersion: 1,
    };

    await expect(mutation.mutationFn(input)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("revise_project_ffe_configuration", {
      p_project_id: "project-1",
      p_ffe_item_id: "ffe-1",
      p_expected_configuration_id: "configuration-1",
      p_expected_configuration_version: 4,
      p_expected_snapshot_hash: "a".repeat(64),
      p_new_configuration_id: "configuration-2",
      p_expected_new_version: 1,
    });

    await mutation.onSuccess(result);
    const invalidatedKeys = invalidateQueries.mock.calls.map(
      ([value]) => value.queryKey,
    );
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        ["project-ffe-items", "project-1"],
        ["spec-books", "workbench", "project-1"],
        ["procurement-items"],
      ]),
    );
  });

  it("lists and appends custom fulfillment evidence through dedicated RPCs", async () => {
    const query = useCustomCommissionMilestones("configuration-1") as any;
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(query.queryFn()).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith("list_custom_commission_milestones", {
      p_configuration_id: "configuration-1",
    });

    const milestone = {
      id: "milestone-1",
      configurationId: "configuration-1",
      projectId: "project-1",
      milestoneType: "receiving",
      status: "received",
      events: [{ eventNumber: 1 }],
    };
    rpc.mockResolvedValueOnce({ data: milestone, error: null });
    const mutation = useRecordCustomCommissionMilestone() as any;
    const input = {
      configurationId: "configuration-1",
      milestoneType: "receiving",
      status: "received",
      evidence: { note: "Two crates verified" },
      artifacts: [{ name: "photo.jpg", url: "/photo.jpg" }],
      note: "Received without damage",
    };
    await expect(mutation.mutationFn(input)).resolves.toEqual(milestone);
    expect(rpc).toHaveBeenCalledWith("record_custom_commission_milestone", {
      p_configuration_id: "configuration-1",
      p_milestone_type: "receiving",
      p_status: "received",
      p_evidence: { note: "Two crates verified" },
      p_artifacts: [{ name: "photo.jpg", url: "/photo.jpg" }],
      p_note: "Received without damage",
    });
  });
});
