import { Suspense } from "react";
import { act, render, screen } from "@testing-library/react";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  __esModule: true,
  useFeatureFlag: jest.fn(),
}));

jest.mock("@/components/project/ProjectReviewEdition", () => ({
  __esModule: true,
  ProjectReviewEdition: ({
    projectId,
    editionId,
  }: {
    projectId: string;
    editionId: string;
  }) => (
    <div data-testid="project-review-edition">{`${projectId}/${editionId}`}</div>
  ),
}));

import { useFeatureFlag } from "@/hooks/use-feature-flag";
import ProjectReviewPage from "../page";

const flagMock = useFeatureFlag as jest.Mock;

async function renderPage() {
  const params = Promise.resolve({ projectId: "proj-vale", editionId: "ed-1" });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ProjectReviewPage params={params} />
      </Suspense>,
    );
    await params;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("the /reviews/[editionId] route — L6 absorbs its act, in place", () => {
  it("renders the old standalone page while the threshold flag is loading (fail-closed)", async () => {
    flagMock.mockReturnValue({ value: false, isLoading: true });
    await renderPage();
    expect(screen.getByTestId("project-review-edition")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders the old standalone page for a client not on the threshold flag", async () => {
    flagMock.mockReturnValue({ value: false, isLoading: false });
    await renderPage();
    expect(screen.getByText("proj-vale/ed-1")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("forwards a threshold client into the project page, edition carried as ?review=", async () => {
    flagMock.mockReturnValue({ value: true, isLoading: false });
    await renderPage();
    expect(mockReplace).toHaveBeenCalledWith("/projects/proj-vale?review=ed-1");
    expect(
      screen.queryByTestId("project-review-edition"),
    ).not.toBeInTheDocument();
  });
});
