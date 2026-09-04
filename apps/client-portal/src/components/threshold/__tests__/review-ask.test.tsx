import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => (
    <img {...props} alt={(props.alt as string) ?? ""} />
  ),
}));

jest.mock("@patina/supabase", () => ({
  __esModule: true,
  useMyPendingReviewRequests: jest.fn(),
  useMySubmittedReviews: jest.fn(),
  useSubmitReview: jest.fn(),
}));

jest.mock("@/hooks/use-commercial-client", () => ({
  __esModule: true,
  useClientProjectReviewBundle: jest.fn(),
  useRecordProjectReviewFeedback: jest.fn(),
}));

jest.mock("@/hooks/use-auth", () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

jest.mock("@/lib/analytics/events", () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

import {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
  useSubmitReview,
} from "@patina/supabase";
import {
  useClientProjectReviewBundle,
  useRecordProjectReviewFeedback,
} from "@/hooks/use-commercial-client";
import { useAuth } from "@/hooks/use-auth";

import {
  SelectionEditionAsk,
  StudioReviewAsk,
  SubmittedReviewsPrevious,
} from "../review-ask";

const pendingMock = useMyPendingReviewRequests as jest.Mock;
const submittedMock = useMySubmittedReviews as jest.Mock;
const submitMock = useSubmitReview as jest.Mock;
const bundleMock = useClientProjectReviewBundle as jest.Mock;
const feedbackMock = useRecordProjectReviewFeedback as jest.Mock;
const authMock = useAuth as jest.Mock;

const PROJECT_ID = "proj-vale";

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  authMock.mockReturnValue({ user: { id: "user-1", name: "Nora Quist" } });
  pendingMock.mockReturnValue({ data: [], isLoading: false });
  submittedMock.mockReturnValue({ data: [], isLoading: false });
  submitMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  bundleMock.mockReturnValue({ data: null, isLoading: false, isError: false });
  feedbackMock.mockReturnValue({ mutate: jest.fn(), isPending: false });
  // jsdom's default URL carries no `?review=`.
  window.history.pushState({}, "", `/projects/${PROJECT_ID}`);
});

describe("StudioReviewAsk — the studio review, absorbed from /reviews", () => {
  it("renders nothing when no pending request names this project", () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: "other-project" },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });
    const { container } = wrap(<StudioReviewAsk projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for a review naming the designer and the studio quote", () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID, name: "Vale Residence" },
          designer: {
            full_name: "Nora Quist",
            business_name: null,
            avatar_url: null,
          },
          custom_message: "Thank you for a wonderful project.",
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("studio-review-ask")).toHaveAttribute(
      "id",
      "review-r1",
    );
    expect(
      screen.getByText(/A few words about working with Nora Quist/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Thank you for a wonderful project/),
    ).toBeInTheDocument();
  });

  it("validates the rating once the body already clears its own minimum length", async () => {
    const mutate = jest.fn();
    submitMock.mockReturnValue({ mutate, isPending: false });
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    // A form field's own `required`/`minLength` (finding #20, ported from the
    // old dialog) blocks the browser from ever dispatching `onSubmit` while
    // the body is short — filling it first is what lets the custom "Choose a
    // rating" message, rather than the native one, have its say.
    await userEvent.type(
      screen.getByTestId("review-body"),
      "A genuinely lovely experience from start to finish, thank you.",
    );
    await userEvent.click(screen.getByTestId("review-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Choose a rating/);
    expect(mutate).not.toHaveBeenCalled();
  });

  // Finding #26 — the 30-character floor was the one rule most likely to be
  // mis-ported, and untested.
  it("still refuses a body under the 30-character floor once a rating is set", async () => {
    const mutate = jest.fn();
    submitMock.mockReturnValue({ mutate, isPending: false });
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("review-star-4"));
    expect(screen.getByTestId("review-body")).toHaveAttribute("minlength", "30");
  });

  // Finding #20 — the fields sit inside a real `<form>` now, not a bare
  // button, so the submit act's native semantics (and the browser's own
  // constraint validation on the body field) are real.
  it("submits by way of a form, not a bare button", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    submitMock.mockReturnValue({ mutate, isPending: false });
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("review-submit").closest("form")).not.toBeNull();
    expect(screen.getByTestId("review-submit")).toHaveAttribute("type", "submit");
  });

  it("sends the review with the old payload shape and stamps a confirmation", async () => {
    const mutate = jest.fn((_vars, opts) => opts?.onSuccess?.());
    submitMock.mockReturnValue({ mutate, isPending: false });
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    await userEvent.click(screen.getByTestId("review-star-4"));
    await userEvent.type(
      screen.getByTestId("review-body"),
      "A genuinely lovely experience from start to finish, thank you.",
    );
    await userEvent.click(screen.getByTestId("review-submit"));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: "r1",
        rating: 4,
        reviewText:
          "A genuinely lovely experience from start to finish, thank you.",
      }),
      expect.any(Object),
    );
    await waitFor(() =>
      expect(screen.getByTestId("studio-review-sent")).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Sent /)).toBeInTheDocument();
  });
});

describe("SubmittedReviewsPrevious — sent reviews, read in the Previously area", () => {
  it("renders nothing without a submitted review for this project", () => {
    submittedMock.mockReturnValue({
      data: [
        { id: "s1", project: { id: "other" }, rating: 5, created_at: null },
      ],
      isLoading: false,
    });
    const { container } = wrap(
      <SubmittedReviewsPrevious projectId={PROJECT_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lines up a submitted review with its rating and a Sent state word", () => {
    submittedMock.mockReturnValue({
      data: [
        {
          id: "s1",
          project: { id: PROJECT_ID },
          rating: 5,
          created_at: "2026-06-19T00:00:00Z",
        },
      ],
      isLoading: false,
    });
    wrap(<SubmittedReviewsPrevious projectId={PROJECT_ID} />);

    expect(screen.getByText(/Your review · 5 of 5 stars/)).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });
});

describe("SelectionEditionAsk — the edition review, absorbed from /projects/[id]/reviews/[editionId]", () => {
  it("renders nothing without a ?review= edition id on the URL", () => {
    const { container } = wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reads the edition off ?review= and renders its items with feedback acts", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: "ed-1",
        publishedAt: null,
        status: "published",
        items: [
          {
            id: "item-1",
            name: "Wingback chair",
            roomName: "Library",
            imageUrl: null,
            clientPriceCents: 240000,
            currency: "USD",
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    const mutate = jest.fn();
    feedbackMock.mockReturnValue({ mutate, isPending: false });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(screen.getByTestId("review-edition-ask")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Wingback chair/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("review-edition-approve-item-1"));
    expect(mutate).toHaveBeenCalledWith({
      reviewItemId: "item-1",
      verdict: "approved",
    });
  });

  it("reads closed once the edition is superseded", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: "ed-1",
        publishedAt: null,
        status: "superseded",
        items: [
          {
            id: "item-1",
            name: "Wingback chair",
            roomName: "Library",
            imageUrl: null,
            clientPriceCents: null,
            currency: "USD",
            verdict: "approved",
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(screen.getByText(/This edition is closed/)).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("review-edition-approve-item-1"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Your response: Looks good/)).toBeInTheDocument();
  });

  // Finding #8 — a non-USD edition must not read in dollars.
  it("formats a price in the item's own currency, not a default USD", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: "ed-1",
        publishedAt: null,
        status: "published",
        items: [
          {
            id: "item-1",
            name: "Wingback chair",
            roomName: "Library",
            imageUrl: null,
            clientPriceCents: 240000,
            currency: "GBP",
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(screen.getByTestId("review-edition-ask")).toBeInTheDocument(),
    );
    expect(screen.getByText(/£2,400/)).toBeInTheDocument();
  });

  // Finding #13 — a link the studio deliberately sent must say something
  // when it fails, not render nothing.
  it("says the edition is unavailable on a read error, given a ?review= id", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({ data: null, isLoading: false, isError: true });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    expect(
      screen.getByText(/This selection review is unavailable/),
    ).toBeInTheDocument();
  });

  // Finding #14 — a one-time deep link should not travel in a bookmark.
  it("cleans ?review= off the URL once it has read the edition id", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: "ed-1",
        publishedAt: null,
        status: "published",
        items: [
          {
            id: "item-1",
            name: "Wingback chair",
            roomName: "Library",
            imageUrl: null,
            clientPriceCents: null,
            currency: "USD",
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(window.location.search).not.toContain("review="),
    );
  });

  // Finding #18 — one item mutating must not disable every other item.
  it("disables only the item whose feedback is in flight", async () => {
    window.history.pushState({}, "", `/projects/${PROJECT_ID}?review=ed-1`);
    bundleMock.mockReturnValue({
      data: {
        projectId: PROJECT_ID,
        editionId: "ed-1",
        publishedAt: null,
        status: "published",
        items: [
          {
            id: "item-1",
            name: "Wingback chair",
            roomName: "Library",
            imageUrl: null,
            clientPriceCents: null,
            currency: "USD",
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
          {
            id: "item-2",
            name: "Console table",
            roomName: "Entry",
            imageUrl: null,
            clientPriceCents: null,
            currency: "USD",
            verdict: null,
            comment: null,
            mediaAssetIds: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    feedbackMock.mockReturnValue({
      mutate: jest.fn(),
      isPending: true,
      variables: { reviewItemId: "item-1", verdict: "approved" },
    });

    wrap(<SelectionEditionAsk projectId={PROJECT_ID} />);

    await waitFor(() =>
      expect(screen.getByTestId("review-edition-approve-item-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("review-edition-approve-item-1")).toBeDisabled();
    expect(screen.getByTestId("review-edition-approve-item-2")).toBeEnabled();
  });
});

describe("StudioReviewAsk — every matching request, including project-less ones (finding #16)", () => {
  it("stands two pending requests for this project at once", () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
        {
          id: "r2",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    expect(screen.getAllByTestId("studio-review-ask")).toHaveLength(2);
  });

  it("stands a request with no project link, rather than dropping it", () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: null,
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });

    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    expect(screen.getByTestId("studio-review-ask")).toBeInTheDocument();
  });

  // Finding #30 — a request the studio has queued but not sent is not yet
  // the client's to act on.
  it("does not stand a request the studio has only queued", () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "queued",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });
    const { container } = wrap(<StudioReviewAsk projectId={PROJECT_ID} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StudioReviewCard — the rating radiogroup (finding #19)", () => {
  it("moves both focus and the checked star with the arrow keys", async () => {
    pendingMock.mockReturnValue({
      data: [
        {
          id: "r1",
          request_status: "sent",
          project: { id: PROJECT_ID },
          designer: null,
          custom_message: null,
        },
      ],
      isLoading: false,
    });
    wrap(<StudioReviewAsk projectId={PROJECT_ID} />);

    const first = screen.getByTestId("review-star-1");
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");

    expect(screen.getByTestId("review-star-3")).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("review-star-3")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("review-star-1")).toHaveAttribute("tabindex", "-1");
  });
});

describe("SubmittedReviewsPrevious — the review's own words (finding #15)", () => {
  it("unfolds the review text, not just the rating", () => {
    submittedMock.mockReturnValue({
      data: [
        {
          id: "s1",
          project: { id: PROJECT_ID },
          rating: 5,
          review_text: "A wonderful studio to work with from start to finish.",
          created_at: "2026-06-19T00:00:00Z",
        },
      ],
      isLoading: false,
    });
    wrap(<SubmittedReviewsPrevious projectId={PROJECT_ID} />);

    expect(
      screen.getByText("A wonderful studio to work with from start to finish."),
    ).toBeInTheDocument();
  });
});
