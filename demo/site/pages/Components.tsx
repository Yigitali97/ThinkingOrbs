import { CSSProperties } from 'react';
import { DEMOS } from '../demos';
import { DOCS, Prop } from '../docs';
import { Link } from '../router';
import { ComponentMeta, COMPONENTS, GROUPS, isHome } from '../routes';
import { CodeBlock } from '../ui';

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

function Sidebar({ current }: { current: string }) {
  return (
    <nav className="sidebar" aria-label="Components">
      {GROUPS.map((group) => (
        <div key={group} className="sidebar-group">
          <h2>{group}</h2>
          <ul>
            {COMPONENTS.filter((c) => c.group === group).map((c) => (
              <li key={c.slug}>
                <Link
                  to={`/components/${c.slug}`}
                  match={c === COMPONENTS[0] ? isHome : undefined}
                  style={{ '--tint': c.tint } as CSSProperties}
                  className={c.slug === current ? 'is-current' : undefined}
                >
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

export function ComponentPage({ meta }: { meta: ComponentMeta }) {
  const doc = DOCS[meta.slug];
  const Demo = DEMOS[meta.slug];
  const i = COMPONENTS.indexOf(meta);
  const prev = COMPONENTS[i - 1];
  const next = COMPONENTS[i + 1];

  return (
    <div className="page page-docs">
      <Sidebar current={meta.slug} />
      <article className="doc">
        <header className="page-head">
          <p className="crumb">
            <Link to="/">Components</Link> <span aria-hidden="true">/</span> {meta.group}
          </p>
          <h1 className="doc-title">{meta.name}</h1>
          <p className="lede">{doc.intro}</p>
        </header>

        <section aria-label="Live demo" className="doc-demo">
          <Demo />
        </section>

        <div className="doc-links">
          <Link to={`/playground?orb=${meta.slug}`} className="btn">
            Try every option in the playground
          </Link>
        </div>

        <section aria-labelledby="usage">
          <h2 id="usage">Usage</h2>
          <CodeBlock code={doc.usage} title="Example.tsx" />
        </section>

        {doc.states && (
          <section aria-labelledby="states">
            <h2 id="states">{doc.states.title}</h2>
            <div className="table-wrap" role="region" aria-labelledby="states" tabIndex={0}>
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
          </section>
        )}

        <section aria-labelledby="props">
          <h2 id="props">Props</h2>
          <PropsTable props={doc.props} labelledBy="props" />
        </section>

        {doc.methods && (
          <section aria-labelledby="methods">
            <h2 id="methods">Ref methods</h2>
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
          </section>
        )}

        {doc.notes && (
          <section aria-labelledby="notes">
            <h2 id="notes">Good to know</h2>
            <ul className="notes">
              {doc.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <nav className="pager" aria-label="More components">
          {prev ? (
            <Link to={`/components/${prev.slug}`} className="pager-prev">
              <span>Previous</span>
              {prev.name}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/components/${next.slug}`} className="pager-next">
              <span>Next</span>
              {next.name}
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
