// The Brightline Labs company systems (Directory, Clockify, Jira, GitHub, Teams, AWS) as assistant tools.
// Tools return everything the query asks for; the role policy decides what the caller may keep.

import type { Tool } from '../../assistant/protocol';
import type {
  AwsCost,
  AwsHealth,
  Commit,
  Company,
  Issue,
  Meeting,
  Message,
  Person,
  Project,
  PullRequest,
  Sprint,
  TimeEntry,
} from '../data/types';

export interface TimeReport {
  entries: TimeEntry[];
  teamTotals: { team: string; hours: number }[];
  /** Hours per team and project, so the policy can total a team over only the projects a user may see. The policy removes it. */
  projectTotals?: { team: string; projectId: string; hours: number }[];
}

type Range = { from: number; to: number };
const inRange = (at: number, r: Range) => at >= r.from && at <= r.to;

function requireRange(input: Partial<Range>): Range {
  if (typeof input.from !== 'number' || typeof input.to !== 'number') throw new Error('A from and to time are required');
  return { from: input.from, to: input.to };
}

export function hermesTools(data: () => Company): Tool[] {
  const tool = <I, O>(id: string, system: string, label: string, run: (input: I, c: Company, now: Date) => O): Tool<I, O> => ({
    id,
    system,
    label,
    run: async (input, ctx) => run((input ?? {}) as I, data(), ctx.now),
  });

  return [
    tool<{ team?: string }, Person[]>('directory.people', 'Directory', 'Looking up people', (i, c) =>
      c.people.filter((p) => !i.team || p.team === i.team).map((p) => ({ ...p })),
    ),
    tool<{ id?: string }, Project[]>('directory.projects', 'Directory', 'Looking up projects', (i, c) =>
      c.projects.filter((p) => !i.id || p.id === i.id).map((p) => ({ ...p })),
    ),
    tool<{ from: number; to: number; personId?: string; projectId?: string }, TimeReport>(
      'clockify.timeEntries',
      'Clockify',
      'Reading Clockify',
      (i, c) => {
        const r = requireRange(i);
        const teamOf = new Map(c.people.map((p) => [p.id, p.team as string]));
        // Totals ignore `personId`, so a person filter can never turn a team total into one person's hours.
        const inScope = c.time.filter((t) => inRange(t.at, r) && (!i.projectId || t.projectId === i.projectId));
        const entries = inScope.filter((t) => !i.personId || t.personId === i.personId).map((t) => ({ ...t }));
        const byProject = new Map<string, { team: string; projectId: string; hours: number }>();
        for (const t of inScope) {
          const team = teamOf.get(t.personId);
          if (!team) continue;
          const key = `${team}|${t.projectId}`;
          const row = byProject.get(key) ?? { team, projectId: t.projectId, hours: 0 };
          row.hours += t.hours;
          byProject.set(key, row);
        }
        const projectTotals = [...byProject.values()];
        return { entries, teamTotals: totalsByTeam(projectTotals), projectTotals };
      },
    ),
    tool<{ projectId?: string; assigneeId?: string; open?: boolean; blocked?: boolean }, Issue[]>(
      'jira.issues',
      'Jira',
      'Reading Jira issues',
      (i, c) =>
        c.issues
          .filter(
            (x) =>
              (!i.projectId || x.projectId === i.projectId) &&
              (!i.assigneeId || x.assigneeId === i.assigneeId) &&
              (i.open === undefined || (x.status !== 'done') === i.open) &&
              (i.blocked === undefined || Boolean(x.blocked) === i.blocked),
          )
          .map((x) => ({ ...x })),
    ),
    tool<{ projectId?: string }, Sprint[]>('jira.sprints', 'Jira', 'Reading Jira sprints', (i, c) =>
      c.sprints.filter((s) => !i.projectId || s.projectId === i.projectId).map((s) => ({ ...s })),
    ),
    tool<{ projectId?: string; open?: boolean }, PullRequest[]>('github.pullRequests', 'GitHub', 'Reading pull requests', (i, c) =>
      c.prs
        .filter((p) => (!i.projectId || p.projectId === i.projectId) && (i.open === undefined || (p.merged === undefined) === i.open))
        .map((p) => ({ ...p, reviewerIds: [...p.reviewerIds] })),
    ),
    tool<{ from: number; to: number; projectId?: string }, Commit[]>('github.commits', 'GitHub', 'Reading commits', (i, c) => {
      const r = requireRange(i);
      const repo = i.projectId ? c.projects.find((p) => p.id === i.projectId)?.repo : undefined;
      return c.commits.filter((m) => inRange(m.at, r) && (!i.projectId || m.repo === repo)).map((m) => ({ ...m }));
    }),
    tool<{ channel?: string; from: number; to: number }, Message[]>('teams.messages', 'Teams', 'Reading Teams messages', (i, c) => {
      const r = requireRange(i);
      return c.messages.filter((m) => inRange(m.at, r) && (!i.channel || m.channel === i.channel)).map((m) => ({ ...m }));
    }),
    tool<{ kind?: string; from: number; to: number; team?: string }, Meeting[]>('teams.meetings', 'Teams', 'Reading meeting notes', (i, c) => {
      const r = requireRange(i);
      return c.meetings
        .filter((m) => inRange(m.at, r) && (!i.kind || m.kind === i.kind) && (!i.team || m.team === i.team))
        .map((m) => ({ ...m, decisions: [...m.decisions], actions: m.actions.map((a) => ({ ...a })) }));
    }),
    tool<{ months: number }, AwsCost[]>('aws.costs', 'AWS', 'Reading AWS costs', (i, c) => {
      const months = [...new Set(c.awsCosts.map((a) => a.month))].sort().slice(-Math.max(0, Math.floor(i.months ?? 0)));
      return c.awsCosts.filter((a) => months.includes(a.month)).map((a) => ({ ...a }));
    }),
    tool<Record<string, never>, AwsHealth[]>('aws.health', 'AWS', 'Checking AWS health', (_i, c) => c.awsHealth.map((h) => ({ ...h }))),
  ];
}

/** Sums project totals into one row per team, in order of first appearance. */
export function totalsByTeam(rows: { team: string; hours: number }[]): { team: string; hours: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.team, (totals.get(r.team) ?? 0) + r.hours);
  return [...totals].map(([team, hours]) => ({ team, hours }));
}
