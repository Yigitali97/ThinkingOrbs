// The streamed answer. A small TokenOrb rides at the end of the text like a caret while words
// arrive, then fades out once the reply is complete.

import { Fragment, ReactNode, useEffect, useState } from 'react';
import { TokenOrb } from '../../src/orbs';

type Block = { type: 'p'; lines: string[] } | { type: 'ul'; items: string[] };

/** Paragraphs, "- " lists and **bold** — the subset the demo agent writes. */
function parse(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .filter((b) => b.trim())
    .map((b) => {
      const lines = b.split('\n');
      return lines.every((l) => /^\s*-\s/.test(l)) ? { type: 'ul', items: lines.map((l) => l.replace(/^\s*-\s/, '')) } : { type: 'p', lines };
    });
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  );
}

export function Answer({ text, tokens, streaming }: { text: string; tokens: number; streaming: boolean }) {
  // keep the caret mounted briefly after streaming ends so it can fade out
  const [caret, setCaret] = useState(streaming);
  useEffect(() => {
    if (streaming) return setCaret(true);
    const t = setTimeout(() => setCaret(false), 700);
    return () => clearTimeout(t);
  }, [streaming]);

  const blocks = parse(text);
  const caretNode: ReactNode = caret ? (
    <span className="ca-caret" data-done={!streaming}>
      <TokenOrb tokens={tokens} done={!streaming} size={15} label={null} />
    </span>
  ) : null;

  if (!blocks.length) return caretNode ? <div className="ca-answer">{caretNode}</div> : null;

  return (
    <div className="ca-answer">
      {blocks.map((b, i) => {
        const last = i === blocks.length - 1;
        if (b.type === 'ul')
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inline text={it} />
                  {last && j === b.items.length - 1 && caretNode}
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
            {last && caretNode}
          </p>
        );
      })}
    </div>
  );
}
