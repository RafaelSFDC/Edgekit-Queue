const MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days maximum delay

export interface ParseDelayResult {
  success: boolean;
  visibilityAt: number;
  delayMs: number;
  error?: string;
}

export function parseDelay(delayInput?: string | number | null): ParseDelayResult {
  if (delayInput === undefined || delayInput === null || delayInput === '') {
    return {
      success: true,
      visibilityAt: 0,
      delayMs: 0,
    };
  }

  const now = Date.now();
  let delayMs = 0;

  if (typeof delayInput === 'number') {
    if (delayInput > 1_000_000_000_000) {
      // It's an absolute timestamp in milliseconds
      delayMs = Math.max(0, delayInput - now);
    } else if (delayInput > 1_000_000_000) {
      // Absolute timestamp in seconds
      delayMs = Math.max(0, delayInput * 1000 - now);
    } else {
      // Relative delay in seconds
      delayMs = delayInput * 1000;
    }
  } else if (typeof delayInput === 'string') {
    const trimmed = delayInput.trim().toLowerCase();

    // Check if it's purely digits
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      if (num > 1_000_000_000_000) {
        delayMs = Math.max(0, num - now);
      } else if (num > 1_000_000_000) {
        delayMs = Math.max(0, num * 1000 - now);
      } else {
        delayMs = num * 1000;
      }
    } else {
      const match = trimmed.match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day)?$/);
      if (!match) {
        return {
          success: false,
          visibilityAt: 0,
          delayMs: 0,
          error: 'Invalid delay format. Supported formats: 10s, 5m, 2h, 1d or raw seconds.',
        };
      }

      const value = parseInt(match[1], 10);
      const unit = match[2] || 's';

      switch (unit) {
        case 's':
        case 'sec':
          delayMs = value * 1000;
          break;
        case 'm':
        case 'min':
          delayMs = value * 60 * 1000;
          break;
        case 'h':
        case 'hr':
          delayMs = value * 60 * 60 * 1000;
          break;
        case 'd':
        case 'day':
          delayMs = value * 24 * 60 * 60 * 1000;
          break;
        default:
          delayMs = value * 1000;
      }
    }
  }

  if (delayMs > MAX_DELAY_MS) {
    return {
      success: false,
      visibilityAt: 0,
      delayMs: 0,
      error: `Delay exceeds maximum allowed limit (${MAX_DELAY_MS / 86400000} days).`,
    };
  }

  const visibilityAt = delayMs > 0 ? now + delayMs : 0;
  return {
    success: true,
    visibilityAt,
    delayMs,
  };
}
