// Tests for the systems on the first screen's orbit: the six Hermes reads, in order, and a question per system that Hermes
// understands for every role and answers by reading that system.

import { describe, expect, it } from 'vitest';
import type { User } from '../../assistant/protocol';
import { runBrain } from '../../assistant/testing';
import { hermesAgent } from '../agent/definition';
import { COMPANY } from '../store';
import { HERMES_SYSTEMS } from './systems';

const NOW = new Date('2026-10-07T15:00:00');
const asUser = (id: string): User => {
  const p = COMPANY.people.find((x) => x.id === id)!;
  return { id: p.id, name: p.name, title: p.title, role: p.role, team: p.team };
};

describe('HERMES_SYSTEMS', () => {
  it('lists the six systems Hermes reads, each with an icon', () => {
    expect(HERMES_SYSTEMS.map((s) => s.name)).toEqual(['Directory', 'Clockify', 'Jira', 'GitHub', 'Teams', 'AWS']);
    for (const s of HERMES_SYSTEMS) expect(s.icon).toBeTruthy();
    // every name is a system the tools carry, so the orbit lights up the node for a running tool
    const toolSystems = new Set(hermesAgent.tools.map((t) => t.system));
    for (const s of HERMES_SYSTEMS) expect(toolSystems.has(s.name)).toBe(true);
  });

  for (const id of ['p-maya', 'p-daniel', 'p-sara']) {
    it(`asks a question Hermes answers from that system, as ${id}`, async () => {
      for (const s of HERMES_SYSTEMS) {
        const r = await runBrain(hermesAgent, s.ask, { now: NOW, user: asUser(id) });
        expect(r.text, s.ask).not.toMatch(/^I'm not sure what you're asking/);
        const systems = r.tools.map((t) => hermesAgent.tools.find((x) => x.id === t)!.system);
        expect(systems, s.ask).toContain(s.name);
      }
    });
  }
});
