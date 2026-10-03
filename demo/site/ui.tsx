// Small building blocks shared by the site's pages.

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { highlight } from './highlight';

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // older browsers / insecure origins
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** A button that copies text and confirms in place. */
export function CopyButton({ text, label = 'Copy', className = '' }: { text: string | (() => string); label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`btn btn-small ${className}`}
      onClick={async () => {
        const ok = await copyText(typeof text === 'function' ? text() : text);
        setState(ok ? 'ok' : 'failed');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('idle'), 2000);
      }}
    >
      <span aria-live="polite">{state === 'ok' ? 'Copied' : state === 'failed' ? 'Copy failed. Select the text instead' : label}</span>
    </button>
  );
}

export function CodeBlock({ code, title, copy = true }: { code: string; title?: string; copy?: boolean }) {
  const tokens = useMemo(() => highlight(code), [code]);
  return (
    <figure className="codeblock">
      {(title || copy) && (
        <figcaption className="codeblock-bar">
          <span>{title}</span>
          {copy && <CopyButton text={code} />}
        </figcaption>
      )}
      <pre tabIndex={0}>
        <code>
          {tokens.map((t, i) =>
            t.kind === 'plain' ? t.text : (
              <span key={i} className={`tk-${t.kind}`}>
                {t.text}
              </span>
            )
          )}
        </code>
      </pre>
    </figure>
  );
}

/** A folded panel, closed until its label is clicked. */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="disclosure">
      <summary>
        <svg className="disclosure-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

/** Radio-style segmented control. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render?: (v: T) => ReactNode;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, dir: number) => {
    const next = (from + dir + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          role="radio"
          aria-checked={value === o}
          tabIndex={value === o ? 0 : -1}
          onClick={() => onChange(o)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') (e.preventDefault(), move(i, 1));
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') (e.preventDefault(), move(i, -1));
          }}
        >
          {render ? render(o) : o[0].toUpperCase() + o.slice(1)}
        </button>
      ))}
    </div>
  );
}

export const usePrefersReducedMotion = () => {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
};
