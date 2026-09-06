import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CHECK_INTENT_IDEMPOTENCY_WINDOW_MS,
  CHECK_INTENT_NOTIFICATION_TYPE,
  type CheckIntentDeps,
  type CheckIntentEmailSend,
  type CheckIntentInvoice,
  type CheckIntentNoticeRow,
  runInvoiceCheckIntent,
} from './invoice-check-intent-core.ts';

function invoice(overrides: Partial<CheckIntentInvoice> = {}): CheckIntentInvoice {
  return {
    id: 'inv-1',
    designer_id: 'designer-1',
    client_id: 'client-1',
    project_id: 'proj-1',
    studio_id: 'studio-1',
    title: null,
    invoice_number: 'INV-0004',
    status: 'sent',
    currency: 'USD',
    total_cents: 1_673_000,
    amount_paid_cents: 760_500,
    project: { id: 'proj-1', name: 'Harper Residence', client_id: 'client-1' },
    client: { id: 'client-1', full_name: 'Harper Lee', email: 'harper@test.invalid' },
    designer: {
      id: 'designer-1',
      full_name: 'Nora Quist',
      business_name: 'Quist Interiors',
      email: 'nora@test.invalid',
    },
    ...overrides,
  };
}

function deps(overrides: Partial<CheckIntentDeps> = {}) {
  const notices: CheckIntentNoticeRow[] = [];
  const sends: CheckIntentEmailSend[] = [];
  const priorCalls: Array<{ designerId: string; invoiceId: string; sinceIso: string }> = [];
  const value: CheckIntentDeps = {
    priorNoticeExists: async (designerId, invoiceId, sinceIso) => {
      priorCalls.push({ designerId, invoiceId, sinceIso });
      return false;
    },
    insertNotice: async (row) => {
      notices.push(row);
      return { error: null };
    },
    sendDesignerEmail: async (send) => {
      sends.push(send);
      return { success: true };
    },
    now: () => Date.UTC(2026, 8, 6, 12, 0, 0),
    ...overrides,
  };
  return { value, notices, sends, priorCalls };
}

Deno.test('check intent: writes the in-app notice first, then the email, and reports both', async () => {
  const d = deps();
  const outcome = await runInvoiceCheckIntent(invoice(), {
    designerPortalUrl: 'https://app.test',
    deps: d.value,
  });
  assertEquals(outcome, {
    ok: true,
    invoiceId: 'inv-1',
    alreadyNotified: false,
    emailSent: true,
    suppressed: false,
  });
  assertEquals(d.notices.length, 1);
  const notice = d.notices[0];
  assertEquals(notice.user_id, 'designer-1');
  assertEquals(notice.type, CHECK_INTENT_NOTIFICATION_TYPE);
  assertEquals(notice.channel, 'in_app');
  assertEquals(notice.metadata.invoice_id, 'inv-1');
  assertEquals(notice.metadata.amount_cents, 912_500);
  assertEquals(
    notice.metadata.message,
    'Harper Residence: Harper Lee is mailing a check for $9,125.00 toward INV-0004. Record it when it arrives.'
  );
  assertEquals(notice.metadata.deep_link, '/desk?book=accounts&page=ledger&invoiceId=inv-1');
  assertEquals(d.sends.length, 1);
  assertEquals(d.sends[0].to, 'nora@test.invalid');
  assertEquals(d.sends[0].userId, 'designer-1');
  assertStringIncludes(d.sends[0].html, 'https://app.test/desk?book=accounts');
  // The idempotency window is read against the designer + invoice, 24h back.
  assertEquals(d.priorCalls, [
    {
      designerId: 'designer-1',
      invoiceId: 'inv-1',
      sinceIso: new Date(Date.UTC(2026, 8, 6, 12, 0, 0) - CHECK_INTENT_IDEMPOTENCY_WINDOW_MS).toISOString(),
    },
  ]);
});

Deno.test('check intent: a notice inside the window short-circuits with nothing written', async () => {
  const d = deps({ priorNoticeExists: async () => true });
  const outcome = await runInvoiceCheckIntent(invoice(), {
    designerPortalUrl: 'https://app.test',
    deps: d.value,
  });
  assertEquals(outcome, {
    ok: true,
    invoiceId: 'inv-1',
    alreadyNotified: true,
    emailSent: false,
    suppressed: false,
  });
  assertEquals(d.notices.length, 0);
  assertEquals(d.sends.length, 0);
});

Deno.test('check intent: a failed idempotency read falls through and sends (never a silent dead end)', async () => {
  const d = deps({ priorNoticeExists: async () => null });
  const outcome = await runInvoiceCheckIntent(invoice(), {
    designerPortalUrl: 'https://app.test',
    deps: d.value,
  });
  assertEquals(outcome.ok, true);
  assertEquals(d.notices.length, 1);
});

Deno.test('check intent: the in-app row is fail-closed', async () => {
  const d = deps({ insertNotice: async () => ({ error: { message: 'disk full' } }) });
  const outcome = await runInvoiceCheckIntent(invoice(), {
    designerPortalUrl: 'https://app.test',
    deps: d.value,
  });
  assertEquals(outcome, { ok: false, error: 'notification_failed', detail: 'disk full' });
  assertEquals(d.sends.length, 0);
});

Deno.test('check intent: the email is best effort — suppressed, failed, thrown, or no address', async () => {
  const suppressed = deps({ sendDesignerEmail: async () => ({ success: false, suppressed: true }) });
  assertEquals(
    await runInvoiceCheckIntent(invoice(), { designerPortalUrl: 'https://app.test', deps: suppressed.value }),
    { ok: true, invoiceId: 'inv-1', alreadyNotified: false, emailSent: false, suppressed: true }
  );
  const failed = deps({ sendDesignerEmail: async () => ({ success: false, error: 'resend 500' }) });
  assertEquals(
    (await runInvoiceCheckIntent(invoice(), { designerPortalUrl: 'https://app.test', deps: failed.value })).ok,
    true
  );
  const thrown = deps({
    sendDesignerEmail: async () => {
      throw new Error('RESEND_API_KEY missing');
    },
  });
  assertEquals(
    await runInvoiceCheckIntent(invoice(), { designerPortalUrl: 'https://app.test', deps: thrown.value }),
    { ok: true, invoiceId: 'inv-1', alreadyNotified: false, emailSent: false, suppressed: false }
  );
  const noAddress = deps();
  assertEquals(
    await runInvoiceCheckIntent(invoice({ designer: { id: 'designer-1', full_name: 'Nora', business_name: null, email: null } }), {
      designerPortalUrl: 'https://app.test',
      deps: noAddress.value,
    }),
    { ok: true, invoiceId: 'inv-1', alreadyNotified: false, emailSent: false, suppressed: false }
  );
  assertEquals(noAddress.sends.length, 0);
  assertEquals(noAddress.notices.length, 1);
});

Deno.test('check intent: a payer-less studio invoice names the studio invoice and "Your client"', async () => {
  const d = deps();
  await runInvoiceCheckIntent(
    invoice({ client_id: null, client: null, project_id: null, project: null, title: 'Consultation, September' }),
    { designerPortalUrl: 'https://app.test', deps: d.value }
  );
  assertEquals(
    d.notices[0].metadata.message,
    'Consultation, September: Your client is mailing a check for $9,125.00 toward INV-0004. Record it when it arrives.'
  );
  assertEquals(d.notices[0].metadata.project_id, null);
});
