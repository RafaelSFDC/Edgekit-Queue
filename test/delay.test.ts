import { describe, it, expect } from 'vitest';
import { parseDelay } from '../src/utils/delay.js';

describe('Delay Utility', () => {
  it('should handle undefined or empty delay as immediate (0)', () => {
    expect(parseDelay(undefined)).toEqual({ success: true, visibilityAt: 0, delayMs: 0 });
    expect(parseDelay(null)).toEqual({ success: true, visibilityAt: 0, delayMs: 0 });
    expect(parseDelay('')).toEqual({ success: true, visibilityAt: 0, delayMs: 0 });
  });

  it('should parse seconds string (e.g. 10s, 30sec)', () => {
    const res = parseDelay('10s');
    expect(res.success).toBe(true);
    expect(res.delayMs).toBe(10000);
    expect(res.visibilityAt).toBeGreaterThan(Date.now());
  });

  it('should parse minutes string (e.g. 5m, 2min)', () => {
    const res = parseDelay('5m');
    expect(res.success).toBe(true);
    expect(res.delayMs).toBe(5 * 60 * 1000);
  });

  it('should parse hours string (e.g. 2h, 1hr)', () => {
    const res = parseDelay('2h');
    expect(res.success).toBe(true);
    expect(res.delayMs).toBe(2 * 60 * 60 * 1000);
  });

  it('should parse days string (e.g. 1d, 3day)', () => {
    const res = parseDelay('1d');
    expect(res.success).toBe(true);
    expect(res.delayMs).toBe(24 * 60 * 60 * 1000);
  });

  it('should reject invalid formats', () => {
    const res = parseDelay('invalid-delay');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('should reject delays exceeding 30 days', () => {
    const res = parseDelay('35d');
    expect(res.success).toBe(false);
    expect(res.error).toContain('exceeds maximum');
  });

  it('should accept raw numbers as seconds', () => {
    const res = parseDelay(60);
    expect(res.success).toBe(true);
    expect(res.delayMs).toBe(60000);
  });
});
