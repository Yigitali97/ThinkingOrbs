// The open-dashboard intent: "Show me the team dashboard", "Open Atlas". It answers in one sentence and asks the site to open the view.
// It only matches a short command naming a view, so questions like "How is the team doing?" keep their own intents.

import { say } from '../../../assistant/brain';
import type { Intent } from '../../../assistant/brain';
import { normalize } from '../../../assistant/text';
import { HERMES_ROOT } from '../../config';
import type { ProjectRef } from './shared';
import { Answer, PROJECT_NAMES, resolveProjects } from './shared';

type Destination = { kind: 'view'; sentence: string; href: string } | { kind: 'project'; project: ProjectRef };

/** A command, an optional article, the thing to open and an optional kind of view: "take me to the team dashboard". */
const COMMAND = new RegExp(
  '^(?:(?:please|can you|could you)\\s+)*(?:open|show(?: me)?|go to|take me to|pull up|bring up)\\s+' +
    '(?:(?:the|my|our)\\s+)?(.+?)(?:\\s+(?:dashboard|page|view|screen))?$',
);

const VIEWS: Record<string, { sentence: string; href: string }> = {
  team: { sentence: "Here's the Team dashboard.", href: `${HERMES_ROOT}/team` },
  projects: { sentence: "Here's the Projects dashboard.", href: `${HERMES_ROOT}/projects` },
  connections: { sentence: "Here's the Connections page.", href: `${HERMES_ROOT}/connections` },
  integrations: { sentence: "Here's the Connections page.", href: `${HERMES_ROOT}/connections` },
};

function destination(text: string): Destination | null {
  const command = COMMAND.exec(normalize(text).replace(/[.!?]+$/, ''));
  if (!command) return null;
  const target = command[1].replace(/\s+project$/, '');
  const view = VIEWS[target];
  if (view) return { kind: 'view', ...view };
  const project = PROJECT_NAMES.find((p) => p.name.toLowerCase() === target);
  return project ? { kind: 'project', project: { id: project.id, name: project.name } } : null;
}

export const openDashboard: Intent<Destination> = {
  id: 'open-dashboard',
  match: (text) => destination(text),
  async run(dest, ctx, emit, signal) {
    if (dest.kind === 'view') {
      await say(emit, dest.sentence, signal);
      emit({ type: 'open', href: dest.href });
      return;
    }
    // A named project is checked against the projects this user can see before anything opens.
    const projects = await resolveProjects(new Answer(ctx, emit, signal), dest.project);
    if (!projects) return;
    await say(emit, `Here's the ${dest.project.name} project.`, signal);
    emit({ type: 'open', href: `${HERMES_ROOT}/projects/${dest.project.id}` });
  },
};
