import { describe, expect, it, vi } from 'vitest';
import { addCalendarMonths, localInputNow, toZonedLocalInput, zonedInputToIso } from '../../src/client/utils/dateTime';

describe('profile-timezone datetime inputs', () => {
  it.each([['2026-01-31', '2026-02-28'], ['2028-01-31', '2028-02-29'], ['2026-12-11', '2027-01-11']])('defaults the next monthly payment after %s to %s', (date, expected) => {
    expect(addCalendarMonths(date, 1)).toBe(expected);
  });
  it('initializes now in the requested profile timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T10:32:45.000Z'));
    expect(localInputNow('UTC')).toBe('2026-09-18T10:32');
    expect(localInputNow('Europe/Kyiv')).toBe('2026-09-18T13:32');
    vi.useRealTimers();
  });

  it('round-trips a profile-local input to the same instant', () => {
    const instant = '2026-09-18T10:32:00.000Z';
    const local = toZonedLocalInput(instant, 'Europe/Kyiv');
    expect(zonedInputToIso(local, 'Europe/Kyiv')).toBe(instant);
  });
});
