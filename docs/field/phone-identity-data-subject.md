# The phone-only homeowner as a data subject

A homeowner reached by text is the one person in Patina with **no account**. There
is no `auth.users` row for her, no `profiles` row, no session, and nothing she can
sign into. That is deliberate (US-3 P21: a phone-only invitation never calls
`inviteUserByEmail` and never gets a GoTrue user) and it has a consequence worth
writing down: **every self-service path Patina has for "show me my data" and
"delete my data" starts from an authenticated user, so none of them can reach
her.** Until an export path exists, her requests are answered by hand, and this
file is the map.

Her identity is her phone number in E.164, normalized by
`public.normalize_phone_e164` (`00281`). Everything below is keyed on that number
or on a row that descends from it. Start every request by normalizing what she
gave you — `SELECT public.normalize_phone_e164('(608) 555-0143')` — and use only
the result.

> **She may hold no consent at all.** A phone letter can be sent to a number with
> no `studio_channel_consent` grant (the letter is the studio's first touch); the
> gate that decides whether a *text* may go is separate. So "no consent row" does
> not mean "no data".

## Where her data lives

Nothing here is copied to a warehouse; these tables are the whole of it.

| Table | What it holds about her | How to find her rows |
| --- | --- | --- |
| `client_invitations` | The letter itself, frozen at send: her number (`phone`, E.164), her name as the studio typed it, the studio's note to her, which house it was about. `email IS NULL` is what makes the row hers rather than an email recipient's. | `WHERE phone = <e164>` |
| `client_links` | Her capability — the scoped, revocable door she opens the letter through. **No token, ever**: `token_hash` is a sha256 and the raw value was returned once at mint and stored nowhere. Also `scope`, `expires_at`, `last_used_at`. | `WHERE invitation_id IN (…)` |
| `client_link_uses` | One row per time that capability was exercised: when, what for (`open`, `accept`, `apply_client_effect:…`), and where from. This is a record of her reading her own letter. | `WHERE link_id IN (…)` |
| `studio_channel_consent` | Whether a studio may text her, how that was recorded (`source`, including `kickoff_checkbox`), the disclosure version she was shown, who recorded it, and any refusal. | `WHERE channel_kind = 'sms' AND channel_value = <e164>` |
| `project_parties` | Her seat on a job: display name, `phone`/`phone_e164`, party kind. The seat is the identity the rail paces and addresses; changing her phone never moves it. | `WHERE phone_e164 = <e164>` |
| `delivery_availability` | Windows she said she could be home for, by reply: the option she chose, the words that option stood for, when, and the message it came from. Availability only — never receipt, assent or signature. | `WHERE party_id IN (…)` |
| `client_decision_batches` | The selections a studio presented to her and the generation they were presented at, plus when a reminder went and when the list closed. | `WHERE party_id IN (…)` |

Two more tables hold her words rather than her decisions, and belong in any
honest answer even though they are the rail's rather than the letter's:

- `sms_conversations` — keyed on `phone_e164`, one row per number per Patina
  number.
- `sms_messages` — the texts themselves, both directions, `body` and all, joined
  through `conversation_id`.

Her `party_id` — needed for the last two rows of the table above — is whichever
seat carries her number: `SELECT id FROM project_parties WHERE phone_e164 =
<e164>`. A capability also froze one at mint, in `client_links.party_id` and in
`client_links.scope->>'party_id'`; prefer that when the question is about a
specific letter, because it is the seat that letter was actually about.

## Answering an export request by hand

1. Normalize the number. Work only from the E.164 result.
2. Confirm who is asking. There is no session to prove it with, so the studio
   that wrote to her confirms she is the person on the letter, out of band, in
   writing. Record that confirmation with the request.
3. Read, in this order: `client_invitations` → `client_links` (by
   `invitation_id`) → `client_link_uses` (by `link_id`) →
   `studio_channel_consent` → `project_parties` → `delivery_availability` and
   `client_decision_batches` (by `party_id`) → `sms_conversations` and
   `sms_messages`.
4. Redact nothing of hers and include nothing of anyone else's. A
   `client_decision_batches` row names decisions that belong to the studio's job:
   give her the fact that a list was presented to her and when, not the studio's
   internal decision records behind it.
5. **Never include a token.** `client_links.token_hash` is not her data in any
   useful sense and a live capability is a credential; omit both. If she needs
   her letter again, the studio re-sends it and she gets a fresh link by text.
6. Hand the result to the studio to give to her, with the date and the operator's
   name on it.

## Answering an erasure request by hand

Do it in this order. Later steps depend on rows the earlier ones name, and the
capability is closed first so nothing can be opened mid-erasure.

1. **Close the door.** For every live capability:
   `SELECT public.revoke_client_link(id) FROM client_links WHERE invitation_id IN
   (SELECT id FROM client_invitations WHERE phone = <e164>) AND status =
   'active';` — immediate, and `resolve_client_link` answers NULL from then on.
2. **Stop the texts.** Record her refusal on the consent ledger through the
   consent door rather than by deleting the row: an erased consent record reads
   as "never asked", and "never asked" is a state a studio may text into. A
   refusal on file is what keeps her number quiet.
3. **Delete the letters.** `DELETE FROM client_invitations WHERE phone = <e164>`
   cascades to `client_links` and, through them, to `client_link_uses`
   (`ON DELETE CASCADE`, `00650`).
4. **Her seat, and what goes with it.** `delivery_availability` and
   `client_decision_batches` each carry a composite `(party_id, project_id)`
   foreign key to `project_parties (id, project_id)` with `ON DELETE CASCADE`
   (`00651`), so deleting her seat deletes her window answers and the record of
   every list presented to her, in the same statement. That is usually what an
   erasure wants — and it is why the export must be taken FIRST, because there is
   no undo. If the studio needs the seat to stay on the job, delete those two by
   `party_id` instead and leave `project_parties` standing with her contact
   details cleared.
5. **Her texts.** Delete the `sms_messages` rows for her conversation, then the
   `sms_conversations` row.
6. **What you may have to keep, and say so.** A consent refusal (step 2) and any
   record required to prove a message was lawfully sent are kept on purpose; an
   erasure that deleted them would remove the evidence that protects her. Tell
   her what was kept and why, in plain words.
7. Re-run the export read of step 3 above and confirm every remaining row is one
   you meant to keep.

## Until there is an export path

There is no `/api` route, no RPC and no studio-facing act that does any of the
above. Everything here is a human with database access following these steps,
which means: no self-service, no audit row written automatically, and no rate
limit but the operator's own care. Record every request and what was done in the
studio's own records.

When an export path is built, it belongs on the same seam as the rest of this
identity — service-role only, keyed on the normalized number, returning no token
— and this file becomes its test's description rather than its substitute.
