import { test, expect } from "../fixtures/auth";
import { psqlScalar } from "../helpers/psql";

// A14 requires five genuinely addressed subject/audience paths and a controlled
// failure or unknown delivery result. Private notes and client drafts alone are
// already exercised by audience-work.spec.ts; repeating those as if they proved
// maker, GC and supplier delivery would hide the missing acceptance branches.
test.fixme("A14 private, client, maker, GC and supplier paths survive uncertain send and retry", async () => {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const db = new URL(process.env.SUPABASE_DB_URL ?? "");
  expect(`${api.hostname}:${api.port}`).toBe("127.0.0.1:56121");
  expect(`${db.hostname}:${db.port}`).toBe("127.0.0.1:56122");
  const expected = process.env.RC7_E3_SYSTEM_IDENTIFIER;
  if (!expected || !/^\d+$/.test(expected)) {
    throw new Error(
      "RC7-E3 requires the cluster identifier captured at stack start",
    );
  }
  expect(
    psqlScalar("SELECT system_identifier::text FROM pg_control_system()"),
  ).toBe(expected);
  expect(
    psqlScalar(`SELECT count(DISTINCT recipient_kind) FROM outbound_drafts
    WHERE project_id='f0180000-0000-4000-8000-000000000010'`),
  ).toBe("3");
});
