/** Today → time; this year → day and month; older → day, month and year. */
export function shortDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The heading a list row sits under: Today, Yesterday, else the weekday and date. */
export function dayGroup(iso, now = new Date()) {
  const date = new Date(iso);
  if (sameDay(date, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString([], options);
}

/** "2026-10-05" → "Monday 5 October" (a calendar date, so no time zone shift). */
export function longDate(ymd) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function sameDay(a, b) {
  return a.toDateString() === b.toDateString();
}
