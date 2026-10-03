// Hermes' opening briefing: two or three sentences on the week, built from the same team-health and project-status figures
// the answers use, through ctx.call and the role's policy only. It is not an answer: no blocks and no Sources line.

import { say } from '../../assistant/brain';
import type { Brain } from '../../assistant/protocol';
import type { Project } from '../data/types';
import { HEALTH_WORDS, projectResults } from './intents/projects';
import { gatherHealth } from './intents/people';
import { Answer, Denied, hours, lowerFirst, one, percentOf, plural } from './intents/shared';

export const hermesBrief: Brain = async (_input, ctx, emit, signal) => {
  const a = new Answer(ctx, emit, signal);
  const sentences: string[] = [];
  try {
    // Scope by role: Leadership both teams, a Manager or Developer their own team (as a total, never individuals).
    const h = await gatherHealth(a, 'this week');
    if (h.hours !== null) {
      const pct = h.capacity === null ? null : percentOf(h.hours, h.capacity);
      const against = pct !== null ? `, ${pct}% of the ${hours(h.capacity!)} capacity so far` : '';
      sentences.push(`This week ${h.scope} logged ${hours(h.hours)}${against}.`);
    }
    if (h.merged !== null) sentences.push(`${plural(h.merged, 'PR')} merged since Monday.`);

    const visible = await a.get<Project[]>('directory.projects', {}, one('the project list'));
    const results = visible ? await projectResults(a, visible, {}, { issues: h.issues, prs: h.prs }) : null;
    if (results) {
      const worrying = results.filter((r) => r.status !== 'on-track');
      sentences.push(
        worrying.length
          ? `${worrying.map((r) => `${r.project.name} is ${HEALTH_WORDS[r.status]}: ${lowerFirst(r.reasons[0])}`).join('; ')}.`
          : 'All your projects are on track.',
      );
    }
  } catch (e) {
    // Nobody is signed in: there is nothing to brief.
    if (!(e instanceof Denied)) throw e;
  }
  await say(emit, sentences.join(' '), signal);
};
