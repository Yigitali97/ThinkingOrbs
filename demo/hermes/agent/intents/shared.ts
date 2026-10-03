// What every Hermes intent shares: an Answer that calls tools and tracks sources, restrictions and outages,
// project-name matching and the visibility check, and small number and date formatters.

import type { Intent } from '../../../assistant/brain';
import { say } from '../../../assistant/brain';
import type { Block, BrainContext, Emit, ToolResult } from '../../../assistant/protocol';
import { hasAny, parseRange } from '../../../assistant/text';
import type { DateRange } from '../../../assistant/text';
import { DAY_MS } from '../../data/derive';
import type { Person, Project } from '../../data/types';
import { COMPANY } from '../../store';

/** The project names Hermes recognizes in a question. Names only: what a user may read about a project still comes through the policy. */
export const PROJECT_NAMES: { id: string; name: string; team: string }[] = COMPANY.projects.map((p) => ({ id: p.id, name: p.name, team: p.team }));
/** Words that ask for a written draft (the status-draft intent), which other intents leave alone. */
export const DRAFT_WORDS = ['write', 'draft', 'compose', 'prepare'];
export const CHANNELS = ['#backend', '#product', '#general'];
const TEAM_CHANNEL: Record<string, string> = { Platform: '#backend', Product: '#product' };
export const teamChannel = (team: string): string => TEAM_CHANNEL[team] ?? '#general';

const SYSTEMS: Record<string, string> = { directory: 'Directory', clockify: 'Clockify', jira: 'Jira', github: 'GitHub', teams: 'Teams', aws: 'AWS' };
const systemOf = (toolId: string): string => SYSTEMS[toolId.split('.')[0]] ?? toolId;

/** What a failed call leaves out of the answer, with the verb that agrees with it. */
export interface Missing {
  text: string;
  plural: boolean;
}
/** Missing data named in the plural: "blockers aren't included". */
export const many = (text: string): Missing => ({ text, plural: true });
/** Missing data named in the singular: "the project list isn't included". */
export const one = (text: string): Missing => ({ text, plural: false });

/** A policy refusal that ends the answer with its reason. */
export class Denied extends Error {
  constructor(
    readonly reason: string,
    readonly alternative?: string,
  ) {
    super(reason);
  }
}

/** One reply under construction: every tool call goes through it so the answer can name its sources and gaps. */
export class Answer {
  private systems: string[] = [];
  private notes: string[] = [];
  /** per system, what is missing because it didn't respond */
  private failures = new Map<string, { reason: 'failed' | 'unknown-tool'; what: Missing[] }>();

  constructor(
    readonly ctx: BrainContext,
    private emit: Emit,
    private signal: AbortSignal,
  ) {}

  /** Calls a tool and records the outcome. `what` names the data for the "didn't respond" line. */
  async result<O>(toolId: string, input: unknown, what: Missing): Promise<ToolResult<O>> {
    const r = await this.ctx.call<O>(toolId, input);
    const system = systemOf(toolId);
    if (r.ok) {
      if (!this.systems.includes(system)) this.systems.push(system);
      if (r.restricted && !this.notes.includes(r.restricted)) this.notes.push(r.restricted);
    } else if (r.reason !== 'denied') {
      const failure = this.failures.get(system) ?? { reason: r.reason, what: [] };
      if (!failure.what.some((w) => w.text === what.text)) failure.what.push(what);
      this.failures.set(system, failure);
    }
    return r;
  }

  /** The tool's data, or null when the system failed. A denial throws, which ends the answer with its reason. */
  async get<O>(toolId: string, input: unknown, what: Missing): Promise<O | null> {
    const r = await this.result<O>(toolId, input, what);
    if (r.ok) return r.data;
    if (r.reason === 'denied') throw new Denied(r.message, r.alternative);
    return null;
  }

  /** Says restriction notes first, then `lines`, then what is missing; then the blocks, then the sources. */
  async send(lines: (string | false | null | undefined)[], blocks: Block[] = []): Promise<void> {
    const missing = [...this.failures].map(([system, f]) => {
      const status = f.reason === 'failed' ? "didn't respond" : "isn't connected";
      const plural = f.what.length > 1 || f.what[0].plural;
      return `${system} ${status}, so ${listOf(f.what.map((w) => w.text))} ${plural ? "aren't" : "isn't"} included.`;
    });
    const body = [...this.notes, ...lines.filter((l): l is string => Boolean(l)), ...missing].join('\n\n');
    await say(this.emit, body, this.signal);
    for (const block of blocks) this.emit({ type: 'block', block });
    if (this.systems.length) await say(this.emit, `${body ? '\n\n' : ''}Sources: ${this.systems.join(', ')}`, this.signal);
  }
}

/** Builds an intent whose body works through an Answer; a policy denial becomes the answer. */
export function intent<P>(id: string, match: Intent<P>['match'], body: (params: P, a: Answer) => Promise<void>): Intent<P> {
  return {
    id,
    match,
    async run(params, ctx, emit, signal) {
      const a = new Answer(ctx, emit, signal);
      try {
        await body(params, a);
      } catch (e) {
        if (!(e instanceof Denied)) throw e;
        await a.send([[e.reason, e.alternative].filter(Boolean).join(' ')]);
      }
    },
  };
}

// ------------------------------------------------------------------ projects

/** The project named in the text, matched case-insensitively and ignoring a trailing 's. */
export function projectIn<T extends { name: string }>(text: string, all: T[]): T | null {
  return all.find((p) => hasAny(text, [p.name])) ?? null;
}

const NOT_PROJECTS = new Set(['I', 'It', 'This', 'That', 'The', 'There', 'AWS', 'Jira', 'GitHub', 'Teams', 'Clockify', 'Hermes', 'Directory']);
/** People's first and full names, and team names: a question about them isn't about an unknown project. */
const PEOPLE_AND_TEAMS = [
  ...new Set([...COMPANY.people.flatMap((p) => [p.name, p.name.split(' ')[0]]), ...COMPANY.people.map((p) => p.team)]),
];

/** The capitalized word after "blocking", "about" or "is", when the text names no known project, person or team. */
export function unknownProjectName(text: string): string | null {
  if (projectIn(text, PROJECT_NAMES) || hasAny(text, PEOPLE_AND_TEAMS)) return null;
  for (const m of text.replace(/[‘’]/g, "'").matchAll(/\b(?:blocking|about|is)\s+([A-Z][A-Za-z0-9-]*)/g)) {
    if (!NOT_PROJECTS.has(m[1])) return m[1];
  }
  return null;
}

export type ProjectRef = { id: string; name: string };

/**
 * The projects an answer covers: the named one if the policy lets this user see it, otherwise every visible project.
 * The check happens before anything project-specific is asked for. When the project is out of reach, or the
 * directory didn't respond, this sends the answer itself and returns null.
 */
export async function resolveProjects(a: Answer, target?: ProjectRef): Promise<Project[] | null> {
  const visible = await a.get<Project[]>('directory.projects', {}, one('the project list'));
  if (!visible) {
    await a.send([]);
    return null;
  }
  if (!target) return visible;
  const project = visible.find((p) => p.id === target.id);
  if (project) return [project];
  const yours = visible.length ? `Your projects: ${visible.map((p) => p.name).join(', ')}.` : "You don't have access to any projects.";
  await a.send([`${target.name} isn't one of the projects you can see. ${yours}`]);
  return null;
}

// ------------------------------------------------------------------ people and time

/** Engineers, for "developers" questions (Ruling R2): developer access role and a Developer job title. */
export const isDeveloper = (p: Person): boolean => p.role === 'developer' && p.title.includes('Developer');

export const nameOf = (people: Person[] | null, id: string): string => people?.find((p) => p.id === id)?.name ?? id;

/** The period the text asks about, or this week. */
export function rangeIn(text: string, now: Date): DateRange {
  return parseRange(text, now) ?? parseRange('this week', now)!;
}

const shiftDays = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds());
/** The same moment a month earlier, kept inside the shorter month (31 March becomes the last day of February). */
function monthEarlier(d: Date): Date {
  const last = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() - 1, Math.min(d.getDate(), last), d.getHours(), d.getMinutes(), d.getSeconds());
}

/** The period to compare with: the same stretch one day, week or month earlier, or the period just before. */
export function comparisonRange(r: DateRange): DateRange {
  const shifted = (shift: (d: Date) => Date, label: string): DateRange => ({ from: shift(r.from), to: shift(r.to), label });
  switch (r.label) {
    case 'today':
      return shifted((d) => shiftDays(d, -1), 'yesterday');
    case 'yesterday':
      return shifted((d) => shiftDays(d, -1), 'the day before');
    case 'this week':
      return shifted((d) => shiftDays(d, -7), 'last week');
    case 'last week':
      return shifted((d) => shiftDays(d, -7), 'the week before');
    case 'this month':
      return shifted(monthEarlier, 'last month');
    case 'last month':
      return shifted(monthEarlier, 'the month before');
    default: {
      const length = r.to.getTime() - r.from.getTime();
      return { from: new Date(r.from.getTime() - length), to: new Date(r.from), label: `before ${r.label}` };
    }
  }
}

/** A tool time window for a range: `to` is exclusive in ranges and inclusive in tools, except at "now". */
export function span(r: DateRange, now: Date): { from: number; to: number } {
  const to = r.to.getTime();
  return { from: r.from.getTime(), to: to >= now.getTime() ? now.getTime() : to - 1 };
}

export const lastDays = (now: Date, days: number) => ({ from: now.getTime() - days * DAY_MS, to: now.getTime() });

// ------------------------------------------------------------------ formatting

/** One decimal place, and 0 for anything that isn't a finite number. */
export const round1 = (n: number): number => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
export const hours = (n: number): string => `${round1(n).toLocaleString('en-US')} h`;
export const money = (n: number): string => `$${Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US')}`;
/** A whole percentage, or null when there is nothing to divide by. */
export const percentOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "a", "a and b", "a, b and c" */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Tuesday 6 October" */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Tue 14:05" */
export function shortTime(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()].slice(0, 3)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "2026-09" → "Sep" */
export function monthLabel(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1]?.slice(0, 3) ?? month;
}
export function monthName(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month;
}
