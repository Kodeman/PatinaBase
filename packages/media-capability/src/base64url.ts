/**
 * Self-contained base64 / base64url codec — no dependency on `btoa`/`atob`
 * (deprecated-but-present in Node, always present in Workers/Deno/browsers).
 * Keeping this hand-rolled means the package has exactly zero surface area
 * that depends on a specific host global beyond WebCrypto and TextEncoder/
 * TextDecoder, which are guaranteed in Workers, Node 20+, and Deno.
 */

const B64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let result = "";
  let i = 0;

  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    result +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      B64_CHARS[n & 63];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] << 16;
    result += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + "==";
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    result +=
      B64_CHARS[(n >> 18) & 63] +
      B64_CHARS[(n >> 12) & 63] +
      B64_CHARS[(n >> 6) & 63] +
      "=";
  }

  return result;
}

function base64Decode(str: string): Uint8Array {
  const lookup = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) {
    lookup[B64_CHARS.charCodeAt(i)] = i;
  }

  const clean = str.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < clean.length; i++) {
    const code = lookup[clean.charCodeAt(i)];
    if (code === -1) {
      throw new Error("base64Decode: invalid character in input");
    }
    buffer = (buffer << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

/** Encode bytes as unpadded base64url text. */
export function toBase64Url(bytes: Uint8Array): string {
  return base64Encode(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode unpadded (or padded) base64url text back to bytes. */
export function fromBase64Url(value: string): Uint8Array {
  const padLength = (4 - (value.length % 4)) % 4;
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return base64Decode(padded);
}

/**
 * True iff `segment` is the UNIQUE canonical base64url encoding of its own
 * decoded bytes — i.e. re-encoding fromBase64Url(segment) reproduces
 * `segment` exactly.
 *
 * A naive decoder (this file's base64Decode included, without this guard)
 * ignores non-zero padding bits in the final character and tolerates '='
 * padding on input it wasn't asked to add itself. That means MANY different
 * strings can decode to the SAME bytes — e.g. a 64-byte Ed25519 signature
 * (64 = 21*3 + 1 leaves a 1-byte remainder, whose second base64 character
 * carries only 2 meaningful bits out of 6) has dozens of string variants
 * that all decode to the identical signature and therefore all verify
 * successfully. Any consumer that keys replay/revocation off the token
 * STRING (not the decoded bytes) is defeated by this — reject non-canonical
 * input outright so exactly one string exists per byte value.
 */
export function isCanonicalBase64Url(segment: string): boolean {
  if (typeof segment !== "string" || segment.length === 0) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return false; // no padding, no stray characters
  try {
    return toBase64Url(fromBase64Url(segment)) === segment;
  } catch {
    return false;
  }
}

export function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/[\r\n\s]/g, "");
  if (body.length === 0) {
    throw new Error("pemToDer: no base64 body found in PEM input");
  }
  const bytes = base64Decode(body);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export function derToPem(der: ArrayBuffer, label: string): string {
  const b64 = base64Encode(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
