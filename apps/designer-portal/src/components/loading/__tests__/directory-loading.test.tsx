/**
 * US-34 F13c — People never reads empty while it loads (H1, D1 §6).
 *
 * The Directory's loading line is a busy status, and the empty sentence
 * ("Nobody under this narrowing yet.") needs a read that answered. A pending
 * read (including one paused offline) is loading; a failed first read is an
 * alert with Try again.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { DirectoryView } from "@/components/document/people/views/directory-view";
import type { PeopleViewProps } from "@/components/document/people/types";
import { DIRECTORY_EMPTY_SENTENCE } from "@/lib/document/people-derivation";

const mockUsePeopleDirectory = jest.fn();

jest.mock("@patina/supabase", () => ({
  useStudioContact: () => ({ data: null }),
  useMergeStudioContacts: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useComplianceDocuments: () => ({ data: [] }),
  ALL_MERGE_MATCHED_ON: ["profile", "phone", "email", "company_name", "manual"],
  MERGE_MATCHED_ON_LABELS: {
    profile: "They sign in with the same account",
    phone: "They share a phone number",
    email: "They share an email address",
    company_name: "Same firm, same name",
    manual: "The studio says so",
  },
  usePeopleDirectory: (...args: unknown[]) =>
    mockUsePeopleDirectory(...(args as [])),
  useStudioContacts: () => ({ data: [], isLoading: false }),
  usePeopleSeats: () => ({ data: [] }),
  useContactRules: () => ({ data: [] }),
  useStudioContactChannelsFor: () => ({ data: [] }),
  useChannelConsentRecords: () => ({ data: [] }),
}));

jest.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: [] }),
}));
jest.mock("@/hooks/use-desk-engagements", () => ({
  useDeskEngagements: () => ({ data: undefined }),
}));
jest.mock("@/components/document/people/directory/makers-marketplace", () => ({
  MakersMarketplace: () => <div data-testid="marketplace" />,
}));
jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: { directoryChip: jest.fn() },
}));

const NAV: PeopleViewProps = {
  openPerson: jest.fn(),
  openThread: jest.fn(),
  goView: jest.fn(),
  notify: jest.fn(),
};

function renderDirectory(query: Record<string, unknown>) {
  mockUsePeopleDirectory.mockReturnValue(query);
  return render(
    <DirectoryView
      {...NAV}
      chip="everyone"
      onChipChange={jest.fn()}
      trade="all"
      onTradeChange={jest.fn()}
      makerLens="roster"
      onMakerLens={jest.fn()}
      search=""
      organizationId="org-1"
      scope="studio"
      onScopeChange={jest.fn()}
      onOpenFirm={jest.fn()}
    />,
  );
}

const PENDING = {
  data: undefined,
  status: "pending",
  isPending: true,
  isError: false,
  refetch: jest.fn(),
};

describe("the Directory while it loads", () => {
  it("is a busy status and never prints the empty sentence", () => {
    renderDirectory(PENDING);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(DIRECTORY_EMPTY_SENTENCE)).toBeNull();
  });

  it("a read paused offline is still loading, not empty", () => {
    // v5: a paused first read is pending with fetchStatus 'paused' and
    // isLoading false; the empty sentence must still wait.
    renderDirectory({ ...PENDING, isLoading: false, fetchStatus: "paused" });
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText(DIRECTORY_EMPTY_SENTENCE)).toBeNull();
  });

  it("a failed first read is an alert with Try again, never empty", () => {
    const refetch = jest.fn();
    renderDirectory({
      data: undefined,
      status: "error",
      isPending: false,
      isError: true,
      refetch,
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The directory could not be read.",
    );
    expect(screen.queryByText(DIRECTORY_EMPTY_SENTENCE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("only a read that answered with nobody prints the empty sentence", () => {
    renderDirectory({
      data: [],
      status: "success",
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    });
    expect(screen.getByText(DIRECTORY_EMPTY_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
