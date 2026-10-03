// Tests for the seeded Hermes company data and the derived figures built on it.

import { describe, expect, it, vi } from 'vitest';
import { HERMES_SEED } from '../config';
import { loadState, projectStatus, proRatedCapacity, velocity, weekStart } from './derive';
import { generateCompany } from './generate';
import type { Company, Project } from './types';

const DAY = 86_400_000;
const NOW = new Date('2026-10-07T15:00:00'); // Wednesday
const MONDAY_EARLY = new Date('2026-10-05T00:30:00');
const c = generateCompany(HERMES_SEED, NOW);

const project = (co: Company, id: string): Project => co.projects.find((p) => p.id === id)!;
const person = (co: Company, id: string) => co.people.find((p) => p.id === id)!;
const weekHours = (co: Company, id: string, now: Date) =>
  co.time
    .filter((t) => t.personId === id && t.at >= weekStart(now).getTime() && t.at <= now.getTime())
    .reduce((sum, t) => sum + t.hours, 0);
const ec2 = (co: Company) => co.awsCosts.filter((a) => a.service === 'EC2').sort((a, b) => a.month.localeCompare(b.month));

describe('determinism', () => {
  it('gives the same company for the same seed and time, without Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = generateCompany(HERMES_SEED, NOW);
    const b = generateCompany(HERMES_SEED, NOW);
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
    expect(a).toEqual(b);
  });
});

describe('people', () => {
  it('has 14 people with the demo users in their roles and teams', () => {
    expect(c.people).toHaveLength(14);
    expect(person(c, 'p-maya')).toMatchObject({ name: 'Maya Chen', title: 'CTO', role: 'leadership', team: 'Leadership' });
    expect(person(c, 'p-daniel')).toMatchObject({ name: 'Daniel Okafor', title: 'Engineering Manager', role: 'manager', team: 'Platform' });
    expect(person(c, 'p-sara')).toMatchObject({ name: 'Sara Lindqvist', title: 'Developer', role: 'developer', team: 'Platform' });
    expect(person(c, 'p-priya')).toMatchObject({ name: 'Priya Nair', role: 'manager', team: 'Product' });
    expect(person(c, 'p-leo')).toMatchObject({ name: 'Leo Park', role: 'developer', team: 'Platform' });
  });

  it('sizes the teams 6 / 6 / 2 and gives Developer titles to enough engineers (Ruling R2)', () => {
    const count = (team: string) => c.people.filter((p) => p.team === team).length;
    expect([count('Platform'), count('Product'), count('Leadership')]).toEqual([6, 6, 2]);
    const devs = (team: string) => c.people.filter((p) => p.team === team && p.role === 'developer' && p.title.includes('Developer'));
    expect(devs('Platform').length).toBeGreaterThanOrEqual(4);
    expect(devs('Platform').map((p) => p.id)).toEqual(expect.arrayContaining(['p-sara', 'p-leo']));
    expect(devs('Product').length).toBeGreaterThanOrEqual(3);
    const others = c.people.filter((p) => p.role === 'developer' && !p.title.includes('Developer'));
    expect(others.map((p) => p.title).sort()).toEqual(['Product Designer', 'Product Manager', 'QA Engineer']);
  });

  it('logs no project hours for Leadership', () => {
    const leaders = new Set(c.people.filter((p) => p.team === 'Leadership').map((p) => p.id));
    expect(c.time.some((t) => leaders.has(t.personId))).toBe(false);
  });
});

describe('history', () => {
  it('covers six weeks of work and six months of AWS cost, none of it in the future', () => {
    const times = [...c.time.map((t) => t.at), ...c.commits.map((x) => x.at), ...c.messages.map((m) => m.at)];
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW.getTime());
    expect(Math.min(...c.time.map((t) => t.at))).toBeLessThan(NOW.getTime() - 35 * DAY);
    expect(new Set(c.awsCosts.map((a) => a.month)).size).toBe(6);
    expect(c.prs.every((p) => p.opened <= NOW.getTime() && (p.firstReviewAt ?? 0) <= NOW.getTime() && (p.merged ?? 0) <= NOW.getTime())).toBe(true);
  });

  it('uses the Jira key prefixes per project', () => {
    const prefix: Record<string, string> = { atlas: 'ATL', beacon: 'BCN', comet: 'CMT', delta: 'DLT' };
    for (const i of c.issues) expect(i.key.startsWith(`${prefix[i.projectId]}-`)).toBe(true);
    expect(new Set(c.issues.map((i) => i.key)).size).toBe(c.issues.length);
  });
});

describe('planted scenarios', () => {
  const scenarios = (co: Company, now: Date) => {
    const status = (id: string) => projectStatus(project(co, id), co, now);
    expect(status('atlas').status).toBe('at-risk');
    expect(status('atlas').reasons).toContain('3 blocked tickets');
    expect(status('atlas').reasons).toContain('1 PR waiting more than 3 days for review');
    expect(status('comet').status).toBe('off-track');
    expect(status('comet').reasons).toContain('Projected to finish 2 weeks after the target date');
    expect(status('beacon').status).toBe('on-track');
    expect(status('delta').status).toBe('on-track');

    expect(co.issues.filter((i) => i.projectId === 'atlas' && i.status !== 'done' && i.blocked)).toHaveLength(3);
    const waiting = co.prs.filter((p) => p.projectId === 'atlas' && !p.merged && !p.firstReviewAt && now.getTime() - p.opened > 3 * DAY);
    expect(waiting).toHaveLength(1);
    expect(now.getTime() - waiting[0].opened).toBe(4 * DAY);

    const [prev, last] = ec2(co).slice(-2);
    expect(last.usd / prev.usd).toBeGreaterThanOrEqual(1.4);
    expect(co.awsHealth.find((h) => h.service === 'EC2')?.note).toBe('Comet load tests left 12 extra instances running');

    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
    const standup = co.meetings.find((m) => m.kind === 'standup' && m.team === 'Platform' && m.at >= y && m.at < y + DAY)!;
    expect(standup.decisions.length).toBeGreaterThanOrEqual(2);
    expect(standup.decisions).toEqual([
      'Freeze the Atlas API contract until the blocked tickets are cleared',
      'Ship the Delta migration behind a feature flag',
      'Hand the Atlas webhook retries from Leo to Sara',
    ]);

    const monday = weekStart(now).getTime();
    expect(co.messages.filter((m) => m.channel === '#backend' && m.at >= monday && m.at <= now.getTime()).length).toBeGreaterThanOrEqual(6);
  };

  it('holds on Wednesday afternoon', () => scenarios(c, NOW));
  it('holds on Monday just after midnight', () => scenarios(generateCompany(HERMES_SEED, MONDAY_EARLY), MONDAY_EARLY));
  it('holds on a Sunday', () => {
    const sunday = new Date('2026-10-11T12:00:00');
    scenarios(generateCompany(HERMES_SEED, sunday), sunday);
  });

  it('has at least three PRs merged so far this week, one on a Platform project, whatever the time', () => {
    for (const now of [NOW, MONDAY_EARLY, new Date('2026-10-06T09:20:00'), new Date('2026-10-11T12:00:00')]) {
      const co = generateCompany(HERMES_SEED, now);
      const monday = weekStart(now).getTime();
      const merged = co.prs.filter((p) => p.merged !== undefined && p.merged >= monday && p.merged <= now.getTime());
      expect(merged.length, now.toISOString()).toBeGreaterThanOrEqual(3);
      expect(merged.some((p) => p.projectId === 'atlas' || p.projectId === 'delta')).toBe(true);
      for (const p of merged) expect(p.opened <= p.firstReviewAt! && p.firstReviewAt! <= p.merged!).toBe(true);
    }
  });

  it('shows Sara under and Leo over this week', () => {
    const sara = person(c, 'p-sara');
    const leo = person(c, 'p-leo');
    expect(loadState(weekHours(c, 'p-sara', NOW), proRatedCapacity(sara, NOW))).toBe('under');
    expect(loadState(weekHours(c, 'p-leo', NOW), proRatedCapacity(leo, NOW))).toBe('over');
  });

  it('keeps the load planting through the week and on a weekend', () => {
    for (const now of [new Date('2026-10-06T09:20:00'), new Date('2026-10-08T12:00:00'), new Date('2026-10-10T10:00:00')]) {
      const co = generateCompany(HERMES_SEED, now);
      expect(loadState(weekHours(co, 'p-sara', now), proRatedCapacity(person(co, 'p-sara'), now))).toBe('under');
      expect(loadState(weekHours(co, 'p-leo', now), proRatedCapacity(person(co, 'p-leo'), now))).toBe('over');
    }
  });
});

describe('derive', () => {
  it('loadState handles zero capacity and the thresholds', () => {
    expect(loadState(0, 0)).toBe('ok');
    expect(loadState(5, 0)).toBe('ok');
    expect(loadState(111, 100)).toBe('over');
    expect(loadState(110, 100)).toBe('ok');
    expect(loadState(69, 100)).toBe('under');
    expect(loadState(70, 100)).toBe('ok');
  });

  it('velocity averages the last three finished sprints, or is 0', () => {
    expect(velocity('atlas', [])).toBe(0);
    const s = (n: number, done: number) => ({
      id: `atlas-${n}`, projectId: 'atlas' as const, start: n * 10, end: n * 10 + 9, committedPoints: 30, completedPoints: done,
    });
    expect(velocity('atlas', [s(1, 100), s(2, 10), s(3, 20), s(4, 30)])).toBe(20);
    expect(velocity('beacon', [s(1, 10)])).toBe(0);
  });

  it('proRatedCapacity counts weekdays and the share of today since 09:00', () => {
    const p = person(c, 'p-sara');
    expect(proRatedCapacity(p, MONDAY_EARLY)).toBe(0);
    expect(proRatedCapacity(p, NOW)).toBe(p.capacityHours * (2 + 6 / 8) / 5);
    expect(proRatedCapacity(p, new Date('2026-10-10T10:00:00'))).toBe(p.capacityHours);
    expect(proRatedCapacity(person(c, 'p-maya'), NOW)).toBe(0);
  });

  it('projects a finish date from velocity', () => {
    const co: Company = { ...c, issues: [], prs: [] };
    const atlas = project(co, 'atlas');
    expect(projectStatus(atlas, { ...co, sprints: [] }, NOW).status).toBe('on-track'); // nothing remaining
    const one = { key: 'ATL-1', projectId: 'atlas' as const, title: 't', status: 'todo' as const, assigneeId: 'p-sara', points: 5, created: 0 };
    const noVelocity = projectStatus(atlas, { ...co, issues: [one], sprints: [] }, NOW);
    expect(noVelocity.status).toBe('off-track');
    expect(noVelocity.reasons[0]).toMatch(/velocity|sprint/i);
  });
});
