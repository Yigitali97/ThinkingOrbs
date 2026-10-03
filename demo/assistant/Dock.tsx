// The floating orb, bottom right, that opens the assistant. The orb shows what the latest reply is doing,
// and a dot marks an answer that finished while the panel was closed.

import { useId } from 'react';
import { AssistantOrb } from '../../src/orbs';
import { useAssistant } from './AssistantProvider';
import { dockState } from './shortcuts';
import './assistant.css';

export function Dock() {
  const { agent, snapshot, unread, open, setOpen, inline } = useAssistant();
  const badge = useId();
  if (inline) return null;
  return (
    <button
      type="button"
      className="as-dock"
      data-assistant-dock=""
      data-hidden={open || undefined}
      aria-label={`Open ${agent.name}`}
      aria-describedby={unread ? badge : undefined}
      aria-expanded={open}
      onClick={(e) => setOpen(true, e.currentTarget)}
    >
      <AssistantOrb state={dockState(snapshot)} size={56} label={null} />
      {unread && <span id={badge} className="as-dock-badge" role="img" aria-label="New answer" />}
    </button>
  );
}
