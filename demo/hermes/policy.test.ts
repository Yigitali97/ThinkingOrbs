// Tests for the Hermes role policy, demo sign-in and route guard: what each role may see, and that restricted data never comes back.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryTool } from '../assistant/callTool';
import type { User } from '../assistant/protocol';
import { DEMO_USERS, getUser, guard, safeNext, signIn, signOut } from './auth';
import { hermesTools } from './agent/tools';
import type { TimeReport } from './agent/tools';
import { HERMES_SEED } from './config';
import { generateCompany } from './data/generate';
import type { AwsCost, Issue, Person, Project, PullRequest } from './data/types';
import { hermesPolicy, visibleProjectIds } from './policy';

const NOW = new Date('2026-10-07T15:00:00'); // Wednesday
const c = generateCompany(HERMES_SEED, NOW);
const def = { tools: hermesTools(() => c), policy: hermesPolicy };
const FROM = NOW.getTime() - 60 * 86_400_000;
const range = { from: FROM, to: NOW.getTime() };

const DEVELOPER_COPY = "Individual hours for other people are visible to managers. Here's your team's total instead.";
const MANAGER_COPY = 'Individual hours outside your team are visible to leadership. Other teams are shown as totals.';
const AWS_REASON = 'AWS costs are visible to leadership.';
const AWS_ALT = 'I can show AWS service health instead.';

const user = (id: string): User => DEMO_USERS.find((u) => u.id === id)!;
const sara = user('p-sara');
const daniel = user('p-daniel');
const maya = user('p-maya');
const teamOf = (id: string) => c.people.find((p) => p.id === id)!.team;

async function call<O>(u: User | undefined, toolId: string, input: unknown = {}) {
  return queryTool<O>(def, toolId, input, { user: u, now: NOW });
}
async function ok<O>(u: User | undefined, toolId: string, input: unknown = {}) {
  const r = await call<O>(u, toolId, input);
  if (!r.ok) throw new Error(`${toolId} refused: ${r.message}`);
  return r;
}

describe('demo users', () => {
  it('are Maya, Daniel and Sara built from the company', () => {
    expect(DEMO_USERS.map((u) => u.id)).toEqual(['p-maya', 'p-daniel', 'p-sara']);
    expect(DEMO_USERS.map((u) => u.role)).toEqual(['leadership', 'manager', 'developer']);
    expect(sara).toEqual({ id: 'p-sara', name: 'Sara Lindqvist', title: 'Developer', role: 'developer', team: 'Platform' });
  });
});

describe('as Sara (developer)', () => {
  it('sees only her own hours, plus her team total', async () => {
    const r = await ok<TimeReport>(sara, 'clockify.timeEntries', range);
    expect(r.data.entries.length).toBeGreaterThan(0);
    expect(r.data.entries.every((e) => e.personId === 'p-sara')).toBe(true);
    expect(r.data.teamTotals).toHaveLength(1);
    expect(r.data.teamTotals[0].team).toBe('Platform');
    const own = r.data.entries.reduce((s, e) => s + e.hours, 0);
    expect(r.data.teamTotals[0].hours).toBeGreaterThanOrEqual(own);
    expect(r.restricted).toBe(DEVELOPER_COPY);
  });

  it('counts teammates hours on Atlas and Delta in the Platform total', async () => {
    const r = await ok<TimeReport>(sara, 'clockify.timeEntries', range);
    const platform = c.time.filter((t) => teamOf(t.personId) === 'Platform' && t.at >= range.from && t.at <= range.to);
    expect(r.data.teamTotals[0].hours).toBeCloseTo(platform.reduce((s, t) => s + t.hours, 0), 6);
  });

  it('cannot read someone else through personId or an invisible projectId', async () => {
    const other = await ok<TimeReport>(sara, 'clockify.timeEntries', { ...range, personId: 'p-leo' });
    expect(other.data.entries).toEqual([]);
    expect(other.data.teamTotals.every((t) => t.team === 'Platform')).toBe(true);
    const product = await ok<TimeReport>(sara, 'clockify.timeEntries', { ...range, personId: 'p-amir' });
    expect(product.data.entries).toEqual([]);
    expect(product.data.teamTotals.map((t) => t.team)).toEqual(['Platform']);
    const hidden = await ok<TimeReport>(sara, 'clockify.timeEntries', { ...range, projectId: 'comet' });
    expect(hidden.data.entries).toEqual([]);
    expect(hidden.data.teamTotals).toEqual([]);
    for (const r of [other, product, hidden]) expect(JSON.stringify(r.data)).not.toMatch(/p-leo|p-amir|projectTotals/);
  });

  it('never carries budgets or other people hours anywhere in a time report', async () => {
    const r = await ok<TimeReport>(sara, 'clockify.timeEntries', range);
    expect(Object.keys(r.data).sort()).toEqual(['entries', 'teamTotals']);
  });

  it('sees only Atlas and Delta, without budgets', async () => {
    const r = await ok<(Project & { budgetHours?: number })[]>(sara, 'directory.projects');
    expect(r.data.map((p) => p.id).sort()).toEqual(['atlas', 'delta']);
    expect(r.data.every((p) => !('budgetHours' in p))).toBe(true);
    const one = await ok<Project[]>(sara, 'directory.projects', { id: 'comet' });
    expect(one.data).toEqual([]);
  });

  it('gets Jira, GitHub and sprints for her projects only', async () => {
    const issues = await ok<Issue[]>(sara, 'jira.issues');
    expect(issues.data.length).toBeGreaterThan(0);
    expect(issues.data.every((i) => ['atlas', 'delta'].includes(i.projectId))).toBe(true);
    expect((await ok<Issue[]>(sara, 'jira.issues', { projectId: 'beacon' })).data).toEqual([]);
    const sprints = await ok<{ projectId: string }[]>(sara, 'jira.sprints');
    expect(sprints.data.every((s) => ['atlas', 'delta'].includes(s.projectId))).toBe(true);
    const prs = await ok<PullRequest[]>(sara, 'github.pullRequests');
    expect(prs.data.length).toBeGreaterThan(0);
    expect(prs.data.every((p) => ['atlas', 'delta'].includes(p.projectId))).toBe(true);
    const commits = await ok<{ repo: string }[]>(sara, 'github.commits', range);
    const repos = new Set(c.projects.filter((p) => ['atlas', 'delta'].includes(p.id)).map((p) => p.repo));
    expect(commits.data.length).toBeGreaterThan(0);
    expect(commits.data.every((m) => repos.has(m.repo))).toBe(true);
  });

  it('is denied AWS costs but can read AWS health', async () => {
    const r = await call(sara, 'aws.costs', { months: 3 });
    expect(r).toEqual({ ok: false, reason: 'denied', message: AWS_REASON, alternative: AWS_ALT });
    expect((await call(sara, 'aws.health')).ok).toBe(true);
  });

  it('visible projects are those of her team', () => {
    expect([...visibleProjectIds(sara, c)].sort()).toEqual(['atlas', 'delta']);
  });
});

describe('as Daniel (manager)', () => {
  it('sees his own team individually and other teams as totals', async () => {
    const r = await ok<TimeReport>(daniel, 'clockify.timeEntries', range);
    expect(r.data.entries.length).toBeGreaterThan(0);
    expect(r.data.entries.every((e) => teamOf(e.personId) === 'Platform')).toBe(true);
    expect(r.data.entries.some((e) => e.personId === 'p-leo')).toBe(true);
    expect(r.data.teamTotals.map((t) => t.team)).toContain('Product');
    expect(r.restricted).toBe(MANAGER_COPY);
  });

  it('cannot read a Product person through personId', async () => {
    const r = await ok<TimeReport>(daniel, 'clockify.timeEntries', { ...range, personId: 'p-amir' });
    expect(r.data.entries).toEqual([]);
    expect(r.data.teamTotals.map((t) => t.team)).toContain('Product');
  });

  it('sees all projects with budgets, but not AWS costs', async () => {
    const r = await ok<(Project & { budgetHours?: number })[]>(daniel, 'directory.projects');
    expect(r.data).toHaveLength(4);
    expect(r.data.every((p) => typeof p.budgetHours === 'number')).toBe(true);
    const aws = await call(daniel, 'aws.costs', { months: 3 });
    expect(aws).toMatchObject({ ok: false, reason: 'denied', message: AWS_REASON, alternative: AWS_ALT });
  });
});

describe('as Maya (leadership)', () => {
  it('sees entries for Product people and every delivery team total', async () => {
    const r = await ok<TimeReport>(maya, 'clockify.timeEntries', range);
    expect(r.data.entries.some((e) => teamOf(e.personId) === 'Product')).toBe(true);
    expect(r.data.entries.some((e) => teamOf(e.personId) === 'Platform')).toBe(true);
    expect(r.data.teamTotals.map((t) => t.team).sort()).toEqual(['Platform', 'Product']);
    expect(r.restricted).toBeUndefined();
    expect(Object.keys(r.data).sort()).toEqual(['entries', 'teamTotals']);
  });

  it('can read AWS costs', async () => {
    const r = await ok<AwsCost[]>(maya, 'aws.costs', { months: 3 });
    expect(new Set(r.data.map((a) => a.month)).size).toBe(3);
  });
});

describe('signed out', () => {
  it('is denied every tool', async () => {
    for (const tool of def.tools) {
      const r = await call(undefined, tool.id, range);
      expect(r).toMatchObject({ ok: false, reason: 'denied', message: 'Sign in to use Hermes.' });
    }
  });
});

describe('tools', () => {
  it('has the eleven connectors with their systems and labels', () => {
    expect(def.tools.map((t) => [t.id, t.system, t.label])).toEqual([
      ['directory.people', 'Directory', 'Looking up people'],
      ['directory.projects', 'Directory', 'Looking up projects'],
      ['clockify.timeEntries', 'Clockify', 'Reading Clockify'],
      ['jira.issues', 'Jira', 'Reading Jira issues'],
      ['jira.sprints', 'Jira', 'Reading Jira sprints'],
      ['github.pullRequests', 'GitHub', 'Reading pull requests'],
      ['github.commits', 'GitHub', 'Reading commits'],
      ['teams.messages', 'Teams', 'Reading Teams messages'],
      ['teams.meetings', 'Teams', 'Reading meeting notes'],
      ['aws.costs', 'AWS', 'Reading AWS costs'],
      ['aws.health', 'AWS', 'Checking AWS health'],
    ]);
  });

  it('filters issues by open, blocked and assignee', async () => {
    const blocked = await ok<Issue[]>(maya, 'jira.issues', { projectId: 'atlas', open: true, blocked: true });
    expect(blocked.data).toHaveLength(3);
    const mine = await ok<Issue[]>(maya, 'jira.issues', { assigneeId: 'p-sara' });
    expect(mine.data.every((i) => i.assigneeId === 'p-sara')).toBe(true);
    const people = await ok<Person[]>(maya, 'directory.people', { team: 'Product' });
    expect(people.data.every((p) => p.team === 'Product')).toBe(true);
  });

  it('is read-only: Maya gets copies, not the company itself', async () => {
    const r = await ok<Person[]>(maya, 'directory.people');
    r.data[0].name = 'Changed';
    expect(c.people[0].name).not.toBe('Changed');
  });
});

describe('guard and safeNext', () => {
  it('sends a signed-out visitor to sign in, remembering where they were going', () => {
    expect(guard('/hermes/team', null)).toBe('/hermes/sign-in?next=%2Fhermes%2Fteam');
    expect(guard('/hermes/sign-in', null)).toBeNull();
    expect(guard('/hermes/team', sara)).toBeNull();
  });

  it('only follows paths inside Hermes', () => {
    expect(safeNext('https://evil.test')).toBe('/hermes/');
    expect(safeNext('//evil.test')).toBe('/hermes/');
    expect(safeNext('/hermes//evil.test')).toBe('/hermes/');
    expect(safeNext('/hermes/\\evil.test')).toBe('/hermes/');
    expect(safeNext('/elsewhere')).toBe('/hermes/');
    expect(safeNext(null)).toBe('/hermes/');
    expect(safeNext('/hermes/projects/atlas')).toBe('/hermes/projects/atlas');
  });
});

describe('sign-in store', () => {
  afterEach(() => {
    signOut();
    vi.unstubAllGlobals();
  });

  it('signs in, listens and signs out', () => {
    expect(getUser()).toBeNull();
    signIn('p-daniel');
    expect(getUser()).toBe(daniel);
    signIn('p-nobody');
    expect(getUser()).toBe(daniel);
    signOut();
    expect(getUser()).toBeNull();
  });

  it('works when sessionStorage throws', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('sessionStorage', { getItem: boom, setItem: boom, removeItem: boom });
    signIn('p-sara');
    expect(getUser()).toEqual(sara);
    signOut();
    expect(getUser()).toBeNull();
  });

  it('stores the id under hermes.user when sessionStorage works', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    signIn('p-maya');
    expect(store.get('hermes.user')).toBe('p-maya');
    signOut();
    expect(store.has('hermes.user')).toBe(false);
  });
});
