/**
 * Internal random hex helper shared across @spendstack/shared modules.
 *
 * Not exported from the package's public API.
 */
export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer);
  } else {
    // Fallback for environments without Web Crypto (non-cryptographic).
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (const value of buffer) {
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}
