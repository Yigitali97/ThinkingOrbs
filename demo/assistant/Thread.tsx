// The conversation as a list of turns: your question, the live activity row while the reply works, then the folded
// activity summary, the streamed answer and its blocks. Only the latest answer is a live region for screen readers.

import { ActivityRow } from '../chat-app/ActivityRow';
import { ActivitySummary } from '../chat-app/ActivitySummary';
import { shownActivity } from '../chat-app/activity';
import type { Activity } from '../chat-app/activity';
import { Answer } from '../chat-app/Answer';
import { useAssistant } from './AssistantProvider';
import { Blocks } from './blocks/Blocks';
import { focusComposer } from './Composer';
import type { Turn } from './conversation';
import type { AssistantReply } from './reply';

type Tools = Extract<Activity, { kind: 'tools' }>;

/**
 * The tool calls of one reply as a single step. Calls made one after another each open their own activity,
 * which would read "used 1 tool, used 1 tool…" in the summary; folded, it says "used 3 tools".
 */
export function foldTools(reply: AssistantReply): AssistantReply {
  const tools = reply.activities.filter((a): a is Tools => a.kind === 'tools');
  if (tools.length < 2) return reply;
  const ends = tools.map((t) => t.endedAt);
  const merged: Tools = {
    ...tools[0],
    calls: tools.flatMap((t) => t.calls),
    status: tools.some((t) => t.status === 'active') ? 'active' : tools.some((t) => t.status === 'error') ? 'error' : 'done',
    endedAt: ends.every((e) => e !== undefined) ? Math.max(...(ends as number[])) : undefined,
  };
  return { ...reply, activities: reply.activities.flatMap((a): Activity[] => (a === tools[0] ? [merged] : a.kind === 'tools' ? [] : [a])) };
}

function Question({ turn }: { turn: Turn }) {
  return (
    <div className="as-user">
      {turn.attachments.length > 0 && (
        <ul className="as-attached" aria-label="Attached">
          {turn.attachments.map((a) => (
            <li key={a.id}>{a.url ? <img src={a.url} alt={a.name} /> : <span className="as-attached-file">{a.name}</span>}</li>
          ))}
        </ul>
      )}
      {turn.question && <p>{turn.question}</p>}
    </div>
  );
}

function Reply({ turn, latest }: { turn: Turn; latest: boolean }) {
  const { reply } = turn;
  const working = reply.state === 'working';
  const streaming = reply.state === 'writing';
  return (
    <div className="as-reply">
      {/* the live row only while nothing is on screen yet: once text or a block arrives it folds into the summary */}
      {working && <ActivityRow activity={shownActivity(reply)} />}
      {!working && reply.activities.length > 0 && <ActivitySummary reply={foldTools(reply)} />}
      <div className="as-answer" aria-live={latest ? 'polite' : undefined} aria-busy={latest ? working || streaming : undefined}>
        <Answer text={reply.text} tokens={reply.tokens} streaming={streaming} />
        <Blocks blocks={reply.blocks} />
        {reply.state === 'stopped' && <p className="as-note">Stopped.</p>}
        {reply.state === 'error' && (
          <p className="as-note" data-error="">
            {reply.error ?? 'Something went wrong.'}
          </p>
        )}
      </div>
    </div>
  );
}

export function Thread({ turns }: { turns: Turn[] }) {
  return (
    <ol className="as-thread" aria-label="Conversation">
      {turns.map((t, i) => (
        <li key={t.id} className="as-turn" data-turn={t.reply.state}>
          <Question turn={t} />
          <Reply turn={t} latest={i === turns.length - 1} />
        </li>
      ))}
    </ol>
  );
}

/** The page's suggested questions as buttons; picking one sends it and puts you back in the message box. */
export function Suggestions({ label = 'Suggestions' }: { label?: string }) {
  const { agent, conversation, page, user } = useAssistant();
  const items = agent.suggestions(page, user);
  if (!items.length) return null;
  return (
    <ul className="as-suggestions" aria-label={label}>
      {items.map((s) => (
        <li key={s}>
          <button
            type="button"
            className="as-suggestion"
            onClick={() => {
              void conversation.send(s);
              focusComposer();
            }}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What an empty conversation shows: the agent's greeting and the page's suggestions. */
export function EmptyThread() {
  const { agent, user } = useAssistant();
  return (
    <div className="as-empty">
      <p className="as-greeting">{agent.greeting(user)}</p>
      <Suggestions />
    </div>
  );
}
