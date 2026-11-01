import { describe, it, expect } from 'vitest';
import { parseCron, isValidCron, computeNextCron } from '../src/utils/cron.js';

describe('Cron Parser & Calculator', () => {
  it('validates common 5-part cron expressions and aliases', () => {
    expect(isValidCron('* * * * *')).toBe(true);
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 9 * * 1-5')).toBe(true);
    expect(isValidCron('30 2 * * 0')).toBe(true);
    expect(isValidCron('@hourly')).toBe(true);
    expect(isValidCron('@daily')).toBe(true);
    expect(isValidCron('@weekly')).toBe(true);
    expect(isValidCron('@monthly')).toBe(true);

    expect(isValidCron('invalid-cron')).toBe(false);
    expect(isValidCron('* * * *')).toBe(false);
    expect(isValidCron('60 * * * *')).toBe(false);
    expect(isValidCron('* 25 * * *')).toBe(false);
    expect(isValidCron('*/0 * * * *')).toBe(false);
  });

  it('correctly parses minutes, hours, and days', () => {
    const parsed = parseCron('*/15 9-17 * * 1-5');
    expect(parsed.minutes.has(0)).toBe(true);
    expect(parsed.minutes.has(15)).toBe(true);
    expect(parsed.minutes.has(30)).toBe(true);
    expect(parsed.minutes.has(45)).toBe(true);
    expect(parsed.minutes.has(10)).toBe(false);

    expect(parsed.hours.has(9)).toBe(true);
    expect(parsed.hours.has(17)).toBe(true);
    expect(parsed.hours.has(8)).toBe(false);
    expect(parsed.hours.has(18)).toBe(false);

    expect(parsed.daysOfWeek.has(1)).toBe(true);
    expect(parsed.daysOfWeek.has(5)).toBe(true);
    expect(parsed.daysOfWeek.has(0)).toBe(false); // Sunday
  });

  it('computes the next run time accurately', () => {
    // Starting on 2026-01-01 12:00:00 UTC (Thursday)
    const baseDate = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

    // Every 5 minutes -> next is 12:05:00
    const next5m = computeNextCron('*/5 * * * *', baseDate);
    const date5m = new Date(next5m);
    expect(date5m.getUTCMinutes()).toBe(5);
    expect(date5m.getUTCHours()).toBe(12);

    // Hourly -> next is 13:00:00
    const nextHour = computeNextCron('@hourly', baseDate);
    const dateHour = new Date(nextHour);
    expect(dateHour.getUTCMinutes()).toBe(0);
    expect(dateHour.getUTCHours()).toBe(13);

    // Daily -> next is 2026-01-02 00:00:00
    const nextDay = computeNextCron('@daily', baseDate);
    const dateDay = new Date(nextDay);
    expect(dateDay.getUTCDate()).toBe(2);
    expect(dateDay.getUTCHours()).toBe(0);
    expect(dateDay.getUTCMinutes()).toBe(0);
  });
});
