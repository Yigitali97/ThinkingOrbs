// Intents about people and time: my tickets, one person's hours, my hours, developer hours, team health and the status-update draft.
// Every figure comes from policy-filtered tool results, so a role only ever sums what it may see.

import type { Block, Column, Row, Series, Tone, User } from '../../../assistant/protocol';
import { hasAny, percentChange } from '../../../assistant/text';
import type { DateRange } from '../../../assistant/text';
import { capacityBetween, loadState, projectStatus } from '../../data/derive';
import type { Issue, Meeting, Person, Project, PullRequest, Sprint } from '../../data/types';
import { hoursRestriction, seesHoursOf } from '../../policy';
import type { TimeReport } from '../tools';
import {
  Answer, DRAFT_WORDS, Denied, PROJECT_NAMES, capitalize, comparisonRange, dayLabel, hours, intent, isDeveloper, lastDays, listOf,
  lowerFirst, many, one, percentOf, personIn, plural, projectIn, rangeIn, resolveProjects, resolveTeam, round1, span, teamChannel, teamIn,
} from './shared';
import type { PersonRef } from './shared';

const SIGN_IN = 'Sign in to use Hermes.';
const HOURS_WORDS = ['hours', 'hour', 'worked', 'timesheet', 'timesheets'];
const GROUP_WORDS = ['developers', 'developer', 'devs', 'engineers', 'team', 'everyone', 'everybody', 'people'];
const SELF_WORDS = ['i', 'my', 'me', 'mine'];
const TEAM_HEALTH_PHRASES = ['how is the team', "how's the team", 'team doing', 'team health', 'team going', 'how are we doing', 'how is everyone'];
const DRAFT_KINDS = ['update', 'status', 'message', 'post', 'summary', 'report'];
const STATUS_LABEL: Record<Issue['status'], string> = { todo: 'To do', 'in-progress': 'In progress', 'in-review': 'In review', done: 'Done' };
const STATUS_ORDER: Issue['status'][] = ['in-progress', 'in-review', 'todo', 'done'];
const HEALTH_WORDS: Record<string, string> = { 'on-track': 'on track', 'at-risk': 'at risk', 'off-track': 'off track' };

const projectName = (id: string) => PROJECT_NAMES.find((p) => p.id === id)?.name ?? id;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const right = (key: string, label: string): Column => ({ key, label, align: 'right' });
const inRange = (at: number | undefined, w: { from: number; to: number }) => at !== undefined && at >= w.from && at <= w.to;

function requireUser(a: Answer): User {
  if (!a.ctx.user) throw new Denied(SIGN_IN);
  return a.ctx.user;
}

/** Hours from report entries for the given people. */
function hoursOf(report: TimeReport | null, ids: Set<string>): number {
  return report ? sum(report.entries.filter((e) => ids.has(e.personId)).map((e) => e.hours)) : 0;
}

const teamTotal = (report: TimeReport | null, team: string) => report?.teamTotals.find((t) => t.team === team)?.hours ?? 0;
/** Capacity counts only up to now, so a range that ends later doesn't count hours not yet worked. */
const capacityIn = (p: Person, r: DateRange, now: Date) => capacityBetween(p, r.from, r.to.getTime() > now.getTime() ? now : r.to);
const soFar = (r: DateRange, now: Date) => (r.to.getTime() >= now.getTime() ? ' so far' : '');

function changeDelta(current: number, previous: TimeReport | null, previousHours: number, label: string): string {
  const change = previous ? percentChange(current, previousHours) : null;
  return change === null ? 'No change data' : `${change > 0 ? '+' : ''}${change}% vs ${label}`;
}

// ------------------------------------------------------------------ my tickets

export const myTickets = intent<true>(
  'my-tickets',
  (text) => (hasAny(text, ['ticket', 'tickets', 'issue', 'issues', 'jira']) && hasAny(text, SELF_WORDS) ? true : null),
  async (_p, a) => {
    const user = requireUser(a);
    const issues = await a.get<Issue[]>('jira.issues', { assigneeId: user.id, open: true }, many('your tickets'));
    if (!issues) return a.send([]);
    if (!issues.length) return a.send(['You have no open tickets.']);
    const sorted = [...issues].sort((x, y) => STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) || x.key.localeCompare(y.key));
    const blocked = sorted.filter((i) => i.blocked);
    const blockedList = listOf(blocked.map((i) => `${i.key} (${lowerFirst(i.blocked!)})`));
    const lines = [
      `You have ${plural(sorted.length, 'open ticket')} worth ${plural(sum(sorted.map((i) => i.points)), 'point')}.` +
        (blocked.length ? ` ${blocked.length === 1 ? '1 is' : `${blocked.length} are`} blocked: ${blockedList}.` : ''),
    ];
    const rows: Row[] = sorted.map((i) => ({
      key: i.key,
      title: i.title,
      project: projectName(i.projectId),
      status: STATUS_LABEL[i.status] + (i.blocked ? ' · blocked' : ''),
      points: i.points,
    }));
    const columns = [
      { key: 'key', label: 'Ticket' },
      { key: 'title', label: 'Title' },
      { key: 'project', label: 'Project' },
      { key: 'status', label: 'Status' },
      right('points', 'Points'),
    ];
    return a.send(lines, [{ kind: 'table', columns, rows, caption: 'Your open tickets' }]);
  },
);

// ------------------------------------------------------------------ my hours and one person's hours

/** Hours per project from report entries, as a table, or nothing when there are none. */
function byProjectTable(entries: TimeReport['entries'], caption: string): Block[] {
  const byProject = new Map<string, number>();
  for (const e of entries) byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + e.hours);
  if (!byProject.size) return [];
  const rows = [...byProject].map(([id, h]) => ({ project: projectName(id), hours: round1(h) }));
  return [{ kind: 'table', columns: [{ key: 'project', label: 'Project' }, right('hours', 'Hours')], rows, caption }];
}

/** The asker's own hours. The policy hands those over in full, so its restriction note isn't said. */
async function answerMyHours(text: string, a: Answer): Promise<void> {
  const user = requireUser(a);
  const { now } = a.ctx;
  const range = rangeIn(text, now);
  const report = await a.get<TimeReport>('clockify.timeEntries', { ...span(range, now), personId: user.id }, many('your hours'), { note: false });
  if (!report) return a.send([]);
  const people = await a.get<Person[]>('directory.people', {}, one('your capacity'));
  const mine = report.entries.filter((e) => e.personId === user.id);
  const total = sum(mine.map((e) => e.hours));
  const me = people?.find((p) => p.id === user.id);
  const capacity = me ? capacityIn(me, range, now) : 0;
  const pct = percentOf(total, capacity);
  const lines = [
    `You logged ${hours(total)} ${range.label}` +
      (pct !== null ? `, against ${hours(capacity)} of capacity${soFar(range, now)} (${pct}%)` : '') +
      '.',
  ];
  const team = report.teamTotals.find((t) => t.team === user.team);
  if (team && user.role !== 'leadership') lines.push(`The ${user.team} team logged ${hours(team.hours)} in total.`);
  return a.send(lines, byProjectTable(mine, `Your hours ${range.label} by project`));
}

/** A person named in the text who isn't the asker: "Leo's timesheet" is about Leo, even with "me" in it. */
const someoneElse = (text: string, user?: User): PersonRef | null => {
  const person = personIn(text);
  return person && person.id !== user?.id ? person : null;
};

export const personHours = intent<{ text: string; person: PersonRef }>(
  'person-hours',
  (text) => {
    if (!hasAny(text, HOURS_WORDS) || hasAny(text, GROUP_WORDS)) return null;
    const person = personIn(text);
    return person ? { text, person } : null;
  },
  async ({ text, person }, a) => {
    const user = requireUser(a);
    if (person.id === user.id) return answerMyHours(text, a);
    const { now } = a.ctx;
    const range = rangeIn(text, now);
    const people = await a.get<Person[]>('directory.people', {}, one(`${person.name}'s capacity`));
    const target = people?.find((p) => p.id === person.id);
    const team = target?.team ?? person.team;

    if (!seesHoursOf(user, { id: person.id, team })) {
      // Not this user's to see: say so in the policy's words, and give the team total they may see instead.
      const restriction = hoursRestriction(user);
      if (restriction) a.note(restriction);
      const report = await a.get<TimeReport>('clockify.timeEntries', span(range, now), many('team totals'));
      if (!report) return a.send([]);
      const total = report.teamTotals.find((t) => t.team === team) ?? report.teamTotals.find((t) => t.team === user.team);
      return a.send([total ? `The ${total.team} team logged ${hours(total.hours)} ${range.label} in total.` : `No team hours were logged ${range.label}.`]);
    }

    const input = { ...span(range, now), personId: person.id };
    const report = await a.get<TimeReport>('clockify.timeEntries', input, many(`${person.name}'s hours`), { note: false });
    if (!report) return a.send([]);
    const theirs = report.entries.filter((e) => e.personId === person.id);
    const total = sum(theirs.map((e) => e.hours));
    const capacity = target ? capacityIn(target, range, now) : 0;
    const pct = percentOf(total, capacity);
    const lines = [
      `${person.name} logged ${hours(total)} ${range.label}` +
        (pct !== null ? `, against ${hours(capacity)} of capacity${soFar(range, now)} (${pct}%)` : '') +
        '.',
    ];
    const stat: Block = {
      kind: 'stat',
      items: [{ label: `${person.name.split(' ')[0]}'s hours`, value: hours(total), delta: pct === null ? undefined : `${pct}% of capacity` }],
    };
    return a.send(lines, [stat, ...byProjectTable(theirs, `${person.name}'s hours ${range.label} by project`)]);
  },
);

export const myHours = intent<{ text: string }>(
  'my-hours',
  (text, ctx) =>
    hasAny(text, HOURS_WORDS) && hasAny(text, SELF_WORDS) && !hasAny(text, GROUP_WORDS) && !someoneElse(text, ctx.user) ? { text } : null,
  ({ text }, a) => answerMyHours(text, a),
);

// ------------------------------------------------------------------ developer hours

export const devHours = intent<{ text: string }>(
  'dev-hours',
  (text) => (hasAny(text, HOURS_WORDS) && hasAny(text, GROUP_WORDS) ? { text } : null),
  async ({ text }, a) => {
    const user = requireUser(a);
    const { now } = a.ctx;
    const range = rangeIn(text, now);
    const before = comparisonRange(range);
    const people = user.role === 'developer' ? null : await a.get<Person[]>('directory.people', {}, many('names and capacity'));
    const current = await a.get<TimeReport>('clockify.timeEntries', span(range, now), many('hours'));
    if (!current) return a.send([]);
    const previous = await a.get<TimeReport>('clockify.timeEntries', span(before, now), one(`the comparison with ${before.label}`));

    let columns: Column[];
    let rows: Row[];
    let series: Series[];
    let headline: { label: string; current: number; previous: number };
    const lines: string[] = [];

    if (user.role === 'developer' || !people) {
      // Own hours and team totals only: all the policy hands a Developer (and all anyone gets without the directory).
      const me = new Set([user.id]);
      const teams = user.role === 'developer' ? [user.team] : current.teamTotals.map((t) => t.team);
      columns = [{ key: 'who', label: 'Who' }, right('hours', 'Hours')];
      rows = [
        ...(user.role === 'developer' ? [{ who: 'You', hours: round1(hoursOf(current, me)) }] : []),
        ...teams.map((team) => ({ who: `${team} team total`, hours: round1(teamTotal(current, team)) })),
      ];
      series = [
        ...(user.role === 'developer' ? [{ name: 'You', values: [round1(hoursOf(previous, me)), round1(hoursOf(current, me))] }] : []),
        ...teams.map((team) => ({ name: `${team} team total`, values: [round1(teamTotal(previous, team)), round1(teamTotal(current, team))] })),
      ];
      if (user.role === 'developer') {
        headline = { label: 'Your hours', current: hoursOf(current, me), previous: hoursOf(previous, me) };
        const team = hours(teamTotal(current, user.team));
        lines.push(`You logged ${hours(headline.current)} ${range.label}; the ${user.team} team logged ${team} in total.`);
      } else {
        const total = sum(teams.map((t) => teamTotal(current, t)));
        headline = { label: 'Team hours', current: total, previous: sum(teams.map((t) => teamTotal(previous, t))) };
        lines.push(`Teams logged ${hours(total)} ${range.label}.`);
      }
    } else {
      const devs = people.filter((p) => isDeveloper(p) && (user.role === 'leadership' || p.team === user.team));
      const perDev = devs
        .map((p) => {
          const ids = new Set([p.id]);
          return { person: p, now: hoursOf(current, ids), before: hoursOf(previous, ids), capacity: capacityIn(p, range, now) };
        })
        .sort((x, y) => y.now - x.now);
      const others = user.role === 'manager' ? current.teamTotals.filter((t) => t.team !== user.team) : [];
      columns = [{ key: 'person', label: 'Person' }, right('hours', 'Hours'), right('capacity', 'Capacity')];
      rows = [
        ...perDev.map((d) => ({ person: d.person.name, hours: round1(d.now), capacity: round1(d.capacity) })),
        ...others.map((t) => ({ person: `${t.team} team total`, hours: round1(t.hours), capacity: '—' })),
      ];
      const total = sum(perDev.map((d) => d.now));
      const capacity = sum(perDev.map((d) => d.capacity));
      const group = user.role === 'leadership' ? 'Developers' : `${user.team} developers`;
      series = [
        { name: group, values: [round1(sum(perDev.map((d) => d.before))), round1(total)] },
        ...others.map((t) => ({ name: `${t.team} team total`, values: [round1(teamTotal(previous, t.team)), round1(t.hours)] })),
      ];
      headline = { label: 'Developer hours', current: total, previous: sum(perDev.map((d) => d.before)) };
      const pct = percentOf(total, capacity);
      lines.push(
        `The ${plural(perDev.length, user.role === 'leadership' ? 'developer' : `${user.team} developer`)} logged ${hours(total)} ${range.label}, ` +
          `against ${hours(capacity)} of capacity${soFar(range, now)}${pct !== null ? ` (${pct}%)` : ''}.`,
      );
      if (total > 0) lines.push(`${perDev[0].person.name} logged the most, ${hours(perDev[0].now)}.`);
      if (others.length) lines.push(`Other teams: ${listOf(others.map((t) => `${t.team} ${hours(t.hours)}`))}.`);
    }

    const delta = changeDelta(headline.current, previous, headline.previous, before.label);
    const blocks: Block[] = [
      { kind: 'stat', items: [{ label: headline.label, value: hours(headline.current), delta }] },
      { kind: 'table', columns, rows, caption: `Hours ${range.label}` },
    ];
    if (previous) {
      const caption = range.label === 'this week' ? 'Hours logged up to this point of each week' : undefined;
      blocks.push({ kind: 'chart', type: 'bar', x: [capitalize(before.label), capitalize(range.label)], series, unit: 'h', caption });
    }
    return a.send(lines, blocks);
  },
);

// ------------------------------------------------------------------ team health

interface Load {
  person: Person;
  hours: number;
  capacity: number;
  state: 'over' | 'under';
}

export interface Health {
  range: DateRange;
  teams: string[];
  /** "the Platform team", or "Platform and Product" for Leadership */
  scope: string;
  hours: number | null;
  capacity: number | null;
  merged: number | null;
  closed: number | null;
  blockers: Issue[] | null;
  /** people over or under capacity, among the individuals this role may see; null without hours or the directory */
  loads: Load[] | null;
  standups: Meeting[];
  issues: Issue[] | null;
  prs: PullRequest[] | null;
}

/** Gathers the team-health figures: the given teams, or else the user's team, or both delivery teams for Leadership. */
export async function gatherHealth(a: Answer, text: string, only?: string[]): Promise<Health> {
  const user = requireUser(a);
  const { now } = a.ctx;
  const range = rangeIn(text, now);
  const window = span(range, now);
  const teams = only ?? (user.role === 'leadership' ? [...new Set(PROJECT_NAMES.map((p) => p.team))] : [user.team]);
  const inScope = new Set(PROJECT_NAMES.filter((p) => teams.includes(p.team)).map((p) => p.id));

  const people = await a.get<Person[]>('directory.people', {}, many('names and capacity'));
  const time = await a.get<TimeReport>('clockify.timeEntries', window, many('hours'));
  const issues = await a.get<Issue[]>('jira.issues', {}, many('closed tickets and blockers'));
  const prs = await a.get<PullRequest[]>('github.pullRequests', {}, many('pull requests'));
  const meetings = await a.get<Meeting[]>('teams.meetings', { kind: 'standup', ...lastDays(now, 7) }, many('standup notes'));

  const members = people?.filter((p) => teams.includes(p.team)) ?? null;
  let loads: Load[] | null = null;
  // Only individuals the role may see: everyone for Leadership, their team for a Manager, themself for a Developer.
  // A team with nobody the user may see individually (another team, for a Manager) gets no over/under list at all.
  const seen = people?.filter((p) => isDeveloper(p) && teams.includes(p.team) && seesHoursOf(user, p)) ?? [];
  if (people && time && seen.length) {
    loads = seen
      .map((p) => {
        const h = hoursOf(time, new Set([p.id]));
        const capacity = capacityIn(p, range, now);
        return { person: p, hours: h, capacity, state: loadState(h, capacity) };
      })
      .filter((l): l is Load => l.state !== 'ok');
  }
  const latest = teams
    .map((team) => (meetings ?? []).filter((m) => m.team === team).sort((x, y) => y.at - x.at)[0])
    .filter((m): m is Meeting => Boolean(m));

  return {
    range,
    teams,
    scope: teams.length === 1 ? `the ${teams[0]} team` : listOf(teams),
    hours: time ? sum(teams.map((t) => teamTotal(time, t))) : null,
    capacity: members ? sum(members.map((p) => capacityIn(p, range, now))) : null,
    merged: prs ? prs.filter((p) => inScope.has(p.projectId) && inRange(p.merged, window)).length : null,
    closed: issues ? issues.filter((i) => inScope.has(i.projectId) && i.status === 'done' && inRange(i.resolved, window)).length : null,
    blockers: issues ? issues.filter((i) => inScope.has(i.projectId) && i.status !== 'done' && i.blocked) : null,
    loads,
    standups: latest,
    issues,
    prs,
  };
}

const capacityPct = (h: Health) => (h.hours !== null && h.capacity !== null ? percentOf(h.hours, h.capacity) : null);

/**
 * The teams a question names, through a project ("for Beacon") or a team ("the Product team"), once the policy lets this
 * user see them. Undefined when nothing is named; null when the named one is out of reach, after saying so.
 */
async function namedTeams(a: Answer, text: string, byProject: boolean): Promise<string[] | null | undefined> {
  const project = byProject ? projectIn(text, PROJECT_NAMES) : null;
  if (project) {
    const visible = await resolveProjects(a, project);
    return visible ? [visible[0].team] : null;
  }
  const team = teamIn(text);
  if (!team) return undefined;
  const visible = await resolveTeam(a, team);
  return visible ? [visible] : null;
}

export const teamHealth = intent<{ text: string }>(
  'team-health',
  (text) => (hasAny(text, TEAM_HEALTH_PHRASES) ? { text } : null),
  async ({ text }, a) => {
    const teams = await namedTeams(a, text, false);
    if (teams === null) return;
    const h = await gatherHealth(a, text, teams);
    const { now } = a.ctx;
    const pct = capacityPct(h);
    const tone: Tone = pct === null ? 'neutral' : pct > 110 || pct < 70 ? 'warn' : 'good';
    const lines: string[] = [];
    if (h.hours !== null) {
      lines.push(
        `${capitalize(h.scope)} logged ${hours(h.hours)} ${h.range.label}` +
          (pct !== null ? `, ${pct}% of the ${hours(h.capacity!)} capacity${soFar(h.range, now)}.` : '.'),
      );
    }
    const work: string[] = [];
    if (h.merged !== null) work.push(`${plural(h.merged, 'PR')} merged`);
    if (h.closed !== null) work.push(`${plural(h.closed, 'ticket')} closed`);
    if (work.length) lines.push(`${capitalize(listOf(work))} ${h.range.label}.`);
    if (h.loads) {
      const self = a.ctx.user?.id;
      const who = (state: Load['state']) => h.loads!.filter((l) => l.state === state).map((l) => (l.person.id === self ? 'you' : l.person.name));
      const phrase = (names: string[], state: string) =>
        names.length > 0 && `${capitalize(listOf(names))} ${names.length === 1 && names[0] !== 'you' ? 'is' : 'are'} ${state} capacity`;
      const parts = [phrase(who('over'), 'over'), phrase(who('under'), 'under')].filter(Boolean);
      lines.push(parts.length ? `${parts.join('; ')}.` : 'Nobody is over or under capacity.');
    }
    if (h.blockers) {
      if (!h.blockers.length) lines.push('No open blockers.');
      else {
        lines.push(`${plural(h.blockers.length, 'open blocker')}:`);
        lines.push(h.blockers.map((i) => `- ${i.key} ${i.title}: ${lowerFirst(i.blocked!)}`).join('\n'));
      }
    }
    for (const m of h.standups) {
      if (m.decisions.length) lines.push(`From the latest ${m.team} standup (${dayLabel(m.at)}): ${m.decisions[0]}.`);
    }

    const blocks: Block[] = [
      {
        kind: 'stat',
        items: [
          {
            label: 'Hours vs capacity',
            value: h.hours === null ? '—' : h.capacity === null ? hours(h.hours) : `${round1(h.hours)} / ${hours(h.capacity)}`,
            delta: pct === null ? undefined : `${pct}% of capacity`,
            tone,
          },
          { label: 'PRs merged', value: h.merged === null ? '—' : String(h.merged) },
          { label: 'Tickets closed', value: h.closed === null ? '—' : String(h.closed) },
        ],
      },
    ];
    if (h.loads?.length) {
      blocks.push({
        kind: 'table',
        columns: [{ key: 'person', label: 'Person' }, right('hours', 'Hours'), right('capacity', 'Capacity'), { key: 'load', label: 'Load' }],
        rows: h.loads.map((l) => ({
          person: l.person.name,
          hours: round1(l.hours),
          capacity: round1(l.capacity),
          load: l.state === 'over' ? 'Over' : 'Under',
        })),
        caption: `Over or under capacity ${h.range.label}`,
      });
    }
    return a.send(lines, blocks);
  },
);

// ------------------------------------------------------------------ status update draft

export const statusDraft = intent<{ text: string }>(
  'status-draft',
  (text) => (hasAny(text, DRAFT_WORDS) && hasAny(text, DRAFT_KINDS) ? { text } : null),
  async ({ text }, a) => {
    const teams = await namedTeams(a, text, true);
    if (teams === null) return;
    const h = await gatherHealth(a, text, teams);
    const projects = await a.get<Project[]>('directory.projects', {}, one('the project list'));
    const sprints = await a.get<Sprint[]>('jira.sprints', {}, many('sprints'));
    const pct = capacityPct(h);
    const period = h.range.label === 'this week' ? `week of ${dayLabel(h.range.from.getTime())}` : h.range.label;
    const missing = 'not available';

    const body = [`Status update for ${h.scope}, ${period}`, ''];
    const against = pct !== null ? ` against ${hours(h.capacity!)} of capacity (${pct}%)` : '';
    body.push(`- Hours: ${h.hours === null ? missing : `${hours(h.hours)} logged${against}`}`);
    body.push(`- PRs merged: ${h.merged ?? missing}`);
    body.push(`- Tickets closed: ${h.closed ?? missing}`);
    const keys = h.blockers?.map((i) => i.key).join(', ');
    body.push(`- Open blockers: ${h.blockers === null ? missing : h.blockers.length ? `${h.blockers.length} (${keys})` : 'none'}`);
    if (projects && sprints && h.issues && h.prs) {
      const data = { issues: h.issues, prs: h.prs, sprints };
      const mine = projects.filter((p) => h.teams.includes(p.team));
      const statuses = mine.map((p) => `${p.name} ${HEALTH_WORDS[projectStatus(p, data, a.ctx.now).status]}`);
      if (statuses.length) body.push(`- Projects: ${statuses.join(', ')}`);
    }

    const to = h.teams.length === 1 ? teamChannel(h.teams[0]) : '#general';
    const lines = [`Here's a draft for ${to}, built from ${h.range.label}'s numbers. It's a demo, so nothing is sent; copy it if it looks right.`];
    const subject = h.teams.length === 1 ? `${h.teams[0]} team status update` : 'Delivery teams status update';
    return a.send(lines, [{ kind: 'draft', channel: 'teams', to, subject, body: body.join('\n') }]);
  },
);
