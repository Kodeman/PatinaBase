import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { psqlAsUserRow, psqlRows, psqlRun, psqlScalar } from "../helpers/psql";

// RC7-E3-4 (refuted at runtime): inquiry -> Direction -> client link ->
// agreement send -> client signature -> designer countersignature -> project,
// then a DB readback of the lineage and of every former alias.
//
// Since 00414 begin_direction_from_discovery seeds a design_services draft, so
// the Direction IS the agreement: its own "Review & send" and Contract Room act
// on the same row, and countersign activates a project whose proposal_id is
// the Direction.
//
// UI (designer, F01): record inquiry, Accept, link the client through
// /api/clients/invite, set the Direction's client through HouseholdChip, read
// the Direction's design-agreement acts, open its Contract Room.
// Authenticated RPC as the real actors: begin_direction_from_discovery
// (designer), the agreement composition + send_commercial_document (designer),
// sign_design_services_agreement (client), countersign_design_services_agreement
// (designer), document_open (designer) for each former id. The client portal's
// sign route calls sign_design_services_agreement_with_trusted_ip with the
// request IP and composed consent instead; that path is NOT exercised here. The sign chain and
// its readback run in ONE transaction that is rolled back, so executed rows
// never outlive the run.

const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const CLIENT = "a0000000-0000-0000-0000-000000000005";
const CLIENT_EMAIL = "client@patina.dev";
const INQUIRY = "RC7 E3 agreement lineage inquiry";
const NOTES = "Agreement lineage probe: keep the piano alcove.";

function ownedStack() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (
    api.hostname !== "127.0.0.1" ||
    api.port !== (process.env.RC7_E3_API_PORT ?? "56121") ||
    db.hostname !== "127.0.0.1" ||
    db.port !== (process.env.RC7_E3_DB_PORT ?? "56122")
  ) {
    throw new Error("RC7-E3 refuses an unowned agreement-lineage stack");
  }
  const expected = process.env.RC7_E3_SYSTEM_IDENTIFIER;
  if (!expected || !/^\d+$/.test(expected)) {
    throw new Error(
      "RC7-E3 requires the cluster identifier captured at stack start",
    );
  }
  expect(
    psqlScalar("SELECT system_identifier::text FROM pg_control_system()"),
  ).toBe(expected);
}

function removeProbe() {
  ownedStack();
  psqlRun(`DO $$ BEGIN IF EXISTS (
      SELECT 1 FROM leads WHERE contact_name='${INQUIRY}'
        AND designer_id IS DISTINCT FROM '${DESIGNER}'::uuid)
    THEN RAISE EXCEPTION 'RC7-E3 agreement probe owner mismatch'; END IF; END $$;
    -- The Contract Room materializes parts on the draft; a cascade from the
    -- proposal delete trips the authored-child guard, so drop parts first.
    -- The page can still be materializing when this runs (it is left on the
    -- separate draft's Room), so hold parts writes until both deletes commit;
    -- otherwise a part lands between them and the cascade trips the guard.
    -- Lock in the app's order (the proposal row, then its parts): parts alone
    -- first deadlocks against a materialization holding the proposal row.
    LOCK TABLE proposals, proposal_agreement_parts IN EXCLUSIVE MODE;
    DELETE FROM proposal_agreement_parts WHERE proposal_id IN
      (SELECT p.id FROM proposals p WHERE p.designer_id='${DESIGNER}' AND p.status='draft'
        AND p.designer_client_id IN (SELECT id FROM designer_clients WHERE designer_id='${DESIGNER}'
          AND lead_id IN (SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}')));
    DELETE FROM proposals WHERE designer_id='${DESIGNER}' AND designer_client_id IN
      (SELECT id FROM designer_clients WHERE designer_id='${DESIGNER}' AND lead_id IN
        (SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}'));
    DELETE FROM designer_clients WHERE designer_id='${DESIGNER}' AND lead_id IN
      (SELECT id FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}');
    DELETE FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}';`);
}

async function openDoc(page: Page, id: string) {
  await page.goto(`/doc/${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-document-shell]")).toHaveAttribute(
    "data-arrival-ready",
    "",
    { timeout: 60_000 },
  );
}

/** Designer UI: inquiry -> Accept; fixture Discovery; designer seed RPC;
 *  invite route links the existing client profile to the relationship. */
async function seedDirection(page: Page) {
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
  await page.getByLabel("Email address (optional)").fill(CLIENT_EMAIL);
  await page.getByLabel("Project summary").fill(NOTES);
  await page.getByRole("button", { name: "Create inquiry brief" }).click();
  await expect
    .poll(() =>
      psqlScalar(
        `SELECT count(*) FROM leads WHERE designer_id='${DESIGNER}' AND contact_name='${INQUIRY}'`,
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
  await page.getByRole("button", { name: "Accept · begin" }).click();
  await expect
    .poll(() => psqlScalar(`SELECT status FROM leads WHERE id='${lead}'`))
    .toBe("accepted");
  const relationship = psqlScalar(
    `SELECT id FROM designer_clients WHERE lead_id='${lead}' AND designer_id='${DESIGNER}'`,
  );
  expect(relationship).toMatch(/^[a-f0-9-]{36}$/);

  // Discovery's five essentials (fixture), then the designer's own seed RPC.
  psqlRun(`INSERT INTO client_discovery
    (designer_client_id,designer_id,project_type,rooms,budget_max_cents,target_date,style_keywords,lifestyle)
    VALUES ('${relationship}','${DESIGNER}','full_room',
      '[{"name":"Piano room","notes":"Keep the piano alcove"}]'::jsonb,
      5000000,'2027-06-01',ARRAY['warm'],'[{"room":"Piano room","who":"family"}]'::jsonb);`);
  const [direction] = psqlAsUserRow(
    DESIGNER,
    `SELECT public.begin_direction_from_discovery('${relationship}');`,
  );
  expect(direction).toMatch(/^[a-f0-9-]{36}$/);
  // 00414 redefined the seed: the Direction is a design-services draft from birth.
  expect(
    psqlScalar(
      `SELECT document_kind||'|'||commercial_state||'|'||status FROM proposals WHERE id='${direction}'`,
    ),
  ).toBe("design_services|draft|draft");

  // Client link: the invite route links the existing client profile to the
  // relationship; HouseholdChip then sets the Direction's client.
  const invite = await page.request.post("/api/clients/invite", {
    data: {
      designerClientId: relationship,
      clientEmail: CLIENT_EMAIL,
      invite: true,
    },
  });
  expect(invite.ok(), await invite.text()).toBe(true);
  expect(
    psqlScalar(
      `SELECT client_id FROM designer_clients WHERE id='${relationship}'`,
    ),
  ).toBe(CLIENT);
  return { lead, relationship, direction };
}

/** Compose, send, client-sign and countersign `agreement` as the real actors,
 *  read the lineage back inside the same transaction, then roll back. */
function signChainReadback(ids: {
  agreement: string;
  direction: string;
  lead: string;
  relationship: string;
}): Record<string, unknown> {
  const { agreement, direction, lead, relationship } = ids;
  const rows = psqlRows(`BEGIN;
CREATE FUNCTION pg_temp.actor(u uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', u::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.actor(uuid) TO authenticated;
CREATE TEMP TABLE e3_chain (result jsonb) ON COMMIT DROP;
GRANT ALL ON e3_chain TO authenticated;
CREATE TEMP TABLE e3_alias (opened jsonb) ON COMMIT DROP;
GRANT ALL ON e3_alias TO authenticated;
CREATE TEMP TABLE e3_neg (k text, v jsonb) ON COMMIT DROP;
GRANT ALL ON e3_neg TO authenticated;
SET LOCAL ROLE authenticated;
DO $d$
DECLARE p uuid := '${agreement}'; phase uuid; snap jsonb; v_err text; v_replay jsonb;
BEGIN
  PERFORM pg_temp.actor('${DESIGNER}');
  INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order)
  VALUES (p, 'Design', 'design-development', 5, 'main', 0, 0) RETURNING id INTO phase;
  UPDATE public.proposals SET valid_until = now() + interval '30 days' WHERE id = p;
  PERFORM public.upsert_design_services_draft(p, jsonb_build_object('scope', 'Fictional interior design services',
    'deliverables', jsonb_build_array('Selections'), 'exclusions', '[]'::jsonb, 'billingCeilingCents', 100000,
    'retainerAmountCents', 0, 'retainerActivationPolicy', 'immediate', 'billingCadence', 'monthly',
    'currency', 'USD', 'terms', 'Signed actual hours', 'currentRateVersion', 1),
    jsonb_build_array(jsonb_build_object('version', 1, 'roleName', 'Designer', 'hourlyRateCents', 12000,
      'sortOrder', 0, 'effectiveAt', now() - interval '1 day')));
  PERFORM public.materialize_standard_parts(p);
  PERFORM public.upsert_agreement_parts(p,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'variant', variant, 'partKey', part_key, 'title', title,
      'payload', payload, 'required', required, 'clientVisible', client_visible) ORDER BY position)
      FROM public.proposal_agreement_parts WHERE proposal_id = p), '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.piano', 'title', 'Piano room', 'payload',
        jsonb_build_object('packageKey', 'pkg.piano', 'label', 'Piano room', 'inclusion', 'included',
          'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'client', 'payer', 'client',
            'fabrication_contract', 'gc', 'installation', 'gc'),
          'serviceBindings', jsonb_build_object('design', jsonb_build_array(phase)))),
      jsonb_build_object('kind', 'acceptance_signer_policy', 'partKey', 'scope.signers', 'title', 'Signers',
        'payload', jsonb_build_object('policyRevision', 1, 'signers', jsonb_build_array(
          jsonb_build_object('slot', 'client', 'required', true, 'profileId', '${CLIENT}'))))),
    'rc7 e3 agreement lineage probe');
  snap := public.get_commercial_document_send_snapshot(p);
  PERFORM public.send_commercial_document(p, snap->>'documentFingerprint', NULL, now() + interval '30 days');
  -- Negative branch: the designer cannot sign in the client's signer slot.
  BEGIN
    PERFORM public.sign_design_services_agreement(p, 'F01 Fictional Designer');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || ': ' || SQLERRM;
  END;
  INSERT INTO e3_neg VALUES ('designerSign', jsonb_build_object('error', v_err,
    'stateAfter', (SELECT commercial_state FROM proposals WHERE id = p)));
  PERFORM pg_temp.actor('${CLIENT}');
  PERFORM public.sign_design_services_agreement(p, 'RC7 Fictional Client');
  PERFORM pg_temp.actor('${DESIGNER}');
  INSERT INTO e3_chain VALUES
    (public.countersign_design_services_agreement(p, 'F01 Fictional Designer'));
  -- Negative branch: a repeated countersign must not activate a second project
  -- (refused, or an idempotent no-op on the same project).
  BEGIN
    v_replay := public.countersign_design_services_agreement(p, 'F01 Fictional Designer');
    v_err := NULL;
  EXCEPTION WHEN OTHERS THEN v_replay := NULL; v_err := SQLSTATE || ': ' || SQLERRM;
  END;
  INSERT INTO e3_neg VALUES ('countersignReplay', jsonb_build_object('error', v_err, 'result', v_replay));
  -- Former aliases, opened as the designer exactly as /doc/[id] does.
  INSERT INTO e3_alias VALUES (jsonb_build_object(
    'lead', public.document_open('${lead}'),
    'relationship', public.document_open('${relationship}'),
    'direction', public.document_open('${direction}')));
END $d$;
RESET ROLE;
WITH c AS (SELECT result, (result->>'projectId')::uuid AS project FROM e3_chain)
SELECT jsonb_build_object(
  'countersign', c.result,
  'agreement', (SELECT jsonb_build_object('kind', document_kind, 'state', commercial_state,
      'parentProposalId', parent_proposal_id, 'designerClientId', designer_client_id, 'projectId', project_id)
    FROM proposals WHERE id = '${agreement}'),
  'direction', (SELECT jsonb_build_object('kind', document_kind, 'status', status,
      'replacementProposalId', replacement_proposal_id, 'supersededAt', superseded_at,
      'projectId', project_id, 'designerClientId', designer_client_id)
    FROM proposals WHERE id = '${direction}'),
  'project', (SELECT jsonb_build_object('proposalId', proposal_id, 'clientId', client_id)
    FROM projects WHERE id = c.project),
  'discoverySeededProposalId', (SELECT seeded_proposal_id FROM client_discovery
    WHERE designer_client_id = '${relationship}'),
  'relationshipLeadId', (SELECT lead_id FROM designer_clients WHERE id = '${relationship}'),
  'directionReferences', jsonb_build_object(
    'proposals.parent_proposal_id', (SELECT count(*) FROM proposals WHERE parent_proposal_id = '${direction}'),
    'project_scope_editions.source_proposal_id', (SELECT count(*) FROM project_scope_editions WHERE source_proposal_id = '${direction}'),
    'project_commercial_documents.source_proposal_id', (SELECT count(*) FROM project_commercial_documents WHERE source_proposal_id = '${direction}'),
    'project_billing_authorities.source_proposal_id', (SELECT count(*) FROM project_billing_authorities WHERE source_proposal_id = '${direction}'),
    'projects.proposal_id', (SELECT count(*) FROM projects WHERE proposal_id = '${direction}')),
  'scopeEditions', (SELECT jsonb_agg(jsonb_build_object('id', id, 'projectId', project_id,
      'sourceProposalId', source_proposal_id, 'status', status))
    FROM project_scope_editions WHERE project_id = c.project OR source_proposal_id = '${direction}'),
  'billingAuthorities', (SELECT jsonb_agg(jsonb_build_object('id', id, 'projectId', project_id,
      'sourceProposalId', source_proposal_id, 'status', status))
    FROM project_billing_authorities WHERE project_id = c.project OR source_proposal_id = '${direction}'),
  'projectLineageNotes', (SELECT jsonb_build_object('leadId', l.id, 'notes', l.project_description,
      'contactName', l.contact_name)
    FROM projects pj
    JOIN proposals pr ON pr.id = pj.proposal_id
    JOIN designer_clients dc ON dc.id = pr.designer_client_id
    JOIN leads l ON l.id = dc.lead_id
    WHERE pj.id = c.project),
  'aliases', (SELECT opened FROM e3_alias),
  'negatives', (SELECT jsonb_object_agg(k, v) FROM e3_neg),
  'projectsForDirection', (SELECT count(*) FROM projects WHERE proposal_id = '${direction}'),
  'leadDocumentState', (SELECT jsonb_agg(jsonb_build_object('kind', engagement_kind, 'engagementId', engagement_id,
      'proposalId', proposal_id, 'projectId', project_id)) FROM document_state WHERE lead_id = '${lead}'))
FROM c;
ROLLBACK;`);
  const line = rows
    .map((r) => r.join("|"))
    .filter((l) => l.trim().startsWith("{"))
    .pop();
  if (!line) throw new Error("RC7-E3-4 sign chain returned no readback");
  return JSON.parse(line);
}

test("A03 inquiry-born Direction carries its lineage through the signed agreement and project", async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(300_000);
  removeProbe();
  try {
    const { lead, relationship, direction } = await seedDirection(page);
    await openDoc(page, direction);
    await page
      .getByRole("button", {
        name: "View or change the client this document is for",
      })
      .click();
    await page.getByTestId("client-picker-trigger").click();
    await page.getByTestId(`client-picker-option-${CLIENT}`).click();
    await expect
      .poll(() =>
        psqlScalar(`SELECT client_id FROM proposals WHERE id='${direction}'`),
      )
      .toBe(CLIENT);

    // The Direction's own agreement acts: send and the Contract Room.
    await openDoc(page, direction);
    const acts = page.getByRole("group", { name: "Design agreement actions" });
    await expect(
      acts.getByRole("button", { name: "Review & send" }),
    ).toBeVisible();
    await expect(
      acts.getByRole("button", { name: /Open the Contract Room/ }),
    ).toBeVisible();

    const readback = signChainReadback({
      agreement: direction,
      direction,
      lead,
      relationship,
    });
    console.log(
      `[RC7-E3-4 readback] ${JSON.stringify({ ids: { lead, relationship, direction }, ...readback })}`,
    );
    const countersign = readback.countersign as Record<string, unknown>;
    const agreementRow = readback.agreement as Record<string, unknown>;
    const project = readback.project as Record<string, unknown>;
    expect(countersign.agreementId).toBe(direction);
    expect(countersign.commercialState).toBe("executed");
    expect(countersign.projectId).toMatch(/^[a-f0-9-]{36}$/);
    expect(agreementRow.state).toBe("executed");
    expect(agreementRow.designerClientId).toBe(relationship);
    expect(project.proposalId).toBe(direction);
    expect(project.clientId).toBe(CLIENT);
    expect(readback.discoverySeededProposalId).toBe(direction);
    expect(readback.relationshipLeadId).toBe(lead);
    expect(
      (readback.directionReferences as Record<string, number>)[
        "projects.proposal_id"
      ],
    ).toBe(1);
    expect(
      (readback.directionReferences as Record<string, number>)[
        "proposals.parent_proposal_id"
      ],
    ).toBe(0);
    // Negative branches, read back in the same transaction.
    const negatives = readback.negatives as Record<
      string,
      {
        error: string | null;
        stateAfter?: string;
        result?: Record<string, unknown> | null;
      }
    >;
    expect(
      negatives.designerSign.error,
      "the designer's own signature in the client slot is refused",
    ).toBeTruthy();
    expect(negatives.designerSign.stateAfter).toBe("sent");
    const replay = negatives.countersignReplay;
    if (replay.error === null) {
      expect(replay.result).toMatchObject({
        newlyExecuted: false,
        projectId: countersign.projectId,
      });
    }
    expect(readback.projectsForDirection).toBe(1);
    // The edition and the billing authority the countersign minted belong to
    // the returned project and name the Direction as their source.
    const projectId = countersign.projectId as string;
    const editions = readback.scopeEditions as Array<Record<string, string>>;
    expect(editions).toHaveLength(1);
    expect(editions[0]).toMatchObject({
      projectId,
      sourceProposalId: direction,
      status: "active",
    });
    const authorities = readback.billingAuthorities as Array<
      Record<string, string>
    >;
    expect(authorities).toHaveLength(1);
    expect(authorities[0]).toMatchObject({
      id: countersign.billingAuthorityId as string,
      projectId,
      sourceProposalId: direction,
      status: "active",
    });
    // The original inquiry notes, read back through the activated project:
    // project -> proposal (Direction) -> relationship -> lead.
    expect(readback.projectLineageNotes).toEqual({
      leadId: lead,
      notes: NOTES,
      contactName: INQUIRY,
    });
    const aliases = readback.aliases as Record<string, Record<string, string>>;
    expect(aliases.lead).toEqual({ kind: "redirect", projectId: relationship });
    expect(aliases.relationship).toEqual({
      kind: "redirect",
      projectId: countersign.projectId,
    });
    expect(aliases.direction).toEqual({
      kind: "redirect",
      projectId: countersign.projectId,
    });

    // The Contract Room opens on the SAME row (after the rolled-back chain, so
    // the Room's own part materialization cannot race the RPC composition).
    await acts.getByRole("button", { name: /Open the Contract Room/ }).click();
    await expect(page).toHaveURL(new RegExp(`/drafting/${direction}`), {
      timeout: 60_000,
    });
    expect(
      psqlScalar(
        `SELECT count(*) FROM proposals WHERE designer_client_id='${relationship}'`,
      ),
    ).toBe("1");
  } finally {
    removeProbe();
  }
});

// RC7-E3-5, fixed by K14: the ⌘K "Draft a services agreement" cold start,
// picked for a household that already has an open Discovery-seeded Direction,
// used to write a second design_services draft with no link to the Direction
// (draft-proposal-opener.tsx), forking the inquiry lineage. Now the sheet asks
// first: "Continue the existing Direction" opens it and writes nothing; "Start a
// separate agreement" writes exactly one new draft, deliberately.
async function pickHouseholdFromCommandBar(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Studio search" });
  await expect(palette).toBeVisible();
  await palette
    .getByRole("combobox", { name: "Studio search" })
    .fill("services agreement");
  await palette
    .getByRole("option", { name: /^Draft a services agreement/ })
    .first()
    .click();
  const sheet = page.getByTestId("draft-proposal-layer");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("client-picker-trigger").click();
  await page.getByTestId(`client-picker-option-${CLIENT}`).click();
}

function householdProposals(relationship: string) {
  return psqlRows(`SELECT id, document_kind, commercial_state, status,
      coalesce(parent_proposal_id::text, ''), coalesce(designer_client_id::text, ''),
      (id = (SELECT seeded_proposal_id FROM client_discovery WHERE designer_client_id='${relationship}'))::text
    FROM proposals WHERE designer_client_id='${relationship}' ORDER BY created_at`).map(
    ([id, kind, state, status, parent, rel, isSeed]) => ({
      id,
      kind,
      state,
      status,
      parentProposalId: parent || null,
      designerClientId: rel,
      isDiscoverySeed: isSeed === "true",
    }),
  );
}

test("A03 cold-start agreement for a household with an open Direction offers continue-or-separate", async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(300_000);
  removeProbe();
  try {
    const { relationship, direction } = await seedDirection(page);
    await openDoc(page, direction);
    await pickHouseholdFromCommandBar(page);

    // Settle on whichever comes first: the choice, or (the defect) the
    // opener's navigation into a new Contract Room.
    await Promise.race([
      page
        .getByRole("button", { name: /Continue the existing Direction/ })
        .waitFor({ timeout: 60_000 }),
      page.waitForURL(/\/drafting\/[a-f0-9-]{36}/, { timeout: 60_000 }),
    ]);
    // DB readback BEFORE any assertion: every proposal on the household, its
    // links, and the seed.
    const household = householdProposals(relationship);
    const evidence = {
      url: page.url(),
      direction,
      discoverySeededProposalId: psqlScalar(
        `SELECT seeded_proposal_id FROM client_discovery WHERE designer_client_id='${relationship}'`,
      ),
      household,
    };
    console.log(`[RC7-E3-5 readback] ${JSON.stringify(evidence)}`);
    test.info().annotations.push({
      type: "RC7-E3-5 readback",
      description: JSON.stringify(evidence),
    });
    expect(
      household,
      "no second agreement row before the designer chooses",
    ).toHaveLength(1);

    // A choice, without the cold start's "no lead, no discovery" copy.
    const sheet = page.getByTestId("draft-proposal-layer");
    await expect(
      sheet.getByRole("button", { name: /Continue the existing Direction/ }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: /Start a separate agreement/ }),
    ).toBeVisible();
    await expect(sheet.getByText(/no lead, no discovery/)).toHaveCount(0);

    // Continue: opens the Direction, writes nothing.
    await sheet
      .getByRole("button", { name: /Continue the existing Direction/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/drafting/${direction}`), {
      timeout: 60_000,
    });
    expect(
      psqlScalar(
        `SELECT count(*) FROM proposals WHERE designer_client_id='${relationship}'`,
      ),
    ).toBe("1");

    // Start a separate agreement: exactly one new draft, not the Direction.
    await pickHouseholdFromCommandBar(page);
    await page
      .getByTestId("draft-proposal-layer")
      .getByRole("button", { name: /Start a separate agreement/ })
      .click();
    await page.waitForURL(
      (url) =>
        /\/drafting\/[a-f0-9-]{36}/.test(url.pathname) &&
        !url.pathname.includes(direction),
      { timeout: 60_000 },
    );
    const after = householdProposals(relationship);
    const separate = after.filter((p) => p.id !== direction);
    console.log(`[RC7-E3-5 separate readback] ${JSON.stringify(after)}`);
    test.info().annotations.push({
      type: "RC7-E3-5 separate readback",
      description: JSON.stringify(after),
    });
    expect(after).toHaveLength(2);
    expect(separate).toHaveLength(1);
    expect(page.url()).toContain(`/drafting/${separate[0].id}`);
    expect(separate[0]).toMatchObject({
      kind: "design_services",
      state: "draft",
      parentProposalId: null,
      designerClientId: relationship,
      isDiscoverySeed: false,
    });
    // The Direction is untouched: still the seed, still an open draft.
    expect(after.find((p) => p.id === direction)).toMatchObject({
      state: "draft",
      isDiscoverySeed: true,
    });
  } finally {
    removeProbe();
  }
});
