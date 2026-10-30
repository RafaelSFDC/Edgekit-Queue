import { describe, it, expect } from 'vitest';
import {
  generateQStashSignature,
  verifyQStashSignature,
  calculateBodyHash,
} from '../src/utils/signature.js';

describe('Upstash QStash Signature (HMAC-SHA256)', () => {
  const secretKey = 'sig_secret_12345';
  const url = 'https://my-app.com/api/webhook';
  const body = JSON.stringify({ hello: 'world', event: 'payment.success' });

  it('should generate a valid JWT format with 3 segments', async () => {
    const signature = await generateQStashSignature({
      url,
      body,
      signingKey: secretKey,
    });

    const parts = signature.split('.');
    expect(parts.length).toBe(3);
  });

  it('should successfully verify a valid signature', async () => {
    const signature = await generateQStashSignature({
      url,
      body,
      signingKey: secretKey,
    });

    const isValid = await verifyQStashSignature({
      signature,
      url,
      body,
      signingKey: secretKey,
    });

    expect(isValid).toBe(true);
  });

  it('should reject a signature if body was tampered with', async () => {
    const signature = await generateQStashSignature({
      url,
      body,
      signingKey: secretKey,
    });

    const isValid = await verifyQStashSignature({
      signature,
      url,
      body: JSON.stringify({ hello: 'world', event: 'tampered' }),
      signingKey: secretKey,
    });

    expect(isValid).toBe(false);
  });

  it('should reject a signature if URL destination does not match', async () => {
    const signature = await generateQStashSignature({
      url,
      body,
      signingKey: secretKey,
    });

    const isValid = await verifyQStashSignature({
      signature,
      url: 'https://attacker.com/api/webhook',
      body,
      signingKey: secretKey,
    });

    expect(isValid).toBe(false);
  });

  it('should reject a signature if signed with a different key', async () => {
    const signature = await generateQStashSignature({
      url,
      body,
      signingKey: 'wrong_secret',
    });

    const isValid = await verifyQStashSignature({
      signature,
      url,
      body,
      signingKey: secretKey,
    });

    expect(isValid).toBe(false);
  });
});
