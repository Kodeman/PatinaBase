/**
 * SigV4 query-signed URLs against the R2 S3 endpoint — the "capability URL"
 * half of the scan read path (DELIVERY-PLAN R5) and the presigned PUT/HEAD of
 * the Phase-2 upload interface (W3-A).
 *
 * Hand-rolled rather than `aws4fetch`: the worker vendors no S3 client, and the
 * one thing this file has to be is *auditable* — the canonical request is the
 * security-relevant artifact, so `canonicalRequestFor` is exported and asserted
 * directly instead of being buried inside a dependency.
 *
 * A presigned URL signs no payload (`UNSIGNED-PAYLOAD`). It signs `host`, plus
 * whatever extra headers the caller pins. Everything else rides in the query
 * string, which is why the URL is a capability: it carries its own expiry and
 * is verifiable by R2 alone.
 *
 * A SIGNED HEADER IS A CONDITION. A header named in `X-Amz-SignedHeaders` must
 * be sent, with exactly the signed value, or R2 rejects the request — which is
 * how the upload interface pins `content-length` (the declared byte count) and
 * `x-amz-checksum-sha256` (the declared digest) onto a URL a client holds.
 */

const ALGORITHM = 'AWS4-HMAC-SHA256';
const SERVICE = 's3';
// R2 has no regions; the S3 API still requires a region in the credential scope
// and rejects anything but `auto`.
const REGION = 'auto';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

/** SigV4's own bound on X-Amz-Expires. */
const MAX_EXPIRES_SECONDS = 604_800;

export class PresignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresignError';
  }
}

export type PresignMethod = 'GET' | 'PUT' | 'HEAD';

export interface PresignRequest {
  /** The account's R2 S3 endpoint, e.g. `https://<account>.r2.cloudflarestorage.com`. */
  endpoint: string;
  bucket: string;
  objectKey: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresInSeconds: number;
  /** Injected so a signature is reproducible in a test and pinned in a probe. */
  now: Date;
  /** Defaults to GET — the read path's shape, unchanged. */
  method?: PresignMethod;
  /**
   * Headers to sign in addition to `host`, lower-cased by the signer. Each one
   * becomes a CONDITION the holder of the URL must satisfy exactly.
   */
  signedHeaders?: Record<string, string>;
}

export interface PresignedUrl {
  url: string;
  /** ISO-8601 instant the capability stops working. */
  expiresAt: string;
}

/**
 * RFC 3986 percent-encoding. `encodeURIComponent` leaves `!'()*` alone; SigV4
 * canonicalization does not, and a single unescaped `(` in an object key is the
 * difference between a working URL and an opaque SignatureDoesNotMatch.
 */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** `/bucket/key` with every path segment encoded, slashes preserved as separators. */
function canonicalUri(bucket: string, objectKey: string): string {
  const segments = objectKey.split('/').map(encodeRfc3986);
  return `/${encodeRfc3986(bucket)}/${segments.join('/')}`;
}

function amzDate(now: Date): string {
  return `${now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15)}Z`;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function sha256Hex(value: string): Promise<string> {
  return hex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function hmac(key: BufferSource, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(value),
  );
}

export interface CanonicalRequest {
  canonicalRequest: string;
  credentialScope: string;
  /** The signed query string, in the canonical (sorted) order, without the signature. */
  canonicalQueryString: string;
  amzDate: string;
  host: string;
  canonicalUri: string;
  /** `;`-joined, sorted, lower-cased — the value of `X-Amz-SignedHeaders`. */
  signedHeaderNames: string;
}

/**
 * The exact bytes SigV4 hashes. Split out from `presignR2GetUrl` so a test can
 * pin the canonical shape — the request line, the sorted query, the single
 * signed header, and `UNSIGNED-PAYLOAD` — without reproducing the HMAC chain.
 */
export function canonicalRequestFor(input: PresignRequest): CanonicalRequest {
  if (!input.bucket) throw new PresignError('bucket is required');
  if (!input.objectKey) throw new PresignError('object key is required');
  if (!input.accessKeyId || !input.secretAccessKey) {
    throw new PresignError('R2 credentials are required');
  }
  if (
    !Number.isInteger(input.expiresInSeconds) ||
    input.expiresInSeconds <= 0 ||
    input.expiresInSeconds > MAX_EXPIRES_SECONDS
  ) {
    throw new PresignError('expiry is out of range');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    throw new PresignError('endpoint is not a URL');
  }
  // A path on the endpoint would silently change the object the signature
  // covers; https because a capability URL travels to a browser.
  if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/') {
    throw new PresignError('endpoint must be an https origin with no path');
  }

  const date = amzDate(input.now);
  const dateStamp = date.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const uri = canonicalUri(input.bucket, input.objectKey);

  // `host` is always signed; extras are folded in, lower-cased, and sorted —
  // SigV4 canonicalization is order-sensitive, and a header sorted wrong is an
  // opaque SignatureDoesNotMatch rather than an error anyone can read.
  const headers = new Map<string, string>([['host', endpoint.host]]);
  for (const [name, value] of Object.entries(input.signedHeaders ?? {})) {
    const canonicalName = name.trim().toLowerCase();
    if (!canonicalName) throw new PresignError('signed header name is empty');
    if (canonicalName === 'host') {
      throw new PresignError('host is signed automatically');
    }
    headers.set(canonicalName, String(value).trim());
  }
  const sortedHeaderNames = [...headers.keys()].sort();
  const signedHeaderNames = sortedHeaderNames.join(';');
  const canonicalHeaders = sortedHeaderNames
    .map((name) => `${name}:${headers.get(name)}\n`)
    .join('');

  // Already in sorted order; kept explicit so a future addition has to be
  // inserted in the right place rather than silently breaking the signature.
  const canonicalQueryString = [
    ['X-Amz-Algorithm', ALGORITHM],
    ['X-Amz-Credential', `${input.accessKeyId}/${credentialScope}`],
    ['X-Amz-Date', date],
    ['X-Amz-Expires', String(input.expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaderNames],
  ]
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&');

  return {
    canonicalRequest: [
      input.method ?? 'GET',
      uri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaderNames,
      UNSIGNED_PAYLOAD,
    ].join('\n'),
    credentialScope,
    canonicalQueryString,
    amzDate: date,
    host: endpoint.host,
    canonicalUri: uri,
    signedHeaderNames,
  };
}

/** Mint a short-lived, query-signed capability for one R2 object. */
export async function presignR2Url(
  input: PresignRequest,
): Promise<PresignedUrl> {
  const canonical = canonicalRequestFor(input);

  const stringToSign = [
    ALGORITHM,
    canonical.amzDate,
    canonical.credentialScope,
    await sha256Hex(canonical.canonicalRequest),
  ].join('\n');

  let signingKey: BufferSource = new TextEncoder().encode(
    `AWS4${input.secretAccessKey}`,
  );
  for (const step of [
    canonical.amzDate.slice(0, 8),
    REGION,
    SERVICE,
    'aws4_request',
  ]) {
    signingKey = await hmac(signingKey, step);
  }
  const signature = hex(await hmac(signingKey, stringToSign));

  return {
    url: `https://${canonical.host}${canonical.canonicalUri}?${canonical.canonicalQueryString}&X-Amz-Signature=${signature}`,
    expiresAt: new Date(
      input.now.getTime() + input.expiresInSeconds * 1000,
    ).toISOString(),
  };
}

/**
 * The read path's shape, unchanged: GET, `host` the only signed header. Kept as
 * its own name so the scan route reads as what it is and cannot acquire a
 * method or a condition by accident.
 */
export function presignR2GetUrl(
  input: Omit<PresignRequest, 'method' | 'signedHeaders'>,
): Promise<PresignedUrl> {
  return presignR2Url(input);
}
