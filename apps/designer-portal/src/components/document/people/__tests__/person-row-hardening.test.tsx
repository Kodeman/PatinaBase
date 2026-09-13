/**
 * The Directory's PERSON row (W2b). Rewritten: the row it tested — one big
 * `<button>` carrying an avatar, a relationship line and a status dot — is
 * retired by C11's three sibling controls and PR-q's ledger row.
 *
 * What this pins is the row's grammar, which four rulings depend on: the row is
 * a container (C11), stage is never a person-level column (PR-p / C1 / R-G),
 * the three words print plain at 390 on every row (R-M / C23), and a routed
 * rule clause carries a way to actually reach the routed person (R-L / C22).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PeopleDirectoryRow } from "@patina/supabase";
import { PersonRow } from "../directory/person-row";

// CR10-2 — the row reads the query's own state, not only its data, so the mock
// has to be able to answer "still reading" as well as "read, and empty".
const mockUsePeopleSeats = jest.fn(
  (): { data?: unknown[]; isFetching?: boolean } => ({ data: [] }),
);

jest.mock("@patina/supabase", () => ({
  usePeopleSeats: (...args: unknown[]) => mockUsePeopleSeats(...(args as [])),
}));

function person(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: "card-dana",
    role: "contact",
    display_name: "Dana Kowalski",
    email: "dana@northgateelectric.com",
    phone: "(612) 555-0111",
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: "active",
    last_touch_at: null,
    meta: {
      entity_kind: "person",
      contact_kind: "sub",
      company_name: "Northgate Electric",
      company_id: "firm-northgate",
      specialties: ["electrical"],
    },
    scope: "studio",
    reach_state: "field_link",
    consent_status: "granted",
    paper_state: "lapsed",
    contact_rule_summary: "Never text. The email on file bounces.",
    seat_count: 1,
    ...over,
  } as PeopleDirectoryRow;
}

function renderRow(over: Partial<PeopleDirectoryRow> = {}, props = {}) {
  const onOpen = jest.fn();
  render(
    <ul>
      <PersonRow person={person(over)} onOpen={onOpen} {...props} />
    </ul>,
  );
  return { onOpen };
}

beforeEach(() => {
  mockUsePeopleSeats.mockReturnValue({ data: [] });
});

describe("the row is a container, not a button (C11)", () => {
  it("the open-person control names the person and nothing else", () => {
    renderRow();
    const open = screen.getByRole("button", { name: "Dana Kowalski" });
    expect(open).toHaveAttribute("data-open-person", "card-dana");
  });

  it("the phone is its own sibling control, never nested in the row control", () => {
    renderRow();
    const tel = screen.getByRole("link", { name: /Call Dana Kowalski/ });
    expect(tel).toHaveAttribute("href", "tel:+16125550111");
    expect(tel.closest("button")).toBeNull();
  });

  it("opens the card from the name", () => {
    const { onOpen } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Dana Kowalski" }));
    expect(onOpen).toHaveBeenCalled();
  });
});

describe("the word columns", () => {
  it("carries exactly three — reach, consent, paper — and never a stage word", () => {
    const { container } = render(
      <ul>
        <PersonRow person={person()} onOpen={jest.fn()} />
      </ul>,
    );
    const bordered = container.querySelector("[data-row-words]") as HTMLElement;
    const words = within(bordered).getAllByText(/Field link|Texting|Lapsed/);
    expect(words).toHaveLength(3);
    expect(bordered.querySelector('[data-state-family="stage"]')).toBeNull();
  });

  it("R-M — line 2 prints the same three words plain at 390, on every row", () => {
    const { container } = render(
      <ul>
        <PersonRow person={person()} onOpen={jest.fn()} />
      </ul>,
    );
    const plain = container.querySelector(
      "[data-row-words-390]",
    ) as HTMLElement;
    expect(plain.querySelectorAll("[data-state-word]")).toHaveLength(3);
  });

  it("R-A — a lender prints no paper word in either place", () => {
    const { container } = render(
      <ul>
        <PersonRow
          person={person({
            meta: { contact_kind: "lender" },
            paper_state: "not_on_file",
          })}
          onOpen={jest.fn()}
        />
      </ul>,
    );
    expect(screen.queryByText("Not on file")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-state-family="paper"]'),
    ).toHaveLength(0);
  });

  it("prints NOTHING for a consent record the studio does not hold (R-BB)", () => {
    render(
      <ul>
        <PersonRow
          person={person({ consent_status: null })}
          onOpen={jest.fn()}
        />
      </ul>,
    );
    expect(screen.queryByText("Not asked")).not.toBeInTheDocument();
  });
});

/** A rule ROW, which is what the faces now read (CR-5 / CR-6 / CR-22). */
function rule(over: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    subject_type: "person",
    subject_id: "card-dana",
    channels_allowed: [],
    channels_forbidden: ["sms", "email", "mobile", "office"],
    route_to_person_id: null,
    contact_hours: null,
    escalation_by_class: {},
    reason: null,
    set_by: null,
    set_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as never;
}

describe("the rule clause", () => {
  it("a rule that leaves NO channel open takes the leading rule", () => {
    const { container } = render(
      <ul>
        <PersonRow person={person()} onOpen={jest.fn()} rule={rule()} />
      </ul>,
    );
    expect(
      container.querySelector('[data-contact-rule-blocked="true"]'),
    ).toBeInTheDocument();
  });

  it("a rule that forbids text takes NO leading rule and KEEPS the phone (R-BL)", () => {
    const { container } = render(
      <ul>
        <PersonRow
          person={person()}
          onOpen={jest.fn()}
          rule={rule({
            channels_forbidden: ["sms"],
            channels_allowed: ["email", "mobile"],
            reason: "Email only. Phone for emergencies. Never texted.",
          })}
        />
      </ul>,
    );
    // R-BL (Fable, 2026-09-13): closing ONE direct channel while another stays
    // open is a plain clause, not a hard block. Only do-not-contact or a route
    // to another person earns the 2px terracotta leading rule.
    expect(
      container.querySelector('[data-contact-rule-blocked="true"]'),
    ).not.toBeInTheDocument();
    // And it is nothing like "do not contact": the phone the clause tells the
    // studio to use is still a live target (§5.4).
    expect(
      screen.getByRole("link", { name: /Call Dana Kowalski/ }),
    ).toBeInTheDocument();
    // The studio's own sentence prints, not the mechanical clause list (CR-6),
    // and no schema word reaches the face (CR-5).
    expect(
      screen.getByText(/Email only\. Phone for emergencies\. Never texted\./),
    ).toBeInTheDocument();
  });

  it("a do-not-contact rule takes the person's own phone off the row (QA-3)", () => {
    render(
      <ul>
        <PersonRow person={person()} onOpen={jest.fn()} rule={rule()} />
      </ul>,
    );
    expect(
      screen.queryByRole("link", { name: /Call Dana Kowalski/ }),
    ).not.toBeInTheDocument();
  });

  it("R-L — a routed clause prints the routed person and a way to reach them", () => {
    render(
      <ul>
        <PersonRow
          person={person({
            display_name: "Frank Bauer",
            phone: null,
            contact_rule_summary:
              "Never text. Do not use: email. Write Rosa Delgado instead.",
          })}
          onOpen={jest.fn()}
          routeTargets={
            new Map([
              [
                "rosa delgado",
                {
                  name: "Rosa Delgado",
                  email: "rosa@twincitiesdrywall.com",
                  officePhone: "(612) 555-0115",
                },
              ],
            ])
          }
        />
      </ul>,
    );
    expect(
      screen.getByText(/Write Rosa Delgado instead\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "rosa@twincitiesdrywall.com" }),
    ).toHaveAttribute("href", "mailto:rosa@twincitiesdrywall.com");
  });

  /**
   * CR3-2 — `contact_rule_summary()` renders `channels_forbidden` as raw
   * `channel_kind` tokens, and the rules are a SEPARATE query from the
   * directory, so every cold load painted "Do not use: after_hours, ap_email,
   * dispatch, …" on the row until they arrived — permanently if that read
   * failed. SPEC §8 #3 bars those words from any face. The row prints no
   * clause until it holds the rule row.
   */
  it("prints no clause — and no schema word — while the rule row is unread", () => {
    const { container } = render(
      <ul>
        <PersonRow
          person={person({
            display_name: "Frank Bauer",
            contact_rule_summary:
              "Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office.",
          })}
          onOpen={jest.fn()}
        />
      </ul>,
    );
    expect(container.querySelector("[data-contact-rule]")).toBeNull();
    for (const token of ["after_hours", "ap_email", "dispatch", "portal_311"]) {
      expect(container.textContent).not.toContain(token);
    }
  });
});

describe("the seats disclosure", () => {
  it("pairs aria-expanded with aria-controls on a real panel id", () => {
    renderRow();
    const toggle = screen.getByRole("button", { name: "1 seat" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panelId = toggle.getAttribute("aria-controls") as string;
    expect(document.getElementById(panelId)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("shows no disclosure at all when the identity nests no seat", () => {
    renderRow({ seat_count: 0 });
    expect(
      screen.queryByRole("button", { name: /seat/ }),
    ).not.toBeInTheDocument();
  });

  it("R-AA — a seat line is a live door, and its stage word prints there", () => {
    mockUsePeopleSeats.mockReturnValue({
      data: [
        {
          identity_key: "card-dana",
          person_id: "card-dana",
          seat_id: "seat-1",
          project_id: "proj-1",
          project_name: "Okonkwo residence",
          party_kind: "sub",
          trade: "electrical",
          stage: "active",
          on_site_from: "2026-10-12",
          on_site_to: "2027-08-13",
        },
      ],
    });
    const onOpenSeat = jest.fn();
    renderRow({}, { onOpenSeat });
    fireEvent.click(screen.getByRole("button", { name: "1 seat" }));
    const seat = screen.getByRole("button", {
      name: /Okonkwo residence · sub · electrical/,
    });
    expect(seat).toHaveTextContent("On the job");
    expect(seat).toHaveTextContent("12 Oct 2026 to 13 Aug 2027");
    fireEvent.click(seat);
    expect(onOpenSeat).toHaveBeenCalled();
  });

  /**
   * CR10-2 — THE COUNT AND THE SENTENCE NEVER CONTRADICT EACH OTHER. The read
   * is enabled only when the disclosure opens, so `data` is undefined for the
   * whole first round-trip; an empty-length test printed "no seat" directly
   * beneath a trigger reading "2 seats".
   */
  it("prints nothing under the trigger while the seats are still being read", () => {
    mockUsePeopleSeats.mockReturnValue({ data: undefined, isFetching: true });
    renderRow({ seat_count: 2 });
    fireEvent.click(screen.getByRole("button", { name: "2 seats" }));
    expect(screen.queryByText(/No open seat/)).not.toBeInTheDocument();
  });

  /**
   * CR10-2 — and the Directory names no project, so it may not borrow R-V's
   * project-scoped fallback from the person card.
   */
  it("says the Directory's own sentence when the read lands empty", () => {
    mockUsePeopleSeats.mockReturnValue({ data: [], isFetching: false });
    renderRow({ seat_count: 2 });
    fireEvent.click(screen.getByRole("button", { name: "2 seats" }));
    expect(screen.getByText("No open seat on any job.")).toBeInTheDocument();
    expect(
      screen.queryByText("No open seat on this project."),
    ).not.toBeInTheDocument();
  });
});
