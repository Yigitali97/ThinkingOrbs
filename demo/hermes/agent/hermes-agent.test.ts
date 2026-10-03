// Tests for the Hermes agent: the brain runner, every question in spec §4.6 per role, and that restricted data never reaches the brain.

import { afterEach, describe, expect, it } from 'vitest';
import { setDown } from '../../assistant/flaky';
import type { AgentDefinition, Block, PageContext, User } from '../../assistant/protocol';
import { runBrain } from '../../assistant/testing';
import { HERMES_SEED } from '../config';
import { generateCompany } from '../data/generate';
import type { Company } from '../data/types';
import { createHermesPolicy } from '../policy';
import { hermesAgent } from './definition';
import { HERMES_INTENTS, projectIn, unknownProjectName } from './intents';
import { hermesTools } from './tools';

const NOW = new Date('2026-10-07T15:00:00'); // Wednesday
const MONDAY_EARLY = new Date('2026-10-05T00:30:00');
const DEVELOPER_COPY = "Individual hours for other people are visible to managers. Here's your team's total instead.";

const c = generateCompany(HERMES_SEED, NOW);
const defFor = (co: Company): AgentDefinition => ({ ...hermesAgent, tools: hermesTools(() => co), policy: createHermesPolicy(() => co) });
const def = defFor(c);

const asUser = (co: Company, id: string): User => {
  const p = co.people.find((x) => x.id === id)!;
  return { id: p.id, name: p.name, title: p.title, role: p.role, team: p.team };
};
const MAYA = asUser(c, 'p-maya');
const DANIEL = asUser(c, 'p-daniel');
const SARA = asUser(c, 'p-sara');

const ask = (q: string, user: User, extra: { page?: PageContext; now?: Date; d?: AgentDefinition } = {}) =>
  runBrain(extra.d ?? def, q, { now: extra.now ?? NOW, user, page: extra.page });

const ofKind = <K extends Block['kind']>(blocks: Block[], kind: K) => blocks.filter((b) => b.kind === kind) as Extract<Block, { kind: K }>[];
const table = (blocks: Block[]) => ofKind(blocks, 'table')[0];
const isDeveloper = (p: Company['people'][number]) => p.role === 'developer' && p.title.includes('Developer');
const ATLAS_PAGE: PageContext = { page: 'project', id: 'atlas', title: 'Atlas' };

afterEach(() => {
  setDown('Jira', false);
});

describe('project names', () => {
  it('matches a project case-insensitively, ignoring a trailing possessive', () => {
    expect(projectIn("What's blocking Atlas?", c.projects)?.id).toBe('atlas');
    expect(projectIn("atlas's blockers?", c.projects)?.id).toBe('atlas');
    expect(projectIn('how is DELTA doing', c.projects)?.id).toBe('delta');
    expect(projectIn('how is the team doing', c.projects)).toBeNull();
  });

  it('picks out an unknown capitalized name after blocking, about or is', () => {
    expect(unknownProjectName("What's blocking Zephyr?")).toBe('Zephyr');
    expect(unknownProjectName('Tell me about Orion')).toBe('Orion');
    expect(unknownProjectName('How is the team doing?')).toBeNull();
  });

  it('never reads a person or team name as an unknown project', () => {
    for (const q of ['How is Sara doing?', 'How is Sara Lindqvist doing?', 'How is Platform doing?', "What's blocking Leo?", 'Tell me about Product']) {
      expect(unknownProjectName(q), q).toBeNull();
    }
  });

  it.each(['How is Sara doing?', 'How is Platform doing?'])('does not refuse "%s" as a missing project', async (q) => {
    const r = await ask(q, MAYA);
    expect(r.text).not.toContain("I can't find a project called");
    expect(r.text).not.toContain("isn't one of the projects you can see");
  });

  it('lists the intents in the documented order', () => {
    expect(HERMES_INTENTS.map((i) => i.id)).toEqual([
      'this-project', 'my-tickets', 'my-hours', 'dev-hours', 'team-health', 'project-blockers', 'project-status',
      'meeting-decisions', 'channel-summary', 'aws-costs', 'status-draft',
    ]);
  });
});

describe('developer hours', () => {
  const Q = 'How many hours did developers work this week?';

  it('shows Maya one row per developer that adds up to their Clockify entries, plus a chart', async () => {
    const r = await ask(Q, MAYA);
    const t = table(r.blocks);
    const devs = c.people.filter(isDeveloper);
    expect(t.rows).toHaveLength(devs.length);
    expect(t.columns.map((col) => col.key)).toEqual(['person', 'hours', 'capacity']);
    const monday = new Date(2026, 9, 5).getTime();
    const ids = new Set(devs.map((p) => p.id));
    const expected = c.time.filter((e) => ids.has(e.personId) && e.at >= monday && e.at <= NOW.getTime()).reduce((s, e) => s + e.hours, 0);
    const sum = t.rows.reduce((s, row) => s + Number(row.hours), 0);
    expect(sum).toBeCloseTo(expected, 0);
    expect(ofKind(r.blocks, 'chart')).toHaveLength(1);
    expect(ofKind(r.blocks, 'chart')[0].type).toBe('bar');
    expect(r.text).toMatch(/Sources: .*Clockify/);
  });

  it('shows Sara the Developer copy, her own hours and her team total only', async () => {
    const r = await ask(Q, SARA);
    expect(r.text).toContain(DEVELOPER_COPY);
    const t = table(r.blocks);
    expect(t.columns.map((col) => col.key)).toEqual(['who', 'hours']);
    expect(t.rows.map((row) => row.who)).toEqual(['You', 'Platform team total']);
  });

  it('has no NaN or Infinity early on a Monday, and every hours cell is 0', async () => {
    const early = generateCompany(HERMES_SEED, MONDAY_EARLY);
    const r = await ask(Q, asUser(early, 'p-maya'), { now: MONDAY_EARLY, d: defFor(early) });
    const json = JSON.stringify(r);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
    const t = table(r.blocks);
    expect(t.rows.length).toBeGreaterThan(0);
    for (const row of t.rows) expect(row.hours).toBe(0);
    expect(ofKind(r.blocks, 'stat')[0].items[0].delta).toBe('No change data');
  });
});

describe("Sara never receives what she can't see", () => {
  const QUESTIONS: [string, PageContext?][] = [
    ['How is the team doing?'],
    ['How many hours did developers work this week?'],
    ['How are the projects going?'],
    ["What's blocking Atlas?"],
    ["What's blocking Beacon?"],
    ["What did we decide in yesterday's standup?"],
    ['Summarize #backend this week'],
    ['Why did AWS costs go up?'],
    ['What are my open tickets?'],
    ['How many hours did I work this week?'],
    ['Write a status update for the team'],
    ['How is this one doing?', ATLAS_PAGE],
    ['How is this one doing?', { page: 'project', id: 'comet', title: 'Comet' }],
  ];

  it.each(QUESTIONS)('%s', async (q, page) => {
    const r = await ask(q, SARA, { page });
    for (const res of r.received) {
      if (!res.ok) continue;
      const data = res.data as Record<string, unknown> | Record<string, unknown>[];
      if (!Array.isArray(data) && Array.isArray(data.entries)) {
        for (const e of data.entries as { personId: string }[]) expect(e.personId).toBe('p-sara');
      }
      const items = Array.isArray(data) ? data : Array.isArray(data.entries) ? (data.entries as Record<string, unknown>[]) : [];
      for (const item of items) {
        expect(item).not.toHaveProperty('budgetHours');
        expect(['beacon', 'comet']).not.toContain(item.projectId);
        expect(['beacon', 'comet']).not.toContain(item.id);
      }
    }
    const json = JSON.stringify(r);
    expect(json).not.toContain('NaN');
    expect(json).not.toContain('Infinity');
    expect(json).not.toMatch(/BCN-|CMT-/);
  });
});

describe('project status', () => {
  const Q = 'How are the projects going?';

  it('gives Maya one status block per project', async () => {
    const r = await ask(Q, MAYA);
    const s = ofKind(r.blocks, 'status');
    expect(s).toHaveLength(4);
    const byTitle = Object.fromEntries(s.map((b) => [b.title, b.status]));
    expect(byTitle).toEqual({ Atlas: 'at-risk', Comet: 'off-track', Beacon: 'on-track', Delta: 'on-track' });
    expect(s.find((b) => b.title === 'Atlas')?.href).toBe('/hermes/projects/atlas');
    expect(s.find((b) => b.title === 'Delta')?.reasons).toEqual(['On pace to finish by the target date']);
  });

  it('gives Sara only her team projects', async () => {
    const r = await ask(Q, SARA);
    expect(ofKind(r.blocks, 'status').map((b) => b.title).sort()).toEqual(['Atlas', 'Delta']);
  });

  it('answers "How is this one doing?" on a project page from the page context', async () => {
    const r = await ask('How is this one doing?', MAYA, { page: ATLAS_PAGE });
    expect(r.text).toContain('Atlas');
    expect(ofKind(r.blocks, 'status')).toHaveLength(1);
  });

  it('does not let "this week" on a project page hijack an hours question', async () => {
    const r = await ask('How many hours did developers work this week?', MAYA, { page: ATLAS_PAGE });
    expect(ofKind(r.blocks, 'status')).toHaveLength(0);
    expect(ofKind(r.blocks, 'chart')).toHaveLength(1);
  });
});

describe('project blockers', () => {
  it.each(["What's blocking Atlas?", "what's blocking atlas", "Atlas's blockers?"])('%s', async (q) => {
    const r = await ask(q, MAYA);
    expect(table(r.blocks).rows).toHaveLength(3);
    expect(r.text).toContain('Retry failed payment webhooks with backoff');
    expect(r.text).toMatch(/Sources: .*Jira.*GitHub/);
  });

  it("says it can't find an unknown project and shows nothing", async () => {
    const r = await ask("What's blocking Zephyr?", MAYA);
    expect(r.text).toContain("I can't find a project called Zephyr.");
    expect(r.blocks).toHaveLength(0);
  });

  it('refuses a project outside Sara’s team without asking Jira about it', async () => {
    const r = await ask("What's blocking Beacon?", SARA);
    expect(r.text).toContain("Beacon isn't one of the projects you can see. Your projects: Atlas, Delta.");
    expect(r.tools).not.toContain('jira.issues');
    expect(r.blocks).toHaveLength(0);
  });
});

describe('AWS costs', () => {
  const Q = 'Why did AWS costs go up?';

  it('shows Maya a line chart and the cause', async () => {
    const r = await ask(Q, MAYA);
    const chart = ofKind(r.blocks, 'chart')[0];
    expect(chart.type).toBe('line');
    expect(chart.x).toHaveLength(6);
    expect(chart.series.map((s) => s.name)).toContain('EC2');
    expect(r.text).toContain('12 extra instances');
    expect(r.text).toContain('EC2');
  });

  it('tells Daniel costs are for leadership and shows health instead', async () => {
    const r = await ask(Q, DANIEL);
    expect(r.text).toContain('AWS costs are visible to leadership.');
    expect(r.text).toContain('I can show AWS service health instead.');
    expect(table(r.blocks).rows).toHaveLength(5);
    expect(ofKind(r.blocks, 'chart')).toHaveLength(0);
  });
});

describe('meetings, channels, tickets and hours', () => {
  it("lists yesterday's standup decisions and owners for Daniel", async () => {
    const r = await ask("What did we decide in yesterday's standup?", DANIEL);
    for (const d of [
      'Freeze the Atlas API contract until the blocked tickets are cleared',
      'Ship the Delta migration behind a feature flag',
      'Hand the Atlas webhook retries from Leo to Sara',
    ]) {
      expect(r.text).toContain(d);
    }
    expect(r.text).toContain('Daniel Okafor: Chase the vendor for sandbox credentials');
    expect(r.text).toMatch(/Sources: .*Teams/);
  });

  it('summarizes #backend this week with up to three key messages', async () => {
    const r = await ask('Summarize #backend this week', DANIEL);
    expect(r.text).toMatch(/#backend had \d+ messages this week/);
    const quoted = r.text.split('\n').filter((l) => l.startsWith('- '));
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.length).toBeLessThanOrEqual(3);
  });

  it("lists Sara's open tickets", async () => {
    const r = await ask('What are my open tickets?', SARA);
    const mine = c.issues.filter((i) => i.assigneeId === 'p-sara' && i.status !== 'done');
    expect(table(r.blocks).rows).toHaveLength(mine.length);
    expect(r.text).toMatch(/Sources: Jira/);
  });

  it("gives Sara her own hours this week", async () => {
    const r = await ask('How many hours did I work this week?', SARA);
    expect(r.text).toContain('You logged 11 h this week');
  });
});

describe('team health and the status draft', () => {
  it('drafts a Teams update with the PRs-merged number from team health', async () => {
    const health = await ask('How is the team doing?', DANIEL);
    const merged = ofKind(health.blocks, 'stat')[0].items.find((i) => i.label === 'PRs merged')!.value;
    const r = await ask('Write a status update for the team', DANIEL);
    const draft = ofKind(r.blocks, 'draft')[0];
    expect(draft.channel).toBe('teams');
    expect(draft.body).toContain(`PRs merged: ${merged}`);
    expect(Number(merged)).toBeGreaterThan(0);
  });

  it('drafts a status update when a project is named, instead of answering with its status', async () => {
    const r = await ask('Write a status update for Atlas', DANIEL);
    expect(ofKind(r.blocks, 'draft')).toHaveLength(1);
    expect(ofKind(r.blocks, 'status')).toHaveLength(0);
  });

  it('shows team health stats and who is over or under capacity', async () => {
    const r = await ask('How is the team doing?', DANIEL);
    expect(ofKind(r.blocks, 'stat')[0].items.map((i) => i.label)).toEqual(['Hours vs capacity', 'PRs merged', 'Tickets closed']);
    const names = table(r.blocks).rows.map((row) => row.person);
    expect(names).toContain('Sara Lindqvist');
    expect(names).toContain('Leo Park');
    expect(r.text).toMatch(/Sources: .*Clockify.*Jira.*GitHub/);
  });

  it('only shows Sara herself in the over/under table', async () => {
    const r = await ask('How is the team doing?', SARA);
    for (const row of table(r.blocks)?.rows ?? []) expect(row.person).toBe('Sara Lindqvist');
  });

  it('says when Jira did not respond', async () => {
    setDown('Jira', true);
    const r = await ask('How is the team doing?', MAYA);
    expect(r.text).toContain("Jira didn't respond, so closed tickets and blockers aren't included.");
    expect(r.text).not.toMatch(/Sources: .*Jira/);
  });

  it('words every missing-data line with a verb that agrees', async () => {
    setDown('Jira', true);
    const tickets = await ask('What are my open tickets?', SARA);
    expect(tickets.text).toContain("Jira didn't respond, so your tickets aren't included.");
    const status = await ask('How are the projects going?', MAYA);
    expect(status.text).toContain("Jira didn't respond, so tickets and sprints aren't included.");
    setDown('Jira', false);
    setDown('GitHub', true);
    try {
      const health = await ask('How is the team doing?', MAYA);
      expect(health.text).toContain("GitHub didn't respond, so pull requests aren't included.");
      expect(health.text).not.toMatch(/\b(requests|tickets|blockers|notes|names|hours) isn't included/);
    } finally {
      setDown('GitHub', false);
    }
  });
});

describe('the brain runner', () => {
  it('says it is not sure and calls no tools', async () => {
    const r = await ask('Tell me a joke', MAYA);
    expect(r.text.startsWith("I'm not sure what you're asking.")).toBe(true);
    for (const s of hermesAgent.suggestions({ page: 'home', title: 'Home' }, MAYA)) expect(r.text).toContain(s);
    expect(r.tools).toEqual([]);
  });

  it('reads an attachment first and asks what to do with it', async () => {
    const r = await runBrain(def, '', { now: NOW, user: MAYA, attachments: [{ id: 'a', name: 'notes.txt', type: 'text/plain', size: 2048 }] });
    expect(r.activities.some((a) => a.kind === 'file')).toBe(true);
    expect(r.text).toContain("I've read notes.txt (2.0 KB).");
    expect(r.text).toContain('What would you like to know about it?');
    expect(r.tools).toEqual([]);
  });

  it('looks at an image and then answers the question', async () => {
    const r = await runBrain(def, 'How is the team doing?', {
      now: NOW,
      user: MAYA,
      attachments: [{ id: 'i', name: 'board.png', type: 'image/png', size: 4096, url: 'data:image/png;base64,AAAA' }],
    });
    expect(r.activities.some((a) => a.kind === 'image')).toBe(true);
    expect(r.text).toContain("I've read board.png (4.0 KB).");
    expect(ofKind(r.blocks, 'stat')).toHaveLength(1);
  });
});

describe('definition', () => {
  it('greets by first name', () => {
    expect(hermesAgent.greeting(MAYA)).toBe('Hi Maya. Ask me about the team, hours, projects, code, Teams or AWS.');
  });

  it('offers three page-aware suggestions, each of which Hermes understands', async () => {
    const pages: PageContext[] = [
      { page: 'home', title: 'Home' },
      { page: 'team', title: 'Team' },
      { page: 'projects', title: 'Projects' },
      ATLAS_PAGE,
      { page: 'connections', title: 'Connections' },
      { page: 'unknown', title: 'Hermes' },
    ];
    expect(hermesAgent.suggestions(pages[0], MAYA)).toContain('Why did AWS costs go up?');
    expect(hermesAgent.suggestions(ATLAS_PAGE, SARA)).toContain('How is this one doing?');
    for (const page of pages) {
      for (const user of [MAYA, DANIEL, SARA]) {
        const list = hermesAgent.suggestions(page, user);
        expect(list).toHaveLength(3);
        for (const s of list) {
          const r = await ask(s, user, { page });
          expect(r.text, `${user.id} on ${page.page}: ${s}`).not.toContain("I'm not sure what you're asking.");
        }
      }
    }
  });
});
