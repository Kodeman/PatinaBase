import { signTwilio } from "../sign-twilio.ts";
import { fieldLineBindings } from "./adapters.ts";

type InboundParams = Parameters<typeof fieldLineBindings.processInbound>[0];

export const TWILIO_TEST_TOKEN = "field-line-fixture-auth-token";
export const INBOUND_URL = "https://fixture.patina.test/functions/v1/sms-inbound";
export const STATUS_URL = "https://fixture.patina.test/functions/v1/sms-status";

export interface SignedWebhookFixture {
  params: Record<string, string>;
  request: Request;
}

async function signedForm(
  url: string,
  params: Record<string, string>,
): Promise<SignedWebhookFixture> {
  const signature = await signTwilio(TWILIO_TEST_TOKEN, url, params);
  return {
    params,
    request: new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body: new URLSearchParams(params).toString(),
    }),
  };
}

export async function signedInboundFixture(
  overrides: Partial<InboundParams> = {},
): Promise<SignedWebhookFixture & { inbound: InboundParams }> {
  const params: Record<string, string> = {
    From: "+15550102030",
    To: "+15559990000",
    Body: "DONE 10",
    MessageSid: "SMfieldfixture001",
    NumMedia: "0",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]),
    ),
  };
  const signed = await signedForm(INBOUND_URL, params);
  return { ...signed, inbound: params as InboundParams };
}

export async function signedStatusFixture(
  overrides: Record<string, string> = {},
): Promise<SignedWebhookFixture> {
  return signedForm(STATUS_URL, {
    MessageSid: "SMfieldfixture001",
    MessageStatus: "queued",
    ...overrides,
  });
}
