// The Hermes access rules. The policy is the security boundary: restricted data is removed from tool output
// before the assistant's brain ever sees it, and what was held back is explained in `restricted`.

import type { Policy, Tool, User } from '../assistant/protocol';
import { totalsByTeam } from './agent/tools';
import type { TimeReport } from './agent/tools';
import type { Commit, Company, Issue, Project, PullRequest, Sprint } from './data/types';
import { COMPANY } from './store';

const SIGN_IN = 'Sign in to use Hermes.';
const AWS_REASON = 'AWS costs are visible to leadership.';
const AWS_ALTERNATIVE = 'I can show AWS service health instead.';
const DEVELOPER_RESTRICTED = "Individual hours for other people are visible to managers. Here's your team's total instead.";
const MANAGER_RESTRICTED = 'Individual hours outside your team are visible to leadership. Other teams are shown as totals.';

/** Projects the user may read: everything for Leadership and Managers, their own team's for Developers. */
export function visibleProjectIds(user: User, c: Company): Set<string> {
  const projects = user.role === 'developer' ? c.projects.filter((p) => p.team === user.team) : c.projects;
  return new Set(projects.map((p) => p.id));
}

function timeReport(report: TimeReport, user: User, c: Company): { output: TimeReport; restricted?: string } {
  const visible = visibleProjectIds(user, c);
  const teamOf = new Map(c.people.map((p) => [p.id, p.team as string]));
  // Totals come from the unfiltered per-project hours, limited to projects the user can see, then reduced to what the role may keep.
  const rows = (report.projectTotals ?? []).filter((r) => visible.has(r.projectId) && (user.role !== 'developer' || r.team === user.team));
  const teamTotals = totalsByTeam(rows);
  const onVisible = report.entries.filter((e) => visible.has(e.projectId));
  if (user.role === 'leadership') return { output: { entries: onVisible, teamTotals } };
  if (user.role === 'manager') {
    return { output: { entries: onVisible.filter((e) => teamOf.get(e.personId) === user.team), teamTotals }, restricted: MANAGER_RESTRICTED };
  }
  return { output: { entries: onVisible.filter((e) => e.personId === user.id), teamTotals }, restricted: DEVELOPER_RESTRICTED };
}

export function createHermesPolicy(data: () => Company): Policy {
  return {
    before(tool: Tool, _input: unknown, user?: User) {
      if (!user) return { reason: SIGN_IN };
      if (tool.id === 'aws.costs' && user.role !== 'leadership') return { reason: AWS_REASON, alternative: AWS_ALTERNATIVE };
      return null;
    },
    after<O>(tool: Tool, output: O, user?: User): { output: O; restricted?: string } {
      // Fail closed: a result is never handed to nobody.
      if (!user) throw new Error(SIGN_IN);
      const c = data();
      const visible = visibleProjectIds(user, c);
      const out = output as unknown;
      const narrowed = (value: unknown, restricted?: string) => ({ output: value as O, restricted });

      if (tool.id === 'clockify.timeEntries') {
        const r = timeReport(out as TimeReport, user, c);
        return narrowed(r.output, r.restricted);
      }
      if (user.role !== 'developer') return { output };

      switch (tool.id) {
        case 'directory.projects':
          return narrowed((out as Project[]).filter((p) => visible.has(p.id)).map(({ budgetHours: _budget, ...rest }) => rest));
        case 'jira.issues':
          return narrowed((out as Issue[]).filter((i) => visible.has(i.projectId)));
        case 'jira.sprints':
          return narrowed((out as Sprint[]).filter((s) => visible.has(s.projectId)));
        case 'github.pullRequests':
          return narrowed((out as PullRequest[]).filter((p) => visible.has(p.projectId)));
        case 'github.commits': {
          const repos = new Set(c.projects.filter((p) => visible.has(p.id)).map((p) => p.repo));
          return narrowed((out as Commit[]).filter((m) => repos.has(m.repo)));
        }
        default:
          return { output };
      }
    },
  };
}

export const hermesPolicy: Policy = createHermesPolicy(() => COMPANY);
