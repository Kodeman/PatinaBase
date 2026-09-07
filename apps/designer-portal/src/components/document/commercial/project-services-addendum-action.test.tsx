import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectServicesAddendumAction } from "./project-services-addendum-action";

const mockPush = jest.fn();
const mockMutateAsync = jest.fn();
const mockCopyParts = jest.fn();
const mockRememberRoomOrigin = jest.fn();
const mockAddendumComposed = jest.fn();

/** Wave 2's gates, flipped per test. Off by default so every Wave 1
 *  expectation in this file still describes the shipped act. */
let composedOn = false;

jest.mock("next/navigation", () => ({
  usePathname: () => "/doc/project-1",
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCreateServiceAddendum: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useCopyAgreementPartsFromAuthority: () => ({
    mutateAsync: mockCopyParts,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1", name: "Leah Hart" } }),
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: composedOn, isLoading: false }),
}));

jest.mock("../overlays/doc-sheet", () => ({
  DocSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

jest.mock("@/lib/document/room-origin", () => ({
  rememberRoomOrigin: (path: string) => mockRememberRoomOrigin(path),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    agreementAddendumComposed: (props: unknown) => mockAddendumComposed(props),
  },
}));

const created = {
  proposalId: "addendum-proposal-1",
  documentId: "addendum-document-1",
  projectId: "project-1",
  documentKind: "service_addendum",
  commercialState: "draft",
};

const clickAct = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /create services addendum/i }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  composedOn = false;
});

describe("ProjectServicesAddendumAction", () => {
  it("creates a project-bound addendum and opens the existing drafting room", async () => {
    mockMutateAsync.mockResolvedValue(created);

    render(<ProjectServicesAddendumAction projectId="project-1" />);
    expect(
      screen.getByText(
        /current authority stays active until the addendum is countersigned/i,
      ),
    ).toBeVisible();

    clickAct();

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith("Design services addendum"),
    );
    expect(mockRememberRoomOrigin).toHaveBeenCalledWith("/doc/project-1");
    expect(mockPush).toHaveBeenCalledWith("/drafting/addendum-proposal-1");
  });

  it("asks nothing with the flags off — no sheet, no why", async () => {
    mockMutateAsync.mockResolvedValue(created);
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(
      screen.queryByLabelText("Why this addendum"),
    ).not.toBeInTheDocument();
    expect(mockCopyParts).not.toHaveBeenCalled();
  });
});

describe("ProjectServicesAddendumAction · composed from parts (P7)", () => {
  beforeEach(() => {
    composedOn = true;
    mockMutateAsync.mockResolvedValue(created);
    mockCopyParts.mockResolvedValue(7);
  });

  it("asks for a title and a why before it creates anything", () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();

    expect(screen.getByLabelText("Addendum title")).toHaveValue(
      "Design services addendum",
    );
    const why = screen.getByLabelText("Why this addendum");
    expect(why).toHaveAttribute("maxLength", "200");
    expect(why).toHaveAttribute("placeholder", "Added the study to the scope");
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("shows the attribution the designer is about to freeze", () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    expect(screen.getByText("— Leah")).toBeInTheDocument();
    expect(
      screen.getByText(
        "One line, kept with the addendum. Your client reads it beside the change.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the standing line about the current authority, verbatim", () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    expect(
      screen.getByText(
        "The current authority stays active until the addendum is countersigned.",
      ),
    ).toBeInTheDocument();
  });

  it("creates, copies the origin's parts with the why, then opens the room", async () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();

    fireEvent.change(screen.getByLabelText("Why this addendum"), {
      target: { value: "  Added the study to the scope  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create the addendum" }),
    );

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith("Design services addendum"),
    );
    expect(mockCopyParts).toHaveBeenCalledWith({
      proposalId: "addendum-proposal-1",
      why: "Added the study to the scope",
    });
    expect(mockAddendumComposed).toHaveBeenCalledWith({
      project_id: "project-1",
      proposal_id: "addendum-proposal-1",
      has_why: true,
    });
    expect(mockRememberRoomOrigin).toHaveBeenCalledWith("/doc/project-1");
    expect(mockPush).toHaveBeenCalledWith("/drafting/addendum-proposal-1");
  });

  it("treats an empty why as no why — the line is optional", async () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    fireEvent.click(
      screen.getByRole("button", { name: "Create the addendum" }),
    );

    await waitFor(() =>
      expect(mockCopyParts).toHaveBeenCalledWith({
        proposalId: "addendum-proposal-1",
        why: null,
      }),
    );
    expect(mockAddendumComposed).toHaveBeenCalledWith(
      expect.objectContaining({ has_why: false }),
    );
  });

  it("carries a retitled addendum through to the RPC", async () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    fireEvent.change(screen.getByLabelText("Addendum title"), {
      target: { value: "  Study addendum  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create the addendum" }),
    );
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith("Study addendum"),
    );
  });

  it("holds the act while the title is blank", () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    fireEvent.change(screen.getByLabelText("Addendum title"), {
      target: { value: "   " },
    });
    expect(
      screen.getByRole("button", { name: "Create the addendum" }),
    ).toBeDisabled();
  });

  it("prints the database's refusal in the sheet and stays put", async () => {
    mockCopyParts.mockRejectedValue({
      code: "42501",
      message: "this addendum has no origin agreement to copy",
    });
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    fireEvent.click(
      screen.getByRole("button", { name: "Create the addendum" }),
    );

    expect(
      await screen.findByText("this addendum has no origin agreement to copy"),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("starts a second addendum with a clean why", async () => {
    render(<ProjectServicesAddendumAction projectId="project-1" />);
    clickAct();
    fireEvent.change(screen.getByLabelText("Why this addendum"), {
      target: { value: "Abandoned" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    clickAct();
    expect(screen.getByLabelText("Why this addendum")).toHaveValue("");
  });
});
