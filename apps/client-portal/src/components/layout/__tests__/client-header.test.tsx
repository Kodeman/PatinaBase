import { render, screen } from "@testing-library/react";

import { ClientHeader } from "../client-header";

jest.mock("next/navigation", () => ({ usePathname: () => "/projects" }));
jest.mock("@patina/supabase", () => ({
  useProfile: () => ({ data: null }),
  useRoomScans: () => ({ data: [] }),
  useMyPendingReviewRequests: () => ({ data: [] }),
  useMySubmittedReviews: () => ({ data: [] }),
}));
jest.mock("@patina/help-system", () => ({ ContextualHelpPanel: () => null }));
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, signOut: jest.fn() }),
}));
jest.mock("../project-switcher", () => ({ ProjectSwitcher: () => null }));
jest.mock("../mobile-nav-drawer", () => ({ MobileNavDrawer: () => null }));
jest.mock("../../notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));
jest.mock("@patina/design-system", () => ({
  Avatar: () => <span />,
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

it("makes the actionable approval count an accessible 44px link", () => {
  render(<ClientHeader projects={[]} approvalsPending={2} />);

  const link = screen.getByRole("link", {
    name: "Approval tasks, 2 need attention",
  });
  expect(link).toHaveAttribute("href", "/decisions");
  expect(link.className).toContain("min-h-[44px]");
  expect(screen.getByText("2")).toBeInTheDocument();
});
