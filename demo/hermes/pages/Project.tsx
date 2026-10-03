// One project's page: its status, the last sprint (Ruling R4), blocked tickets, open pull requests, recent team decisions
// and hours logged. The budget appears only when the policy left `budgetHours` in the project, which it removes for Developers.

import { Chart, StatusBadge, Table } from '../../assistant/blocks/Blocks';
import type { ChartProps } from '../../assistant/blocks/Chart';
import type { StatusProps } from '../../assistant/blocks/Status';
import type { Row, User } from '../../assistant/protocol';
import { usePageContext } from '../../assistant/usePageContext';
import type { TimeReport } from '../agent/tools';
import { DAY_MS, blockedIssues, projectStatus, remainingPoints, weekStart } from '../data/derive';
import type { Issue, Meeting, Person, Project as ProjectRecord, PullRequest, Sprint } from '../data/types';
import { HERMES_PROJECTS } from '../routes';
import { Loading, dateText, dayText, hoursText, read, round1, sum, usePageData } from './shared';

const WEEKS = 6;
const DECISION_DAYS = 14;
const DECISION_MEETINGS = 4;

interface ProjectData {
  project: ProjectRecord;
  status: Pick<StatusProps, 'status' | 'reasons'>;
  lastSprint: Sprint | null;
  openPoints: number;
  blocked: Row[];
  prs: Row[];
  meetings: Meeting[];
  hours: number | null;
  weekly: ChartProps | null;
}

/** Team hours on one project in a window, as the policy totals them for this user. */
async function projectHours(user: User, projectId: string, from: number, to: number): Promise<number | null> {
  const r = await read<TimeReport>(user, 'clockify.timeEntries', { from, to, projectId });
  return r ? sum(r.data.teamTotals.map((t) => t.hours)) : null;
}

const weekLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

async function loadProject(id: string, user: User, now: Date): Promise<ProjectData | null> {
  const projects = await read<ProjectRecord[]>(user, 'directory.projects', { id });
  const project = projects?.data.find((p) => p.id === id);
  if (!project) return null;

  const people = (await read<Person[]>(user, 'directory.people'))?.data ?? [];
  const issues = (await read<Issue[]>(user, 'jira.issues', { projectId: id }))?.data ?? [];
  const sprints = (await read<Sprint[]>(user, 'jira.sprints', { projectId: id }))?.data ?? [];
  const prs = (await read<PullRequest[]>(user, 'github.pullRequests', { projectId: id }))?.data ?? [];
  const meetings =
    (await read<Meeting[]>(user, 'teams.meetings', { team: project.team, from: now.getTime() - DECISION_DAYS * DAY_MS, to: now.getTime() }))
      ?.data ?? [];
  const nameOf = (personId: string) => people.find((p) => p.id === personId)?.name ?? personId;

  const hours = await projectHours(user, id, project.start, now.getTime());
  // the last six weeks, Monday to Sunday, with this week up to now
  const monday = weekStart(now);
  const weeks: { label: string; from: number; to: number }[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    weeks.push({ label: weekLabel.format(from), from: from.getTime(), to: Math.min(next.getTime() - 1, now.getTime()) });
  }
  const perWeek: number[] = [];
  for (const w of weeks) perWeek.push(round1((await projectHours(user, id, w.from, w.to)) ?? 0));

  return {
    project,
    status: projectStatus(project, { issues, prs, sprints }, now),
    lastSprint: [...sprints].filter((s) => s.end <= now.getTime()).sort((a, b) => b.end - a.end)[0] ?? null,
    openPoints: remainingPoints(project.id, { issues }),
    blocked: blockedIssues(project.id, { issues }).map((i) => ({
      key: i.key,
      title: i.title,
      assignee: nameOf(i.assigneeId),
      blocked: i.blocked ?? '',
    })),
    prs: prs
      .filter((p) => !p.merged)
      .sort((a, b) => a.opened - b.opened)
      .map((p) => ({
        pr: `#${p.id} ${p.title}`,
        author: nameOf(p.authorId),
        opened: dateText(p.opened),
        wait: Math.floor(((p.firstReviewAt ?? now.getTime()) - p.opened) / DAY_MS),
        review: p.firstReviewAt ? 'Reviewed' : 'Waiting',
      })),
    meetings: meetings.filter((m) => m.decisions.length > 0).sort((a, b) => b.at - a.at).slice(0, DECISION_MEETINGS),
    hours,
    weekly: hours === null ? null : { type: 'bar', series: [{ name: 'Hours', values: perWeek }], x: weeks.map((w) => w.label), unit: 'h' },
  };
}

function Sections({ data }: { data: ProjectData }) {
  const { project, lastSprint } = data;
  const budget = project.budgetHours;
  const used = budget && data.hours !== null ? Math.round((data.hours / budget) * 100) : null;
  return (
    <>
      <div className="summary-grid">
        <section className="info-card">
          <h2>Sprint</h2>
          <p className="figure">
            {lastSprint ? `Last sprint: ${lastSprint.completedPoints} / ${lastSprint.committedPoints} points` : 'No finished sprint yet'}
          </p>
          {lastSprint && (
            <p className="muted">
              {dateText(lastSprint.start)} to {dateText(lastSprint.end)}
            </p>
          )}
          <p className="muted">{data.openPoints === 1 ? '1 point still open' : `${data.openPoints} points still open`}</p>
        </section>
        <section className="info-card">
          <h2>Hours logged</h2>
          <p className="figure">{data.hours === null ? 'Clockify didn’t respond' : hoursText(data.hours)}</p>
          <p className="muted">Since the project started on {dateText(project.start)}</p>
        </section>
        {budget !== undefined && (
          <section className="info-card">
            <h2>Budget</h2>
            <p className="figure">{hoursText(budget)}</p>
            {used !== null && (
              <>
                <p className="muted">{used}% used so far</p>
                <div className="bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, used)}%` }} data-over={used > 100 || undefined} />
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {data.weekly && (
        <section className="page-section">
          <h2>Hours per week</h2>
          <Chart {...data.weekly} caption={`Hours logged on ${project.name} per week, last ${WEEKS} weeks`} />
        </section>
      )}

      <section className="page-section">
        <h2>Blocked tickets</h2>
        {data.blocked.length ? (
          <div className="page-table caption-hidden">
            <Table
              columns={[
                { key: 'key', label: 'Ticket' },
                { key: 'title', label: 'Title' },
                { key: 'assignee', label: 'Assignee' },
                { key: 'blocked', label: 'Blocked by' },
              ]}
              rows={data.blocked}
              caption="Blocked tickets"
            />
          </div>
        ) : (
          <p className="muted">Nothing is blocked.</p>
        )}
      </section>

      <section className="page-section">
        <h2>Open pull requests</h2>
        {data.prs.length ? (
          <div className="page-table caption-hidden">
            <Table
              columns={[
                { key: 'pr', label: 'Pull request' },
                { key: 'author', label: 'Author' },
                { key: 'opened', label: 'Opened' },
                { key: 'wait', label: 'Review wait (days)', align: 'right' },
                { key: 'review', label: 'Review' },
              ]}
              rows={data.prs}
              caption="Open pull requests"
            />
          </div>
        ) : (
          <p className="muted">No open pull requests.</p>
        )}
      </section>

      <section className="page-section">
        <h2>Recent decisions</h2>
        {data.meetings.length ? (
          <ul className="decisions">
            {data.meetings.map((m) => (
              <li key={m.id}>
                <p className="decision-meta">
                  {project.team} {m.kind}, <time dateTime={new Date(m.at).toISOString()}>{dayText(m.at)}</time>
                </p>
                <ul>
                  {m.decisions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No decisions recorded in the last {DECISION_DAYS} days.</p>
        )}
      </section>
    </>
  );
}

/** Rendered only for a project the user may see; App shows the not-found page for any other. */
export function Project({ id }: { id: string }) {
  const name = HERMES_PROJECTS.find((p) => p.id === id)?.name ?? id;
  usePageContext({ page: 'project', id, title: name });
  const [data, broken] = usePageData((user, now) => loadProject(id, user, now), id);

  return (
    <div className="page as">
      <h1>{name}</h1>
      <div className="project-status" aria-busy={data === undefined && !broken}>
        {data === undefined ? (
          <Loading failed={broken} />
        ) : data === null ? (
          <p className="note">The directory didn’t respond, so this project can’t be shown right now.</p>
        ) : (
          <>
            <p className="project-meta">
              <StatusBadge status={data.status.status} />
              <span>
                {data.project.team} team · target {dateText(data.project.target)}
              </span>
            </p>
            <ul className="reasons">
              {data.status.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {data && <Sections data={data} />}
    </div>
  );
}
