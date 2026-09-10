export class BunScheduleError extends Error { override readonly name = "BunScheduleError"; }

export interface BunCronExpression { readonly source: string; readonly minutes: ReadonlySet<number>; readonly hours: ReadonlySet<number>; readonly days: ReadonlySet<number>; readonly months: ReadonlySet<number>; readonly weekdays: ReadonlySet<number>; readonly anyDay: boolean; readonly anyWeekday: boolean }
const MONTHS: Readonly<Record<string, number>> = Object.freeze({ JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 });
const DAYS: Readonly<Record<string, number>> = Object.freeze({ SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 });
function field(source: string, minimum: number, maximum: number, names: Readonly<Record<string, number>> = {}): ReadonlySet<number> {
  const output = new Set<number>();
  const number = (text: string): number => {
    const named = names[text.toUpperCase()]; const value = named ?? (/^\d+$/.test(text) ? Number(text) : NaN);
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new BunScheduleError(`Invalid cron field value "${text}".`);
    return value;
  };
  for (const item of source.split(",")) {
    const [base, stepText, ...extra] = item.split("/");
    if (!base || extra.length || (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1))) throw new BunScheduleError(`Invalid cron field "${source}".`);
    const step = stepText === undefined ? 1 : Number(stepText); let start: number; let end: number;
    if (base === "*") { start = minimum; end = maximum; }
    else if (base.includes("-")) { const parts = base.split("-"); if (parts.length !== 2) throw new BunScheduleError(`Invalid cron range "${base}".`); start = number(parts[0]!); end = number(parts[1]!); if (end < start) throw new BunScheduleError(`Invalid descending cron range "${base}".`); }
    else { start = number(base); end = stepText === undefined ? start : maximum; }
    for (let value = start; value <= end; value += step) output.add(maximum === 7 && value === 7 ? 0 : value);
  }
  if (!output.size) throw new BunScheduleError(`Cron field "${source}" selects no values.`);
  return Object.freeze(output);
}
export function parseCronExpression(source: string): BunCronExpression {
  if (typeof source !== "string" || source.trim() !== source) throw new BunScheduleError("Cron expressions must be trimmed five-field strings.");
  const parts = source.split(/\s+/); if (parts.length !== 5) throw new BunScheduleError("Cron expressions require exactly five fields (minute hour day month weekday).");
  return Object.freeze({ source, minutes: field(parts[0]!, 0, 59), hours: field(parts[1]!, 0, 23), days: field(parts[2]!, 1, 31), months: field(parts[3]!, 1, 12, MONTHS), weekdays: field(parts[4]!, 0, 7, DAYS), anyDay: parts[2]!.startsWith("*"), anyWeekday: parts[4]!.startsWith("*") });
}
export function validateTimeZone(timezone: string): string {
  if (typeof timezone !== "string" || !timezone.trim() || timezone !== timezone.trim()) throw new BunScheduleError("Schedule timezone must be a non-empty IANA timezone.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0); } catch { throw new BunScheduleError(`Unknown IANA timezone "${timezone}".`); }
  return timezone;
}
export function cronMatches(cron: BunCronExpression, timestamp: number, timezone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" }).formatToParts(timestamp);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)!.value;
  const day = Number(get("day")); const weekday = DAYS[get("weekday").toUpperCase()]!;
  const dayMatches = cron.days.has(day); const weekdayMatches = cron.weekdays.has(weekday);
  const calendarMatches = cron.anyDay && cron.anyWeekday ? true : cron.anyDay ? weekdayMatches : cron.anyWeekday ? dayMatches : dayMatches || weekdayMatches;
  return cron.minutes.has(Number(get("minute"))) && cron.hours.has(Number(get("hour"))) && cron.months.has(Number(get("month"))) && calendarMatches;
}
