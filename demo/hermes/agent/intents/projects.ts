// Intents about projects: "this one" on a project page, project status and what's blocking a project.
// A named project is checked against the user's visible projects before anything about it is requested.

import type { BrainContext } from '../../../assistant/protocol';
import { hasAny, normalize } from '../../../assistant/text';
import { HERMES_ROOT } from '../../config';
import { DAY_MS, projectStatus, waitingPrs } from '../../data/derive';
import type { ProjectHealth } from '../../data/derive';
import type { Issue, Message, Person, Project, PullRequest, Sprint } from '../../data/types';
import type { Answer, ProjectRef } from './shared';
import {
  DRAFT_WORDS, PROJECT_NAMES, intent, lastDays, listOf, lowerFirst, many, nameOf, plural, projectIn, resolveProjects, teamChannel,
  unknownProjectName,
} from './shared';

const BLOCKER_WORDS = ['blocking', 'blocked', 'blockers', 'blocker', 'blocks', 'stuck', 'holding up'];
/** Words that mean the question is about something other than the page's project, even if it says "this" or "it". */
const OTHER_TOPICS = [
  'hours', 'hour', 'ticket', 'tickets', 'aws', 'cloud', 'standup', 'meeting', 'decide', 'decided', 'decisions', 'summarize', 'summary',
  'write', 'draft', 'team', 'projects',
];
export const HEALTH_WORDS: Record<string, string> = { 'on-track': 'on track', 'at-risk': 'at risk', 'off-track': 'off track' };
const ALL_PROJECTS = ['projects going', 'projects doing', 'project status', 'status of the projects', 'how are the projects', 'all projects'];
const ONE_PROJECT = ['how is', "how's", 'how are', 'status', 'doing', 'going', 'on track'];
const MESSAGE_HINTS = ['block', 'blocked', 'waiting', 'stuck', 'review', 'retry', 'flaky', 'credentials', 'vendor', 'slow'];

type Target = { target?: ProjectRef; unknown?: string };

const cantFind = (name: string) => `I can't find a project called ${name}.`;

export interface ProjectResult {
  project: Project;
  status: ProjectHealth;
  reasons: string[];
}

/**
 * The health of each of `projects` (already visible to the user), from policy-filtered Jira and GitHub data; null when a system
 * didn't respond. `known` hands over data the caller already fetched with no project filter, so it isn't asked for twice.
 */
export async function projectResults(
  a: Answer,
  projects: Project[],
  only: { projectId?: string } = {},
  known: { issues?: Issue[] | null; prs?: PullRequest[] | null } = {},
): Promise<ProjectResult[] | null> {
  const issues = known.issues ?? (await a.get<Issue[]>('jira.issues', only, many('tickets')));
  const sprints = await a.get<Sprint[]>('jira.sprints', only, many('sprints'));
  const prs = known.prs ?? (await a.get<PullRequest[]>('github.pullRequests', only, many('pull requests')));
  if (!issues || !sprints || !prs) return null;
  return projects.map((p) => ({ project: p, ...projectStatus(p, { issues, prs, sprints }, a.ctx.now) }));
}

/** Status for one or all visible projects, as `status` blocks linking to each project page. */
async function answerStatus(a: Answer, target?: ProjectRef): Promise<void> {
  const projects = await resolveProjects(a, target);
  if (!projects) return;
  const results = await projectResults(a, projects, target ? { projectId: target.id } : {});
  if (!results) return a.send(["I need Jira and GitHub to work out project status, so I can't show it right now."]);

  const describe = (r: ProjectResult) => `${r.project.name} is ${HEALTH_WORDS[r.status]}: ${r.reasons.map(lowerFirst).join('; ')}.`;
  const lines: string[] = [];
  if (target) lines.push(describe(results[0]));
  else {
    const onTrack = results.filter((r) => r.status === 'on-track').length;
    lines.push(`${onTrack} of ${plural(results.length, 'project')} ${onTrack === 1 ? 'is' : 'are'} on track.`);
    for (const r of results) if (r.status !== 'on-track') lines.push(describe(r));
  }
  return a.send(
    lines,
    results.map((r) => ({
      kind: 'status' as const,
      title: r.project.name,
      status: r.status,
      reasons: r.reasons,
      sources: ['Jira', 'GitHub'],
      href: `${HERMES_ROOT}/projects/${r.project.id}`,
    })),
  );
}

/** Blocked tickets, PRs waiting for review and related messages in the team's channel, for one or all visible projects. */
async function answerBlockers(a: Answer, target?: ProjectRef): Promise<void> {
  const projects = await resolveProjects(a, target);
  if (!projects) return;
  const { now } = a.ctx;
  const only = target ? { projectId: target.id } : {};
  const people = await a.get<Person[]>('directory.people', {}, many('names'));
  const issues = await a.get<Issue[]>('jira.issues', { ...only, open: true, blocked: true }, many('blocked tickets'));
  const prs = await a.get<PullRequest[]>('github.pullRequests', { ...only, open: true }, many('pull requests'));
  const channels = [...new Set(projects.map((p) => teamChannel(p.team)))];
  const messages: Message[] = [];
  for (const channel of channels) {
    messages.push(...((await a.get<Message[]>('teams.messages', { channel, ...lastDays(now, 7) }, many(`${channel} messages`))) ?? []));
  }

  const ids = new Set(projects.map((p) => p.id));
  const subject = target ? target.name : 'Your projects';
  const lines: string[] = [];
  const blocked = issues?.filter((i) => ids.has(i.projectId)) ?? null;
  if (blocked) {
    const count = plural(blocked.length, 'blocked ticket');
    lines.push(blocked.length ? `${subject} ${target ? 'has' : 'have'} ${count}.` : `Nothing in ${subject} is blocked.`);
  }

  if (prs) {
    const waiting = projects.flatMap((p) => waitingPrs(p.id, { prs }, now));
    if (!waiting.length) lines.push('No pull request has waited more than 3 days for a review.');
    for (const pr of waiting) {
      const days = Math.floor((now.getTime() - pr.opened) / DAY_MS);
      const reviewers = pr.reviewerIds.length ? ` (${listOf(pr.reviewerIds.map((id) => nameOf(people, id)))} asked to review)` : '';
      const by = nameOf(people, pr.authorId);
      lines.push(`A pull request is waiting for review: “${pr.title}” by ${by}, open ${plural(days, 'day')} with no review${reviewers}.`);
    }
  }

  const names = projects.map((p) => p.name);
  const related = messages
    .filter((m) => hasAny(m.text, names) || MESSAGE_HINTS.some((w) => normalize(m.text).includes(w)))
    .sort((x, y) => y.at - x.at)
    .slice(0, 3);
  if (related.length) {
    lines.push(`Related in ${listOf(channels)} in the last 7 days:`);
    lines.push(related.map((m) => `- ${nameOf(people, m.authorId)}: “${m.text}”`).join('\n'));
  } else if (messages.length) {
    lines.push(`Nothing in ${listOf(channels)} in the last 7 days looks related.`);
  }

  const multi = projects.length > 1;
  const blocks = blocked?.length
    ? [
        {
          kind: 'table' as const,
          columns: [
            { key: 'key', label: 'Ticket' },
            ...(multi ? [{ key: 'project', label: 'Project' }] : []),
            { key: 'title', label: 'Title' },
            { key: 'assignee', label: 'Assignee' },
            { key: 'blocked', label: 'Blocked by' },
          ],
          rows: blocked.map((i) => ({
            key: i.key,
            ...(multi ? { project: projects.find((p) => p.id === i.projectId)?.name ?? i.projectId } : {}),
            title: i.title,
            assignee: nameOf(people, i.assigneeId),
            blocked: i.blocked ?? '',
          })),
          caption: `Blocked tickets in ${subject}`,
        },
      ]
    : [];
  return a.send(lines, blocks);
}

/** The page's project when the question says "this" or "it" (but not "this week") and isn't about another topic. */
function pageProject(text: string, ctx: BrainContext): { target: ProjectRef; blockers: boolean } | null {
  if (ctx.page.page !== 'project' || !ctx.page.id) return null;
  const t = normalize(text).replace(/\b(this|last|next) (week|month|sprint)\b/g, ' ');
  if (!hasAny(t, ['this', 'it', 'here']) || hasAny(t, OTHER_TOPICS)) return null;
  const named = projectIn(text, PROJECT_NAMES);
  if (named && named.id !== ctx.page.id) return null;
  const target = PROJECT_NAMES.find((p) => p.id === ctx.page.id) ?? { id: ctx.page.id, name: ctx.page.title };
  return { target: { id: target.id, name: target.name }, blockers: hasAny(t, BLOCKER_WORDS) };
}

function namedTarget(text: string): Target | null {
  const named = projectIn(text, PROJECT_NAMES);
  if (named) return { target: { id: named.id, name: named.name } };
  const unknown = unknownProjectName(text);
  return unknown ? { unknown } : null;
}

export const thisProject = intent<{ target: ProjectRef; blockers: boolean }>('this-project', pageProject, ({ target, blockers }, a) =>
  blockers ? answerBlockers(a, target) : answerStatus(a, target),
);

export const projectBlockers = intent<Target>(
  'project-blockers',
  (text) => (hasAny(text, BLOCKER_WORDS) ? namedTarget(text) ?? (hasAny(text, ['us', 'we', 'our', 'projects']) ? {} : null) : null),
  async ({ target, unknown }, a) => (unknown ? a.send([cantFind(unknown)]) : answerBlockers(a, target)),
);

export const projectStatusIntent = intent<Target>(
  'project-status',
  (text) => {
    // "write a status update for Atlas" asks for a draft, not a status
    if (hasAny(text, DRAFT_WORDS)) return null;
    if (hasAny(text, ALL_PROJECTS)) return {};
    const named = projectIn(text, PROJECT_NAMES);
    if (named && hasAny(text, ONE_PROJECT)) return { target: { id: named.id, name: named.name } };
    const unknown = hasAny(text, ['how is', "how's", 'status of']) ? unknownProjectName(text) : null;
    return unknown ? { unknown } : null;
  },
  async ({ target, unknown }, a) => (unknown ? a.send([cantFind(unknown)]) : answerStatus(a, target)),
);
