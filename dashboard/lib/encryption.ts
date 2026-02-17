/**
 * FlowCap Encryption Module
 * AES-GCM encryption for session keys stored in localStorage
 * Uses Web Crypto API (SubtleCrypto) — browser-native, no dependencies
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const ITERATIONS = 100_000;

/**
 * Derive an AES key from a user-provided password (wallet signature)
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-256-GCM
 * Returns base64-encoded string: salt(16) + iv(12) + ciphertext
 */
export async function encrypt(plaintext: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext)
  );

  // Concat: salt + iv + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data encrypted with encrypt()
 */
export async function decrypt(encoded: string, password: string): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

// ─── localStorage wrapper with encryption ───────────────────────────

const STORAGE_PREFIX = 'flowcap-enc-';

/**
 * Store an encrypted value in localStorage
 * @param key - storage key
 * @param value - plaintext value to encrypt
 * @param password - encryption password (derived from wallet signature)
 */
export async function secureStore(key: string, value: string, password: string): Promise<void> {
  const encrypted = await encrypt(value, password);
  localStorage.setItem(`${STORAGE_PREFIX}${key}`, encrypted);
}

/**
 * Retrieve and decrypt a value from localStorage
 */
export async function secureRetrieve(key: string, password: string): Promise<string | null> {
  const encrypted = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
  if (!encrypted) return null;

  try {
    return await decrypt(encrypted, password);
  } catch {
    console.error(`Failed to decrypt ${key} — password may have changed`);
    return null;
  }
}

/**
 * Remove an encrypted value from localStorage
 */
export function secureRemove(key: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}

/**
 * Clear all FlowCap encrypted storage
 */
export function secureClearAll(): void {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
  // Also clear legacy unencrypted keys
  ['flowcap-session-key', 'flowcap-smart-account', 'flowcap-risk-profile', 'flowcap-max-investment', 'flowcap-delegated', 'flowcap-valid-until'].forEach((k) => localStorage.removeItem(k));
}

/**
 * Generate a deterministic encryption password from a wallet signature
 * The user signs a fixed message — the signature becomes the encryption key
 */
export const ENCRYPTION_MESSAGE = 'FlowCap: Unlock encrypted session storage';

export function derivePasswordFromSignature(signature: string): string {
  // Use first 64 chars of the hex signature as password material
  return signature.slice(2, 66);
}
