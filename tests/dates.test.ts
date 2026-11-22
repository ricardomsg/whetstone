import { expect, it } from 'vitest';
import { addDays, localDate, startOfDay } from '../src/lib/core/ids';

it('uses the zone it is given', () => {
	const t = Date.parse('2026-07-01T23:30:00Z');
	expect(localDate(t, 'UTC')).toBe('2026-07-01');
	expect(localDate(t, 'Europe/Lisbon')).toBe('2026-07-02');
	expect(localDate(t, 'America/New_York')).toBe('2026-07-01');
});

it('finds the start of a day in a zone', () => {
	expect(startOfDay('2026-07-02', 'UTC')).toBe(Date.parse('2026-07-02T00:00:00Z'));
	expect(startOfDay('2026-07-02', 'Europe/Lisbon')).toBe(Date.parse('2026-07-01T23:00:00Z'));
	expect(startOfDay('2026-07-02', 'Asia/Tokyo')).toBe(Date.parse('2026-07-01T15:00:00Z'));
});

it('handles days next to a clock change', () => {
	expect(startOfDay('2026-03-29', 'Europe/Lisbon')).toBe(Date.parse('2026-03-29T00:00:00Z'));
	expect(startOfDay('2026-03-30', 'Europe/Lisbon')).toBe(Date.parse('2026-03-29T23:00:00Z'));
	expect(startOfDay('2026-10-25', 'Europe/Lisbon')).toBe(Date.parse('2026-10-24T23:00:00Z'));
	expect(startOfDay('2026-10-26', 'Europe/Lisbon')).toBe(Date.parse('2026-10-26T00:00:00Z'));
});

it('handles a clock change that skips or repeats midnight', () => {
	expect(startOfDay('2026-03-08', 'America/Havana')).toBe(Date.parse('2026-03-08T05:00:00Z'));
	expect(startOfDay('2026-11-01', 'America/Havana')).toBe(Date.parse('2026-11-01T04:00:00Z'));
});

it('counts calendar days across a clock change', () => {
	expect(addDays('2026-03-30', -1)).toBe('2026-03-29');
	expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
	expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
});
