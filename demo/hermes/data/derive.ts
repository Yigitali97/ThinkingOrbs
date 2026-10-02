// Figures worked out from the company data: pro-rated capacity, load state, sprint velocity and project status.

import { SPRINT_DAYS } from '../config';
import type { Company, Person, Project, ProjectId, Sprint } from './types';

export const DAY_MS = 86_400_000;
const STALE_REVIEW_DAYS = 3;

export type LoadState = 'over' | 'under' | 'ok';
export type ProjectHealth = 'on-track' | 'at-risk' | 'off-track';

/** Monday 00:00 local of the week containing `now`. */
export function weekStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
}

/** Weekly capacity scaled to the weekdays gone so far; today counts as the share of an 8 h day since 09:00. */
export function proRatedCapacity(person: Person, now: Date): number {
  const weekday = (now.getDay() + 6) % 7; // Monday = 0
  let elapsed = 5;
  if (weekday < 5) {
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    elapsed = weekday + Math.min(1, Math.max(0, (hour - 9) / 8));
  }
  return (person.capacityHours * elapsed) / 5;
}

/** Hours logged by a person from Monday of this week up to `now`. */
export function weekToDateHours(c: Company, personId: string, now: Date): number {
  const from = weekStart(now).getTime();
  return c.time.filter((t) => t.personId === personId && t.at >= from && t.at <= now.getTime()).reduce((sum, t) => sum + t.hours, 0);
}

export function loadState(hours: number, capacity: number): LoadState {
  if (capacity === 0) return 'ok';
  const ratio = hours / capacity;
  if (ratio > 1.1) return 'over';
  if (ratio < 0.7) return 'under';
  return 'ok';
}

/** Average completed points of the last three finished sprints (pass finished sprints only), or 0 with none. */
export function velocity(projectId: ProjectId, sprints: Sprint[]): number {
  const last = sprints
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => b.end - a.end)
    .slice(0, 3);
  if (last.length === 0) return 0;
  return last.reduce((sum, s) => sum + s.completedPoints, 0) / last.length;
}

export function remainingPoints(projectId: ProjectId, c: Company): number {
  return c.issues.filter((i) => i.projectId === projectId && i.status !== 'done').reduce((sum, i) => sum + i.points, 0);
}

export function blockedIssues(projectId: ProjectId, c: Company) {
  return c.issues.filter((i) => i.projectId === projectId && i.status !== 'done' && i.blocked);
}

/** Open pull requests with no review yet after more than three days. */
export function waitingPrs(projectId: ProjectId, c: Company, now: Date) {
  return c.prs.filter(
    (p) => p.projectId === projectId && !p.merged && !p.firstReviewAt && now.getTime() - p.opened > STALE_REVIEW_DAYS * DAY_MS,
  );
}

export function projectStatus(project: Project, c: Company, now: Date): { status: ProjectHealth; reasons: string[] } {
  const reasons: string[] = [];
  const remaining = remainingPoints(project.id, c);
  const v = velocity(project.id, c.sprints);
  let late = false;
  if (remaining > 0 && v === 0) {
    late = true;
    reasons.push('No finished sprints yet, so there is no velocity to project a finish date from');
  } else if (remaining > 0) {
    const finish = now.getTime() + Math.ceil(remaining / v) * SPRINT_DAYS * DAY_MS;
    if (finish > project.target) {
      late = true;
      const weeks = Math.max(1, Math.round((finish - project.target) / (7 * DAY_MS)));
      reasons.push(`Projected to finish ${weeks} week${weeks === 1 ? '' : 's'} after the target date`);
    }
  }
  const blocked = blockedIssues(project.id, c).length;
  if (blocked > 2) reasons.push(`${blocked} blocked tickets`);
  const waiting = waitingPrs(project.id, c, now).length;
  if (waiting > 0) reasons.push(`${waiting} ${waiting === 1 ? 'PR' : 'PRs'} waiting more than ${STALE_REVIEW_DAYS} days for review`);
  if (late) return { status: 'off-track', reasons };
  if (blocked > 2 || waiting > 0) return { status: 'at-risk', reasons };
  return { status: 'on-track', reasons: ['On pace to finish by the target date'] };
}
