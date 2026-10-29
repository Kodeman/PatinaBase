import { test, expect } from "../fixtures/auth";
import { psqlAsUserRow, psqlScalar, psqlRun } from "../helpers/psql";

const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const INQUIRY = "RC7 E3 fictional inquiry";
const NOTES = "Keep the piano alcove and original survey notes.";
const DIRECT = "RC7 E3 fictional direct project";

function ownedStack() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (
    api.hostname !== "127.0.0.1" ||
    api.port !== "56121" ||
    db.hostname !== "127.0.0.1" ||
    db.port !== "56122"
  ) {
    throw new Error("RC7-E3 refuses an unowned lineage stack");
  }
  expect(
    psqlScalar("SELECT system_identifier::text FROM pg_control_system()"),
  ).toBe("7702055901180289066");
}

function removeLineage() {
  ownedStack();
  psqlRun(`DO $$ BEGIN IF EXISTS (
      SELECT 1 FROM leads l WHERE l.contact_name='${INQUIRY}' AND NOT (
        l.designer_id='${DESIGNER}'::uuid OR
        (l.designer_id IS NULL AND l.homeowner_id IS NULL AND l.status='new'
          AND l.project_description='${NOTES}' AND NOT EXISTS
            (SELECT 1 FROM designer_clients dc WHERE dc.lead_id=l.id))))
    OR EXISTS (SELECT 1 FROM projects WHERE name='${DIRECT}' AND designer_id IS DISTINCT FROM '${DESIGNER}'::uuid)
    OR EXISTS (SELECT 1 FROM proposals WHERE designer_client_id IN
      (SELECT id FROM designer_clients WHERE lead_id IN
        (SELECT id FROM leads WHERE contact_name='${INQUIRY}'))
      AND designer_id IS DISTINCT FROM '${DESIGNER}'::uuid)
    THEN RAISE EXCEPTION 'RC7-E3 cleanup owner mismatch'; END IF; END $$;
    DELETE FROM projects WHERE designer_id='${DESIGNER}' AND name='${DIRECT}';
    DELETE FROM proposals WHERE designer_client_id IN
      (SELECT id FROM designer_clients WHERE designer_id='${DESIGNER}' AND lead_id IN
        (SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}'));
    DELETE FROM designer_clients WHERE designer_id='${DESIGNER}' AND lead_id IN
      (SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}');
    DELETE FROM leads WHERE contact_name='${INQUIRY}' AND
      (designer_id='${DESIGNER}' OR (designer_id IS NULL AND homeowner_id IS NULL
        AND status='new' AND project_description='${NOTES}'));`);
}

test("A03 inquiry reaches a draft proposal with source notes; direct project keeps absent history", async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(240_000);
  removeLineage();
  expect(
    psqlScalar(`SELECT count(*) FROM leads WHERE contact_name='${INQUIRY}'`),
  ).toBe("0");
  expect(
    psqlScalar(
      `SELECT count(*) FROM projects WHERE designer_id='${DESIGNER}' AND name='${DIRECT}'`,
    ),
  ).toBe("0");
  try {
    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-studio="round8"]')).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    await page
      .getByRole("button", { name: "Record an inquiry", exact: true })
      .click();
    await page.getByLabel("Client name").fill(INQUIRY);
    await page.getByLabel("Project summary").fill(NOTES);
    await page.getByRole("button", { name: "Create inquiry brief" }).click();
    await expect
      .poll(() =>
        psqlScalar(
          `SELECT count(*) FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}' AND project_description='${NOTES}'`,
        ),
      )
      .toBe("1");
    const lead = psqlScalar(
      `SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}'`,
    );
    await page.goto(`/doc/${lead}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-document-shell]")).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    await expect(page.getByText(`“${NOTES}”`)).toBeVisible();
    await page.getByRole("button", { name: "Accept · begin" }).click();
    await expect
      .poll(() => psqlScalar(`SELECT status FROM leads WHERE id='${lead}'`))
      .toBe("accepted");
    const relationship = psqlScalar(
      `SELECT id FROM designer_clients WHERE lead_id='${lead}' AND designer_id='${DESIGNER}'`,
    );
    expect(relationship).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      psqlScalar(`SELECT project_description FROM leads WHERE id='${lead}'`),
    ).toBe(NOTES);
    await page.goto(`/doc/${lead}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-document-shell]")).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    expect(
      psqlScalar(
        `SELECT engagement_id FROM public.document_state WHERE lead_id='${lead}'`,
      ),
    ).toBe(relationship);
    expect(
      psqlScalar(
        `SELECT count(*) FROM proposals WHERE designer_client_id='${relationship}'`,
      ),
    ).toBe("0");
    psqlRun(`INSERT INTO client_discovery
      (designer_client_id, designer_id, project_type, rooms, budget_max_cents, target_date, style_keywords, lifestyle)
      VALUES ('${relationship}', '${DESIGNER}', 'full_room',
        '[{"name":"Piano room","notes":"Keep the piano alcove"}]'::jsonb,
        5000000, '2027-06-01', ARRAY['warm'], '[{"room":"Piano room","who":"family"}]'::jsonb)
      ON CONFLICT (designer_client_id) DO UPDATE SET
        project_type=EXCLUDED.project_type, rooms=EXCLUDED.rooms,
        budget_max_cents=EXCLUDED.budget_max_cents, target_date=EXCLUDED.target_date,
        style_keywords=EXCLUDED.style_keywords, lifestyle=EXCLUDED.lifestyle;`);
    expect(
      psqlScalar(`SELECT count(*) FROM client_discovery WHERE designer_client_id='${relationship}'
        AND seeded_proposal_id IS NULL AND project_type='full_room'`),
    ).toBe("1");
    const [proposal] = psqlAsUserRow(
      DESIGNER,
      `SELECT public.begin_direction_from_discovery('${relationship}');`,
    );
    expect(proposal).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      psqlScalar(`SELECT count(*) FROM proposals WHERE id='${proposal}'
        AND designer_client_id='${relationship}' AND status='draft' AND project_id IS NULL`),
    ).toBe("1");
    expect(
      psqlScalar(
        `SELECT seeded_proposal_id FROM client_discovery WHERE designer_client_id='${relationship}'`,
      ),
    ).toBe(proposal);
    expect(
      psqlAsUserRow(
        DESIGNER,
        `SELECT public.begin_direction_from_discovery('${relationship}');`,
      )[0],
    ).toBe(proposal);
    expect(
      psqlScalar(
        `SELECT count(*) FROM proposals WHERE designer_client_id='${relationship}'`,
      ),
    ).toBe("1");
    await page.goto(`/doc/${lead}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-document-shell]")).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    await expect(page).toHaveURL(new RegExp(`/doc/${proposal}(?:\\?|$)`));
    await expect(page.getByRole("heading", { name: INQUIRY })).toBeVisible();
    await expect(page.getByRole("region", { name: "Direction" })).toContainText(
      "DRAFT",
    );
    expect(
      psqlScalar(`SELECT project_description FROM leads WHERE id='${lead}'`),
    ).toBe(NOTES);

    await page.goto("/desk", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-studio="round8"]')).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    await page
      .getByRole("button", { name: "Create a project file", exact: true })
      .click();
    await page.getByLabel("Project title").fill(DIRECT);
    await page
      .getByRole("button", { name: "Create project file", exact: true })
      .click();
    await expect
      .poll(() =>
        psqlScalar(
          `SELECT count(*) FROM projects WHERE designer_id='${DESIGNER}' AND name='${DIRECT}' AND proposal_id IS NULL`,
        ),
      )
      .toBe("1");
    const project = psqlScalar(
      `SELECT id FROM projects WHERE designer_id='${DESIGNER}' AND name='${DIRECT}'`,
    );
    await expect(page).toHaveURL(new RegExp(`/doc/${project}(?:\\?|$)`));
    await expect(
      page.getByText("No original brief is linked to this document."),
    ).toBeVisible();
    await expect(
      page.getByText("No agreement is linked to this document."),
    ).toBeVisible();
    expect(
      psqlScalar(
        `SELECT proposal_id IS NULL AND client_id IS NULL FROM projects WHERE id='${project}'`,
      ),
    ).toBe("t");
  } finally {
    removeLineage();
  }
});

// The full proposal → signed commission → project chain requires real client
// acceptance and is not claimed by the inquiry/relationship transition above.
test.fixme("A03 proposal agreement activation preserves lead notes and all former aliases", async () => {});
