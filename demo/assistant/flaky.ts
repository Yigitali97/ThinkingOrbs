// A tiny in-memory store of which company systems are "down", so the demo can simulate outages.
// The store is plain so tests can call isDown/setDown; useDown subscribes React components to it.

import { useSyncExternalStore } from 'react';

let down: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function isDown(system: string): boolean {
  return down.has(system);
}

export function setDown(system: string, value: boolean): void {
  if (down.has(system) === value) return;
  const next = new Set(down);
  if (value) next.add(system);
  else next.delete(system);
  down = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDown(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => down, () => down);
}
