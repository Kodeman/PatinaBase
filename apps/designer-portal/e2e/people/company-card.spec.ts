import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";

/**
 * THE COMPANY CARD — the only place a compliance document is written, and the
 * only place "Chase the renewal" can be pressed.
 *
 * The chase is the assertion that matters: it must leave ONE ROW ON THE AGENT
 * QUEUE at `awaiting_review` and send nothing. No automated external sends is a
 * standing rule, and the act's own sentence on the face promises exactly that.
 *
 * Chromium-pinned: one seeded designer, one queue.
 */
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "single seeded actor",
);

async function firstFirm() {
  const { data, error } = await adminDb
    .from("studio_contacts")
    .select("id, company_name, company_kind, contact_kind")
    .eq("entity_kind", "company")
    .is("archived_at", null)
    .limit(20);
  if (error) throw error;
  // A lender or an inspector never owed the studio paper, so it carries no
  // chase act at all (C13) — pick a firm that does.
  return (data ?? []).find(
    (c) =>
      !["lender", "inspector"].includes(
        String(c.company_kind ?? c.contact_kind),
      ),
  );
}

async function chaseTasksFor(companyId: string) {
  const { data, error } = await adminDb
    .from("agent_tasks")
    .select("id, status, task_type, entity_id")
    .eq("task_type", "compliance_chase")
    .eq("entity_id", companyId);
  if (error) throw error;
  return data ?? [];
}

test.describe("the company card", () => {
  test("Chase the renewal files a draft awaiting review, and sends nothing", async ({
    authenticatedPage: page,
  }) => {
    const firm = await firstFirm();
    test.skip(!firm, "the studio book holds no firm that owes paper");
    const companyId = firm!.id as string;

    await adminDb
      .from("agent_tasks")
      .delete()
      .eq("task_type", "compliance_chase")
      .eq("entity_id", companyId);

    await page.goto(`/people?firm=${companyId}`);
    await expect(page.getByRole("heading", { name: "Paper" })).toBeVisible();

    const chase = page.getByRole("button", { name: "Chase the renewal" });
    await expect(chase).toBeVisible();
    // The consequence stands beside the act, and it is what the act does.
    await expect(
      page.getByText(
        `This drafts a note to ${firm!.company_name}'s paperwork contact and files it for your review. Nothing is sent until you send it.`,
      ),
    ).toBeVisible();

    await chase.click();

    await expect
      .poll(async () => (await chaseTasksFor(companyId)).map((t) => t.status), {
        timeout: 15_000,
      })
      .toEqual(["awaiting_review"]);

    await expect(
      page.getByText(
        "Filed for your review. Nothing is sent until you send it.",
      ),
    ).toBeVisible();

    await adminDb
      .from("agent_tasks")
      .delete()
      .eq("task_type", "compliance_chase")
      .eq("entity_id", companyId);
  });

  test("a firm carries no consent word and no reach word", async ({
    authenticatedPage: page,
  }) => {
    const firm = await firstFirm();
    test.skip(!firm, "the studio book holds no firm that owes paper");
    await page.goto(`/people?firm=${firm!.id}`);
    await expect(page.locator("[data-company-card]")).toBeVisible();
    await expect(page.locator('[data-state-family="consent"]')).toHaveCount(0);
    await expect(page.locator('[data-state-family="reach"]')).toHaveCount(0);
  });
});
