// The assistant in the page itself rather than the panel (Hermes Home uses it). While it is mounted the dock and panel step aside.

import { useEffect } from 'react';
import { useAssistant } from './AssistantProvider';
import { Composer } from './Composer';
import { Suggestions, Thread } from './Thread';
import './assistant.css';

export function AssistantInline({ className }: { className?: string }) {
  const { agent, user, snapshot, setInline } = useAssistant();
  useEffect(() => {
    setInline(true);
    return () => setInline(false);
  }, [setInline]);

  const empty = snapshot.turns.length === 0;
  return (
    <section className={['as', 'as-inline', className].filter(Boolean).join(' ')} aria-label={agent.name}>
      {empty ? <p className="as-greeting">{agent.greeting(user)}</p> : <Thread turns={snapshot.turns} />}
      <Suggestions />
      <Composer />
    </section>
  );
}
