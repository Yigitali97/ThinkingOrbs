// The header's way in: an "Ask <agent>" button with the / key hint. It opens the panel and remembers itself as the opener.

import { useAssistant } from './AssistantProvider';
import { focusComposer } from './Composer';
import './assistant.css';

export function AskBar() {
  const { agent, open, inline, setOpen } = useAssistant();
  return (
    <button
      type="button"
      className="as-askbar"
      aria-label={`Ask ${agent.name}`}
      aria-keyshortcuts="/ Control+K Meta+K"
      onClick={(e) => {
        if (open || inline) focusComposer();
        else setOpen(true, e.currentTarget);
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" />
      </svg>
      <span className="as-askbar-text">Ask {agent.name}</span>
      <kbd className="as-askbar-key" aria-hidden="true">
        /
      </kbd>
    </button>
  );
}
