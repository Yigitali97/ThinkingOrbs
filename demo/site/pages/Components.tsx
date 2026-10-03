import { CSSProperties, useRef } from 'react';
import { DEMOS } from '../demos';
import { DOCS, Prop } from '../docs';
import { Link } from '../router';
import { ComponentMeta, COMPONENTS, GROUPS } from '../routes';
import { MountWhenNear, useActiveSection, useKeepActiveInView } from '../sections';
import { CodeBlock, Disclosure } from '../ui';

export function PropsTable({ props, labelledBy }: { props: Prop[]; labelledBy: string }) {
  return (
    <div className="table-wrap" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      <table className="table table-props">
        <thead>
          <tr>
            <th scope="col">Prop</th>
            <th scope="col">Type</th>
            <th scope="col">Default</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name}>
              <td>
                <code>{p.name}</code>
              </td>
              <td>
                <code className="type">{p.type}</code>
              </td>
              <td>{p.def === 'required' ? <span className="required">required</span> : <code>{p.def}</code>}</td>
              <td>{p.about}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Space kept for each demo before it mounts (its height on a desktop screen), so the page doesn't jump. */
const DEMO_HEIGHT: Record<string, number> = {
  'assistant-orb': 640,
  'voice-orb': 550,
  'status-orb': 490,
  'token-orb': 250,
  'tool-orb': 400,
  'ask-orb': 620,
  'mascot-orb': 410,
  'bot-orb': 450,
  'gaze-orb': 390,
  'search-orb': 460,
  'ingest-orb': 475,
  'reasoning-orb': 460,
  'vision-orb': 575,
  'reel-orb': 490,
};

const IDS = COMPONENTS.map((c) => c.slug);

function Sidebar({ active }: { active: string }) {
  const nav = useRef<HTMLElement>(null);
  useKeepActiveInView(nav, active);
  return (
    <nav ref={nav} className="sidebar" aria-label="Components">
      {GROUPS.map((group) => (
        <div key={group} className="sidebar-group">
          <h2>{group}</h2>
          <ul>
            {COMPONENTS.filter((c) => c.group === group).map((c) => (
              <li key={c.slug}>
                <Link to={`/components#${c.slug}`} style={{ '--tint': c.tint } as CSSProperties} aria-current={c.slug === active ? 'location' : undefined}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ComponentSection({ meta }: { meta: ComponentMeta }) {
  const doc = DOCS[meta.slug];
  const Demo = DEMOS[meta.slug];
  const id = (part: string) => `${meta.slug}-${part}`;

  return (
    <section id={meta.slug} className="component" aria-labelledby={id('title')} style={{ '--tint': meta.tint } as CSSProperties}>
      <header className="component-head">
        <p className="crumb">{meta.group}</p>
        <h2 id={id('title')}>{meta.name}</h2>
        <p>{doc.intro}</p>
      </header>

      <MountWhenNear height={DEMO_HEIGHT[meta.slug]} release className="doc-demo">
        <Demo />
      </MountWhenNear>

      <div className="doc-links">
        <Link to={`/playground?orb=${meta.slug}`} className="btn">
          Try every option in the playground
        </Link>
      </div>

      <Disclosure label="Usage and props">
        <h3 id={id('usage')}>Usage</h3>
        <CodeBlock code={doc.usage} title="Example.tsx" />

        {doc.states && (
          <>
            <h3 id={id('states')}>{doc.states.title}</h3>
            <div className="table-wrap" role="region" aria-labelledby={id('states')} tabIndex={0}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Value</th>
                    <th scope="col">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.states.rows.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <code className="state-name">
                          {r.color && <span className="swatch" style={{ background: r.color }} aria-hidden="true" />}
                          {r.name}
                        </code>
                      </td>
                      <td>{r.about}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h3 id={id('props')}>Props</h3>
        <PropsTable props={doc.props} labelledBy={id('props')} />

        {doc.methods && (
          <>
            <h3 id={id('methods')}>Ref methods</h3>
            <dl className="methods">
              {doc.methods.map((m) => (
                <div key={m.name}>
                  <dt>
                    <code>{m.name}</code>
                  </dt>
                  <dd>{m.about}</dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {doc.notes && (
          <>
            <h3 id={id('notes')}>Good to know</h3>
            <ul className="notes">
              {doc.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </Disclosure>
    </section>
  );
}

/** Every component on one page. Each demo runs only while it is near the screen. */
export function ComponentsPage() {
  const active = useActiveSection(IDS);
  return (
    <div className="page page-docs page-sections page-components">
      <Sidebar active={active} />
      <div className="doc">
        <header className="page-head">
          <h1>Components</h1>
          <p className="lede">
            Orbs that show what an assistant is doing, driven by real audio, tokens, tool calls, sources and progress. Copy the src/orbs/ folder into your app, or
            just the orbs you need along with src/orbs/shared/.
          </p>
        </header>
        {COMPONENTS.map((c) => (
          <ComponentSection key={c.slug} meta={c} />
        ))}
      </div>
    </div>
  );
}
