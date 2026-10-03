// Every page of the Hermes site. Plain data with no React or DOM, so the Vite build can import it too and prerender one HTML file per page.

import { HERMES_NAME, HERMES_ROOT } from './config';
import type { PageMeta } from '../site/routes';

/** The projects that have a page. The Hermes data tests check this list against the generated company. */
export const HERMES_PROJECTS: { id: string; name: string }[] = [
  { id: 'atlas', name: 'Atlas' },
  { id: 'delta', name: 'Delta' },
  { id: 'beacon', name: 'Beacon' },
  { id: 'comet', name: 'Comet' },
];

export const HERMES_PATHS: string[] = [
  HERMES_ROOT,
  `${HERMES_ROOT}/sign-in`,
  `${HERMES_ROOT}/team`,
  `${HERMES_ROOT}/projects`,
  ...HERMES_PROJECTS.map((p) => `${HERMES_ROOT}/projects/${p.id}`),
  `${HERMES_ROOT}/connections`,
];

const strip = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Title and description for a Hermes path, or null when no page exists there. */
export function hermesPageMeta(rawPath: string): PageMeta | null {
  const path = strip(rawPath);
  if (path === HERMES_ROOT)
    return {
      title: `${HERMES_NAME}: ask anything about Brightline Labs`,
      description:
        'Hermes is the Brightline Labs company assistant: ask about hours, tickets, pull requests, meetings and costs, and get answers that respect your role. A demo with sample data.',
    };
  if (path === `${HERMES_ROOT}/sign-in`)
    return { title: `Sign in · ${HERMES_NAME}`, description: 'Pick a sample Brightline Labs employee to try Hermes as. A demo: no password needed.' };
  if (path === `${HERMES_ROOT}/team`)
    return { title: `Team · ${HERMES_NAME}`, description: 'Who is on each Brightline Labs team and how many hours they logged this week, as far as your role allows.' };
  if (path === `${HERMES_ROOT}/projects`)
    return { title: `Projects · ${HERMES_NAME}`, description: 'The Brightline Labs projects you can see, with their sprint progress, open work and budget.' };
  if (path === `${HERMES_ROOT}/connections`)
    return {
      title: `Connections · ${HERMES_NAME}`,
      description: 'The company systems Hermes reads from: Jira, GitHub, Teams, Clockify, the directory and AWS, and what your role may see in each.',
    };
  const project = path.match(/^\/hermes\/projects\/([a-z-]+)$/);
  if (project) {
    const found = HERMES_PROJECTS.find((p) => p.id === project[1]);
    return found
      ? { title: `${found.name} · ${HERMES_NAME}`, description: `${found.name} at Brightline Labs: sprint progress, tickets, pull requests and hours against budget.` }
      : null;
  }
  return null;
}
