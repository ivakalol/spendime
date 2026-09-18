import { describe, expect, it, vi } from 'vitest';
import { localInputNow, toZonedLocalInput, zonedInputToIso } from '../../src/client/utils/dateTime';

describe('profile-timezone datetime inputs', () => {
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
