// The live row at the top of a reply: one orb slot that cross-fades between whichever orb
// matches the current activity, a status title and a little metadata.

import { CSSProperties } from 'react';
import { IngestOrb, ReasoningOrb, ReelOrb, SearchOrb, StatusOrb, ToolOrb, VisionOrb } from '../../src/orbs';
import { Activity, KIND_COLOR, liveLabel } from './activity';
import { Swap, useNow } from './motion';

const ORB = 64;
const WIDE = 112;

function OrbFor({ a }: { a?: Activity }) {
  if (!a) return <StatusOrb variant="waiting" size={40} label={null} />;
  switch (a.kind) {
    case 'thinking':
      return <ReasoningOrb steps={a.steps} thinking budget={a.budget} size={ORB} showCaption={false} />;
    case 'search':
      return <SearchOrb phase={a.phase} sources={a.sources} size={ORB} showCaption={false} />;
    case 'tools':
      return <ToolOrb tools={a.calls} size={ORB} showLabels={false} />;
    case 'file':
      return <IngestOrb name={a.name} progress={a.progress} status={a.phase} width={WIDE} height={ORB} showCaption={false} />;
    case 'image':
      return <VisionOrb src={a.src} status={a.phase} size={ORB} showCaption={false} />;
    case 'video':
      return <ReelOrb frames={a.frames} progress={a.progress} status={a.phase} width={WIDE} height={ORB} showCaption={false} />;
  }
}

export function ActivityRow({ activity }: { activity?: Activity }) {
  const now = useNow(true);
  const { title, meta } = liveLabel(activity, now);
  const wide = activity?.kind === 'file' || activity?.kind === 'video';
  const style = { '--kind': activity ? KIND_COLOR[activity.kind] : '#8c8d96' } as CSSProperties;

  return (
    <div className="ca-activity" style={style}>
      <div className="ca-activity-orb" data-wide={wide}>
        <Swap id={activity?.id ?? 'start'}>
          <OrbFor a={activity} />
        </Swap>
      </div>
      <div className="ca-activity-copy">
        <div aria-live="polite" aria-atomic="true">
          {/* keyed so each new status fades in */}
          <p key={title} className="ca-activity-title">
            {title}
          </p>
        </div>
        <p className="ca-activity-meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
