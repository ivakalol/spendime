// Calendar-only arithmetic keeps reporting dates independent of the device timezone.
export function budgetMonthWindow(today: string, startDay: number, stepsBack = 0) {
  const [year, month] = today.split('-').map(Number);
  const boundary = (offset: number) => {
    const first = new Date(Date.UTC(year!, month! - 1 + offset, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(startDay, lastDay));
    return first.toISOString().slice(0, 10);
  };
  const offset = (today < boundary(0) ? -1 : 0) - stepsBack;
  const from = boundary(offset);
  const endExclusive = boundary(offset + 1);
  const end = new Date(`${endExclusive}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { from, to: end.toISOString().slice(0, 10), endExclusive };
}
