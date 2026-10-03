// The Projects page: a status card for each project the user may see, by the same rule the assistant answers with.

import { useAssistant } from '../../assistant/AssistantProvider';
import { Status } from '../../assistant/blocks/Blocks';
import type { StatusProps } from '../../assistant/blocks/Status';
import type { User } from '../../assistant/protocol';
import { usePageContext } from '../../assistant/usePageContext';
import { HERMES_ROOT } from '../config';
import { projectStatus } from '../data/derive';
import type { Issue, Project, PullRequest, Sprint } from '../data/types';
import { Loading, read, usePageData } from './shared';

interface ProjectsData {
  cards: StatusProps[];
  failed: boolean;
}

async function loadProjects(user: User, now: Date): Promise<ProjectsData> {
  const projects = await read<Project[]>(user, 'directory.projects');
  const issues = await read<Issue[]>(user, 'jira.issues');
  const sprints = await read<Sprint[]>(user, 'jira.sprints');
  const prs = await read<PullRequest[]>(user, 'github.pullRequests');
  if (!projects || !issues || !sprints || !prs) return { cards: [], failed: true };
  const data = { issues: issues.data, sprints: sprints.data, prs: prs.data };
  const cards = projects.data.map((p) => ({
    title: p.name,
    ...projectStatus(p, data, now),
    sources: ['Jira', 'GitHub'],
    href: `${HERMES_ROOT}/projects/${p.id}`,
  }));
  return { cards, failed: false };
}

export function Projects() {
  const { user } = useAssistant();
  usePageContext({ page: 'projects', title: 'Projects' });
  const [data, broken] = usePageData(loadProjects);
  const onTrack = data?.cards.filter((c) => c.status === 'on-track').length ?? 0;

  return (
    <div className="page as">
      <h1>Projects</h1>
      <p className="lede">
        On track, at risk or off track, from sprint velocity against the target date, blocked tickets and pull requests waiting for review.
      </p>
      <section className="page-section" aria-busy={!data && !broken}>
        <div className="section-head">
          <h2>{user?.role === 'developer' ? 'Your team’s projects' : 'All projects'}</h2>
          {data && !data.failed && (
            <p className="section-note">
              {onTrack} of {data.cards.length} on track
            </p>
          )}
        </div>
        {!data ? (
          <Loading failed={broken} />
        ) : data.failed ? (
          <p className="note">Jira or GitHub didn’t respond, so project status can’t be shown right now.</p>
        ) : (
          <div className="card-grid">
            {data.cards.map((c) => (
              <Status key={c.title} {...c} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
