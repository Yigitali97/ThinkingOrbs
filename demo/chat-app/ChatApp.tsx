// Chat app sample. Each orb has one job and appears only while it's doing it:
//   live row  — ReasoningOrb · SearchOrb · ToolOrb · IngestOrb · VisionOrb · ReelOrb, cross-fading
//   results   — the real image, frames and files the reply worked with
//   answer    — streamed text with a TokenOrb caret
//   header    — MascotOrb avatar + StatusOrb activity;  composer — VoiceOrb for dictation
// Plug in your model with <ChatApp agent={yourAgent} /> — the event protocol is in agent.ts.

import { CSSProperties, useEffect, useRef, useState } from 'react';
import { MascotOrb, MascotOrbRef, StatusOrb, StatusVariant } from '../../src/orbs';
import { currentActivity, Reply, shownActivity } from './activity';
import { ActivityRow } from './ActivityRow';
import { ActivitySummary } from './ActivitySummary';
import { Answer } from './Answer';
import { Composer } from './Composer';
import { Agent, demoAgent } from './agent';
import { Hint, HINTS, makeSample } from './hints';
import { Collapse } from './motion';
import { Results } from './Results';
import { AssistantMessage, useChat, UserMessage } from './useChat';
import { useDictation } from './useDictation';
import './chat-app.css';

function headerStatus(reply: Reply | undefined, busy: boolean): [StatusVariant, string] {
  if (!busy || !reply) return ['base', 'Ready'];
  if (reply.state === 'writing') return ['working', 'Writing'];
  switch (currentActivity(reply)?.kind) {
    case 'thinking':
      return ['reasoning', 'Thinking'];
    case 'search':
      return ['searching', 'Searching the web'];
    case 'tools':
      return ['working · gyro', 'Using tools'];
    case 'file':
      return ['searching · lighthouse', 'Reading a file'];
    case 'image':
      return ['searching · lighthouse', 'Looking at an image'];
    case 'video':
      return ['searching · lighthouse', 'Watching a video'];
    default:
      return reply.activities.length ? ['working', 'Preparing the answer'] : ['waiting', 'Getting started'];
  }
}

function UserBubble({ m }: { m: UserMessage }) {
  return (
    <div className="ca-msg ca-user">
      {m.attachments.length > 0 && (
        <div className="ca-attached">
          {m.attachments.map((a) => {
            const thumb = a.url ?? a.frames?.[Math.floor(a.frames.length / 2)];
            return thumb ? (
              <img key={a.id} src={thumb} alt={a.name} />
            ) : (
              <span key={a.id} className="ca-attached-file">
                {a.name}
              </span>
            );
          })}
        </div>
      )}
      {m.text && <p>{m.text}</p>}
    </div>
  );
}

function AssistantReply({ m }: { m: AssistantMessage }) {
  const r = m.reply;
  const live = r.state === 'working';
  return (
    <div className="ca-msg ca-assistant">
      <Collapse open={live}>
        <ActivityRow activity={shownActivity(r)} />
      </Collapse>
      <Collapse open={!live && r.activities.length > 0}>
        <ActivitySummary reply={r} />
      </Collapse>
      <Results activities={r.activities} />
      <Answer text={r.text} tokens={r.tokens} streaming={r.state === 'writing'} />
      {r.state === 'stopped' && <p className="ca-status-note">You stopped this reply.</p>}
      {r.state === 'error' && (
        <p className="ca-status-note" data-error>
          {r.error}
        </p>
      )}
    </div>
  );
}

export function ChatApp({ agent = demoAgent }: { agent?: Agent }) {
  const mascot = useRef<MascotOrbRef>(null);
  const chat = useChat(agent, { onReplyDone: () => mascot.current?.bounce(0.6) });
  const [draft, setDraft] = useState('');
  const dictation = useDictation(setDraft);
  const listRef = useRef<HTMLDivElement>(null);

  // follow new content, unless the reader has scrolled up to look at something
  const pinned = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.messages]);

  const last = chat.messages[chat.messages.length - 1];
  const [variant, status] = headerStatus(last?.role === 'assistant' ? last.reply : undefined, chat.busy);

  const send = (text: string) => {
    dictation.stop();
    setDraft('');
    pinned.current = true;
    void chat.send(text);
  };

  async function runHint(h: Hint) {
    if (chat.busy) return;
    if (h.dictate) return dictation.active ? dictation.stop() : void dictation.start(draft);
    pinned.current = true;
    if (h.sample) chat.sendWhenReady(h.prompt ?? '', [await makeSample(h.sample)]);
    else if (h.prompt) send(h.prompt);
  }

  return (
    <div className="ca">
      <header className="ca-head">
        <MascotOrb ref={mascot} size={48} label={null} />
        <div className="ca-head-text">
          <strong>Orb Assistant</strong>
          <span aria-live="polite">
            <StatusOrb variant={variant} size={14} label={null} className="ca-head-status" />
            {status}
          </span>
        </div>
        {chat.messages.length > 0 && (
          <button className="ca-ghost" onClick={chat.clear} disabled={chat.busy}>
            New chat
          </button>
        )}
      </header>

      <div
        className="ca-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {chat.messages.length === 0 ? (
          <div className="ca-empty">
            <h3>What would you like to try?</h3>
            <p>Each of these shows a different orb at work. You can also type anything or attach your own file.</p>
            <div className="ca-cards">
              {HINTS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="ca-card"
                  style={{ '--hint': h.color } as CSSProperties}
                  disabled={h.dictate && !dictation.supported}
                  onClick={() => void runHint(h)}
                >
                  <strong>{h.label}</strong>
                  <span className="ca-card-prompt">{h.prompt ?? 'Speak instead of typing'}</span>
                  <span className="ca-card-orb">
                    <i aria-hidden="true" />
                    {h.orb}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chat.messages.map((m) => (m.role === 'user' ? <UserBubble key={m.id} m={m} /> : <AssistantReply key={m.id} m={m} />))
        )}
      </div>

      <Composer
        draft={draft}
        setDraft={setDraft}
        uploads={chat.uploads}
        busy={chat.busy}
        dictation={dictation}
        onSend={() => send(draft)}
        onStop={chat.stop}
        onAttach={chat.attachFiles}
        onRemoveUpload={chat.removeUpload}
        onHint={(h) => void runHint(h)}
      />
    </div>
  );
}
