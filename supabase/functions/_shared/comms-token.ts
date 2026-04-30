// Shared HMAC-signed token helpers for comms email actions.
//
// Used by:
//   - comms-notification-dispatch  → generates per-recipient mute tokens
//   - comms-mute                   → verifies tokens before applying mute
//
// Token shape (JWT HS256):
//   { purpose: 'comms_mute', sub: profile_id, thread_id, iss, iat, exp }
//
// Secret resolution:
//   1. UNSUBSCRIBE_TOKEN_SECRET (preferred — already configured for unsubscribe links)
//   2. SUPABASE_SERVICE_ROLE_KEY (fallback — local dev convenience)

import { SignJWT, jwtVerify } from "https://deno.land/x/jose@v5.2.0/index.ts";

const ISSUER = "patina:comms";
const PURPOSE = "comms_mute";
const EXPIRY = "365d";

function getSecretKey(): Uint8Array {
  const secret =
    Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) {
    throw new Error(
      "comms-token: missing UNSUBSCRIBE_TOKEN_SECRET / SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signCommsMuteToken(input: {
  threadId: string;
  profileId: string;
}): Promise<string> {
  const secretKey = getSecretKey();
  return await new SignJWT({
    purpose: PURPOSE,
    thread_id: input.threadId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.profileId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(EXPIRY)
    .sign(secretKey);
}

export interface VerifiedMuteToken {
  threadId: string;
  profileId: string;
}

export async function verifyCommsMuteToken(
  token: string,
): Promise<VerifiedMuteToken> {
  const secretKey = getSecretKey();
  const { payload } = await jwtVerify(token, secretKey, {
    issuer: ISSUER,
  });
  if (payload.purpose !== PURPOSE) {
    throw new Error(`comms-token: wrong purpose '${payload.purpose}'`);
  }
  if (typeof payload.sub !== "string" || typeof payload.thread_id !== "string") {
    throw new Error("comms-token: malformed payload");
  }
  return {
    profileId: payload.sub,
    threadId: payload.thread_id as string,
  };
}

/**
 * Public base URL that email recipients can reach. In production this is
 * api.patina.cloud (Traefik → Kong). In local dev it's typically
 * http://127.0.0.1:54321 (Supabase CLI). Operators can override with
 * COMMS_PUBLIC_BASE if neither default is correct.
 */
export function commsPublicBase(): string {
  return (
    Deno.env.get("COMMS_PUBLIC_BASE") ||
    Deno.env.get("SUPABASE_URL") ||
    "https://api.patina.cloud"
  );
}

export function buildMuteUrl(token: string): string {
  return `${commsPublicBase()}/functions/v1/comms-mute?t=${encodeURIComponent(token)}`;
}
