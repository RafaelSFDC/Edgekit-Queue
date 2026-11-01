/**
 * Pure TypeScript 5-part Cron Parser & Next Occurrence Calculator
 * Zero external dependencies.
 *
 * Syntax: "minute hour dayOfMonth month dayOfWeek"
 * Also supports: "@hourly", "@daily", "@weekly", "@monthly", "@yearly"
 */

const CRON_ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

/**
 * Parses a single cron field and returns a Set of valid integer values.
 */
function parseField(field: string, min: number, max: number, isDayOfWeek = false): Set<number> {
  const allowed = new Set<number>();
  const parts = field.split(',');

  for (const part of parts) {
    if (part === '*') {
      for (let i = min; i <= max; i++) allowed.add(i);
      continue;
    }

    if (part.includes('/')) {
      const [rangePart, stepPart] = part.split('/');
      const step = parseInt(stepPart, 10);
      if (isNaN(step) || step <= 0) {
        throw new Error(`Invalid cron step: ${part}`);
      }

      let start = min;
      let end = max;

      if (rangePart !== '*') {
        if (rangePart.includes('-')) {
          const [rStart, rEnd] = rangePart.split('-').map((v) => parseInt(v, 10));
          start = rStart;
          end = rEnd;
        } else {
          start = parseInt(rangePart, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) {
          allowed.add(isDayOfWeek && i === 7 ? 0 : i);
        }
      }
      continue;
    }

    if (part.includes('-')) {
      const [start, end] = part.split('-').map((v) => parseInt(v, 10));
      if (isNaN(start) || isNaN(end) || start > end) {
        throw new Error(`Invalid cron range: ${part}`);
      }
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) {
          allowed.add(isDayOfWeek && i === 7 ? 0 : i);
        }
      }
      continue;
    }

    const num = parseInt(part, 10);
    if (isNaN(num) || num < min || num > max) {
      if (isDayOfWeek && num === 7) {
        allowed.add(0);
      } else {
        throw new Error(`Invalid cron number: ${part} outside [${min}, ${max}]`);
      }
    } else {
      allowed.add(num);
    }
  }

  return allowed;
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  raw: string;
}

/**
 * Validates and parses a 5-part cron expression.
 */
export function parseCron(cronStr: string): ParsedCron {
  const normalized = (CRON_ALIASES[cronStr.trim().toLowerCase()] || cronStr).trim();
  const parts = normalized.split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Cron expression must have exactly 5 fields, got: "${cronStr}"`);
  }

  const [minStr, hourStr, domStr, monthStr, dowStr] = parts;

  return {
    minutes: parseField(minStr, 0, 59),
    hours: parseField(hourStr, 0, 23),
    daysOfMonth: parseField(domStr, 1, 31),
    months: parseField(monthStr, 1, 12),
    daysOfWeek: parseField(dowStr, 0, 7, true),
    raw: normalized,
  };
}

/**
 * Checks if a string is a valid 5-part cron expression or alias.
 */
export function isValidCron(cronStr: string): boolean {
  try {
    parseCron(cronStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the next occurrence timestamp (in epoch milliseconds) matching the cron expression.
 * Evaluates UTC timestamps.
 */
export function computeNextCron(cronStr: string, fromDate: Date = new Date()): number {
  const cron = parseCron(cronStr);

  // Start at the beginning of the next minute
  const current = new Date(fromDate.getTime());
  current.setUTCSeconds(0, 0);
  current.setUTCMinutes(current.getUTCMinutes() + 1);

  // Max search range: 5 years into the future (~2,628,000 minutes)
  const maxSearchMinutes = 60 * 24 * 365 * 5;
  let iterations = 0;

  while (iterations < maxSearchMinutes) {
    const month = current.getUTCMonth() + 1; // 1-12
    if (!cron.months.has(month)) {
      // Advance to 1st of next month at 00:00
      current.setUTCMonth(current.getUTCMonth() + 1, 1);
      current.setUTCHours(0, 0, 0, 0);
      iterations += 60;
      continue;
    }

    const dom = current.getUTCDate(); // 1-31
    const dow = current.getUTCDay(); // 0-6
    if (!cron.daysOfMonth.has(dom) || !cron.daysOfWeek.has(dow)) {
      // Advance to next day at 00:00
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(0, 0, 0, 0);
      iterations += 60;
      continue;
    }

    const hour = current.getUTCHours(); // 0-23
    if (!cron.hours.has(hour)) {
      // Advance to next hour at 00:00
      current.setUTCHours(current.getUTCHours() + 1, 0, 0, 0);
      iterations += 60;
      continue;
    }

    const minute = current.getUTCMinutes(); // 0-59
    if (!cron.minutes.has(minute)) {
      current.setUTCMinutes(current.getUTCMinutes() + 1);
      iterations++;
      continue;
    }

    // All fields match!
    return current.getTime();
  }

  throw new Error(`Unable to find next run time for cron: "${cronStr}" within 5 years`);
}
