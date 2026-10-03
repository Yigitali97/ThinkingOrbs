// The Connections page: the company systems Hermes reads, when each last synced, what this user's role lets Hermes read
// there, and a switch per system to simulate an outage so the assistant's "didn't respond" answers can be tried.

import { useAssistant } from '../../assistant/AssistantProvider';
import { setDown, useDown } from '../../assistant/flaky';
import type { Role } from '../../assistant/protocol';
import { int, seeded } from '../../assistant/random';
import { usePageContext } from '../../assistant/usePageContext';
import { HERMES_SEED } from '../config';
import { hermesNow } from '../store';

interface System {
  /** the `system` name the tools carry, so an outage here is an outage for the assistant */
  name: string;
  reads: (role: Role) => string;
}

const SYSTEMS: System[] = [
  {
    name: 'Directory',
    reads: (role) =>
      role === 'developer'
        ? 'People, titles, teams and weekly capacity, and your team’s projects.'
        : 'People, titles, teams and weekly capacity, and every project with its budget.',
  },
  {
    name: 'Clockify',
    reads: (role) =>
      role === 'leadership'
        ? 'Everyone’s time entries.'
        : role === 'manager'
          ? 'Time entries for your team, and other teams as totals.'
          : 'Your own time entries, and your team’s total.',
  },
  {
    name: 'Jira',
    reads: (role) => `Issues, blockers and sprints${role === 'developer' ? ' for your team’s projects' : ' for every project'}.`,
  },
  {
    name: 'GitHub',
    reads: (role) => `Pull requests, reviews and commits${role === 'developer' ? ' in your team’s repositories' : ' in every repository'}.`,
  },
  { name: 'Teams', reads: () => 'Messages in #backend, #product and #general, and standup and planning notes.' },
  {
    name: 'AWS',
    reads: (role) => (role === 'leadership' ? 'Monthly costs by service, and service health.' : 'Service health. Costs are visible to leadership.'),
  },
];

const LATER = ['Slack', 'Google Drive', 'Salesforce'];

// minutes since each system last synced: seeded, so every load shows the same
const rng = seeded(HERMES_SEED);
const SYNC_OFFSETS = SYSTEMS.map(() => int(rng, 2, 9));
const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function Connections() {
  const { user } = useAssistant();
  usePageContext({ page: 'connections', title: 'Connections' });
  const down = useDown();
  const role = user?.role ?? 'developer';
  const now = hermesNow().getTime();

  return (
    <div className="page as">
      <h1>Connections</h1>
      <p className="lede">
        Hermes reads these systems as you, and only what your role allows. It never writes to them. To see how answers cope when a system is
        unavailable, simulate an outage.
      </p>

      <section className="page-section">
        <h2>Company systems</h2>
        <ul className="systems">
          {SYSTEMS.map((s, i) => {
            const isDown = down.has(s.name);
            const synced = now - SYNC_OFFSETS[i] * 60_000;
            const checkbox = `outage-${s.name.toLowerCase()}`;
            return (
              <li key={s.name} className="system" data-down={isDown || undefined}>
                <div className="system-head">
                  <h3>{s.name}</h3>
                  <span className="system-state">
                    <span className="dot" aria-hidden="true" />
                    {isDown ? 'Outage (simulated)' : 'Connected'}
                  </span>
                </div>
                <p className="system-reads">{s.reads(role)}</p>
                <p className="muted">
                  Last sync <time dateTime={new Date(synced).toISOString()}>{clock.format(synced)}</time> ({SYNC_OFFSETS[i]} min ago)
                </p>
                <label className="check" htmlFor={checkbox}>
                  <input id={checkbox} type="checkbox" checked={isDown} onChange={(e) => setDown(s.name, e.currentTarget.checked)} />
                  <span>
                    Simulate an outage<span className="sr-only"> of {s.name}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="page-section">
        <h2>Not connected yet</h2>
        <ul className="systems">
          {LATER.map((name) => (
            <li key={name} className="system system-later">
              <div className="system-head">
                <h3>{name}</h3>
                <span className="tag">Coming later</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
