import { render } from "@testing-library/react";

const replace = jest.fn();
const openLedger = jest.fn();
const openAccountPage = jest.fn();
const openPost = jest.fn();
let searchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  usePathname: () => "/desk",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

jest.mock("./command-bar", () => ({
  openLedger: (...args: unknown[]) => openLedger(...args),
}));

jest.mock("./account/account-sheet", () => ({
  ACCOUNT_PAGES: ["profile", "notifications", "security", "devices", "studio"],
  openAccountPage: (...args: unknown[]) => openAccountPage(...args),
}));

jest.mock("./overlays/post-sheet", () => ({
  openPost: (...args: unknown[]) => openPost(...args),
}));

jest.mock("./help/desk-walkthrough-gate", () => ({
  DESK_WALKTHROUGH_REPLAY_PARAM: "tour",
}));

import { DeskDoorway } from "./desk-doorway";

describe("DeskDoorway authorization destination", () => {
  beforeEach(() => {
    replace.mockReset();
    openLedger.mockReset();
    openAccountPage.mockReset();
    openPost.mockReset();
    searchParams = new URLSearchParams();
  });

  it("replaces a transient Desk authorization doorway with its actionable project document", () => {
    searchParams = new URLSearchParams({
      authorization: "authorization-proposal-1",
      projectId: "project-1",
    });

    render(<DeskDoorway />);

    expect(replace).toHaveBeenCalledWith(
      "/doc/project-1?authorization=authorization-proposal-1&from=desk",
    );
    expect(openLedger).not.toHaveBeenCalled();
    expect(openAccountPage).not.toHaveBeenCalled();
    expect(openPost).not.toHaveBeenCalled();
  });
});
