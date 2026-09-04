import { Suspense } from "react";
import { act, render } from "@testing-library/react";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ replace: mockReplace }),
}));

import ProjectReviewPage from "../page";

async function renderPage() {
  const params = Promise.resolve({ projectId: "proj-vale", editionId: "ed-1" });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <Suspense fallback={null}>
        <ProjectReviewPage params={params} />
      </Suspense>,
    );
    await params;
  });
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Finding #2 — unconditional now: L8's brief removes the `threshold` flag
// from `ProjectSurfaceSwitch` entirely, so a flag read here would go stale
// the moment that lands.
describe("the /reviews/[editionId] route — L6 absorbs its act, in place", () => {
  it("forwards every client into the project page, edition carried as ?review=", async () => {
    await renderPage();
    expect(mockReplace).toHaveBeenCalledWith("/projects/proj-vale?review=ed-1");
  });

  it("renders nothing itself — the ask lives on the project page", async () => {
    const { container } = await renderPage();
    expect(container).toBeEmptyDOMElement();
  });
});
