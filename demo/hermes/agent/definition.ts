// The Hermes agent: Brightline Labs' company assistant, wired to the company tools, the role policy and the intent brain.

import { createBrain } from '../../assistant/brain';
import type { AgentDefinition, BrainContext, PageContext, User } from '../../assistant/protocol';
import { hermesPolicy } from '../policy';
import { COMPANY } from '../store';
import { hermesBrief } from './brief';
import { HERMES_INTENTS } from './intents';
import { PROJECT_NAMES, teamChannel } from './intents/shared';
import { hermesTools } from './tools';

const OPEN_TEAM = 'Show me the team dashboard';
const STANDUP = "What did we decide in yesterday's standup?";

/** Three questions per page kind, each answerable by an intent; Home opens with the team dashboard and depends on the role. */
export function hermesSuggestions(page: PageContext, user?: User): string[] {
  const role = user?.role ?? 'developer';
  const channel = `Summarize ${teamChannel(user?.team ?? 'Platform')} this week`;
  // a project the user can see, to name in an example question
  const example = (role === 'developer' ? PROJECT_NAMES.find((p) => p.team === user?.team) : undefined) ?? PROJECT_NAMES[0];
  switch (page.page) {
    case 'team':
      return ['How is the team doing?', 'How many hours did developers work this week?', 'Write a status update for the team'];
    case 'projects':
      return ['How are the projects going?', `What's blocking ${example.name}?`, 'Write a status update for the team'];
    case 'project':
      return ['How is this one doing?', "What's blocking it?", STANDUP];
    case 'connections':
      return role === 'leadership'
        ? ['Why did AWS costs go up?', channel, 'How are the projects going?']
        : [channel, 'What are my open tickets?', 'How are the projects going?'];
    default:
      if (role === 'leadership') return [OPEN_TEAM, 'How are the projects going?', 'Why did AWS costs go up?'];
      if (role === 'manager') return [OPEN_TEAM, 'How is the team doing?', 'How many hours did developers work this week?'];
      return [OPEN_TEAM, 'What are my open tickets?', 'How many hours did I work this week?'];
  }
}

function notUnderstood(ctx: BrainContext): string {
  const tries = hermesSuggestions(ctx.page, ctx.user).map((s) => `- ${s}`);
  return `I'm not sure what you're asking. Try one of these:\n\n${tries.join('\n')}`;
}

export const hermesAgent: AgentDefinition = {
  id: 'hermes',
  name: 'Hermes',
  scope: 'Company systems: people, hours, projects, code, conversations and cloud.',
  tools: hermesTools(() => COMPANY),
  policy: hermesPolicy,
  brain: createBrain({ intents: HERMES_INTENTS, notUnderstood }),
  brief: hermesBrief,
  greeting(user) {
    const first = user?.name.split(' ')[0];
    return `Hi ${first ?? 'there'}. Ask me about the team, hours, projects, code, Teams or AWS.`;
  },
  suggestions: hermesSuggestions,
};
