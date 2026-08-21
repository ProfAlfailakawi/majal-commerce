import { randomBytes } from 'node:crypto';

/**
 * Shamir Secret Sharing over GF(2^8)
 * ----------------------------------
 * Splits a secret into `n` shares such that ANY `k` reconstruct it and any `k-1` reveal
 * nothing. Dependency-free, byte-wise, using the AES field polynomial (0x11b). Used to
 * split a recipe's data key across independent holders so no single party — not even the
 * platform — can reveal the secret alone.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  // Generator 3 is a primitive element of GF(2^8)/0x11b (2 is not), so its powers cover
  // every non-zero element exactly once — required for correct log/antilog tables.
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    let doubled = x << 1;
    if (doubled & 0x100) doubled ^= 0x11b; // reduce by the AES irreducible polynomial
    x = (x ^ doubled) & 0xff;              // x * 3  =  x ^ (x * 2)
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
const div = (a: number, b: number) => {
  if (b === 0) throw new Error('SHAMIR_DIVIDE_BY_ZERO');
  return a === 0 ? 0 : EXP[LOG[a] - LOG[b] + 255];
};

export interface Share {
  x: number;       // holder index 1..255
  y: Buffer;       // one byte per secret byte
}

/** Splits `secret` into `n` shares with threshold `k`. */
export function split(secret: Buffer, n: number, k: number): Share[] {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 2 || n < k || n > 255) throw new Error('SHAMIR_INVALID_PARAMS');
  if (secret.length === 0) throw new Error('SHAMIR_EMPTY_SECRET');
  const shares: Share[] = Array.from({ length: n }, (_v, i) => ({ x: i + 1, y: Buffer.alloc(secret.length) }));
  for (let byteIndex = 0; byteIndex < secret.length; byteIndex += 1) {
    // Random polynomial of degree k-1 with constant term = secret byte.
    const coeffs = Buffer.concat([secret.subarray(byteIndex, byteIndex + 1), randomBytes(k - 1)]);
    for (const share of shares) {
      let acc = 0;
      // Horner evaluation at x = share.x.
      for (let c = coeffs.length - 1; c >= 0; c -= 1) acc = mul(acc, share.x) ^ coeffs[c];
      share.y[byteIndex] = acc;
    }
  }
  return shares;
}

/** Reconstructs the secret from at least `k` distinct shares via Lagrange interpolation at x=0. */
export function combine(shares: Share[]): Buffer {
  if (shares.length < 2) throw new Error('SHAMIR_NOT_ENOUGH_SHARES');
  const xs = shares.map(s => s.x);
  if (new Set(xs).size !== xs.length) throw new Error('SHAMIR_DUPLICATE_SHARES');
  const length = shares[0].y.length;
  if (!shares.every(s => s.y.length === length)) throw new Error('SHAMIR_SHARE_LENGTH_MISMATCH');
  const secret = Buffer.alloc(length);
  for (let byteIndex = 0; byteIndex < length; byteIndex += 1) {
    let value = 0;
    for (let i = 0; i < shares.length; i += 1) {
      let numerator = 1;
      let denominator = 1;
      for (let j = 0; j < shares.length; j += 1) {
        if (i === j) continue;
        numerator = mul(numerator, shares[j].x);              // (0 - x_j) == x_j in GF(2^8)
        denominator = mul(denominator, shares[i].x ^ shares[j].x);
      }
      value ^= mul(shares[i].y[byteIndex], div(numerator, denominator));
    }
    secret[byteIndex] = value;
  }
  return secret;
}

/** Wire encoding: first byte is the holder index, remainder is the share body. */
export function encodeShare(share: Share): string {
  return Buffer.concat([Buffer.from([share.x]), share.y]).toString('base64url');
}

export function decodeShare(encoded: string): Share {
  const raw = Buffer.from(encoded, 'base64url');
  if (raw.length < 2) throw new Error('SHAMIR_INVALID_SHARE');
  return { x: raw[0], y: raw.subarray(1) };
}
