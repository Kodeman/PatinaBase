/**
 * Tests for DetailsSheet — the Threshold's in-place absorption of /account,
 * /preferences and /settings/notifications (L7, client-page-completion).
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NotificationPreferences } from "@patina/shared/types";
import {
  useProfile,
  useUpdateProfile,
  useSignOutAllDevices,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  useMyThreadOverrides,
  useUpdateThreadNotificationPref,
  useMuteThread,
} from "@patina/supabase";

import { DetailsSheet } from "../details-sheet";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("@patina/supabase", () => ({
  useProfile: jest.fn(),
  useUpdateProfile: jest.fn(),
  useSignOutAllDevices: jest.fn(),
  useNotificationPreferences: jest.fn(),
  useUpdateNotificationPreferences: jest.fn(),
  useMyThreadOverrides: jest.fn(),
  useUpdateThreadNotificationPref: jest.fn(),
  useMuteThread: jest.fn(),
}));

const mockUseProfile = useProfile as jest.Mock;
const mockUseUpdateProfile = useUpdateProfile as jest.Mock;
const mockUseSignOutAllDevices = useSignOutAllDevices as jest.Mock;
const mockUseNotificationPreferences = useNotificationPreferences as jest.Mock;
const mockUseUpdateNotificationPreferences =
  useUpdateNotificationPreferences as jest.Mock;
const mockUseMyThreadOverrides = useMyThreadOverrides as jest.Mock;
const mockUseUpdateThreadNotificationPref =
  useUpdateThreadNotificationPref as jest.Mock;
const mockUseMuteThread = useMuteThread as jest.Mock;

function makePrefs(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return {
    id: "pref-1",
    user_id: "user-1",
    channels_email: true,
    channels_push: true,
    channels_in_app: true,
    channels_sms: false,
    type_new_lead: false,
    type_lead_expiring: false,
    type_lead_response: false,
    type_client_message: true,
    type_project_milestone: true,
    type_commission_earned: false,
    type_new_products: true,
    type_teaching_reminder: false,
    type_price_drop: true,
    type_back_in_stock: true,
    type_wishlist_update: true,
    type_account_security: true,
    type_order_confirmation: true,
    type_payment_receipt: true,
    type_weekly_inspiration: true,
    type_founding_circle: true,
    type_product_launch: true,
    type_seasonal_campaign: true,
    type_reengagement: true,
    digest_frequency: "weekly",
    reminder_cadence: "right_away",
    quiet_hours_enabled: false,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    timezone: "America/New_York",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as NotificationPreferences;
}

const updateProfileMutate = jest.fn();
const updatePrefsMutate = jest.fn();
const updateThreadPrefMutate = jest.fn();
const muteThreadMutate = jest.fn();
const signOutAllMutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();

  mockUseProfile.mockReturnValue({
    data: {
      id: "user-1",
      email: "nora@quist.example",
      full_name: "Nora Quist",
      display_name: null,
      business_name: null,
      avatar_url: null,
      phone: "555-0100",
      bio: null,
      role: "homeowner",
      website_url: null,
      instagram_handle: null,
      location_city: null,
      location_state: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    isLoading: false,
    isError: false,
  });
  mockUseUpdateProfile.mockReturnValue({
    mutate: updateProfileMutate,
    isPending: false,
    isError: false,
    error: null,
  });
  mockUseSignOutAllDevices.mockReturnValue({
    mutateAsync: signOutAllMutateAsync,
    isPending: false,
  });
  mockUseNotificationPreferences.mockReturnValue({
    data: makePrefs(),
    isLoading: false,
    isError: false,
  });
  mockUseUpdateNotificationPreferences.mockReturnValue({
    mutate: updatePrefsMutate,
    isPending: false,
    isError: false,
    error: null,
  });
  mockUseMyThreadOverrides.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
  mockUseUpdateThreadNotificationPref.mockReturnValue({
    mutate: updateThreadPrefMutate,
  });
  mockUseMuteThread.mockReturnValue({ mutate: muteThreadMutate });
});

describe("DetailsSheet — closed", () => {
  it("renders nothing when not open", () => {
    render(<DetailsSheet open={false} onClose={jest.fn()} />);
    expect(screen.queryByTestId("details-sheet")).not.toBeInTheDocument();
  });
});

describe("DetailsSheet — open, the frame", () => {
  it("is a labelled, modal dialog", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    const dialog = screen.getByTestId("details-sheet");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      within(dialog).getByRole("heading", { name: "Your details" }),
    ).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = jest.fn();
    render(<DetailsSheet open onClose={onClose} />);
    // Fired on the element the trap has focused, matching a real keypress —
    // the handler is guarded to only act within its own container so it
    // never steals an Escape meant for a sibling overlay (e.g. L5's sheet).
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a keydown whose target sits outside this sheet", () => {
    const onClose = jest.fn();
    render(<DetailsSheet open onClose={onClose} />);
    const outsider = document.createElement("div");
    document.body.appendChild(outsider);
    fireEvent.keyDown(outsider, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    document.body.removeChild(outsider);
  });

  it("still closes on Escape once focus has fallen to the body", () => {
    // Clicking non-focusable prose, or a Save act that disables itself
    // mid-write, leaves `document.activeElement` on <body>. The container does
    // not contain <body>, so an unqualified guard killed Escape and the Tab
    // trap exactly then — with the scrim still covering the page.
    const onClose = jest.fn();
    render(<DetailsSheet open onClose={onClose} />);
    (document.activeElement as HTMLElement | null)?.blur?.();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("takes Tab back into the sheet from the body rather than the page behind", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    (document.activeElement as HTMLElement | null)?.blur?.();

    fireEvent.keyDown(document.body, { key: "Tab" });

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on the scrim", async () => {
    const onClose = jest.fn();
    render(<DetailsSheet open onClose={onClose} />);
    await userEvent.click(screen.getByLabelText("Close your details"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on its own "Shut" act', async () => {
    const onClose = jest.fn();
    render(<DetailsSheet open onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Shut" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not offer data export or erase — no caller is wired to either route", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.queryByText(/export/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/erase|delete my (data|account)/i),
    ).not.toBeInTheDocument();
  });
});

describe("DetailsSheet — name and number", () => {
  it("hydrates from the profile", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByTestId("details-full-name")).toHaveValue("Nora Quist");
    expect(screen.getByTestId("details-phone")).toHaveValue("555-0100");
    expect(screen.getByText("nora@quist.example")).toBeInTheDocument();
  });

  it("keeps Save inert until something changed", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    await userEvent.type(screen.getByTestId("details-phone"), "1");
    expect(save).toBeEnabled();
  });

  it("saves the edited name and phone", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    const name = screen.getByTestId("details-full-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Nora Q. Vale");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateProfileMutate).toHaveBeenCalledWith(
      { full_name: "Nora Q. Vale", phone: "555-0100" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("mounts the avatar upload act, absorbed from /account", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByTestId("account-avatar-upload")).toBeInTheDocument();
  });

  it("shows a loading sentence while the profile is read", () => {
    mockUseProfile.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByText("Reading the file…")).toBeInTheDocument();
  });

  it("holds on a settled sentence, not a loading line, when the profile query fails", () => {
    mockUseProfile.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByText("The file could not be read.")).toBeInTheDocument();
    expect(screen.queryByText("Reading the file…")).not.toBeInTheDocument();
  });
});

describe("DetailsSheet — what you hear from us", () => {
  it("flips the email master switch", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Email notifications/ }),
    );
    expect(updatePrefsMutate).toHaveBeenCalledWith({ channels_email: false });
  });

  it("flips a single category toggle", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Price drops" }),
    );
    expect(updatePrefsMutate).toHaveBeenCalledWith({ type_price_drop: false });
  });

  it("flips push and in-app channel toggles", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Push/ }));
    expect(updatePrefsMutate).toHaveBeenCalledWith({ channels_push: false });

    await userEvent.click(screen.getByRole("checkbox", { name: "In-app" }));
    expect(updatePrefsMutate).toHaveBeenCalledWith({ channels_in_app: false });
  });

  it("reports a pending write and a failed write beside the section head", () => {
    mockUseUpdateNotificationPreferences.mockReturnValue({
      mutate: updatePrefsMutate,
      isPending: true,
      isError: false,
      error: null,
    });
    const { rerender } = render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    mockUseUpdateNotificationPreferences.mockReturnValue({
      mutate: updatePrefsMutate,
      isPending: false,
      isError: true,
      error: new Error(
        'new row violates row-level security policy for table "notification_preferences"',
      ),
    });
    rerender(<DetailsSheet open onClose={jest.fn()} />);
    // The house says it refused; the cause's own string is a developer's
    // message and never reaches the homeowner as content.
    const refusal = screen.getByRole("alert");
    expect(refusal).toHaveTextContent("Could not save.");
    expect(refusal).not.toHaveTextContent("row-level security");
  });

  it("reveals quiet-hours fields only once enabled", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.queryByLabelText("Start")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Enable quiet hours" }),
    );
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      quiet_hours_enabled: true,
    });
  });

  it("shows quiet-hours fields when the preference already carries them enabled", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs({ quiet_hours_enabled: true }),
      isLoading: false,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByLabelText("Start")).toHaveValue("22:00");
    expect(screen.getByLabelText("End")).toHaveValue("08:00");
  });

  it("carries the full timezone list and always offers the stored zone", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs({ quiet_hours_enabled: true, timezone: "Asia/Tokyo" }),
      isLoading: false,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    const select = screen.getByLabelText("Timezone") as HTMLSelectElement;
    expect(select).toHaveValue("Asia/Tokyo");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(
      expect.arrayContaining([
        "Asia/Tokyo",
        "Asia/Singapore",
        "Asia/Dubai",
        "Australia/Sydney",
      ]),
    );
  });

  it("sets a digest frequency", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Daily" }));
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      digest_frequency: "daily",
    });
  });

  it("sets a reminder cadence, and names invoice reminders as always-immediate", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(
      screen.getByText(
        /invoice reminders are time-sensitive and always arrive right away/i,
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Once a day" }));
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      reminder_cadence: "daily",
    });

    // P-28: the third cadence she can choose, in her own words.
    await userEvent.click(
      screen.getByRole("radio", { name: "Once a week, on Sunday" }),
    );
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      reminder_cadence: "weekly_sunday",
    });
  });

  /**
   * P-28. Three cadences, in plain words. The column's own tokens —
   * `right_away`, `daily`, `weekly_sunday` — never reach the page.
   */
  it("offers three cadences and says them in her words, never in tokens", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);

    const cadence = screen.getByRole("group", { name: "Reminder cadence" });
    const options = within(cadence).getAllByRole("radio");
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.getAttribute("aria-label") ?? "")).not.toContain(
      "weekly_sunday",
    );

    for (const label of [
      "Tell me right away",
      "Once a day",
      "Once a week, on Sunday",
    ]) {
      expect(within(cadence).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(cadence.textContent).not.toMatch(
      /right_away|weekly_sunday|immediate|daily_digest/,
    );
  });

  /**
   * The tokens the widened column's CHECK accepts (00572). A picker writing
   * anything else violates the constraint, and the Sunday cadence could never
   * be saved at all.
   */
  it("writes the widened column's own value for each cadence", async () => {
    // Starting on the middle cadence, so pressing either of the other two is a
    // real change: a radio already checked fires nothing.
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs({ reminder_cadence: "daily" }),
      isLoading: false,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole("radio", { name: "Tell me right away" }));
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      reminder_cadence: "right_away",
    });

    await userEvent.click(
      screen.getByRole("radio", { name: "Once a week, on Sunday" }),
    );
    expect(updatePrefsMutate).toHaveBeenCalledWith({
      reminder_cadence: "weekly_sunday",
    });
  });

  it("checks the option the stored row actually names", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs({ reminder_cadence: "weekly_sunday" }),
      isLoading: false,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    expect(
      screen.getByRole("radio", { name: "Once a week, on Sunday" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Tell me right away" })).not.toBeChecked();
  });

  /**
   * No dark default: a client with no row of her own is shown the quietest
   * cadence that still gets a real answer on time, which is the column's own
   * DEFAULT after 00572 — never the loudest one.
   */
  it("falls back to the quiet cadence, not the loud one, when the row names none", () => {
    mockUseNotificationPreferences.mockReturnValue({
      data: makePrefs({ reminder_cadence: undefined as never }),
      isLoading: false,
      isError: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    expect(screen.getByRole("radio", { name: "Once a day" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Tell me right away" })).not.toBeChecked();
  });

  /**
   * R16's floor holds whether or not she sets quiet hours of her own, so it is
   * stated as a fact about Patina rather than as a setting she has to find.
   */
  it("states the floor under quiet hours, and names its exceptions", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);

    const floor = screen.getByTestId("details-quiet-floor");
    expect(floor).toHaveTextContent("nothing before 8am in your time zone");
    expect(floor).toHaveTextContent("nothing on Sunday");
    // The two things the sentence must not promise away: the weekly summary
    // IS sent on Sunday, and the passed-date notice breaks every hold.
    expect(floor).toHaveTextContent("except the weekly summary");
    expect(floor).toHaveTextContent("passed its date is the one thing that never waits");
    // An absolute "never" would be false on both counts.
    expect(floor.textContent ?? "").not.toMatch(/never sends/);
  });

  /** P-24: the ask is an approval, and the copy says so. */
  it("calls them approval requests", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);

    expect(screen.getByTestId("details-notifications")).toHaveTextContent(
      "approval requests",
    );
    expect(screen.getByTestId("details-notifications")).not.toHaveTextContent(
      "decision requests",
    );
  });
});

describe("DetailsSheet — conversations, muted or set apart", () => {
  it("renders nothing when there is nothing to show", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.queryByTestId("details-threads")).not.toBeInTheDocument();
  });

  it("unmutes a muted thread", async () => {
    mockUseMyThreadOverrides.mockReturnValue({
      data: [
        {
          thread_id: "th-1",
          thread_kind: "project",
          thread_title: "The Quist library",
          project_id: "proj-1",
          muted_at: "2026-08-01T00:00:00Z",
          notification_pref: "all",
          counterpart_names: ["Studio"],
        },
      ],
      isLoading: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    expect(screen.getByText("The Quist library")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unmute" }));
    expect(muteThreadMutate).toHaveBeenCalledWith({
      threadId: "th-1",
      muted: false,
    });
  });

  it("changes a custom per-thread preference", () => {
    mockUseMyThreadOverrides.mockReturnValue({
      data: [
        {
          thread_id: "th-2",
          thread_kind: "vendor_brief",
          thread_title: null,
          project_id: null,
          muted_at: null,
          notification_pref: "mentions",
          counterpart_names: ["Prairie Coat Painting"],
        },
      ],
      isLoading: false,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);

    expect(screen.getByText("Vendor brief")).toBeInTheDocument();
    const select = screen.getByLabelText(
      "Notification preference for Prairie Coat Painting",
    );
    fireEvent.change(select, { target: { value: "none" } });
    expect(updateThreadPrefMutate).toHaveBeenCalledWith({
      threadId: "th-2",
      pref: "none",
    });
  });

  it("holds on a settled sentence when the overrides query fails", () => {
    mockUseMyThreadOverrides.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    });
    render(<DetailsSheet open onClose={jest.fn()} />);
    expect(screen.getByTestId("details-threads")).toBeInTheDocument();
    expect(screen.getByText("The file could not be read.")).toBeInTheDocument();
  });
});

describe("DetailsSheet — every session, everywhere", () => {
  it("asks before it signs out everywhere", async () => {
    render(<DetailsSheet open onClose={jest.fn()} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    expect(signOutAllMutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /ends every active session on every device, including this one/i,
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Never mind" }));
    expect(
      screen.queryByText(
        /ends every active session on every device, including this one/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("signs out everywhere and lands on sign-in", async () => {
    signOutAllMutateAsync.mockResolvedValueOnce(undefined);
    render(<DetailsSheet open onClose={jest.fn()} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, sign out everywhere" }),
    );

    await waitFor(() => expect(signOutAllMutateAsync).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/auth/signin");
  });

  it("reports a failed sign-out instead of pretending it happened", async () => {
    signOutAllMutateAsync.mockRejectedValueOnce(
      new Error("AuthApiError: refresh_token_not_found"),
    );
    render(<DetailsSheet open onClose={jest.fn()} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign out everywhere" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Yes, sign out everywhere" }),
    );

    const refusal = await screen.findByRole("alert");
    expect(refusal).toHaveTextContent("Could not end your sessions just now.");
    expect(refusal).not.toHaveTextContent("refresh_token_not_found");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DetailsSheet — focus trap and restore", () => {
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  it("wraps Tab from the last focusable element back to the first", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    const dialog = screen.getByTestId("details-sheet");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    render(<DetailsSheet open onClose={jest.fn()} />);
    const dialog = screen.getByTestId("details-sheet");
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to whatever opened it, once it closes", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<DetailsSheet open onClose={jest.fn()} />);
    expect(document.activeElement).not.toBe(opener);

    rerender(<DetailsSheet open={false} onClose={jest.fn()} />);
    expect(document.activeElement).toBe(opener);

    document.body.removeChild(opener);
  });
});
