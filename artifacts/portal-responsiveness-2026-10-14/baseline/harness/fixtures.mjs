// SQ-966 (US-34 F17): fixture setup and teardown for the write scenarios P6-P9.
// LOCAL Supabase only. Every statement goes through psql to PGURL, and the module refuses any
// host that is not 127.0.0.1/localhost. Each fixture is created before one run and removed (or
// restored from its snapshot) after it, so the shared local database ends as it began.
//
//   P6  one project_tasks row (section_key 'project') on Aspen Loft, ticked then unticked; deleted.
//   P7  Marrow & Vale's "Procurement & Orders" (in_progress) and its successor are snapshotted, the
//       phase is completed through the UI, and both rows are restored from the snapshot.
//   P8  a room named FIXTURE_ROOM is added through the UI; every row with that name is deleted.
//   P9  one outbound_drafts row (awaiting_review, email, to an RFC 2606 .invalid address) is
//       edited in the ready-to-send sheet up to "Sending". The send request is blocked in the
//       browser (lab.mjs). Teardown asserts the row was never claimed or sent, then deletes it.
import { execFileSync } from 'node:child_process';

export const PGURL = process.env.PGURL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/@(127\.0\.0\.1|localhost):\d+\//.test(PGURL)) throw new Error(`fixtures: refusing non-local database ${PGURL.replace(/:[^:@/]*@/, ':***@')}`);

export const PROJECT = 'b0000000-0000-0000-0000-0000000000d1'; // Aspen Loft Refresh (Leah)
export const STUDIO = 'b0000000-0000-0000-0000-000000000001'; // Local Dev Studio
// P7 runs on Marrow & Vale: Aspen Loft's live phases cannot advance locally (one has an
// unresolved blocker, the other hits "multiple live main phases"), so its click only measures a
// refusal. Marrow & Vale's thread phase completes and activates exactly one successor.
export const PHASE_PROJECT = 'b0000000-0000-0000-0000-0000000000d4'; // Marrow & Vale Residence (Leah)
export const PHASE = 'b0000000-0000-0000-0000-00000005c704'; // Procurement & Orders (thread, in_progress)
export const PHASE_NEXT = 'b0000000-0000-0000-0000-00000005c705'; // its successor (pending)
export const TASK_ID = 'e9660000-0000-0000-0000-000000000006';
export const TASK_TITLE = 'SQ-966 perf fixture task';
export const FIXTURE_ROOM = 'SQ-966 perf room';
export const DRAFT_ID = 'e9660000-0000-0000-0000-000000000009';

function sql(text) {
  return execFileSync('psql', [PGURL, '-v', 'ON_ERROR_STOP=1', '-qAt', '-c', text], { encoding: 'utf8' }).trim();
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const FIX = {
  P6: {
    setup() {
      sql(`delete from public.project_tasks where id = ${q(TASK_ID)};
           insert into public.project_tasks (id, project_id, section_key, title, status, owner, sort_order)
           values (${q(TASK_ID)}, ${q(PROJECT)}, 'project', ${q(TASK_TITLE)}, 'todo', 'designer', 999);`);
      return { title: TASK_TITLE };
    },
    teardown() {
      sql(`delete from public.project_tasks where id = ${q(TASK_ID)};`);
      return { left: Number(sql(`select count(*) from public.project_tasks where id = ${q(TASK_ID)}`)) };
    },
  },
  P7: {
    setup() {
      const snap = sql(`select json_agg(to_jsonb(p)) from public.project_phases p where id in (${q(PHASE)}, ${q(PHASE_NEXT)})`);
      const rows = JSON.parse(snap);
      const cur = rows.find((r) => r.id === PHASE);
      if (!cur || cur.status !== 'in_progress') throw new Error(`P7 fixture: ${PHASE} is ${cur && cur.status}, expected in_progress`);
      return { snapshot: rows, phaseName: cur.name, project: PHASE_PROJECT };
    },
    teardown(state) {
      // Guard triggers only allow the RPC to move phases; the restore is a fixture write, so it
      // runs as the local superuser with triggers off for this transaction only.
      const restore = state.snapshot.map((r) => `update public.project_phases t set
          status = s.status, progress = s.progress, completed_at = s.completed_at, start_date = s.start_date,
          target_end_date = s.target_end_date, updated_at = s.updated_at
        from jsonb_populate_record(null::public.project_phases, ${q(JSON.stringify(r))}::jsonb) s where t.id = s.id;`).join('\n');
      sql(`begin; set local session_replication_role = replica; ${restore} commit;`);
      const now = JSON.parse(sql(`select json_agg(json_build_object('id', id, 'status', status)) from public.project_phases where id in (${q(PHASE)}, ${q(PHASE_NEXT)})`));
      const ok = state.snapshot.every((r) => now.find((n) => n.id === r.id)?.status === r.status);
      if (!ok) throw new Error(`P7 teardown: phases not restored ${JSON.stringify(now)}`);
      return { restored: now };
    },
  },
  P8: {
    setup() {
      sql(`delete from public.project_rooms where project_id = ${q(PROJECT)} and name = ${q(FIXTURE_ROOM)};`);
      return { room: FIXTURE_ROOM };
    },
    teardown() {
      const n = sql(`with d as (delete from public.project_rooms where project_id = ${q(PROJECT)} and name = ${q(FIXTURE_ROOM)} returning 1) select count(*) from d`);
      return { deleted: Number(n) };
    },
  },
  P9: {
    setup() {
      sql(`delete from public.outbound_drafts where id = ${q(DRAFT_ID)};
           insert into public.outbound_drafts (id, organization_id, project_id, kind, channel, recipient_kind, to_address,
             subject, body, payload, ref_type, ref_id, composed_by, dedupe_key, status)
           values (${q(DRAFT_ID)}, ${q(STUDIO)}, ${q(PROJECT)}, 'client_digest', 'email', 'client', 'perf-fixture@example.invalid',
             'SQ-966 perf fixture', 'A perf fixture draft. It is never sent.', '{}'::jsonb, 'project', ${q(PROJECT)},
             'system', 'sq966-perf-p9', 'awaiting_review');`);
      return { draft: DRAFT_ID };
    },
    teardown() {
      const row = JSON.parse(sql(`select coalesce(json_agg(json_build_object('status', status, 'claimed_at', claimed_at, 'sent_at', sent_at,
        'send_attempted_at', send_attempted_at, 'message_id', message_id, 'edited_at', edited_at)), '[]') from public.outbound_drafts where id = ${q(DRAFT_ID)}`))[0] || null;
      sql(`delete from public.outbound_drafts where id = ${q(DRAFT_ID)};`);
      const neverSent = !!row && row.status === 'awaiting_review' && !row.claimed_at && !row.sent_at && !row.send_attempted_at && !row.message_id;
      if (!neverSent) throw new Error(`P9 teardown: fixture draft was claimed or sent ${JSON.stringify(row)}`);
      return { neverSent, edited: !!row.edited_at };
    },
  },
};

export const hasFixture = (name) => Object.hasOwn(FIX, name);

/** Runs fn(state) between the scenario's setup and teardown; teardown always runs. */
export async function withFixture(name, fn) {
  const f = FIX[name];
  const state = f.setup();
  let result;
  let failure;
  try { result = await fn(state); } catch (e) { failure = e; }
  const teardown = f.teardown(state);
  if (failure) throw failure;
  return { ...result, fixture: { name, teardown } };
}
