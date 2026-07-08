// sign-twilio.ts — compute an X-Twilio-Signature for a params map + URL.
// Used by the tests AND runnable via `deno run` to sign a curl smoke request:
//
//   deno run --allow-env supabase/functions/_tests/sign-twilio.ts \
//     --token "$TWILIO_AUTH_TOKEN" \
//     --url "https://<host>/functions/v1/sms-inbound" \
//     From=+15551234567 To=+15557654321 Body="done 1" MessageSid=SMtest123
//
// Prints just the signature (put it in the X-Twilio-Signature header).

import { computeTwilioSignature } from "../_shared/twilio-verify.ts";

export { computeTwilioSignature };

/** Convenience wrapper for tests. */
export function signTwilio(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  return computeTwilioSignature(authToken, url, params);
}

if (import.meta.main) {
  const args = Deno.args;
  let token = "";
  let url = "";
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--token") token = args[++i];
    else if (a === "--url") url = args[++i];
    else if (a.includes("=")) {
      const idx = a.indexOf("=");
      params[a.slice(0, idx)] = a.slice(idx + 1);
    }
  }
  if (!token || !url) {
    console.error("usage: sign-twilio.ts --token <t> --url <u> Key=Value ...");
    Deno.exit(1);
  }
  console.log(await computeTwilioSignature(token, url, params));
}
