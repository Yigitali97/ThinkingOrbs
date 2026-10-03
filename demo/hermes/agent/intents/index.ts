// The Hermes intents, in the order the brain tries them: page context first, then the user's own things,
// then team, projects, conversations, cloud and drafts.

import type { Intent } from '../../../assistant/brain';
import { awsCosts } from './aws';
import { channelSummary, meetingDecisions } from './conversations';
import { devHours, myHours, myTickets, statusDraft, teamHealth } from './people';
import { projectBlockers, projectStatusIntent, thisProject } from './projects';

export const HERMES_INTENTS: Intent[] = [
  thisProject,
  myTickets,
  myHours,
  devHours,
  teamHealth,
  projectBlockers,
  projectStatusIntent,
  meetingDecisions,
  channelSummary,
  awsCosts,
  statusDraft,
];

export { projectIn, unknownProjectName } from './shared';
