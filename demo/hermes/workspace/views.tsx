// Which view the canvas shows for an address: none on the conversation itself, a dashboard on its route, and Not found for
// an unknown address or a project this user may not see (the two look the same, so a hidden project is never confirmed).

import type { ReactNode } from 'react';
import type { User } from '../../assistant/protocol';
import { normalisePath } from '../../site/router';
import { HERMES_PROJECTS, hermesProjectId } from '../routes';
import { HERMES_ROOT } from '../config';
import { visibleProjectIds } from '../policy';
import { COMPANY } from '../store';
import { Connections } from '../views/Connections';
import { NotFound } from '../views/NotFound';
import { Project } from '../views/Project';
import { Projects } from '../views/Projects';
import { Team } from '../views/Team';

export interface CanvasView {
  title: string;
  view: ReactNode;
}

/** The project a path shows, when this user may see it; otherwise null. */
export function visibleProject(path: string, user: User | null): string | null {
  const id = hermesProjectId(path);
  return id && user && visibleProjectIds(user, COMPANY).has(id) ? id : null;
}

export function canvasFor(rawPath: string, user: User): CanvasView | null {
  const path = normalisePath(rawPath);
  if (path === HERMES_ROOT) return null;
  if (path === `${HERMES_ROOT}/team`) return { title: 'Team', view: <Team /> };
  if (path === `${HERMES_ROOT}/projects`) return { title: 'Projects', view: <Projects /> };
  if (path === `${HERMES_ROOT}/connections`) return { title: 'Connections', view: <Connections /> };
  const id = visibleProject(path, user);
  if (id) return { title: HERMES_PROJECTS.find((p) => p.id === id)?.name ?? id, view: <Project id={id} /> };
  return { title: 'Not found', view: <NotFound path={path} /> };
}
