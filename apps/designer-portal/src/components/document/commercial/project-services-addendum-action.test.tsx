import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectServicesAddendumAction } from "./project-services-addendum-action";

const mockPush = jest.fn();
const mockMutateAsync = jest.fn();
const mockRememberRoomOrigin = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/doc/project-1",
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCreateServiceAddendum: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock("@/lib/document/room-origin", () => ({
  rememberRoomOrigin: (path: string) => mockRememberRoomOrigin(path),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

describe("ProjectServicesAddendumAction", () => {
  it("creates a project-bound addendum and opens the existing drafting room", async () => {
    mockMutateAsync.mockResolvedValue({
      proposalId: "addendum-proposal-1",
      documentId: "addendum-document-1",
      projectId: "project-1",
      documentKind: "service_addendum",
      commercialState: "draft",
    });

    render(<ProjectServicesAddendumAction projectId="project-1" />);
    expect(
      screen.getByText(
        /current authority stays active until the addendum is countersigned/i,
      ),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /create services addendum/i }),
    );

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith("Design services addendum"),
    );
    expect(mockRememberRoomOrigin).toHaveBeenCalledWith("/doc/project-1");
    expect(mockPush).toHaveBeenCalledWith("/drafting/addendum-proposal-1");
  });
});
