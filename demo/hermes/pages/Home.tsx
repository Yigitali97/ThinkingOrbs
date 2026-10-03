// The Hermes home page, AI first: a greeting, this week at a glance for the user's scope, the assistant itself in the page,
// and the conversations cleared earlier in this session, ready to bring back.

import { useAssistant } from '../../assistant/AssistantProvider';
import { AssistantInline } from '../../assistant/AssistantInline';
import { Stat } from '../../assistant/blocks/Blocks';
import { focusComposer } from '../../assistant/Composer';
import type { Tone, User } from '../../assistant/protocol';
import { usePageContext } from '../../assistant/usePageContext';
import type { TimeReport } from '../agent/tools';
import { proRatedCapacity, weekStart } from '../data/derive';
import type { Issue, Person, Project, PullRequest } from '../data/types';
import { hermesNow } from '../store';
import { Loading, firstName, hoursText, listOf, read, sum, usePageData } from './shared';

interface Glance {
  scope: string;
  items: { label: string; value: string; delta?: string; tone?: Tone }[];
}

const DASH = '—';

/** The same scope as "How is the team doing?": both delivery teams for Leadership, otherwise the user's own team. */
async function loadGlance(user: User, now: Date): Promise<Glance> {
  const from = weekStart(now).getTime();
  const to = now.getTime();
  const inWeek = (at?: number) => at !== undefined && at >= from && at <= to;

  const projects = await read<Project[]>(user, 'directory.projects');
  const people = await read<Person[]>(user, 'directory.people');
  const time = await read<TimeReport>(user, 'clockify.timeEntries', { from, to });
  const prs = await read<PullRequest[]>(user, 'github.pullRequests');
  const issues = await read<Issue[]>(user, 'jira.issues');

  const teams = user.role === 'leadership' ? [...new Set((projects?.data ?? []).map((p) => p.team as string))] : [user.team];
  const inScope = new Set((projects?.data ?? []).filter((p) => teams.includes(p.team)).map((p) => p.id as string));

  const hours = time ? sum(time.data.teamTotals.filter((t) => teams.includes(t.team)).map((t) => t.hours)) : null;
  const capacity = people ? sum(people.data.filter((p) => teams.includes(p.team)).map((p) => proRatedCapacity(p, now))) : null;
  const pct = hours !== null && capacity ? Math.round((hours / capacity) * 100) : null;
  const merged = prs ? prs.data.filter((p) => inScope.has(p.projectId) && inWeek(p.merged)).length : null;
  const mine = issues?.data.filter((i) => inScope.has(i.projectId)) ?? null;
  const closed = mine ? mine.filter((i) => i.status === 'done' && inWeek(i.resolved)).length : null;
  const blockers = mine ? mine.filter((i) => i.status !== 'done' && i.blocked).length : null;

  return {
    scope: teams.length === 1 ? `The ${teams[0]} team, since Monday.` : `${listOf(teams)}, since Monday.`,
    items: [
      {
        label: 'Hours logged this week',
        value: hours === null ? DASH : hoursText(hours),
        delta: pct === null ? undefined : `${pct}% of capacity so far`,
        tone: pct === null ? undefined : pct > 110 || pct < 70 ? 'warn' : 'good',
      },
      { label: 'PRs merged', value: merged === null ? DASH : String(merged) },
      { label: 'Tickets closed', value: closed === null ? DASH : String(closed) },
      { label: 'Open blockers', value: blockers === null ? DASH : String(blockers) },
    ],
  };
}

function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { user, snapshot, conversation } = useAssistant();
  usePageContext({ page: 'home', title: 'Home' });
  const glance = usePageData(loadGlance);
  const hasTurns = snapshot.turns.length > 0;

  return (
    <div className="page as home">
      <h1>
        {greeting(hermesNow())}, {firstName(user)}
      </h1>

      <section className="home-glance" aria-labelledby="home-glance" aria-busy={!glance}>
        <div className="section-head">
          <h2 id="home-glance">Today at a glance</h2>
          {glance && <p className="section-note">{glance.scope}</p>}
        </div>
        {glance ? <Stat items={glance.items} /> : <Loading />}
      </section>

      <section className="home-ask" aria-labelledby="home-ask">
        <div className="section-head">
          <h2 id="home-ask">Ask Hermes</h2>
          {hasTurns && (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                conversation.clear();
                focusComposer();
              }}
            >
              Clear conversation
            </button>
          )}
        </div>
        <AssistantInline className="home-assistant" />
      </section>

      {snapshot.archive.length > 0 && (
        <section className="home-recent" aria-labelledby="home-recent">
          <h2 id="home-recent">Recent conversations</h2>
          <ul className="recent-list">
            {snapshot.archive.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="recent-item"
                  aria-describedby={`recent-${a.id}`}
                  onClick={() => {
                    conversation.restore(a.id);
                    focusComposer();
                  }}
                >
                  <span className="recent-title">{a.title}</span>
                  <span className="recent-count" id={`recent-${a.id}`} aria-hidden="true">
                    {a.turns.length === 1 ? '1 question' : `${a.turns.length} questions`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
