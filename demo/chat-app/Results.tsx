// What the agent looked at, shown as the content itself — the real image with marked
// points, the video's frames, the file — rather than as another orb.

import { CSSProperties, useState } from 'react';
import { KIND_COLORS, kindFromName } from '../../src/orbs';
import { Activity, KIND_COLOR } from './activity';

type Of<K extends Activity['kind']> = Extract<Activity, { kind: K }>;

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const tint = (k: Activity['kind']) => ({ '--kind': KIND_COLOR[k] }) as CSSProperties;

function ImageResult({ a }: { a: Of<'image'> }) {
  const [dims, setDims] = useState<[number, number] | null>(null);
  return (
    <figure className="ca-media" data-phase={a.phase} style={tint('image')}>
      <div className="ca-image">
        <img src={a.src} alt={a.name ?? 'Attached image'} onLoad={(e) => setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />
        {a.phase === 'scanning' && <span className="ca-scan" aria-hidden="true" />}
        {a.phase === 'done' &&
          a.focus.map((f, i) => (
            <span key={i} className="ca-pin" style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, animationDelay: `${i * 90}ms` }}>
              <i aria-hidden="true" />
              {f.label && <b>{f.label}</b>}
            </span>
          ))}
      </div>
      <figcaption>
        <span>{a.name ?? 'Image'}</span>
        {dims && (
          <span>
            {dims[0]} × {dims[1]}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function VideoResult({ a }: { a: Of<'video'> }) {
  const n = a.frames.length;
  const current = a.phase === 'done' ? n : Math.floor(a.progress * n);
  return (
    <figure className="ca-media" data-phase={a.phase} style={tint('video')}>
      <div className="ca-film" role="list" aria-label="Frames" style={{ '--n': n || 8 } as CSSProperties}>
        {n
          ? a.frames.map((f, i) => (
              <img key={i} role="listitem" src={f} alt={`Frame ${i + 1}`} data-state={i < current ? 'seen' : i === current && a.phase === 'analyzing' ? 'now' : 'next'} />
            ))
          : Array.from({ length: 8 }, (_, i) => <span key={i} className="ca-film-skeleton" />)}
      </div>
      <figcaption>
        <span>{a.name ?? 'Video'}</span>
        <span>{a.phase === 'error' ? "Couldn't open" : n ? `${n} frames` : 'Extracting frames'}</span>
      </figcaption>
    </figure>
  );
}

function FileResult({ a }: { a: Of<'file'> }) {
  const ext = a.name.includes('.') ? a.name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE';
  return (
    <div className="ca-filecard" data-phase={a.phase} style={tint('file')}>
      <span className="ca-filecard-icon" style={{ background: KIND_COLORS[kindFromName(a.name)] }} aria-hidden="true">
        {ext}
      </span>
      <span className="ca-filecard-text">
        <strong>{a.name}</strong>
        <small>
          {a.size != null && <span>{bytes(a.size)}</span>}
          <span>{a.phase === 'done' ? 'Read' : a.phase === 'error' ? "Couldn't read" : 'Reading…'}</span>
        </small>
      </span>
    </div>
  );
}

/** Media and files the reply worked with, in the order it looked at them. */
export function Results({ activities }: { activities: Activity[] }) {
  const items = activities.filter((a) => a.kind === 'image' || a.kind === 'video' || a.kind === 'file');
  if (!items.length) return null;
  return (
    <div className="ca-results">
      {items.map((a) =>
        a.kind === 'image' ? <ImageResult key={a.id} a={a} /> : a.kind === 'video' ? <VideoResult key={a.id} a={a} /> : a.kind === 'file' ? <FileResult key={a.id} a={a} /> : null
      )}
    </div>
  );
}
