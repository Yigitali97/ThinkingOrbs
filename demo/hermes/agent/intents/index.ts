// The Hermes intents, in the order the brain tries them: page context first, then the user's tickets, a named person's hours
// (before your own, so "Show me Leo's timesheet" is about Leo), your hours, team, projects, conversations, cloud and drafts.

import type { Intent } from '../../../assistant/brain';
import { awsCosts } from './aws';
import { channelSummary, meetingDecisions } from './conversations';
import { devHours, myHours, myTickets, personHours, statusDraft, teamHealth } from './people';
import { projectBlockers, projectStatusIntent, thisProject } from './projects';

export const HERMES_INTENTS: Intent[] = [
  thisProject,
  myTickets,
  personHours,
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
