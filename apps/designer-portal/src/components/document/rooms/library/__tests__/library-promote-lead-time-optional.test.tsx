/**
 * US-37 #5 (SQ-1098, D7) — lead time is optional on library items.
 *
 * The Library room saves a piece into the Studio Library through the promote
 * sheet (library-room.tsx mounts PromoteToStudioModal asSheet). That sheet
 * refused to save until a lead time was typed. A piece with no lead time must
 * save, and the RPC receives no lead time rather than a made-up number.
 */
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PromoteToStudioModal } from "@/components/products/promotion/promote-to-studio-modal";

const mockMutateAsync = jest.fn();

jest.mock("@patina/supabase", () => ({
  useProduct: () => ({
    data: {
      id: "piece-1",
      vendor_id: "vendor-1",
      category: "seating",
      lead_time_weeks: null,
    },
  }),
  useVendor: () => ({
    data: {
      id: "vendor-1",
      preferred_contact: { name: "Rae", email: "rae@maker.test" },
      default_payment_terms: "net_30",
    },
  }),
  useOrganizations: () => ({
    data: [
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        membership: { role: "owner" },
      },
    ],
  }),
  usePromoteToStudio: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock("@patina/catalog-ui", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PrefilledInput: ({ prefilled, ...rest }: { prefilled?: boolean } & Record<string, unknown>) => (
    <input {...rest} />
  ),
  PrefilledChip: () => null,
  LayerChip: () => null,
}));

jest.mock("@/components/document/rooms/room-sheet", () => ({
  RoomSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("Library promote sheet — lead time is optional (US-37 #5)", () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockMutateAsync.mockResolvedValue("piece-1");
  });

  it("saves a library item with no lead time", async () => {
    const onSuccess = jest.fn();
    render(
      <PromoteToStudioModal
        open
        productId="piece-1"
        asSheet
        onClose={() => {}}
        onSuccess={onSuccess}
      />,
    );

    // Pre-fill lands (contact, terms, category); lead time stays blank.
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Name")).toHaveValue("Rae"),
    );
    const leadTime = screen.getByRole("spinbutton");
    expect(leadTime).toHaveValue(null);
    expect(leadTime).not.toBeRequired();

    fireEvent.change(
      screen.getByPlaceholderText(
        "Custom dye lots are slow, but the rep is responsive.",
      ),
      { target: { value: "Ships blanket-wrapped." } },
    );

    const save = screen.getByRole("button", { name: "Promote to Studio" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync.mock.calls[0][0]).toMatchObject({
      productId: "piece-1",
      studioId: "studio-1",
      leadTimeWeeks: null,
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("piece-1"));
  });

  it("still sends a lead time the designer typed", async () => {
    render(
      <PromoteToStudioModal open productId="piece-1" asSheet onClose={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Name")).toHaveValue("Rae"),
    );
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "8" } });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Custom dye lots are slow, but the rep is responsive.",
      ),
      { target: { value: "Ships blanket-wrapped." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Promote to Studio" }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync.mock.calls[0][0]).toMatchObject({ leadTimeWeeks: 8 });
  });
});
