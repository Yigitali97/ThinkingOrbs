// Seeded generator for the Brightline Labs demo company: six weeks of Clockify, Jira, GitHub and Teams data
// and six months of AWS cost. A random pass fills the history, then the demo scenarios are planted
// relative to `now` so they hold whatever day the site is opened.

import { int, pick, seeded } from '../../assistant/random';
import { SPRINT_DAYS } from '../config';
import { DAY_MS, proRatedCapacity, velocity, weekStart } from './derive';
import type {
  AwsCost, AwsHealth, AwsService, Commit, Company, Issue, Meeting, Message, Person, ProjectId, Project, PullRequest, Sprint,
  TeamName, TimeEntry,
} from './types';

type Rng = () => number;

const HOUR = 3_600_000;
const HISTORY_DAYS = 42;
const SERVICES: AwsService[] = ['EC2', 'RDS', 'S3', 'Lambda', 'CloudFront'];

const person = (id: string, name: string, title: string, role: Person['role'], team: TeamName, capacityHours: number): Person => ({
  id, name, title, role, team, capacityHours,
});

const PEOPLE: Person[] = [
  person('p-maya', 'Maya Chen', 'CTO', 'leadership', 'Leadership', 0),
  person('p-elena', 'Elena Rossi', 'Head of Product', 'leadership', 'Leadership', 0),
  person('p-daniel', 'Daniel Okafor', 'Engineering Manager', 'manager', 'Platform', 30),
  person('p-sara', 'Sara Lindqvist', 'Developer', 'developer', 'Platform', 40),
  person('p-leo', 'Leo Park', 'Senior Developer', 'developer', 'Platform', 40),
  person('p-marcus', 'Marcus Webb', 'Developer', 'developer', 'Platform', 40),
  person('p-ines', 'Ines Duarte', 'Staff Developer', 'developer', 'Platform', 40),
  person('p-tomas', 'Tomas Novak', 'QA Engineer', 'developer', 'Platform', 40),
  person('p-priya', 'Priya Nair', 'Engineering Manager', 'manager', 'Product', 30),
  person('p-amir', 'Amir Haddad', 'Senior Developer', 'developer', 'Product', 40),
  person('p-chloe', 'Chloe Martin', 'Developer', 'developer', 'Product', 40),
  person('p-jonas', 'Jonas Weber', 'Developer', 'developer', 'Product', 40),
  person('p-nina', 'Nina Kowalski', 'Product Designer', 'developer', 'Product', 32),
  person('p-omar', 'Omar Reyes', 'Product Manager', 'developer', 'Product', 32),
];

const TEAM_PROJECTS: Record<TeamName, ProjectId[]> = {
  Platform: ['atlas', 'delta'],
  Product: ['comet', 'beacon'],
  Leadership: [],
};

const PROJECT_DEFS: { id: ProjectId; name: string; team: TeamName; budgetHours: number; repo: string; prefix: string; base: number }[] = [
  { id: 'atlas', name: 'Atlas', team: 'Platform', budgetHours: 1800, repo: 'brightline/atlas-api', prefix: 'ATL', base: 21 },
  { id: 'delta', name: 'Delta', team: 'Platform', budgetHours: 1400, repo: 'brightline/delta-pipeline', prefix: 'DLT', base: 20 },
  { id: 'beacon', name: 'Beacon', team: 'Product', budgetHours: 1600, repo: 'brightline/beacon-app', prefix: 'BCN', base: 24 },
  { id: 'comet', name: 'Comet', team: 'Product', budgetHours: 1500, repo: 'brightline/comet-web', prefix: 'CMT', base: 18 },
];

/** Per project: remaining work as a multiple of velocity, and the target date in days from now. */
const PLAN: Record<ProjectId, { remaining: number; targetDays: number; blocked: number }> = {
  atlas: { remaining: 1.5, targetDays: 42, blocked: 3 },
  beacon: { remaining: 1.6, targetDays: 56, blocked: 1 },
  delta: { remaining: 2.2, targetDays: 84, blocked: 1 },
  comet: { remaining: 3.6, targetDays: 42, blocked: 1 }, // 4 sprints of work, 3 sprints to the target: 2 weeks late
};

const NOUNS: Record<ProjectId, string[]> = {
  atlas: ['payments webhook', 'ledger API', 'auth tokens', 'rate limiter', 'invoice export', 'retry queue', 'audit log'],
  delta: ['ETL job', 'schema migration', 'warehouse sync', 'data validation', 'backfill script', 'job scheduler'],
  beacon: ['onboarding flow', 'push notifications', 'settings screen', 'offline mode', 'deep links', 'profile page'],
  comet: ['dashboard charts', 'checkout page', 'search filters', 'report builder', 'theme switcher', 'session timeout'],
};
const VERBS = ['Add', 'Fix', 'Refactor', 'Speed up', 'Document', 'Test', 'Harden', 'Simplify'];
const BLOCKERS = [
  'Waiting on payments vendor sandbox credentials',
  'Blocked by the auth service rate-limit change',
  'Needs a decision on the webhook retry policy',
  'Waiting on the staging database refresh',
  'Waiting on final design specs',
];
const BLOCKED_BY: Record<ProjectId, string[]> = {
  atlas: BLOCKERS.slice(0, 3),
  delta: [BLOCKERS[3]],
  beacon: [BLOCKERS[4]],
  comet: ['Waiting on the analytics team to expose the events API'],
};
const COMMIT_WHAT = ['handle empty responses', 'tighten input checks', 'cache the lookup', 'rename the config flag', 'cover the edge case', 'drop the unused import'];
const MEETING_DECISIONS = [
  'Keep the sprint scope as planned',
  'Move the demo to Thursday afternoon',
  'Review pull requests within one working day',
  'Defer the dependency upgrade to next sprint',
  'Use the shared staging environment for QA',
];
const MEETING_ACTIONS = ['Update the board before lunch', 'Share the test plan', 'Book the release window', 'Triage the new bug reports'];
const TIME_WORK = ['Implementation', 'Code review', 'Pairing', 'Planning and refinement', 'Bug fixing', 'Testing'];
const CHAT: Record<Message['channel'], string[]> = {
  '#backend': [
    'Staging is green again after the deploy.', 'Can someone review my PR on the queue consumer?', 'The nightly job finished in 12 minutes.',
    'Heads up: rotating the service tokens at 16:00.', 'The retry queue is draining slowly, looking into it.', 'Pushed a fix for the flaky integration test.',
    'Do we still need the v1 endpoint?', 'Load looks fine on the replicas.',
  ],
  '#product': [
    'New mocks are in the design file.', 'Customer feedback on onboarding is positive.', 'Can we cut the settings redesign from this sprint?',
    'Usability test is booked for Friday.', 'Copy for the empty state is approved.', 'Analytics events are firing correctly on staging.',
  ],
  '#general': [
    'Reminder: all-hands moves to 15:00.', 'Welcome to the new starters this week!', 'The office wifi is back up.',
    'Lunch and learn on observability on Thursday.', 'Quarterly goals are in the wiki.',
  ],
};

/** Local-midnight offset from today, plus an optional hour of the day (fractions allowed). */
const dayAt = (now: Date, offset: number, hour = 0): number =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, Math.floor(hour), Math.round((hour % 1) * 60)).getTime();
const isWeekday = (now: Date, offset: number): boolean => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset).getDay();
  return d >= 1 && d <= 5;
};
const pad = (n: number): string => String(n).padStart(2, '0');
const dateKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

/** Whole-number point pieces that add up exactly to `total`. */
function fillPoints(rng: Rng, total: number): number[] {
  const out: number[] = [];
  for (let left = total; left > 0; ) {
    const p = Math.min(left, pick(rng, [1, 2, 3, 3, 5, 8]));
    out.push(p);
    left -= p;
  }
  return out;
}

export function generateCompany(seed: number, now: Date): Company {
  const rng = seeded(seed);
  const nowMs = now.getTime();
  const dayOffset = -((now.getDay() + 6) % 7); // Monday of this week, in days from today
  const monday = weekStart(now).getTime();
  const workdays: number[] = [];
  for (let off = -HISTORY_DAYS; off <= 0; off++) if (isWeekday(now, off)) workdays.push(off);
  const team = (name: TeamName) => PEOPLE.filter((p) => p.team === name);
  const workers = (name: TeamName) => team(name).filter((p) => p.role !== 'manager');
  const developers = (name: TeamName) => team(name).filter((p) => p.role === 'developer' && p.title.includes('Developer'));
  const projectOf = (t: TeamName): ProjectId => (rng() < 0.6 ? TEAM_PROJECTS[t][0] : TEAM_PROJECTS[t][1]);

  const people = PEOPLE.map((p) => ({ ...p }));
  const defs = new Map(PROJECT_DEFS.map((d) => [d.id, d]));

  // --- Clockify: a few entries per person per working day -------------------------------------------------
  let time: TimeEntry[] = [];
  for (const off of workdays) {
    for (const p of people) {
      if (p.team === 'Leadership') continue;
      const daily = (p.capacityHours / 5) * (0.8 + rng() * 0.25);
      const parts = int(rng, 1, 3);
      for (let k = 0; k < parts; k++) {
        const at = dayAt(now, off, 9 + k * 3 + rng() * 1.5);
        const projectId = projectOf(p.team);
        const description = pick(rng, TIME_WORK);
        if (at > nowMs) continue;
        time.push({ personId: p.id, projectId, at, hours: Math.max(0.25, Math.round((daily / parts) * 4) / 4), description });
      }
    }
  }

  // --- Sprints and Jira ------------------------------------------------------------------------------------
  const sprints: Sprint[] = [];
  const issues: Issue[] = [];
  const projects: Project[] = [];
  for (const def of PROJECT_DEFS) {
    const pool = workers(def.team);
    let n = 0;
    const key = () => `${def.prefix}-${++n}`;
    const title = () => `${pick(rng, VERBS)} ${pick(rng, NOUNS[def.id])}`;
    for (let s = 0; s < 3; s++) {
      const start = dayAt(now, dayOffset - HISTORY_DAYS + SPRINT_DAYS * s);
      const end = dayAt(now, dayOffset - HISTORY_DAYS + SPRINT_DAYS * (s + 1));
      const completed = def.base + int(rng, -3, 3);
      sprints.push({ id: `${def.id}-sprint-${s + 1}`, projectId: def.id, start, end, committedPoints: completed + int(rng, 0, 6), completedPoints: completed });
      for (const points of fillPoints(rng, completed)) {
        const resolved = start + Math.floor(rng() * (end - start - DAY_MS));
        issues.push({
          key: key(), projectId: def.id, title: title(), status: 'done', assigneeId: pick(rng, pool).id, points,
          created: Math.max(start - 2 * DAY_MS, resolved - int(rng, 2, 12) * DAY_MS), resolved,
        });
      }
    }
    if (nowMs - monday >= 9 * HOUR) {
      for (let k = int(rng, 1, 3); k > 0; k--) {
        const resolved = monday + Math.floor(rng() * (nowMs - monday));
        issues.push({
          key: key(), projectId: def.id, title: title(), status: 'done', assigneeId: pick(rng, pool).id, points: pick(rng, [1, 2, 3, 5]),
          created: resolved - int(rng, 3, 10) * DAY_MS, resolved,
        });
      }
    }
    // open work, sized against velocity so each project's projected finish is known
    const v = velocity(def.id, sprints);
    const open = fillPoints(rng, Math.round(v * PLAN[def.id].remaining));
    open.forEach((points, i) => {
      const blocked = i < PLAN[def.id].blocked;
      issues.push({
        key: key(), projectId: def.id, title: title(), points, assigneeId: pick(rng, pool).id,
        status: blocked ? pick(rng, ['todo', 'in-progress'] as const) : pick(rng, ['todo', 'todo', 'in-progress', 'in-progress', 'in-review'] as const),
        ...(blocked ? { blocked: BLOCKED_BY[def.id][i % BLOCKED_BY[def.id].length] } : {}),
        created: nowMs - int(rng, 1, 20) * DAY_MS - int(rng, 0, 20) * HOUR,
      });
    });
    projects.push({
      id: def.id, name: def.name, team: def.team, budgetHours: def.budgetHours, repo: def.repo,
      start: dayAt(now, -int(rng, 90, 150)), target: dayAt(now, PLAN[def.id].targetDays),
    });
  }

  // --- GitHub ----------------------------------------------------------------------------------------------
  const prs: PullRequest[] = [];
  let prId = 200;
  const reviewers = (author: Person, t: TeamName) => {
    const others = team(t).filter((p) => p.id !== author.id);
    const first = pick(rng, others);
    return rng() < 0.5 ? [first.id] : [first.id, pick(rng, others.filter((p) => p.id !== first.id)).id];
  };
  for (const def of PROJECT_DEFS) {
    const pool = developers(def.team);
    const prTitle = () => `${pick(rng, VERBS)} ${pick(rng, NOUNS[def.id])}`;
    for (let k = int(rng, 6, 9); k > 0; k--) {
      const author = pick(rng, pool);
      const opened = nowMs - int(rng, 5, 41) * DAY_MS - int(rng, 0, 23) * HOUR;
      const firstReviewAt = opened + int(rng, 2, 30) * HOUR;
      prs.push({
        id: prId++, repo: def.repo, projectId: def.id, title: prTitle(), authorId: author.id, reviewerIds: reviewers(author, def.team),
        opened, firstReviewAt, merged: firstReviewAt + int(rng, 1, 30) * HOUR,
      });
    }
    // open PRs: reviewed, or still inside the three-day window
    for (let k = 0; k < 2; k++) {
      const author = pick(rng, pool);
      const age = int(rng, 6, 60) * HOUR;
      const opened = nowMs - age;
      prs.push({
        id: prId++, repo: def.repo, projectId: def.id, title: prTitle(), authorId: author.id, reviewerIds: reviewers(author, def.team),
        opened, ...(k === 0 ? { firstReviewAt: opened + Math.floor(rng() * age) } : {}),
      });
    }
  }
  const commits: Commit[] = [];
  for (const off of workdays) {
    for (const p of PEOPLE) {
      if (p.team === 'Leadership' || p.role !== 'developer') continue;
      for (let k = int(rng, 0, 3); k > 0; k--) {
        const at = dayAt(now, off, 9 + rng() * 9);
        const def = defs.get(projectOf(p.team))!;
        const sha = Math.floor(rng() * 0xfffffff).toString(16).padStart(7, '0');
        const message = `${pick(rng, VERBS)} ${pick(rng, NOUNS[def.id])}: ${pick(rng, COMMIT_WHAT)}`;
        if (at <= nowMs) commits.push({ sha, repo: def.repo, authorId: p.id, at, message });
      }
    }
  }
  commits.sort((a, b) => a.at - b.at);

  // --- Teams -----------------------------------------------------------------------------------------------
  const chat: Omit<Message, 'id'>[] = [];
  const channels: [Message['channel'], number, number][] = [['#backend', 3, 5], ['#product', 2, 4], ['#general', 1, 3]];
  for (const off of workdays) {
    for (const [channel, lo, hi] of channels) {
      for (let k = int(rng, lo, hi); k > 0; k--) {
        const author = pick(rng, channel === '#backend' ? workers('Platform') : channel === '#product' ? team('Product') : PEOPLE);
        const at = dayAt(now, off, 9 + rng() * 9);
        const text = pick(rng, CHAT[channel]);
        if (at <= nowMs) chat.push({ channel, authorId: author.id, at, text });
      }
    }
  }
  const meetings: Meeting[] = [];
  for (const off of workdays) {
    for (const t of ['Platform', 'Product'] as const) {
      const at = dayAt(now, off, 9.5);
      if (at > nowMs) continue;
      const owners = workers(t);
      meetings.push({
        id: `m-standup-${t.toLowerCase()}-${dateKey(at)}`, kind: 'standup', team: t, at,
        decisions: rng() < 0.5 ? [pick(rng, MEETING_DECISIONS)] : [],
        actions: rng() < 0.6 ? [{ ownerId: pick(rng, owners).id, text: pick(rng, MEETING_ACTIONS) }] : [],
      });
    }
  }
  for (let s = 0; s <= 3; s++) {
    for (const t of ['Platform', 'Product'] as const) {
      const at = dayAt(now, dayOffset - HISTORY_DAYS + SPRINT_DAYS * s, 10);
      if (at <= nowMs) {
        meetings.push({
          id: `m-planning-${t.toLowerCase()}-${dateKey(at)}`, kind: 'planning', team: t, at,
          decisions: [pick(rng, MEETING_DECISIONS)], actions: [{ ownerId: team(t)[0].id, text: 'Publish the sprint goals' }],
        });
      }
    }
  }

  // --- AWS: six full months before this one ----------------------------------------------------------------
  const awsCosts: AwsCost[] = [];
  const base: Record<AwsService, number> = { EC2: 11000, RDS: 4200, S3: 1300, Lambda: 700, CloudFront: 900 };
  for (let i = 6; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    for (const service of SERVICES) {
      awsCosts.push({ month, service, usd: Math.round(base[service] * (1 + 0.012 * (6 - i)) * (0.96 + rng() * 0.08)) });
    }
  }
  const awsHealth: AwsHealth[] = SERVICES.map((service) => ({ service, status: 'healthy', lastDeployAt: nowMs - int(rng, 1, 20) * DAY_MS }));

  // --- Planted scenarios, applied after the random pass ----------------------------------------------------
  // Sara is light and Leo heavy against pro-rated capacity so far this week
  const planted = new Map([['p-sara', 0.5], ['p-leo', 1.25]]);
  time = time.filter((t) => !planted.has(t.personId) || t.at < monday);
  for (const [id, ratio] of planted) {
    const p = people.find((x) => x.id === id)!;
    const target = proRatedCapacity(p, now) * ratio;
    // each weekday so far, counting today once it is past 09:00
    const slots = [0, 1, 2, 3, 4].filter((d) => dayOffset + d < 0 || (dayOffset + d === 0 && nowMs > dayAt(now, 0, 9)));
    if (target <= 0 || slots.length === 0) continue;
    const each = Math.round((target / slots.length / 2) * 1000) / 1000;
    for (const d of slots) {
      const day = dayOffset + d;
      for (const [k, projectId] of (['atlas', 'delta'] as const).entries()) {
        time.push({ personId: id, projectId, at: Math.min(dayAt(now, day, 10 + k * 3), nowMs - 60_000), hours: each, description: pick(rng, TIME_WORK) });
      }
    }
  }
  time.sort((a, b) => a.at - b.at);

  // Atlas has one PR nobody has looked at for four days
  prs.push({
    id: prId++, repo: defs.get('atlas')!.repo, projectId: 'atlas', title: 'Retry failed payment webhooks with backoff', authorId: 'p-leo',
    reviewerIds: ['p-daniel'], opened: nowMs - 4 * DAY_MS,
  });

  // a few PRs merged so far this week (on Platform and Product projects), spread evenly between Monday 00:00 and now
  const elapsed = nowMs - monday;
  if (elapsed > 0) {
    for (const [k, projectId] of (['atlas', 'beacon', 'delta'] as const).entries()) {
      const def = defs.get(projectId)!;
      const author = pick(rng, developers(def.team));
      const merged = monday + Math.floor((elapsed * (k + 1)) / 4);
      const opened = merged - int(rng, 20, 40) * HOUR;
      prs.push({
        id: prId++, repo: def.repo, projectId, title: `${pick(rng, VERBS)} ${pick(rng, NOUNS[projectId])}`, authorId: author.id,
        reviewerIds: reviewers(author, def.team), opened, firstReviewAt: opened + Math.floor((merged - opened) / 2), merged,
      });
    }
  }

  // yesterday's Platform standup, whatever day that was
  const yesterday = dayAt(now, -1, 9.5);
  const standup: Meeting = {
    id: `m-standup-platform-${dateKey(yesterday)}`, kind: 'standup', team: 'Platform', at: yesterday,
    decisions: [
      'Freeze the Atlas API contract until the blocked tickets are cleared',
      'Ship the Delta migration behind a feature flag',
      'Hand the Atlas webhook retries from Leo to Sara',
    ],
    actions: [
      { ownerId: 'p-daniel', text: 'Chase the vendor for sandbox credentials' },
      { ownerId: 'p-leo', text: 'Write up the webhook retry handoff for Sara' },
      { ownerId: 'p-sara', text: 'Pick up the Atlas webhook retries' },
    ],
  };
  const meetingsOut = [...meetings.filter((m) => !(m.kind === 'standup' && m.team === 'Platform' && m.at >= dayAt(now, -1) && m.at < dayAt(now, 0))), standup]
    .sort((a, b) => a.at - b.at);

  // #backend is busy this week, even if the week has barely started
  const backendThisWeek = chat.filter((m) => m.channel === '#backend' && m.at >= monday).length;
  for (let k = 0; k < 6 - backendThisWeek; k++) {
    chat.push({
      channel: '#backend', authorId: pick(rng, workers('Platform')).id, text: pick(rng, CHAT['#backend']),
      at: monday + Math.floor(((nowMs - monday) * (k + 1)) / (6 - backendThisWeek + 1)),
    });
  }
  chat.sort((a, b) => a.at - b.at);
  const messages: Message[] = chat.map((m, i) => ({ id: `msg-${i + 1}`, ...m }));

  // last month's EC2 bill jumps 40% or more: Comet's load tests left instances running
  const lastMonth = awsCosts[awsCosts.length - 1].month;
  const monthBefore = awsCosts[awsCosts.length - 1 - SERVICES.length].month;
  const ec2Before = awsCosts.find((a) => a.service === 'EC2' && a.month === monthBefore)!;
  awsCosts.find((a) => a.service === 'EC2' && a.month === lastMonth)!.usd = Math.round(ec2Before.usd * 1.52);
  awsHealth.find((h) => h.service === 'EC2')!.note = 'Comet load tests left 12 extra instances running';

  return { people, projects, time, sprints, issues, prs, commits, messages, meetings: meetingsOut, awsCosts, awsHealth };
}
