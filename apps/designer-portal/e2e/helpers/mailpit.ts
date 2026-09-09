/**
 * The local mail catcher is Mailpit on :54324 despite config.toml's deprecated
 * [inbucket] block — its API is /api/v1/*, not Inbucket's.
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

export async function messageBody(id: string): Promise<{ HTML: string; Text: string }> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return (await res.json()) as { HTML: string; Text: string };
}
