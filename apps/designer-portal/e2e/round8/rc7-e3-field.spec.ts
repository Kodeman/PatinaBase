import { test, expect } from "../fixtures/auth";
import {
  psqlAsUser,
  psqlAsUserRow,
  psqlScalar,
  psqlRun,
} from "../helpers/psql";

const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const STUDIO = "f0180000-0000-4000-8000-000000000001";
const JOB = "f0180000-0000-4000-8000-000000000010";
const ROOM = "f0180000-0000-4000-8000-000000000011";
const TOKEN = "e3000000-0000-4000-8000-000000000101";
const NOTE = "e3000000-0000-4000-8000-000000000102";
const BODY =
  "RC7 E3 fictional field observation: verify print A-101 before proceeding.";

function ownedStack() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (
    api.hostname !== "127.0.0.1" ||
    api.port !== (process.env.RC7_E3_API_PORT ?? "56121") ||
    db.hostname !== "127.0.0.1" ||
    db.port !== (process.env.RC7_E3_DB_PORT ?? "56122")
  ) {
    throw new Error("RC7-E3 refuses a database outside its owned stack");
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

function removeObservation() {
  ownedStack();
  psqlRun(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.margin_notes WHERE id='${NOTE}' AND designer_id IS DISTINCT FROM '${DESIGNER}'::uuid)
      OR EXISTS (SELECT 1 FROM public.field_captures WHERE client_capture_id='${TOKEN}' AND designer_id IS DISTINCT FROM '${DESIGNER}'::uuid)
      OR EXISTS (SELECT 1 FROM public.products WHERE name='RC7 E3 field observation' AND capture_source='field_capture'
        AND owner_user_id IS DISTINCT FROM '${DESIGNER}'::uuid)
    THEN RAISE EXCEPTION 'RC7-E3 observation has a different owner'; END IF;
  END $$;
  DELETE FROM public.margin_notes WHERE id='${NOTE}';
  DELETE FROM public.project_products WHERE product_id IN
    (SELECT id FROM public.products WHERE name='RC7 E3 field observation' AND capture_source='field_capture' AND owner_user_id='${DESIGNER}');
  DELETE FROM public.products WHERE name='RC7 E3 field observation' AND capture_source='field_capture' AND owner_user_id='${DESIGNER}';
  DELETE FROM public.field_captures WHERE client_capture_id='${TOKEN}';`);
}

test("A15 real Field RPC and Field note write retain room and author; a capture retry is idempotent", async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(240_000);
  ownedStack();
  removeObservation();
  try {
    const prior = psqlScalar(`SELECT jsonb_build_object(
      'tasks', (SELECT count(*) FROM project_tasks WHERE project_id='${JOB}' AND status='completed'),
      'prints', (SELECT count(*) FROM plan_prints p JOIN plan_sheets s ON s.id=p.sheet_id WHERE s.project_id='${JOB}'),
      'decisions', (SELECT count(*) FROM client_decisions WHERE project_id='${JOB}'),
      'outbound', (SELECT count(*) FROM outbound_drafts WHERE project_id='${JOB}'))::text`);
    // SupabaseCaptureGateway.commit → public.commit_field_capture, with the
    // exact camelCase payload used by FieldCapturePayload. No route interception.
    psqlAsUser(
      DESIGNER,
      `SELECT public.commit_field_capture('${TOKEN}', 'library',
      '{"schemaVersion":4,"captureKind":"note","title":"RC7 E3 field observation","notes":"${BODY}","photos":[],"confirmations":{},"proposals":{}}'::jsonb,
      '${JOB}', '${ROOM}', NULL, '${STUDIO}');`,
    );
    const capture =
      psqlScalar(`SELECT jsonb_build_object('designer',designer_id,'project',project_id,
      'room',project_room_id,'kind',capture_kind,'notes',notes,'status',status)::text
      FROM field_captures WHERE client_capture_id='${TOKEN}'`);
    expect(JSON.parse(capture)).toMatchObject({
      designer: DESIGNER,
      project: JOB,
      room: ROOM,
      kind: "note",
      notes: BODY,
      status: "saved",
    });
    const captureId = psqlScalar(
      `SELECT id FROM field_captures WHERE client_capture_id='${TOKEN}'`,
    );
    // Negative branch: the Field sync retries the same client_capture_id. The
    // retry must be a no-op: same capture, created=false, no second row and
    // no second minted library product.
    const products = () =>
      psqlScalar(`SELECT count(*) FROM products WHERE name='RC7 E3 field observation'
        AND capture_source='field_capture' AND owner_user_id='${DESIGNER}'`);
    const productsBefore = products();
    const [replay] = psqlAsUserRow(
      DESIGNER,
      `SELECT public.commit_field_capture('${TOKEN}', 'library',
      '{"schemaVersion":4,"captureKind":"note","title":"RC7 E3 field observation","notes":"${BODY}","photos":[],"confirmations":{},"proposals":{}}'::jsonb,
      '${JOB}', '${ROOM}', NULL, '${STUDIO}')::text;`,
    );
    expect(JSON.parse(replay!)).toMatchObject({
      capture_id: captureId,
      created: false,
      status: "saved",
    });
    expect(
      psqlScalar(
        `SELECT count(*) FROM field_captures WHERE client_capture_id='${TOKEN}'`,
      ),
    ).toBe("1");
    expect(products()).toBe(productsBefore);
    // Exercise the server note insert as the designer; this does not run the
    // Swift sync service or assert its encoded request.
    psqlAsUser(
      DESIGNER,
      `INSERT INTO public.margin_notes
      (id,project_id,designer_id,body,anchor_kind,field_capture_id)
      VALUES ('${NOTE}','${JOB}','${DESIGNER}','${BODY}','letterhead','${captureId}');`,
    );
    expect(
      JSON.parse(
        psqlScalar(`SELECT jsonb_build_object('project',project_id,'author',designer_id,
      'capture',field_capture_id,'body',body)::text FROM margin_notes WHERE id='${NOTE}'`),
      ),
    ).toMatchObject({
      project: JOB,
      author: DESIGNER,
      capture: captureId,
      body: BODY,
    });
    await page.goto(`/doc/${JOB}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-document-shell]")).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    await expect(page.locator("html")).not.toHaveClass(
      /\barr-(?:pre|on|press)\b/,
    );
    if ((page.viewportSize()?.width ?? 1440) < 1180) {
      await page.getByRole("button", { name: "More studio actions" }).click();
      await page
        .getByRole("group", { name: "In this document" })
        .getByRole("button", { name: /^Margin/ })
        .click();
      const row = page
        .locator("[data-margin-row]")
        .filter({ hasText: "RC7 E3 fictional field observation" });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("button").first().click();
    } else {
      const note = page
        .getByRole("complementary", { name: /^(?:In the margin|Margin)$/ })
        .getByRole("button", {
          name: /Note RC7 E3 fictional field observation/,
        });
      await expect(note).toBeVisible({ timeout: 30_000 });
      await note.click();
    }
    await expect(
      page.locator("p").filter({ hasText: BODY }).last(),
    ).toBeVisible();
    expect(
      psqlScalar(
        `SELECT project_room_id FROM field_captures WHERE id='${captureId}'`,
      ),
    ).toBe(ROOM);
    expect(
      psqlScalar(`SELECT jsonb_build_object(
      'tasks', (SELECT count(*) FROM project_tasks WHERE project_id='${JOB}' AND status='completed'),
      'prints', (SELECT count(*) FROM plan_prints p JOIN plan_sheets s ON s.id=p.sheet_id WHERE s.project_id='${JOB}'),
      'decisions', (SELECT count(*) FROM client_decisions WHERE project_id='${JOB}'),
      'outbound', (SELECT count(*) FROM outbound_drafts WHERE project_id='${JOB}'))::text`),
    ).toBe(prior);
  } finally {
    removeObservation();
  }
});

function seedDefectObservation() {
  removeObservation();
  psqlAsUser(
    DESIGNER,
    `SELECT public.commit_field_capture('${TOKEN}', 'library',
      '{"schemaVersion":4,"captureKind":"note","title":"RC7 E3 field observation","notes":"${BODY}","photos":[],"confirmations":{},"proposals":{}}'::jsonb,
      '${JOB}', '${ROOM}', NULL, '${STUDIO}');`,
  );
  const captureId = psqlScalar(
    `SELECT id FROM field_captures WHERE client_capture_id='${TOKEN}'`,
  );
  psqlAsUser(
    DESIGNER,
    `INSERT INTO public.margin_notes
      (id,project_id,designer_id,body,anchor_kind,field_capture_id)
      VALUES ('${NOTE}','${JOB}','${DESIGNER}','${BODY}','letterhead','${captureId}');`,
  );
}

// RC7-E3-2: REST proves server acceptance of project_room; scope/next-owner columns deferred
test.fixme("A15 Field observation records its typed room subject", async ({
  authenticatedPage: page,
}) => {
  ownedStack();
  removeObservation();
  try {
    psqlAsUser(
      DESIGNER,
      `SELECT public.commit_field_capture('${TOKEN}', 'library',
      '{"schemaVersion":4,"captureKind":"note","title":"RC7 E3 field observation","notes":"${BODY}","photos":[],"confirmations":{},"proposals":{}}'::jsonb,
      '${JOB}', '${ROOM}', NULL, '${STUDIO}');`,
    );
    const captureId = psqlScalar(
      `SELECT id FROM field_captures WHERE client_capture_id='${TOKEN}'`,
    );
    const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const login = await page.request.post(
      `${api}/auth/v1/token?grant_type=password`,
      {
        headers: { apikey: key },
        data: {
          email: process.env.DESIGNER_E2E_EMAIL ?? "designer@patina.dev",
          password: process.env.DESIGNER_E2E_PASSWORD ?? "password123",
        },
      },
    );
    expect(login.ok()).toBe(true);
    const { access_token } = (await login.json()) as { access_token: string };
    const write = await page.request.post(`${api}/rest/v1/margin_notes`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${access_token}`,
        Prefer: "return=representation",
      },
      data: {
        id: NOTE,
        project_id: JOB,
        designer_id: DESIGNER,
        body: BODY,
        anchor_kind: "letterhead",
        field_capture_id: captureId,
        subject_kind: "project_room",
        subject_id: ROOM,
      },
    });
    expect(write.status()).toBe(201);
    expect(
      JSON.parse(
        psqlScalar(`SELECT jsonb_build_object(
      'subject_kind',subject_kind,'subject_id',subject_id)::text
      FROM public.margin_notes WHERE id='${NOTE}'`),
      ),
    ).toEqual({
      subject_kind: "project_room",
      subject_id: ROOM,
    });
  } finally {
    removeObservation();
  }
});

// Was DEFECT RC7-E3-3 (raw UUID room link); fixed by f9e2c941d and
// 00902_round8_note_context_labels.sql, which label the room by its name.
test("A15 Field observation links to the room by its human name", async ({
  authenticatedPage: page,
}) => {
  ownedStack();
  seedDefectObservation();
  try {
    await page.goto(`/doc/${JOB}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-document-shell]")).toHaveAttribute(
      "data-arrival-ready",
      "",
      { timeout: 60_000 },
    );
    if ((page.viewportSize()?.width ?? 1440) < 1180) {
      await page.getByRole("button", { name: "More studio actions" }).click();
      await page
        .getByRole("group", { name: "In this document" })
        .getByRole("button", { name: /^Margin/ })
        .click();
      const row = page
        .locator("[data-margin-row]")
        .filter({ hasText: "RC7 E3 fictional field observation" });
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.getByRole("button").first().click();
    } else {
      const note = page
        .getByRole("complementary", { name: /^(?:In the margin|Margin)$/ })
        .getByRole("button", {
          name: /Note RC7 E3 fictional field observation/,
        });
      await expect(note).toBeVisible({ timeout: 30_000 });
      await note.click();
    }
    await expect(
      page.getByRole("link", { name: "Return to room · Living Room" }),
    ).toBeVisible();
  } finally {
    removeObservation();
  }
});
