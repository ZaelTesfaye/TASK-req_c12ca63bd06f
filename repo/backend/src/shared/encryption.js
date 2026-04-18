/**
 * Encryption Helpers
 *
 * AES-256-GCM encryption / decryption and field masking utilities.
 * Uses the encryption key from the centralized config module.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import config from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/** Derive the 32-byte key from the hex string in config. */
const encryptionKey = Buffer.from(config.encryptionKeyHex, 'hex');

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param {string} plaintext - The value to encrypt
 * @returns {string} Format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt a string produced by `encrypt()`.
 *
 * @param {string} encryptedString - Format: iv:authTag:ciphertext (hex)
 * @returns {string} The original plaintext
 */
export function decrypt(encryptedString) {
  const [ivHex, authTagHex, ciphertext] = encryptedString.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Mask a sensitive field for display purposes.
 *
 * @param {string} value - The raw value
 * @param {string} type  - Masking strategy: 'employee_id' | 'phone' | 'email' | default
 * @returns {string} The masked value
 */
export function maskField(value, type) {
  if (!value || typeof value !== 'string') return '';

  switch (type) {
    case 'employee_id': {
      // Show last 4 characters
      if (value.length <= 4) return value;
      return '*'.repeat(value.length - 4) + value.slice(-4);
    }

    case 'phone': {
      // Show last 2 digits
      if (value.length <= 2) return value;
      return '*'.repeat(value.length - 2) + value.slice(-2);
    }

    case 'email': {
      // Mask the local part, keep domain
      const atIndex = value.indexOf('@');
      if (atIndex <= 0) return '***';
      const local = value.slice(0, atIndex);
      const domain = value.slice(atIndex);
      if (local.length <= 2) {
        return '*'.repeat(local.length) + domain;
      }
      return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + domain;
    }

    default: {
      // Show last 4 characters
      if (value.length <= 4) return value;
      return '*'.repeat(value.length - 4) + value.slice(-4);
    }
  }
}
