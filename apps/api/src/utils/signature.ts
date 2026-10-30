/**
 * Upstash QStash Signature Generator and Verifier
 * Implements HMAC-SHA256 JWT signing according to Upstash QStash specification.
 */

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBuffer(bytes.buffer as ArrayBuffer);
}

function base64UrlEncodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Calculates base64url-encoded SHA-256 hash of the raw body string
 */
export async function calculateBodyHash(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(body || '');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncodeBuffer(hashBuffer);
}

/**
 * Signs an outgoing QStash webhook request and returns the JWT value for `Upstash-Signature`
 */
export async function generateQStashSignature(options: {
  url: string;
  body: string;
  signingKey: string;
  clockToleranceSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const bodyHash = await calculateBodyHash(options.body);

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload = {
    iss: 'Upstash',
    sub: options.url,
    exp: now + 300, // Valid for 5 minutes
    nbf: now - (options.clockToleranceSeconds || 5),
    iat: now,
    jti: crypto.randomUUID(),
    body: bodyHash,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(options.signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(signingInput)
  );

  const signatureB64 = base64UrlEncodeBuffer(signatureBuffer);
  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifies an incoming Upstash-Signature against a secret key and raw body
 */
export async function verifyQStashSignature(options: {
  signature: string;
  url: string;
  body: string;
  signingKey: string;
  clockToleranceSeconds?: number;
}): Promise<boolean> {
  try {
    const parts = options.signature.split('.');
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    // Verify HMAC
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(options.signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Decode signature
    let sigBase64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    while (sigBase64.length % 4) sigBase64 += '=';
    const sigBinary = atob(sigBase64);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const isValidSig = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      encoder.encode(signingInput)
    );

    if (!isValidSig) return false;

    // Decode and check claims
    const payloadJson = base64UrlDecode(payloadB64);
    const claims = JSON.parse(payloadJson);

    if (claims.iss !== 'Upstash') return false;
    if (claims.sub !== options.url) return false;

    const now = Math.floor(Date.now() / 1000);
    const tolerance = options.clockToleranceSeconds || 10;
    if (claims.exp && now > claims.exp + tolerance) return false;
    if (claims.nbf && now < claims.nbf - tolerance) return false;

    // Check body hash
    const expectedBodyHash = await calculateBodyHash(options.body);
    if (claims.body !== expectedBodyHash) return false;

    return true;
  } catch {
    return false;
  }
}
