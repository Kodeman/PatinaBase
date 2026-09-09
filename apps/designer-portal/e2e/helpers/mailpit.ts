/**
 * The local mail catcher is Mailpit on :54324 despite config.toml's deprecated
 * [inbucket] block — its API is /api/v1/*, not Inbucket's.
 *
 * Mailpit only ever receives GoTrue's own SMTP-relayed mail (confirmation,
 * recovery, magic-link, invite). It is NOT where the letter The First Letter
 * sends lands: that letter goes through sendCompliantEmail → Resend HTTPS
 * (supabase/functions/_shared/send-email.ts), a different transport entirely,
 * so Mailpit can never hold it. What Mailpit IS good for here is a negative
 * assertion — proving GoTrue did NOT also mail the address (client-invite's
 * 'invite' path calls admin.auth.admin.generateLink, which mints an account
 * and a link without sending; a message showing up here for that address
 * would mean some GoTrue leg sent anyway, i.e. a duplicate first touch).
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface MailpitSummary {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
}

export async function deleteAllMessages(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

export async function listMessagesTo(address: string): Promise<MailpitSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const body = (await res.json()) as { messages?: MailpitSummary[] };
  return (body.messages ?? []).filter((m) =>
    (m.To ?? []).some((t) => t.Address.toLowerCase() === address.toLowerCase()),
  );
}
