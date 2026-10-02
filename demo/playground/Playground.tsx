import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { COMPONENTS } from '../site/routes';
import { Link, navigate, useLocation } from '../site/router';
import { CodeBlock, CopyButton } from '../site/ui';
import { Control, ENTRIES, Entry, Value, Values } from './registry';
import { readValues, writeQuery } from './url';

const initial = (controls: Control[]): Values => Object.fromEntries(controls.map((c) => [c.key, c.init]));
const slugOf = (e: Entry) => COMPONENTS.find((c) => c.name === e.name)!.slug;
const bySlug = (slug: string | null) => ENTRIES.find((e) => slugOf(e) === slug) ?? ENTRIES[0];

function fromUrl(search: string) {
  const params = new URLSearchParams(search);
  const entry = bySlug(params.get('orb'));
  return { entry, values: readValues(entry.controls, params, entry.adjust) };
}

function Field({ c, value, onChange }: { c: Control; value: Value; onChange: (v: Value) => void }) {
  const id = `pg-${c.key}`;
  switch (c.type) {
    case 'select':
      return (
        <label className="pg-field" htmlFor={id}>
          <span>{c.label}</span>
          <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
            {c.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    case 'range':
      return (
        <label className="pg-field" htmlFor={id}>
          <span>
            {c.label}
            <output htmlFor={id}>{Number(value).toFixed(c.step < 1 ? 2 : 0)}</output>
          </span>
          <input id={id} type="range" min={c.min} max={c.max} step={c.step} value={value as number} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
      );
    case 'toggle':
      return (
        <label className="pg-field pg-toggle" htmlFor={id}>
          <span>{c.label}</span>
          <input id={id} type="checkbox" role="switch" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
    case 'color':
      return (
        <label className="pg-field" htmlFor={id}>
          <span>{c.label}</span>
          <span className="pg-color-row">
            <input id={id} type="color" value={value as string} onChange={(e) => onChange(e.target.value)} />
            <code>{String(value)}</code>
          </span>
        </label>
      );
    case 'text':
      return (
        <label className="pg-field" htmlFor={id}>
          <span>{c.label}</span>
          <input id={id} type="text" maxLength={80} value={value as string} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
}

export function Playground() {
  const loc = useLocation();
  const [start] = useState(() => fromUrl(loc.search));
  const [active, setActive] = useState(start.entry.name);
  const [all, setAll] = useState<Record<string, Values>>(() => ({
    ...Object.fromEntries(ENTRIES.map((e) => [e.name, initial(e.controls)])),
    [start.entry.name]: start.values,
  }));
  const entry = ENTRIES.find((e) => e.name === active)!;
  const values = all[active];
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  // Keep the URL in step with what's on screen, so any setup can be shared.
  const written = useRef(loc.search);
  const query = writeQuery(slugOf(entry), entry.controls, values);
  useEffect(() => {
    if (query === written.current) return;
    written.current = query;
    navigate('/playground' + query, { replace: true });
  }, [query]);
  // ...and follow the URL when it changes from outside (a link to another orb).
  useEffect(() => {
    if (loc.search === written.current) return;
    const next = fromUrl(loc.search);
    written.current = loc.search;
    setActive(next.entry.name);
    setAll((prev) => ({ ...prev, [next.entry.name]: next.values }));
  }, [loc.search]);

  const set = (key: string, v: Value) =>
    setAll((prev) => {
      const cur = prev[active];
      const next = { ...cur, [key]: v };
      return { ...prev, [active]: entry.adjust ? entry.adjust(cur, next) : next };
    });

  const code = useMemo(() => {
    const changed = (key: string) => {
      const c = entry.controls.find((x) => x.key === key);
      if (!c || c.def === null) return true;
      const a = values[key], b = c.def;
      return typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() !== b.toLowerCase() : a !== b;
    };
    return `import { ${entry.name} } from './orbs';\n\n` + entry.code(values, changed);
  }, [entry, values]);

  const select = (i: number) => {
    const e = ENTRIES[(i + ENTRIES.length) % ENTRIES.length];
    setActive(e.name);
    tabs.current[ENTRIES.indexOf(e)]?.focus();
  };

  const Preview = entry.Preview;
  const index = ENTRIES.indexOf(entry);

  return (
    <div className="pg" style={{ '--tint': COMPONENTS.find((c) => c.name === entry.name)!.tint } as CSSProperties}>
      <div className="pg-picker" role="tablist" aria-label="Orb">
        {ENTRIES.map((e, i) => (
          <button
            key={e.name}
            ref={(el) => (tabs.current[i] = el)}
            type="button"
            role="tab"
            id={`pg-tab-${slugOf(e)}`}
            aria-selected={e.name === active}
            aria-controls="pg-panel"
            tabIndex={e.name === active ? 0 : -1}
            onClick={() => setActive(e.name)}
            onKeyDown={(ev) => {
              if (ev.key === 'ArrowRight') (ev.preventDefault(), select(i + 1));
              if (ev.key === 'ArrowLeft') (ev.preventDefault(), select(i - 1));
              if (ev.key === 'Home') (ev.preventDefault(), select(0));
              if (ev.key === 'End') (ev.preventDefault(), select(ENTRIES.length - 1));
            }}
          >
            {e.name}
          </button>
        ))}
      </div>

      <div className="pg-body" id="pg-panel" role="tabpanel" aria-labelledby={`pg-tab-${slugOf(entry)}`}>
        <div className="pg-stage" data-orb={slugOf(entry)}>
          <Preview key={entry.name} v={values} />
          <p className="pg-blurb">{entry.blurb}</p>
        </div>

        <div className="pg-controls">
          <div className="pg-controls-head">
            <h2>{entry.name}</h2>
            <button type="button" className="pg-link" onClick={() => setAll((prev) => ({ ...prev, [active]: initial(entry.controls) }))}>
              Reset
            </button>
          </div>
          {entry.controls.map((c) => (
            <Field key={c.key} c={c} value={values[c.key]} onChange={(v) => set(c.key, v)} />
          ))}
          <div className="pg-controls-foot">
            <Link to={`/components/${slugOf(entry)}`}>{entry.name} reference</Link>
            <CopyButton label="Copy link" text={() => window.location.href} />
          </div>
        </div>
      </div>

      <CodeBlock code={code} title={`${entry.name}.tsx`} />
      <span className="sr-only" aria-live="polite">
        {`${entry.name}, ${index + 1} of ${ENTRIES.length}`}
      </span>
    </div>
  );
}
