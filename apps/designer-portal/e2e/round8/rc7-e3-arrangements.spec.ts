import { test, expect } from '../fixtures/auth';
import { psqlScalar } from '../helpers/psql';

function ownedStack() {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const db = new URL(process.env.SUPABASE_DB_URL ?? '');
  if (api.hostname !== '127.0.0.1' || api.port !== '56121' ||
      db.hostname !== '127.0.0.1' || db.port !== '56122') {
    throw new Error('RC7-E3 refuses an unowned arrangement stack');
  }
  expect(psqlScalar('SELECT system_identifier::text FROM pg_control_system()')).toBe('7702029588411166762');
}

test('A04 activated C2 reports the actual arrangement catalog and leaves existing editions untouched', async () => {
  ownedStack();
  expect(psqlScalar("SELECT enabled FROM public.server_capabilities WHERE key='scope_editions'"))
    .toBe('t');
  expect(psqlScalar("SELECT has_function_privilege('authenticated','public.apply_service_arrangement(uuid,text,uuid)','EXECUTE')"))
    .toBe('t');
  // A catalog entry must be an actual versioned service arrangement. UI labels
  // are not presets; synthetic arrangements in SQL tests cannot replace them.
  expect(psqlScalar('SELECT count(*) FROM public.service_arrangements')).toBe('0');
  expect(psqlScalar('SELECT count(*) FROM public.proposal_service_arrangement_applications')).toBe('0');
  expect(psqlScalar('SELECT count(*) FROM public.project_scope_editions')).toBe('0');
});

// DEFECT RC7-e3-1: no actual service arrangements exist to apply/repeat on C2.
test.fixme('A04 apply and replay every actual arrangement without editing signed editions or access', async () => {
  ownedStack();
  expect(Number(psqlScalar('SELECT count(DISTINCT arrangement_key) FROM public.service_arrangements')))
    .toBeGreaterThanOrEqual(4);
});
