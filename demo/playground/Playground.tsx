import { useMemo, useState } from 'react';
import { Control, ENTRIES, Value, Values } from './registry';

const initial = (controls: Control[]): Values => Object.fromEntries(controls.map((c) => [c.key, c.init]));

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / insecure origins
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
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
            <output>{Number(value).toFixed(c.step < 1 ? 2 : 0)}</output>
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
        <label className="pg-field pg-color" htmlFor={id}>
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
          <input id={id} type="text" value={value as string} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
}

export function Playground() {
  const [active, setActive] = useState(ENTRIES[0].name);
  const [all, setAll] = useState<Record<string, Values>>(() => Object.fromEntries(ENTRIES.map((e) => [e.name, initial(e.controls)])));
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const entry = ENTRIES.find((e) => e.name === active)!;
  const values = all[active];

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

  const Preview = entry.Preview;

  return (
    <div className="pg">
      <div className="pg-picker" role="tablist" aria-label="Orb">
        {ENTRIES.map((e) => (
          <button key={e.name} role="tab" aria-selected={e.name === active} onClick={() => setActive(e.name)}>
            {e.name}
          </button>
        ))}
      </div>

      <div className="pg-body">
        <div className="pg-stage" role="tabpanel" aria-label={`${entry.name} preview`}>
          <Preview key={entry.name} v={values} />
          <p className="pg-blurb">{entry.blurb}</p>
        </div>

        <div className="pg-controls">
          <div className="pg-controls-head">
            <h3>{entry.name}</h3>
            <button className="pg-link" onClick={() => setAll((prev) => ({ ...prev, [active]: initial(entry.controls) }))}>
              Reset
            </button>
          </div>
          {entry.controls.map((c) => (
            <Field key={c.key} c={c} value={values[c.key]} onChange={(v) => set(c.key, v)} />
          ))}
        </div>
      </div>

      <div className="pg-code">
        <button
          className="btn pg-copy"
          onClick={async () => {
            const ok = await copy(code);
            setCopied(ok ? 'ok' : 'failed');
            setTimeout(() => setCopied('idle'), 2200);
          }}
        >
          {copied === 'ok' ? 'Copied ✓' : copied === 'failed' ? 'Select & copy manually' : 'Copy code'}
        </button>
        <pre className="code">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
