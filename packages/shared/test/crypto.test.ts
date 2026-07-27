import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from '../src/crypto';

const KEY = 'ab'.repeat(32);

describe('secret encryption', () => {
  it('round-trips', () => {
    const token = '1//refresh-token-value';
    expect(decryptSecret(encryptSecret(token, KEY), KEY)).toBe(token);
  });

  it('produces different ciphertexts per call (fresh IV)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('rejects tampered ciphertext', () => {
    const payload = Buffer.from(encryptSecret('secret', KEY), 'base64');
    payload[payload.length - 1] = payload[payload.length - 1]! ^ 0xff;
    expect(() => decryptSecret(payload.toString('base64'), KEY)).toThrow();
  });

  it('rejects a wrong key', () => {
    const encrypted = encryptSecret('secret', KEY);
    expect(() => decryptSecret(encrypted, 'cd'.repeat(32))).toThrow();
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('rejects malformed stored values', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
  });
});
