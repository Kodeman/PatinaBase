import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const select = vi.fn();
const single = vi.fn();
const from = vi.fn();
const getUser = vi.fn();

const builder = { insert, select, single };
insert.mockReturnValue(builder);
select.mockReturnValue(builder);

const supabaseClient = {
  auth: { getUser },
  from,
};

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useCreateProposal } from "../use-proposals";

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockReturnValue(builder);
  select.mockReturnValue(builder);
  from.mockReturnValue(builder);
  getUser.mockResolvedValue({ data: { user: { id: "designer-1" } } });
  single.mockResolvedValue({ data: { id: "proposal-1" }, error: null });
});

function createProposalMutation() {
  return (
    useCreateProposal() as unknown as {
      mutationFn: (input: {
        title: string;
        clientId?: string;
        designerClientId?: string;
      }) => Promise<unknown>;
    }
  ).mutationFn;
}

describe("useCreateProposal client relationship identity", () => {
  it("persists profile and designer-client legs in the same proposal insert", async () => {
    await createProposalMutation()({
      title: "Repeat household proposal",
      clientId: "profile-1",
      designerClientId: "relationship-1",
    });

    expect(from).toHaveBeenCalledWith("proposals");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "profile-1",
        designer_client_id: "relationship-1",
        status: "draft",
      }),
    );
  });

  it("fails before writing when only one identity leg is supplied", async () => {
    await expect(
      createProposalMutation()({
        title: "Split identity",
        clientId: "profile-1",
      }),
    ).rejects.toThrow(
      "A proposal client must include both profile and designer relationship identities",
    );

    expect(from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("still supports a genuinely unassigned draft with both legs null", async () => {
    await createProposalMutation()({ title: "Unassigned draft" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: null,
        designer_client_id: null,
      }),
    );
  });
});
