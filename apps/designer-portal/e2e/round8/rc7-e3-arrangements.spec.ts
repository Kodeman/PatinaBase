import { test, expect } from "../fixtures/auth";
import { psqlAsUserRow, psqlRows, psqlRun, psqlScalar } from "../helpers/psql";

const DESIGNER = "f0180000-0000-4000-8000-000000000002";
const OUTSIDER = "f0180000-0000-4000-8000-000000000003";
const STUDIO = "f0180000-0000-4000-8000-000000000001";
const TITLE = "RC7 E3 arrangement refusal fixture";
const proposalId = (n: number) =>
  `e3000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const requestId = (n: number) =>
  `e3000001-0000-4000-8000-${String(n).padStart(12, "0")}`;

function ownedStack() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  if (
    api.hostname !== "127.0.0.1" ||
    api.port !== (process.env.RC7_E3_API_PORT ?? "56121") ||
    db.hostname !== "127.0.0.1" ||
    db.port !== (process.env.RC7_E3_DB_PORT ?? "56122")
  ) {
    throw new Error("RC7-E3 refuses an unowned arrangement stack");
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

function seed(id: string) {
  ownedStack();
  psqlRun(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.proposals WHERE id='${id}') THEN
      RAISE EXCEPTION 'RC7-E3 arrangement fixture ID occupied'; END IF;
    END $$;
    INSERT INTO public.proposals (id,designer_id,studio_id,title,status,document_kind,commercial_state)
    VALUES ('${id}','${DESIGNER}','${STUDIO}','${TITLE}','draft','design_services','draft');`);
}

function cleanup(id: string) {
  ownedStack();
  psqlRun(`BEGIN;
    DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.proposals WHERE id='${id}' AND
      (designer_id IS DISTINCT FROM '${DESIGNER}'::uuid OR studio_id IS DISTINCT FROM '${STUDIO}'::uuid
       OR title IS DISTINCT FROM '${TITLE}')) THEN
      RAISE EXCEPTION 'RC7-E3 arrangement fixture owner mismatch'; END IF;
    END $$;
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.proposal_service_arrangement_applications
      WHERE proposal_id='${id}' AND created_by='${DESIGNER}';
    SET LOCAL session_replication_role = origin;
    DELETE FROM public.proposal_agreement_parts WHERE proposal_id='${id}';
    DELETE FROM public.proposal_service_rates WHERE proposal_id='${id}';
    DELETE FROM public.proposal_service_terms WHERE proposal_id='${id}';
    SET LOCAL session_replication_role = replica;
    DELETE FROM public.agreement_part_events WHERE proposal_id='${id}';
    SET LOCAL session_replication_role = origin;
    DELETE FROM public.proposals WHERE id='${id}' AND designer_id='${DESIGNER}' AND title='${TITLE}';
    COMMIT;`);
}

test("A04 C2 refuses unavailable arrangement for designer and denies a non-author", async () => {
  const id = proposalId(401);
  seed(id);
  try {
    expect(
      psqlScalar(
        "SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'",
      ),
    ).toBe("t");
    expect(
      psqlScalar(
        "SELECT has_function_privilege('authenticated','public.apply_service_arrangement(uuid,text,uuid)','EXECUTE')",
      ),
    ).toBe("t");
    expect(() =>
      psqlAsUserRow(
        DESIGNER,
        `SELECT public.apply_service_arrangement('${id}','rc7-e3-missing', '${requestId(401)}');`,
      ),
    ).toThrow(/arrangement_not_found/);
    expect(() =>
      psqlAsUserRow(
        OUTSIDER,
        `SELECT public.apply_service_arrangement('${id}','rc7-e3-missing', '${requestId(402)}');`,
      ),
    ).toThrow(/scope_proposal_access_denied/);
    expect(
      psqlScalar(
        `SELECT count(*) FROM public.proposal_service_arrangement_applications WHERE proposal_id='${id}'`,
      ),
    ).toBe("0");
  } finally {
    cleanup(id);
  }
});

test("A04 actual Patina Six arrangement applies once and replays without duplicate phases", async () => {
  const id = proposalId(410);
  const request = requestId(410);
  seed(id);
  try {
    expect(
      psqlScalar(
        "SELECT count(*) FROM public.service_arrangements WHERE arrangement_key='patina_six' AND version=1 AND phase_template_slug='patina_six'",
      ),
    ).toBe("1");
    const first = JSON.parse(
      psqlAsUserRow(
        DESIGNER,
        `SELECT public.apply_service_arrangement('${id}','patina_six','${request}');`,
      )[0]!,
    );
    const replay = JSON.parse(
      psqlAsUserRow(
        DESIGNER,
        `SELECT public.apply_service_arrangement('${id}','patina_six','${request}');`,
      )[0]!,
    );
    expect(first).toMatchObject({ arrangementKey: "patina_six", arrangementVersion: 1, replayed: false });
    expect(replay).toMatchObject({ arrangementKey: "patina_six", arrangementVersion: 1, replayed: true });
    expect(replay.phaseIds).toEqual(first.phaseIds);
    expect(replay.partKeys).toEqual(first.partKeys);
    expect(first.phaseIds).toHaveLength(
      Number(psqlScalar("SELECT jsonb_array_length(phases) FROM public.phase_templates WHERE slug='patina_six'")),
    );
    expect(
      psqlRows(`SELECT id::text FROM public.proposal_phases WHERE proposal_id='${id}' ORDER BY id`).map(([phaseId]) => phaseId),
    ).toEqual([...first.phaseIds].sort());
    expect(
      psqlScalar(
        `SELECT count(*) FROM public.proposal_service_arrangement_applications WHERE proposal_id='${id}' AND request_id='${request}' AND arrangement_version=1 AND phase_ids @> ARRAY[${first.phaseIds.map((phaseId: string) => `'${phaseId}'::uuid`).join(",")}]`,
      ),
    ).toBe("1");
    expect(
      psqlScalar(`SELECT count(*) FROM public.proposal_phase_template_applications WHERE proposal_id='${id}'`),
    ).toBe("1");
  } finally {
    cleanup(id);
  }
});
