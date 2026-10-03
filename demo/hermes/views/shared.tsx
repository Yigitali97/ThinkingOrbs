// What the Hermes pages share: reading a company tool as the signed-in user through the assistant's own policy,
// loading a page's data once per user, a loading (or failed) placeholder, and the few number and date formats the pages print.

import { useEffect, useState } from 'react';
import { useAssistant } from '../../assistant/AssistantProvider';
import { queryTool } from '../../assistant/callTool';
import type { User } from '../../assistant/protocol';
import { hermesAgent } from '../agent/definition';
import { hermesNow } from '../store';

export interface Read<O> {
  data: O;
  /** what the policy held back, in its own words */
  restricted?: string;
}

/** One tool read as `user`, narrowed by the same policy the assistant obeys. Null when the tool refused or failed. */
export async function read<O>(user: User, toolId: string, input: unknown = {}): Promise<Read<O> | null> {
  const r = await queryTool<O>(hermesAgent, toolId, input, { user, now: hermesNow() });
  return r.ok ? { data: r.data, restricted: r.restricted } : null;
}

/** How a load ended: with its data, or failed. */
export type LoadOutcome<T> = { data: T; failed: false } | { data?: undefined; failed: true };

/** Runs `load` and reports how it ended, unless the returned cancel function was called first. A throw counts as a failure. */
export function trackLoad<T>(load: () => Promise<T>, report: (outcome: LoadOutcome<T>) => void): () => void {
  let live = true;
  new Promise<T>((resolve) => resolve(load())).then(
    (data) => live && report({ data, failed: false }),
    () => live && report({ failed: true }),
  );
  return () => {
    live = false;
  };
}

/**
 * Runs `load` for the signed-in user at `hermesNow()` and returns what it resolved to (undefined while it runs), and whether
 * it failed. It loads again when the user or `key` changes, and a result for an earlier user is never shown.
 */
export function usePageData<T>(load: (user: User, now: Date) => Promise<T>, key = ''): [data: T | undefined, failed: boolean] {
  const { user } = useAssistant();
  const id = `${user?.id ?? ''}|${key}`;
  const [state, setState] = useState<{ id: string; outcome: LoadOutcome<T> } | null>(null);
  useEffect(() => {
    if (!user) return;
    return trackLoad(() => load(user, hermesNow()), (outcome) => setState({ id, outcome }));
    // `load` is a module-level function; the user and key decide when to reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const outcome = state?.id === id ? state.outcome : undefined;
  return [outcome?.data, outcome?.failed ?? false];
}

const ONE_DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Rounded to one decimal, and 0 for anything that isn't a finite number. */
export const round1 = (n: number): number => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
export const hoursText = (n: number): string => `${ONE_DECIMAL.format(round1(n))} h`;
export const dayText = (at: number): string => DAY.format(new Date(at));
export const dateText = (at: number): string => DATE.format(new Date(at));
export const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);
export const firstName = (user?: User): string => user?.name.split(' ')[0] ?? 'there';

/** A plain list of names: "A", "A and B", "A, B and C". */
export function listOf(items: string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What a page section shows while its data is loading, or if loading failed; `size` reserves the room the content will take. */
export function Loading({ size = 'block', failed = false }: { size?: 'block' | 'table'; failed?: boolean }) {
  return (
    <p className={failed ? 'note' : 'loading'} data-size={failed ? undefined : size} role="status">
      {failed ? 'This can’t be shown right now.' : 'Loading…'}
    </p>
  );
}
