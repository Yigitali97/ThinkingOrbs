// What the live row folds into once the answer starts: one sentence that expands into a timeline.

import { CSSProperties, useId, useState } from 'react';
import { ReasoningOrb } from '../../src/orbs';
import { Activity, describe, KIND_COLOR, Reply, summarize } from './activity';
import { Collapse } from './motion';

const seconds = (ms: number) => (ms < 950 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`);
const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function Details({ a }: { a: Activity }) {
  switch (a.kind) {
    case 'thinking':
      return (
        <div className="ca-tl-thinking">
          <ReasoningOrb steps={a.steps} thinking={false} size={96} showCaption={false} />
          <ol>
            {a.steps.map((s) => (
              <li key={s.id}>{s.label}</li>
            ))}
          </ol>
        </div>
      );
    case 'search': {
      const sorted = [...a.sources].sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
      return (
        <>
          <ul className="ca-tl-sources">
            {sorted.map((s) => (
              <li key={s.id}>
                <span className="ca-avatar" aria-hidden="true">
                  {(s.domain ?? '?').charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{s.domain}</strong>
                  <small>{s.title}</small>
                </span>
              </li>
            ))}
          </ul>
          {a.sources.some((s) => s.demo) && <p className="ca-tl-note">These are demo results.</p>}
        </>
      );
    }
    case 'tools':
      return (
        <ul className="ca-tl-tools">
          {a.calls.map((c) => (
            <li key={c.id} data-status={c.status}>
              <span className="ca-tl-glyph" aria-label={c.status === 'error' ? 'Failed' : 'Finished'}>
                {c.status === 'error' ? '✕' : '✓'}
              </span>
              <code>{c.label ?? c.id}</code>
              <span className="ca-tl-time">{c.status === 'error' ? 'failed' : seconds((c.endedAt ?? c.startedAt) - c.startedAt)}</span>
            </li>
          ))}
        </ul>
      );
    case 'file':
      return <p className="ca-tl-plain">{a.size != null ? `${a.name}, ${bytes(a.size)}` : a.name}</p>;
    case 'image':
      return a.focus.length ? <p className="ca-tl-plain">Marked: {a.focus.map((f) => f.label ?? 'a point').join(', ')}</p> : null;
    case 'video':
      return (
        <div className="ca-tl-frames">
          {a.frames.map((f, i) => (
            <img key={i} src={f} alt="" />
          ))}
        </div>
      );
  }
}

export function ActivitySummary({ reply }: { reply: Reply }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const sentence = summarize(reply);
  if (!sentence) return null;
  // a single activity needs no timeline: its sentence is already the heading
  const single = reply.activities.length === 1;
  const total = (reply.firstTextAt ?? reply.endedAt ?? reply.startedAt) - reply.startedAt;
  // "Thought for 4s" already says how long it took; a second time beside it would only disagree with it
  const timed = !reply.activities.some((a) => a.kind === 'thinking');

  return (
    <div className="ca-summary">
      <button className="ca-summary-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="ca-summary-dots" aria-hidden="true">
          {reply.activities.map((a) => (
            <i key={a.id} style={{ background: KIND_COLOR[a.kind] }} />
          ))}
        </span>
        <span>{sentence}</span>
        {timed && <span className="ca-summary-time">{seconds(total)}</span>}
        <svg className="ca-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <Collapse open={open}>
        <ol id={id} className="ca-timeline" data-single={single}>
          {reply.activities.map((a) => {
            const phrase = describe(a, reply);
            return (
              <li key={a.id} style={{ '--kind': KIND_COLOR[a.kind] } as CSSProperties} data-status={a.status}>
                {!single && (
                  <div className="ca-tl-head">
                    <span>{phrase[0].toUpperCase() + phrase.slice(1)}</span>
                    <span className="ca-tl-time">{seconds((a.endedAt ?? reply.endedAt ?? a.startedAt) - a.startedAt)}</span>
                  </div>
                )}
                <Details a={a} />
              </li>
            );
          })}
        </ol>
      </Collapse>
    </div>
  );
}
