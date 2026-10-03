// A draft block: a message Hermes wrote for you, with a copy button. Hermes never sends it, and says so.

import { useEffect, useState } from 'react';
import type { Block } from '../protocol';

export type DraftProps = Omit<Extract<Block, { kind: 'draft' }>, 'kind'>;

const CHANNEL: Record<DraftProps['channel'], string> = { teams: 'Teams', email: 'Email' };

export function Draft({ channel, to, subject, body }: DraftProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      // no clipboard access: the text is still there to select by hand
    }
  };

  return (
    <section className="as-draft" aria-label={`${CHANNEL[channel]} draft`}>
      <div className="as-draft-head">
        <span className="as-draft-channel">
          {CHANNEL[channel]}
          {to && <span className="as-draft-to"> · {to}</span>}
        </span>
        <span className="as-draft-demo">Demo — not sent</span>
      </div>
      {subject && <p className="as-draft-subject">{subject}</p>}
      <pre className="as-draft-body">{body}</pre>
      <div className="as-draft-actions">
        <button type="button" className="as-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}
