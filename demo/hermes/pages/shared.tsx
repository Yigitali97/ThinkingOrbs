// What the Hermes pages share: reading a company tool as the signed-in user through the assistant's own policy,
// loading a page's data once per user, a loading placeholder, and the few number and date formats the pages print.

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

/**
 * Runs `load` for the signed-in user at `hermesNow()` and returns what it resolved to, or undefined while it runs.
 * It loads again when the user or `key` changes, and a result for an earlier user is never shown.
 */
export function usePageData<T>(load: (user: User, now: Date) => Promise<T>, key = ''): T | undefined {
  const { user } = useAssistant();
  const id = `${user?.id ?? ''}|${key}`;
  const [state, setState] = useState<{ id: string; data: T } | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    void load(user, hermesNow()).then((data) => {
      if (live) setState({ id, data });
    });
    return () => {
      live = false;
    };
    // `load` is a module-level function; the user and key decide when to reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return state?.id === id ? state.data : undefined;
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

/** What a page section shows for the moment its data is loading; `size` reserves the room the content will take. */
export function Loading({ size = 'block' }: { size?: 'block' | 'table' }) {
  return (
    <p className="loading" data-size={size} role="status">
      Loading…
    </p>
  );
}
