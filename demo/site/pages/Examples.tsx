import { CSSProperties } from 'react';
import { Link } from '../router';
import { COMPONENTS, EXAMPLES } from '../routes';

export const slugFor = (name: string) => COMPONENTS.find((c) => c.name === name)?.slug;

export function ExamplesIndex() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Examples</h1>
        <p className="lede">Complete samples built from the orbs. Each one lives in its own folder under demo/ so you can copy it and plug in your model.</p>
      </header>
      <div className="example-list example-list-wide">
        {EXAMPLES.map((e) => (
          <Link key={e.slug} to={`/examples/${e.slug}`} className="example-card" style={{ '--tint': e.tint } as CSSProperties}>
            <h2>{e.name}</h2>
            <p>{e.summary}</p>
            <span className="uses">Uses {e.uses.join(', ')}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
