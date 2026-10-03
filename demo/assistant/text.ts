// Small text helpers for rule-based brains: normalizing a question, matching words,
// reading a time range ("this week", "last month") and comparing two periods.

export interface DateRange {
  from: Date;
  /** exclusive */
  to: Date;
  label: string;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when any of `words` (or phrases) appears as a whole word in the text. */
export function hasAny(text: string, words: string[]): boolean {
  const t = normalize(text);
  return words.some((w) => new RegExp(`(^|[^a-z0-9])${escape(normalize(w))}($|[^a-z0-9])`).test(t));
}

const day = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);

/** Recognizes a period in a question. Weeks start Monday 00:00 local; `to` is exclusive. */
export function parseRange(text: string, now: Date): DateRange | null {
  // the "last" and "yesterday" forms first, so "last week" never reads as "this week"
  if (hasAny(text, ['yesterday'])) return { from: day(now, -1), to: day(now), label: 'yesterday' };
  if (hasAny(text, ['today'])) return { from: day(now), to: now, label: 'today' };
  const monday = day(now, -((now.getDay() + 6) % 7));
  if (hasAny(text, ['last week'])) return { from: day(monday, -7), to: monday, label: 'last week' };
  if (hasAny(text, ['this week'])) return { from: monday, to: now, label: 'this week' };
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  if (hasAny(text, ['last month'])) return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: month, label: 'last month' };
  if (hasAny(text, ['this month'])) return { from: month, to: now, label: 'this month' };
  return null;
}

/** The period of the same length immediately before `r`. */
export function previousRange(r: DateRange): DateRange {
  const length = r.to.getTime() - r.from.getTime();
  const raw = r.from.getTime() - length;
  // keep local midnight a midnight across a clock change
  const shift = (new Date(raw).getTimezoneOffset() - r.from.getTimezoneOffset()) * 60_000;
  return { from: new Date(raw + shift), to: new Date(r.from), label: `before ${r.label}` };
}

/** Percent change to one decimal, or null when there is nothing to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10 || 0;
}
