// Timezone-aware "now" parts, so the scheduler's "run at hour X" and weekend rules
// are deterministic regardless of the server's locale (spec: configurable timezone).
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type TzParts = { hour: number; weekday: number; dateKey: string; isWeekend: boolean };

/** Hour (0–23), weekday (0=Sun…6=Sat), and a YYYY-MM-DD day key in `timeZone`. */
export function tzParts(timeZone: string, now = new Date()): TzParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(now);
  } catch {
    // Bad timezone → fall back to UTC so the scheduler still works.
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour12: false,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const weekday = WEEKDAY[get("weekday")] ?? 0;
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  return { hour, weekday, dateKey, isWeekend: weekday === 0 || weekday === 6 };
}
