// Shapes of the generated Brightline Labs company data: people, projects, hours, Jira, GitHub, Teams and AWS.
// All times are epoch milliseconds.

import type { Role } from '../../assistant/protocol';

export type TeamName = 'Platform' | 'Product' | 'Leadership';
export type ProjectId = 'atlas' | 'beacon' | 'comet' | 'delta';
export type AwsService = 'EC2' | 'RDS' | 'S3' | 'Lambda' | 'CloudFront';

export interface Person {
  id: string;
  name: string;
  title: string;
  /** the access role, not the job: QA, designers and PMs are `developer` too */
  role: Role;
  team: TeamName;
  /** weekly hours; 0 for Leadership, who log none */
  capacityHours: number;
}

export interface Project {
  id: ProjectId;
  name: string;
  team: TeamName;
  budgetHours: number;
  start: number;
  target: number;
  repo: string;
}

export interface TimeEntry {
  personId: string;
  projectId: ProjectId;
  at: number;
  hours: number;
  description: string;
}

export interface Sprint {
  id: string;
  projectId: ProjectId;
  start: number;
  end: number;
  committedPoints: number;
  completedPoints: number;
}

export interface Issue {
  /** e.g. ATL-12 */
  key: string;
  projectId: ProjectId;
  title: string;
  status: 'todo' | 'in-progress' | 'in-review' | 'done';
  assigneeId: string;
  points: number;
  /** why it is blocked, when it is */
  blocked?: string;
  created: number;
  resolved?: number;
}

export interface PullRequest {
  id: number;
  repo: string;
  projectId: ProjectId;
  title: string;
  authorId: string;
  reviewerIds: string[];
  opened: number;
  firstReviewAt?: number;
  merged?: number;
}

export interface Commit {
  sha: string;
  repo: string;
  authorId: string;
  at: number;
  message: string;
}

export interface Message {
  id: string;
  channel: '#backend' | '#product' | '#general';
  authorId: string;
  at: number;
  text: string;
}

export interface Meeting {
  id: string;
  kind: 'standup' | 'planning';
  team: TeamName;
  at: number;
  decisions: string[];
  actions: { ownerId: string; text: string }[];
}

export interface AwsCost {
  /** YYYY-MM */
  month: string;
  service: AwsService;
  usd: number;
}

export interface AwsHealth {
  service: AwsService;
  status: 'healthy' | 'degraded';
  lastDeployAt: number;
  note?: string;
}

export interface Company {
  people: Person[];
  projects: Project[];
  time: TimeEntry[];
  sprints: Sprint[];
  issues: Issue[];
  prs: PullRequest[];
  commits: Commit[];
  messages: Message[];
  meetings: Meeting[];
  awsCosts: AwsCost[];
  awsHealth: AwsHealth[];
}
