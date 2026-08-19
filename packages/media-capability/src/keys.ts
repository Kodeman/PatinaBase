import { derToPem, pemToDer } from './base64url';

const ALGORITHM = { name: 'Ed25519' } as const;

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      '@patina/media-capability: globalThis.crypto.subtle is unavailable in this runtime'
    );
  }
  return c.subtle;
}

/** Import a PKCS8 PEM-encoded Ed25519 private key for signing. */
export async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const der = pemToDer(privateKeyPem);
  return getSubtle().importKey('pkcs8', der, ALGORITHM, false, ['sign']);
}

/** Import an SPKI PEM-encoded Ed25519 public key for verification. */
export async function importPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  const der = pemToDer(publicKeyPem);
  return getSubtle().importKey('spki', der, ALGORITHM, false, ['verify']);
}

/**
 * Generate a fresh Ed25519 key pair as PEM text. Not one of the two
 * contractual API functions (mint/verify) but the minimal supporting
 * infrastructure needed to exercise them — key provisioning otherwise has
 * no in-package path.
 */
export async function generateCapabilityKeyPair(): Promise<{
  privateKeyPem: string;
  publicKeyPem: string;
}> {
  const subtle = getSubtle();
  const keyPair = (await subtle.generateKey(ALGORITHM, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pkcs8 = await subtle.exportKey('pkcs8', keyPair.privateKey);
  const spki = await subtle.exportKey('spki', keyPair.publicKey);
  return {
    privateKeyPem: derToPem(pkcs8, 'PRIVATE KEY'),
    publicKeyPem: derToPem(spki, 'PUBLIC KEY'),
  };
}
