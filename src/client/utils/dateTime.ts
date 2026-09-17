export function formatInTimezone(value: string, timezone: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short', ...options }).format(new Date(value));
}
export function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function localInputNow(): string {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}
export function browserTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Converts wall-clock form input in an IANA zone to an instant. This is presentation/input
// plumbing only; authoritative reporting boundaries remain a backend responsibility.
export function zonedInputToIso(value: string, timezone: string): string {
  const [date = '', time = '00:00'] = value.split('T');
  const [year = 0, month = 1, day = 1] = date.split('-').map((part) => parseInt(part, 10));
  const [hour = 0, minute = 0] = time.split(':').map((part) => parseInt(part, 10));
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let index = 0; index < 3; index += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const get = (kind: Intl.DateTimeFormatPartTypes) => parseInt(parts.find((part) => part.type === kind)?.value ?? '0', 10);
    const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    guess += desired - shown;
  }
  return new Date(guess).toISOString();
}
