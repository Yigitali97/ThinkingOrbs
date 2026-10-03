// Intents about Teams: decisions and actions from meeting notes, and a summary of a channel.
// Teams messages and meetings are readable by every signed-in role (Ruling R5).

import { hasAny, normalize, parseRange } from '../../../assistant/text';
import type { DateRange } from '../../../assistant/text';
import type { Meeting, Message, Person } from '../../data/types';
import { CHANNELS, PROJECT_NAMES, dayLabel, intent, lastDays, nameOf, plural, rangeIn, shortTime, span } from './shared';

const KEY_HINTS = ['heads up', 'review', 'fix', 'deploy', 'blocked', 'slow', 'flaky', 'green', 'rotating', 'retry', 'need', 'still'];
const MEETING_WORDS = ['decide', 'decided', 'decision', 'decisions', 'standup', 'stand-up', 'stand up', 'meeting', 'meetings', 'planning'];
const TEAMS = [...new Set(PROJECT_NAMES.map((p) => p.team))];

// ------------------------------------------------------------------ meetings

type MeetingQuery = { range: DateRange | null; kind?: Meeting['kind']; team?: string };

export const meetingDecisions = intent<MeetingQuery>(
  'meeting-decisions',
  (text, ctx) => {
    if (!hasAny(text, MEETING_WORDS)) return null;
    const kind = hasAny(text, ['standup', 'stand-up', 'stand up']) ? 'standup' : hasAny(text, ['planning']) ? 'planning' : undefined;
    return { range: parseRange(text, ctx.now), kind, team: TEAMS.find((t) => hasAny(text, [t])) };
  },
  async ({ range, kind, team }, a) => {
    const { now, user } = a.ctx;
    // the user's own team's meetings unless another team is named; Leadership has no meetings of its own, so sees all
    const forTeam = team ?? (user && user.role !== 'leadership' ? user.team : undefined);
    const window = range ? span(range, now) : lastDays(now, 14);
    const found = await a.get<Meeting[]>('teams.meetings', { kind, team: forTeam, ...window }, 'meeting notes');
    if (!found) return a.send([]);
    const what = kind ?? 'meeting';
    const when = range ? range.label : 'in the last two weeks';
    const sorted = [...found].sort((x, y) => x.at - y.at);
    // with no period named, the latest meeting per team
    const meetings = range ? sorted : [...new Map(sorted.map((m) => [m.team, m])).values()];
    if (!meetings.length) return a.send([`I couldn't find ${forTeam ? `a ${forTeam} ${what}` : `a ${what}`} ${when}.`]);

    const people = await a.get<Person[]>('directory.people', {}, 'names');
    const lines: string[] = [];
    for (const m of meetings) {
      const title = `${m.team} ${m.kind === 'standup' ? 'standup' : 'planning meeting'}`;
      if (!m.decisions.length && !m.actions.length) {
        lines.push(`The ${title} on ${dayLabel(m.at)} recorded no decisions or actions.`);
        continue;
      }
      if (m.decisions.length) {
        lines.push(`In the ${title} on ${dayLabel(m.at)}, the team decided:`);
        lines.push(m.decisions.map((d) => `- ${d}`).join('\n'));
      } else {
        lines.push(`The ${title} on ${dayLabel(m.at)} made no decisions.`);
      }
      if (m.actions.length) {
        lines.push('Actions:');
        lines.push(m.actions.map((x) => `- ${nameOf(people, x.ownerId)}: ${x.text}`).join('\n'));
      }
    }
    return a.send(lines);
  },
);

// ------------------------------------------------------------------ channels

type ChannelQuery = { channel: string; text: string };

export const channelSummary = intent<ChannelQuery>(
  'channel-summary',
  (text) => {
    const tagged = normalize(text).match(/#([a-z][a-z0-9-]*)/);
    if (tagged) return { channel: `#${tagged[1]}`, text };
    if (!hasAny(text, ['summarize', 'summarise', 'summary'])) return null;
    const named = CHANNELS.find((c) => hasAny(text, [c.slice(1)]));
    return named ? { channel: named, text } : null;
  },
  async ({ channel, text }, a) => {
    if (!CHANNELS.includes(channel)) {
      return a.send([`I can't find a channel called ${channel}. The channels I can read are ${CHANNELS.join(', ')}.`]);
    }
    const { now } = a.ctx;
    const range = rangeIn(text, now);
    const messages = await a.get<Message[]>('teams.messages', { channel, ...span(range, now) }, `${channel} messages`);
    if (!messages) return a.send([]);
    if (!messages.length) return a.send([`${channel} had no messages ${range.label}.`]);
    const people = await a.get<Person[]>('directory.people', {}, 'names');

    const counts = new Map<string, number>();
    for (const m of messages) counts.set(m.authorId, (counts.get(m.authorId) ?? 0) + 1);
    const [topId, topCount] = [...counts].sort((x, y) => y[1] - x[1])[0];
    const score = (m: Message) => KEY_HINTS.filter((w) => normalize(m.text).includes(w)).length;
    // the most telling messages, one per distinct text, shown in the order they were posted
    const seen = new Set<string>();
    const key = [...messages]
      .sort((x, y) => score(y) - score(x) || y.at - x.at)
      .filter((m) => !seen.has(m.text) && Boolean(seen.add(m.text)))
      .slice(0, 3)
      .sort((x, y) => x.at - y.at);

    const lines = [
      `${channel} had ${plural(messages.length, 'message')} ${range.label} from ${plural(counts.size, 'person', 'people')}. ` +
        `${nameOf(people, topId)} posted the most (${topCount}).`,
      'Key messages:',
      key.map((m) => `- ${shortTime(m.at)}, ${nameOf(people, m.authorId)}: “${m.text}”`).join('\n'),
    ];
    return a.send(lines);
  },
);
