/**
 * HT-4 — the rate card binds to the roster role enum, and the picker is the
 * only way to say so. There is no free-text role field any more: the shipped
 * default label "Principal designer" could never normalize-match
 * `lead_designer`, and that one sentence is why a default two-role card
 * stranded every hour it should have priced.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type { AgreementPart } from "@patina/types";
import { PartEditor } from "../part-editor";

function rateCard(roles: unknown[]): AgreementPart {
  return {
    id: "part-rate-card",
    proposalId: "agreement-1",
    position: 1,
    kind: "schedule",
    variant: "rate_card",
    partKey: "patina.role_rates",
    title: "Role rates",
    payload: { roles },
    required: false,
    clientVisible: true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
  };
}

function renderCard(roles: unknown[], onChange = jest.fn()) {
  render(
    <PartEditor
      part={rateCard(roles)}
      onChange={onChange}
      readOnly={false}
      libraryOn={false}
    />,
  );
  return onChange;
}

describe("the rate card's role picker (HT-4)", () => {
  it("offers exactly the four roster roles, and no free-text field", () => {
    renderCard([{ roleName: "", hourlyRateCents: 0, sortOrder: 0 }]);

    const picker = screen.getByLabelText("Role 1") as HTMLSelectElement;
    expect(picker.tagName).toBe("SELECT");

    const offered = Array.from(picker.options)
      .map((option) => option.value)
      .filter((value) => value !== "");
    expect(offered).toEqual([
      "lead_designer",
      "support_designer",
      "bookkeeper",
      "vendor",
    ]);
  });

  it("does not offer 'client' — a signed card may not price the homeowner", () => {
    renderCard([{ roleName: "", hourlyRateCents: 0, sortOrder: 0 }]);
    const picker = screen.getByLabelText("Role 1") as HTMLSelectElement;
    expect(
      Array.from(picker.options).map((option) => option.value),
    ).not.toContain("client");
  });

  it("writes the binding AND the label the client reads", () => {
    const onChange = renderCard([
      { roleName: "", hourlyRateCents: 0, sortOrder: 0 },
    ]);

    fireEvent.change(screen.getByLabelText("Role 1"), {
      target: { value: "support_designer" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [
          expect.objectContaining({
            rosterRole: "support_designer",
            roleName: "Support designer",
          }),
        ],
      }),
    );
  });

  it("shows a legacy label as the unchosen state rather than losing it", () => {
    renderCard([
      { roleName: "Principal designer", hourlyRateCents: 22_500, sortOrder: 0 },
    ]);
    const picker = screen.getByLabelText("Role 1") as HTMLSelectElement;
    expect(picker.value).toBe("");
    expect(
      Array.from(picker.options).some(
        (option) => option.text === "Principal designer",
      ),
    ).toBe(true);
  });

  it("seeds a new row with the first role the card does not already price", () => {
    const onChange = renderCard([
      {
        roleName: "Lead designer",
        rosterRole: "lead_designer",
        hourlyRateCents: 26_000,
        sortOrder: 0,
      },
    ]);

    fireEvent.click(screen.getByText("+ Add a role"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: expect.arrayContaining([
          expect.objectContaining({
            rosterRole: "support_designer",
            roleName: "Support designer",
          }),
        ]),
      }),
    );
  });

  it("spends the act once all four roles are priced — two cards for one role is the stranding by another door", () => {
    renderCard([
      { roleName: "Lead designer", rosterRole: "lead_designer", hourlyRateCents: 1, sortOrder: 0 },
      { roleName: "Support designer", rosterRole: "support_designer", hourlyRateCents: 1, sortOrder: 1 },
      { roleName: "Bookkeeper", rosterRole: "bookkeeper", hourlyRateCents: 1, sortOrder: 2 },
      { roleName: "Vendor", rosterRole: "vendor", hourlyRateCents: 1, sortOrder: 3 },
    ]);
    expect(screen.getByText("+ Add a role").closest("button")).toBeDisabled();
  });

  it("does not offer a role another row on the card already prices", () => {
    renderCard([
      { roleName: "Lead designer", rosterRole: "lead_designer", hourlyRateCents: 1, sortOrder: 0 },
      { roleName: "", hourlyRateCents: 0, sortOrder: 1 },
    ]);
    const second = screen.getByLabelText("Role 2") as HTMLSelectElement;
    const lead = Array.from(second.options).find(
      (option) => option.value === "lead_designer",
    );
    expect(lead?.disabled).toBe(true);
  });
});
