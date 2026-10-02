// Small motion primitives for the chat. Motion here only ever answers a change of state.

import { ReactNode, useEffect, useRef, useState } from 'react';

const DURATION = 300; // keep in sync with --ca-dur in chat-app.css

/**
 * Height-animated reveal. Content mounts before opening and unmounts after closing,
 * so a closed section costs nothing (no orb canvases running off-screen).
 */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // let the closed layout paint once, then open so the transition runs
      // (a timeout rather than rAF, so it still opens in a background tab)
      const t = setTimeout(() => setExpanded(true), 20);
      return () => clearTimeout(t);
    }
    setExpanded(false);
    const t = setTimeout(() => setMounted(false), DURATION + 40);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div className={['cx', className].filter(Boolean).join(' ')} data-open={expanded} aria-hidden={!open}>
      <div className="cx-inner">{mounted && children}</div>
    </div>
  );
}

/**
 * Cross-fade between children keyed by `id`. The outgoing child keeps rendering
 * (its orb keeps animating) while it fades out, so nothing ever pops.
 */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const last = useRef(new Map<string, ReactNode>());
  last.current.set(id, children);
  const [items, setItems] = useState<Array<{ id: string; leaving: boolean }>>([{ id, leaving: false }]);

  useEffect(() => {
    setItems((prev) => (prev.some((p) => p.id === id && !p.leaving) ? prev : [...prev.filter((p) => p.id !== id).map((p) => ({ ...p, leaving: true })), { id, leaving: false }]));
    const t = setTimeout(() => {
      setItems((prev) => {
        const keep = prev.filter((p) => !p.leaving);
        for (const p of prev) if (p.leaving) last.current.delete(p.id);
        return keep;
      });
    }, DURATION + 40);
    return () => clearTimeout(t);
  }, [id]);

  // on the render where `id` changes, show the new child straight away
  const list = items.some((p) => p.id === id) ? items : [...items.map((p) => ({ ...p, leaving: true })), { id, leaving: false }];

  return (
    <div className={['swap', className].filter(Boolean).join(' ')}>
      {list.map((p) => (
        <div key={p.id} className="swap-item" data-leaving={p.leaving} aria-hidden={p.leaving || undefined}>
          {p.id === id ? children : last.current.get(p.id)}
        </div>
      ))}
    </div>
  );
}

/** Current time, refreshed while `active` — for elapsed-time labels. */
export function useNow(active: boolean, every = 500) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const id = setInterval(() => setNow(performance.now()), every);
    return () => clearInterval(id);
  }, [active, every]);
  return now;
}
