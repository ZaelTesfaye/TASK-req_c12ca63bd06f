/**
 * Unit tests for encryption helpers (AES-256-GCM + field masking).
 */

// Stub config before the encryption module imports it.
vi.mock('../../src/config/index.js', () => {
  const key = 'ab'.repeat(32); // valid 64-hex-char key
  return {
    default: { encryptionKeyHex: key },
    config: { encryptionKeyHex: key },
  };
});

// Dynamic import so the mock is in place first.
const { encrypt, decrypt, maskField } = await import('../../src/shared/encryption.js');

describe('encrypt / decrypt', () => {
  it('roundtrip produces the original plaintext', () => {
    const plaintext = 'Hello, Hospitality!';
    const ciphertext = encrypt(plaintext);
    const result = decrypt(ciphertext);

    expect(result).toBe(plaintext);
  });

  it('different plaintexts produce different ciphertexts', () => {
    const a = encrypt('alpha');
    const b = encrypt('bravo');

    expect(a).not.toBe(b);
  });

  it('same plaintext encrypted twice produces different ciphertexts (random IV)', () => {
    const a = encrypt('same-value');
    const b = encrypt('same-value');

    expect(a).not.toBe(b);
    // But both decrypt to the same value
    expect(decrypt(a)).toBe('same-value');
    expect(decrypt(b)).toBe('same-value');
  });

  it('decrypt with tampered ciphertext throws', () => {
    const ciphertext = encrypt('secret');
    // Tamper with the auth tag portion (second segment)
    const parts = ciphertext.split(':');
    parts[1] = '00'.repeat(16); // wrong auth tag
    const tampered = parts.join(':');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('handles empty string encryption and decryption', () => {
    const ciphertext = encrypt('');
    const result = decrypt(ciphertext);

    expect(result).toBe('');
  });

  it('handles unicode text', () => {
    const unicode = 'Caf\u00e9 \u2615 \u00fc\u00f6\u00e4 \u{1F600} \u4f60\u597d';
    const ciphertext = encrypt(unicode);
    const result = decrypt(ciphertext);

    expect(result).toBe(unicode);
  });

  it('ciphertext format is iv:authTag:ciphertext (hex)', () => {
    const ciphertext = encrypt('test');
    const parts = ciphertext.split(':');

    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext portion is non-empty hex
    expect(parts[2].length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(parts[0])).toBe(true);
  });
});

describe('maskField', () => {
  it('masks employee_id showing last 4 chars', () => {
    expect(maskField('EMP12345', 'employee_id')).toBe('****2345');
  });

  it('returns full value if employee_id is <= 4 chars', () => {
    expect(maskField('AB12', 'employee_id')).toBe('AB12');
  });

  it('masks phone showing last 2 digits', () => {
    expect(maskField('+1234567890', 'phone')).toBe('*********90');
  });

  it('masks email keeping first char, last char of local, and domain', () => {
    expect(maskField('user@example.com', 'email')).toBe('u**r@example.com');
  });

  it('masks email with short local part', () => {
    expect(maskField('ab@example.com', 'email')).toBe('**@example.com');
  });

  it('returns *** for email without @ sign', () => {
    expect(maskField('noemail', 'email')).toBe('***');
  });

  it('uses default masking (last 4 chars) for unknown types', () => {
    expect(maskField('ABCDEFGH', 'unknown_type')).toBe('****EFGH');
  });

  it('returns empty string for null or non-string values', () => {
    expect(maskField(null, 'phone')).toBe('');
    expect(maskField(undefined, 'email')).toBe('');
    expect(maskField(123, 'employee_id')).toBe('');
  });
});
