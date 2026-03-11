/**
 * Returns the current date formatted as an ISO 8601 string with the local
 * timezone offset (e.g. "2026-03-08T17:17:00+01:00") instead of UTC "Z".
 *
 * This relies on the TZ environment variable being set to "Europe/Rome"
 * (configured in both Dockerfile and docker-compose.yml).
 */
export function localISOString(date: Date = new Date()): string {
  const offset = -date.getTimezoneOffset(); // minutes east of UTC
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const hh = String(Math.floor(absOffset / 60)).padStart(2, '0');
  const mm = String(absOffset % 60).padStart(2, '0');

  const pad = (n: number, len = 2) => String(n).padStart(len, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${sign}${hh}:${mm}`
  );
}

/**
 * Returns a human-readable Italian date+time string.
 * Example: "11 marzo 2026, 18:23"
 */
export function italianDateTime(date: Date = new Date()): string {
  return date.toLocaleString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  });
}
