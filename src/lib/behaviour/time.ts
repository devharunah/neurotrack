/**
 * Time-zone helpers built on Intl only. Studies run in one IANA time zone (default
 * Africa/Kampala), and "time of day" or "which day" always means the study's local wall time.
 */

export const DEFAULT_TIME_ZONE = "Africa/Kampala";

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading of `date` in `timeZone`. */
export function wallTime(date: Date, timeZone: string): WallTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  return {
    year: parts["year"] ?? 1970,
    month: parts["month"] ?? 1,
    day: parts["day"] ?? 1,
    hour: (parts["hour"] ?? 0) % 24,
    minute: parts["minute"] ?? 0,
    second: parts["second"] ?? 0,
  };
}

/** Minutes the zone is ahead of UTC at `date` (Kampala: +180). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const w = wallTime(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/** `YYYY-MM-DD` of the local calendar day. */
export function localDateKey(date: Date, timeZone: string): string {
  const w = wallTime(date, timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

export function localHour(date: Date, timeZone: string): number {
  return wallTime(date, timeZone).hour;
}

/** ISO 8601 local wall time with its UTC offset, e.g. `2026-11-20T19:30:00+03:00`. */
export function toZonedIso(date: Date, timeZone: string): string {
  const w = wallTime(date, timeZone);
  const offset = offsetMinutes(date, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(
    w.second,
  )}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The instant at which the wall clock in `timeZone` reads the given local time. */
export function zonedTimeToUtc(
  local: Pick<WallTime, "year" | "month" | "day" | "hour" | "minute">,
  timeZone: string,
): Date {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  let guess = naive - offsetMinutes(new Date(naive), timeZone) * 60_000;
  // A second pass settles guesses that straddle a daylight-saving change.
  guess = naive - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

/** Whole days from local day `from` to local day `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** The local day key `days` after `key`. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return date.toISOString().slice(0, 10);
}
