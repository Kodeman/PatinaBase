import { adminDb } from "../helpers/supabase-admin";

/**
 * Shared reads for the People room specs. Every one of these asks the DATABASE
 * what the room claims to have written — a face that says "saved" and a table
 * that holds nothing is the failure these specs exist to catch.
 *
 * Service role, so RLS is not what is under test here; the portal's own writes
 * went through the signed-in designer's session.
 */

/** A name unique to this run, so three browser projects never collide. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36).slice(-5)}`;
}

/**
 * A mobile number nobody else in the book holds.
 *
 * The room merges on a shared phone by design (b4c1ff290), so a fixed number
 * attached every synthetic sub to whichever card already held it — the seed's
 * permanent Frank Bauer on (612) 555-0115, or Dana Kowalski on (612) 555-0111
 * — and the distinctly-named card the test then reads back never existed. The
 * digits are hashed off the full name, which already carries uniqueName()'s
 * per-run suffix, so two people added inside one test differ from each other
 * as well as from the run before. The 4000–9999 band sits clear of every
 * seeded number (the seed's highest is 555-0777, the alarm company on a site
 * record; 555-0308 is the highest on a card) (W6 QA F4-new).
 */
export function mobileFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 6000;
  return `(612) 555-${4000 + hash}`;
}

export async function cardByName(name: string) {
  const { data, error } = await adminDb
    .from("studio_contacts")
    .select("*")
    .eq("full_name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function seatByName(name: string) {
  const { data, error } = await adminDb
    .from("project_parties")
    .select("*")
    .eq("display_name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function ruleForSubject(subjectId: string) {
  const { data, error } = await adminDb
    .from("studio_contact_rules")
    .select("*")
    .eq("subject_type", "person")
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function channelsFor(ownerId: string) {
  const { data, error } = await adminDb
    .from("studio_contact_channels")
    .select("*")
    .eq("owner_id", ownerId);
  if (error) throw error;
  return data ?? [];
}

export async function authorityForSeat(seatId: string) {
  const { data, error } = await adminDb
    .from("project_party_authority")
    .select("*")
    .eq("engagement_id", seatId);
  if (error) throw error;
  return data ?? [];
}

/** Everything one run wrote, removed in FK order. */
export async function removePerson(name: string): Promise<void> {
  const seat = await seatByName(name);
  if (seat) {
    await adminDb
      .from("project_party_authority")
      .delete()
      .eq("engagement_id", seat.id);
    await adminDb.from("project_parties").delete().eq("id", seat.id);
  }
  const card = await cardByName(name);
  if (card) {
    await adminDb
      .from("studio_contact_rules")
      .delete()
      .eq("subject_id", card.id);
    await adminDb
      .from("studio_contact_channels")
      .delete()
      .eq("owner_id", card.id);
    await adminDb
      .from("studio_person_affiliations")
      .delete()
      .eq("person_id", card.id);
    await adminDb.from("studio_contacts").delete().eq("id", card.id);
  }
}
