/** Claims minted into a media capability token. */
export interface MediaCapabilityClaims {
  /** The public.media_registry row id this capability grants access to. */
  objectId: string;
  /** The media_registry row's version — a capability is pinned to one version. */
  version: number;
  bucket: string;
  key: string;
  /** Which derived presets (thumb/hero/etc.) this capability may fetch. */
  presetAllowList: string[];
  /** Unix seconds. verifyCapability refuses the token at/after this instant. */
  exp: number;
  /** Intended audience (e.g. a service name). NOT enforced by verifyCapability
   *  — carried through in the returned claims for the caller to check. */
  aud: string;
  /** Set automatically by mintCapability when absent; unix seconds. */
  iat?: number;
}

export type VerifyCapabilityResult =
  | { ok: true; claims: MediaCapabilityClaims }
  | { ok: false; reason: string };
