// The homeowner's world (US-3 P23/P24), on the same fixture the trade rail uses.
//
// THIS FILE IS THE TS-SIDE MODEL OF apply_client_effect (00651, repaired by
// 00652), and contract P14 is what makes it worth writing: the pipeline decides
// what to do with every answer that function can give, so the answers have to be
// modelled here in the SAME ORDER and with the SAME NAMES the migration raises
// them under. A refusal this file cannot produce is a refusal nothing tests, and
// a refusal it produces that SQL does not is a test asserting a fiction.
//
// The order below is the migration's own numbering:
//   0  no source SID                      → 23514
//   1  unknown prompt                     → 23514
//   2  same SID again                     → status replayed
//   3  unknown effect                     → 22023 · effect answers another kind → 23514
//   4  answered/voided → closed · expired → expired
//   5  capability: wrong project / expired-or-revoked / none → 42501 (three names)
//   6  invitation revoked or superseded    → 42501 letter_revoked
//   7  approve_selection: no batch → 23514 · not this party's → batch_not_addressed
//      · closed batch → closed · no payload.version → 22023 · version moved →
//      stale_version · per decision: missing → 23514, other project / other
//      household / not a client selection / approval contract → 42501, not
//      exactly one recommended option → 23514
//   8  select_window: no payload.option → 22023 · SID already on another answer
//      → sid_already_recorded
//
// What it deliberately does NOT model is the SQL half of the same contract: RLS,
// the grant matrix, the consumed_sid unique index and the real locking. Those are
// supabase/tests/field/apply_client_effect_test.sql's, and this fixture is not
// evidence about them.

import { inboundFixture } from "./inbound-fixture.ts";
import { CLIENT_LINK_ACTIONS } from "../../client-invite/lib.ts";

/** A number that holds ONE seat, and that seat is a homeowner's. */
export const CLIENT_PHONE = "+15550102040";
export const CLIENT_ROOM = "Living room";

const FAR_FUTURE = "2027-02-01T00:00:00.000Z";

function pgError(code: string, message: string) {
  return { code, message, details: null, hint: null };
}

export interface ClientFixtureOptions {
  now?: Date;
  env?: Record<string, string>;
  /** Start with no capability at all (the phone-only page unreachable case). */
  noCapability?: boolean;
}

export interface DeliveryProposal {
  subjectId?: string;
  /** 'task' | 'coordination' | 'purchase_order' — 00643's own CHECK. */
  subjectKind?: "task" | "coordination" | "purchase_order";
  /** What the studio called the piece. */
  title?: string;
  /** The windows it wrote down, in the order it wrote them. */
  windows?: Array<{ date?: string | null; window?: string | null }>;
}

export function clientFixture(options: ClientFixtureOptions = {}) {
  const fixture = inboundFixture(undefined, options.now, {
    FIELD_LINE_PHASE: "2",
    FIELD_LINE_CAMPAIGN_APPROVED: "1",
    CLIENT_PORTAL_URL: "https://client.patina.cloud",
    ...options.env,
  });
  const { h } = fixture;
  const uses: Array<Record<string, unknown>> = [];
  let mints = 0;

  h.fake._data.project_parties.push({
    id: "party-c",
    project_id: "project-a",
    phone_e164: CLIENT_PHONE,
    party_kind: "client",
    display_name: "Adaeze Okonkwo",
  });
  // The kickoff box, as record_channel_invite writes it: pending, with HOW she
  // said yes and WHO wrote it down (SQ-16 SQL case 8).
  h.fake._data.studio_channel_consent.push({
    organization_id: "studio-a",
    channel_kind: "sms",
    channel_value: CLIENT_PHONE,
    status: "pending",
    refusal_unanswered: false,
    source: "kickoff_checkbox",
    evidence: "Kickoff consent box ticked in Patina, 19 September 2026.",
    recorded_at: "2026-10-01T00:00:00.000Z",
    disclosure_version: "field-sms-v1",
    recorded_by: "studio-a",
  });
  h.fake._data.client_invitations = [{
    id: "inv-c",
    project_id: "project-a",
    phone: CLIENT_PHONE,
    designer_client_id: "household-1",
    revoked_at: null,
    superseded_by: null,
    accepted_at: null,
    sent_at: "2026-10-01T00:00:00.000Z",
    expires_at: FAR_FUTURE,
    kind: "invite",
  }];
  h.fake._data.client_links = options.noCapability ? [] : [{
    id: "cl-1",
    invitation_id: "inv-c",
    project_id: "project-a",
    party_id: "party-c",
    token_hash: "f".repeat(64),
    status: "active",
    last_used_at: null,
    expires_at: FAR_FUTURE,
    created_at: "2026-10-01T00:00:00.000Z",
    scope: {
      project_id: "project-a",
      party_id: "party-c",
      invitation_id: "inv-c",
      actions: [...CLIENT_LINK_ACTIONS],
    },
  }];
  h.fake._data.project_rooms = [{ id: "room-1", name: CLIENT_ROOM, project_id: "project-a" }];
  h.fake._data.client_decisions = [{
    id: "dec-1",
    project_id: "project-a",
    designer_client_id: "household-1",
    coordination_kind: "selection",
    court: "client",
    status: "pending",
    approval_contract: null,
    title: "Living room sofa",
    room_id: "room-1",
    recommended_option_id: "opt-1",
    selected_by: null,
    created_at: "2026-10-02T00:00:00.000Z",
  }];
  h.fake._data.client_decision_options = [
    { id: "opt-1", decision_id: "dec-1", is_recommended: true, sort_order: 1, label: "Linen" },
    { id: "opt-2", decision_id: "dec-1", is_recommended: false, sort_order: 2, label: "Bouclé" },
  ];
  h.fake._data.client_decision_batches = [];
  h.fake._data.client_link_uses = [];
  h.fake._data.delivery_availability = [];
  h.fake._data.decision_events = [];

  // 00652's client copy, seeded from the migration's own literals — the fixture
  // never writes the words it asserts.
  const clientSql = Deno.readTextFileSync(
    new URL("../../../migrations/00652_field_line_client_templates.sql", import.meta.url),
  );
  const canonical = Deno.readTextFileSync(
    new URL("../../../migrations/00641_field_line_effects_templates.sql", import.meta.url),
  );
  const closing = canonical.match(/v_closing\s+CONSTANT\s+text\s*:=\s*'([^']*)'/)![1];
  const clientBlock = clientSql.slice(
    clientSql.indexOf("-- <<< FIELD LINE CLIENT COPY BLOCK"),
    clientSql.indexOf("-- >>> FIELD LINE CLIENT COPY BLOCK"),
  );
  const TUPLE =
    /\(\s*'(sms_[a-z_]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)/g;
  for (const m of clientBlock.matchAll(TUPLE)) {
    h.fake._data.email_templates.push({
      slug: m[1],
      is_active: true,
      html_content: `${m[3].replace(/''/g, "'")} ${closing}`,
    });
  }
  // The ordinary reply shape sms-inbound dispatches an acknowledgement through.
  h.fake._data.email_templates.push({
    slug: "sms_inbound_reply",
    is_active: true,
    html_content: `{{studio_name}}: {{message}} ${closing}`,
  });

  /** An open batch for the homeowner, presented today. */
  const batch = (overrides: Record<string, unknown> = {}) => {
    const row = {
      id: "batch-1",
      project_id: "project-a",
      party_id: "party-c",
      decision_ids: ["dec-1"],
      version: 1,
      presented_at: h.clock.toISOString(),
      presented_local_day: "2026-11-01",
      presented_snapshot: { room_id: "room-1", decisions: [{ id: "dec-1", option_id: "opt-1" }] },
      reminder_sent_at: null,
      closed_at: null,
      ...overrides,
    };
    (h.fake._data.client_decision_batches ??= []).push(row);
    return row;
  };

  /** Her reference, in the shape sms_create_prompt writes one. */
  const ask = (overrides: Record<string, unknown> = {}) =>
    fixture.prompt({
      id: "prompt-c",
      party_id: "party-c",
      project_id: "project-a",
      kind: "selection_batch",
      subject_id: "batch-1",
      short_code: "31",
      version: 1,
      recipient_phone: CLIENT_PHONE,
      ...overrides,
    });

  /**
   * A DELIVERY WITH WINDOWS ON THE RECORD (US-3 P23). The only place the studio
   * proposes one is field_delivery_reports.proposed_date / proposed_window
   * (00641), one row per proposal, keyed by the same (subject_kind, subject_id)
   * pair delivery_availability answers against — so two rows on one subject are
   * the two windows a card offers.
   *
   * OPT-IN ON PURPOSE: the default fixture proposes nothing, because a truck on
   * the way is a fact about one case and not about every client case, and a seed
   * here would put a second text in every phase-2 case's tick.
   */
  const delivery = (options: DeliveryProposal = {}) => {
    const subjectKind = options.subjectKind ?? "task";
    const subjectId = options.subjectId ?? "task-delivery";
    const title = options.title ?? "Living room sofa";
    const windows = options.windows ?? [
      { date: "2026-11-03", window: "2-4" },
      { date: "2026-11-05", window: "morning" },
    ];
    // The subject itself, in the table 00643's CHECK points that kind at: the
    // card prints what the studio called the piece, so something has to have
    // been called something. owner_party_id is null for a task, because a
    // delivery subject is not a crew member's assignment and must not turn up on
    // anyone's digest.
    if (subjectKind === "task") {
      (h.fake._data.project_tasks ??= []).push({
        id: subjectId,
        project_id: "project-a",
        owner_party_id: null,
        title,
        due_date: null,
        status: "todo",
      });
    } else if (subjectKind === "coordination") {
      h.fake._data.client_decisions.push({
        id: subjectId,
        project_id: "project-a",
        designer_client_id: "household-1",
        coordination_kind: "delivery",
        court: "studio",
        status: "pending",
        title,
        created_at: "2026-10-02T00:00:00.000Z",
      });
    } else {
      (h.fake._data.purchase_orders ??= []).push({
        id: subjectId,
        project_id: "project-a",
        sidemark: title,
        po_number: "PO-1",
      });
    }
    const rows = windows.map((proposal, index) => {
      const row = {
        id: `fdr-${subjectId}-${index + 1}`,
        project_id: "project-a",
        // The report is the crew's, written on the visit; the window inside it
        // is the studio's offer to her.
        party_id: "party-a",
        subject_kind: subjectKind,
        subject_id: subjectId,
        proposed_date: proposal.date ?? null,
        proposed_window: proposal.window ?? null,
        availability_at: `2026-11-01T1${index}:00:00.000Z`,
      };
      (h.fake._data.field_delivery_reports ??= []).push(row);
      return row;
    });
    return { subjectKind, subjectId, title, rows };
  };

  const rpc = h.fake.rpc;
  h.fake.rpc = async (name, args = {}) => {
    if (name === "create_client_link") {
      const invitation = h.fake._data.client_invitations
        .find((row) => row.id === args.p_invitation_id);
      if (!invitation) return { data: null, error: pgError("P0002", "unknown invitation") };
      for (const link of h.fake._data.client_links) {
        if (link.invitation_id === invitation.id && link.status === "active") {
          link.status = "revoked";
        }
      }
      mints += 1;
      const token = mints.toString(16).padStart(64, "c");
      const id = `cl-mint-${mints}`;
      const seats = h.fake._data.project_parties.filter((seat) =>
        seat.project_id === invitation.project_id && seat.phone_e164 === invitation.phone
      );
      const partyId = seats.length === 1 ? seats[0].id : null;
      h.fake._data.client_links.push({
        id,
        invitation_id: invitation.id,
        project_id: invitation.project_id,
        party_id: partyId,
        token_hash: token,
        status: "active",
        last_used_at: null,
        expires_at: FAR_FUTURE,
        created_at: h.clock.toISOString(),
        scope: {
          project_id: invitation.project_id,
          party_id: partyId,
          invitation_id: invitation.id,
          actions: (args.p_actions as string[]) ?? [...CLIENT_LINK_ACTIONS],
        },
      });
      return { data: [{ id, token }], error: null };
    }
    // THE ONLY READ PATH A TOKEN HOLDER HAS (00650:330-372). Every miss —
    // unknown, revoked, expired, blank — answers NULL, so the function is no
    // oracle for which tokens exist; a hit stamps last_used_at and audits the
    // action. The digest is SQL's business and is proven at rest in
    // supabase/tests/field/client_phone_identity_test.sql; this fixture keeps
    // the minted token in token_hash so a case can hold a credential at all.
    if (name === "resolve_client_link") {
      const token = typeof args.p_token === "string" ? args.p_token.trim() : "";
      if (!token) return { data: null, error: null };
      const link = h.fake._data.client_links.find((row) =>
        row.token_hash === token && row.status === "active" &&
        String(row.expires_at) > h.clock.toISOString()
      );
      if (!link) return { data: null, error: null };
      link.last_used_at = h.clock.toISOString();
      const use = {
        link_id: link.id,
        action: (typeof args.p_action === "string" ? args.p_action.trim() : "") || null,
        source: (typeof args.p_source === "string" ? args.p_source.trim() : "") || null,
      };
      uses.push(use);
      h.fake._data.client_link_uses.push(use);
      return {
        data: {
          link_id: link.id,
          invitation_id: link.invitation_id,
          project_id: link.project_id,
          party_id: link.party_id,
          scope: link.scope,
          expires_at: link.expires_at,
        },
        error: null,
      };
    }
    if (name !== "apply_client_effect") return rpc(name, args);

    const sid = String(args.p_source_sid ?? "").trim() || null;
    const effect = String(args.p_effect ?? "").trim() || null;
    const payload = (args.p_payload ?? {}) as Record<string, unknown>;
    const nowIso = h.clock.toISOString();

    // 0/1.
    if (!sid) {
      return { data: null, error: pgError("23514", "apply_client_effect: a source SID is required") };
    }
    const prompt = (h.fake._data.sms_prompts ?? []).find((row) => row.id === args.p_prompt_id);
    if (!prompt) {
      return { data: null, error: pgError("23514", "apply_client_effect: unknown prompt") };
    }
    // 2.
    if (prompt.consumed_sid && prompt.consumed_sid === sid) {
      return { data: { status: "replayed", result: prompt.consumption_result }, error: null };
    }
    // 3.
    if (!effect || !["approve_selection", "select_window"].includes(effect)) {
      return {
        data: null,
        error: pgError("22023", `apply_client_effect: unknown client effect ${effect ?? "<null>"}`),
      };
    }
    if (
      (effect === "approve_selection" && prompt.kind !== "selection_batch") ||
      (effect === "select_window" && prompt.kind !== "window_pick")
    ) {
      return {
        data: null,
        error: pgError("23514", `apply_client_effect: ${effect} does not answer a ${prompt.kind} prompt`),
      };
    }
    // 4.
    if (prompt.answered_at || prompt.voided_at) return { data: { status: "closed" }, error: null };
    if (String(prompt.expires_at) <= nowIso) return { data: { status: "expired" }, error: null };
    // 5. The capability, with 00652's both-copies-agree predicate.
    const links = h.fake._data.client_links.filter((row) => row.party_id === prompt.party_id);
    const names = (row: Record<string, unknown>) =>
      ((row.scope as { actions?: string[] })?.actions ?? []).includes(effect);
    const scopeProject = (row: Record<string, unknown>) =>
      (row.scope as { project_id?: string })?.project_id ?? null;
    const live = (row: Record<string, unknown>) =>
      row.status === "active" && String(row.expires_at) > nowIso;
    const link = links
      .filter((row) =>
        live(row) && names(row) &&
        row.project_id === prompt.project_id &&
        scopeProject(row) === prompt.project_id
      )
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!link) {
      if (
        links.some((row) =>
          live(row) && names(row) &&
          (scopeProject(row) !== null && scopeProject(row) !== prompt.project_id ||
            row.project_id !== prompt.project_id)
        )
      ) {
        return {
          data: null,
          error: pgError("42501", "apply_client_effect: capability_wrong_project — this capability speaks for another house"),
        };
      }
      if (
        links.some((row) =>
          names(row) && scopeProject(row) === prompt.project_id &&
          row.project_id === prompt.project_id && !live(row)
        )
      ) {
        return {
          data: null,
          error: pgError("42501", "apply_client_effect: capability_expired_or_revoked — the capability no longer opens anything"),
        };
      }
      return {
        data: null,
        error: pgError("42501", "apply_client_effect: no_capability — nothing authorizes this"),
      };
    }
    // 6.
    const invitation = h.fake._data.client_invitations.find((row) => row.id === link.invitation_id);
    if (!invitation || invitation.revoked_at || invitation.superseded_by) {
      return {
        data: null,
        error: pgError("42501", "apply_client_effect: letter_revoked — the invitation behind this capability has been revoked or superseded"),
      };
    }
    uses.push({ link_id: link.id, action: `apply_client_effect:${effect}`, source: `sms:${sid}` });
    h.fake._data.client_link_uses.push(uses[uses.length - 1]);

    let result: Record<string, unknown>;
    if (effect === "approve_selection") {
      // 7.
      const batchRow = (h.fake._data.client_decision_batches ?? [])
        .find((row) => row.id === prompt.subject_id);
      if (!batchRow) {
        return {
          data: null,
          error: pgError("23514", "apply_client_effect: this prompt names no selection batch"),
        };
      }
      if (batchRow.project_id !== prompt.project_id || batchRow.party_id !== prompt.party_id) {
        return {
          data: null,
          error: pgError("42501", `apply_client_effect: batch_not_addressed — batch ${batchRow.id} is not this party's ask on this project`),
        };
      }
      if (batchRow.closed_at) return { data: { status: "closed" }, error: null };
      if (typeof payload.version !== "number") {
        return {
          data: null,
          error: pgError("22023", "apply_client_effect: approve_selection requires payload.version, the batch version the reply was written against"),
        };
      }
      if (payload.version !== batchRow.version) {
        return {
          data: {
            status: "stale_version",
            result: {
              batch_id: batchRow.id,
              replied_version: payload.version,
              current_version: batchRow.version,
            },
          },
          error: null,
        };
      }
      batchRow.closed_at = nowIso;
      const applied: Array<Record<string, unknown>> = [];
      for (const decisionId of batchRow.decision_ids as string[]) {
        const decision = h.fake._data.client_decisions.find((row) => row.id === decisionId);
        if (!decision) {
          return {
            data: null,
            error: pgError("23514", `apply_client_effect: batch ${batchRow.id} names decision ${decisionId}, which does not exist`),
          };
        }
        if (decision.project_id !== batchRow.project_id) {
          return {
            data: null,
            error: pgError("42501", `apply_client_effect: decision_other_project — decision ${decisionId} is not on project ${batchRow.project_id}`),
          };
        }
        // 00652's household conjunct.
        if (decision.designer_client_id !== invitation.designer_client_id) {
          return {
            data: null,
            error: pgError("42501", `apply_client_effect: decision_other_household — decision ${decisionId} belongs to client record ${decision.designer_client_id}`),
          };
        }
        if (decision.coordination_kind !== "selection" || decision.court !== "client") {
          return {
            data: null,
            error: pgError("42501", `apply_client_effect: not_a_client_selection — only client-court selection decisions may be answered by text (decision ${decisionId} is ${decision.coordination_kind}/${decision.court})`),
          };
        }
        if (decision.approval_contract) {
          return {
            data: null,
            error: pgError("42501", `apply_client_effect: approval_contract_not_textable — decision ${decisionId} carries approval contract ${decision.approval_contract}`),
          };
        }
        const shown = (h.fake._data.client_decision_options ?? [])
          .filter((row) => row.decision_id === decisionId && row.is_recommended === true)
          .sort((a, b) =>
            Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) ||
            String(a.id).localeCompare(String(b.id))
          );
        if (shown.length !== 1) {
          return {
            data: null,
            error: pgError("23514", `apply_client_effect: no_single_presented_option — decision ${decisionId} presents ${shown.length} recommended options, so a batch approval names none of them`),
          };
        }
        const previous = decision.status;
        Object.assign(decision, {
          status: "responded",
          answer: shown[0].id,
          responded_at: nowIso,
          // p_actor NULL: selected_by is a FK to auth.users and a seat is not one.
          selected_by: null,
        });
        h.fake._data.decision_events.push({
          decision_id: decisionId,
          old_status: previous,
          new_status: "responded",
          changed_by: null,
          actor_party_id: prompt.party_id,
          reason: `apply_client_effect approve_selection: party ${prompt.party_id} answered by text`,
        });
        // 00171's own status-mirror row, written by trigger with BOTH actor
        // columns NULL. Modelled because the pipeline must never read it as a
        // second action (SQ-110 LOW-4).
        h.fake._data.decision_events.push({
          decision_id: decisionId,
          old_status: previous,
          new_status: "responded",
          changed_by: null,
          actor_party_id: null,
          reason: "status change",
        });
        applied.push({ decision_id: decisionId, option_id: shown[0].id });
      }
      result = {
        effect: "approve_selection",
        batch_id: batchRow.id,
        version: batchRow.version,
        project_id: prompt.project_id,
        party_id: prompt.party_id,
        capability_id: link.id,
        decisions: applied,
        decision_count: applied.length,
      };
    } else {
      // 8.
      const option = String(payload.option ?? "").trim() || null;
      if (!option) {
        return {
          data: null,
          error: pgError("22023", "apply_client_effect: select_window requires payload.option, the choice the card offered"),
        };
      }
      if (h.fake._data.delivery_availability.some((row) => row.source_sid === sid)) {
        return {
          data: null,
          error: pgError("42501", `apply_client_effect: sid_already_recorded — inbound ${sid} is already on the record against another answer`),
        };
      }
      const window = String(payload.window_label ?? "").trim() || null;
      const subjectKind = String(payload.subject_kind ?? "").trim() || "delivery";
      const row = {
        id: `avail-${h.fake._data.delivery_availability.length + 1}`,
        project_id: prompt.project_id,
        party_id: prompt.party_id,
        subject_kind: subjectKind,
        subject_id: prompt.subject_id,
        option,
        window_label: window,
        source_sid: sid,
        recorded_by_party_id: prompt.party_id,
      };
      h.fake._data.delivery_availability.push(row);
      result = {
        effect: "select_window",
        availability_id: row.id,
        project_id: prompt.project_id,
        party_id: prompt.party_id,
        capability_id: link.id,
        subject_kind: row.subject_kind,
        subject_id: row.subject_id,
        option: row.option,
        window_label: row.window_label,
        availability_only: true,
      };
    }

    const receipt = { kind: "effect", result };
    Object.assign(prompt, {
      consumed_sid: sid,
      consumption_result: receipt,
      answered_at: nowIso,
    });
    return { data: { status: "applied", result: receipt }, error: null };
  };

  return {
    ...fixture,
    batch,
    ask,
    delivery,
    get mints() {
      return mints;
    },
    get uses() {
      return uses;
    },
    /** Her inbound, on her own number. */
    inbound(body: string, sid: string) {
      return h.processInbound({ Body: body, MessageSid: sid, From: CLIENT_PHONE });
    },
  };
}
