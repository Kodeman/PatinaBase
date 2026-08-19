/**
 * Maximum lifetime a single capability token may be minted with, in seconds.
 * mintCapability refuses to mint anything longer-lived than this — a media
 * capability is meant to be short-lived by design; a caller that needs a
 * longer-lived grant should re-mint, not widen this constant casually.
 */
export const MAX_CAPABILITY_TTL_SECONDS = 3600;

/**
 * Hard cap on total token string length verifyCapability will even attempt
 * to parse. Checked before any base64/JSON work — a legitimately minted
 * token is a few hundred bytes; anything past this is either garbage or an
 * attempt to make parsing/decoding expensive.
 */
export const MAX_TOKEN_LENGTH_CHARS = 4096;
