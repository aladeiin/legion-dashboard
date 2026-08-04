// Time zone helpers built entirely on the browser's native Intl API
// (no external date library needed). Handles DST transitions correctly
// because it always asks Intl for the true offset of a given instant.

/**
 * Returns the UTC offset, in minutes, of `tz` at the given UTC instant.
 */
function getOffsetMinutes(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Converts a "wall clock" date/time as seen in `tz` into a real UTC Date
 * instant. `month` is 1-indexed (1 = January), matching getZonedParts().
 * Uses a converging offset lookup so it stays correct across DST
 * transitions.
 */
function zonedTimeToUtc(year, month, day, hour, minute, tz) {
  const base = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(base);
  for (let i = 0; i < 3; i++) {
    const offset = getOffsetMinutes(tz, guess);
    const next = new Date(base - offset * 60000);
    if (next.getTime() === guess.getTime()) break;
    guess = next;
  }
  return guess;
}

/**
 * Breaks a UTC instant into wall-clock components as seen in `tz`.
 */
function getZonedParts(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: parts.hour === '24' ? 0 : Number(parts.hour),
    minute: Number(parts.minute)
  };
}

function formatOffsetLabel(tz, date) {
  const mins = getOffsetMinutes(tz, date);
  const sign = mins >= 0 ? '+' : '-';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

function formatTime(hour, minute, use24h) {
  if (use24h) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
}

if (typeof module !== 'undefined') {
  module.exports = { getOffsetMinutes, zonedTimeToUtc, getZonedParts, formatOffsetLabel, formatTime };
}
