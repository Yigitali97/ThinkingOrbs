// Demo sign-in: three fixed users, kept in sessionStorage (or in memory when storage is unavailable), and the route guard helpers.

import { useSyncExternalStore } from 'react';
import type { User } from '../assistant/protocol';
import { HERMES_ROOT } from './config';
import { COMPANY } from './store';

const STORAGE_KEY = 'hermes.user';
const SIGN_IN_PATH = `${HERMES_ROOT}/sign-in`;
const DEMO_IDS = ['p-maya', 'p-daniel', 'p-sara'];

export const DEMO_USERS: User[] = DEMO_IDS.map((id) => {
  const p = COMPANY.people.find((x) => x.id === id);
  if (!p) throw new Error(`Demo user ${id} is missing from the company`);
  return { id: p.id, name: p.name, title: p.title, role: p.role, team: p.team };
});

// Memory is the source of truth after the first read; storage only carries the choice across reloads.
let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) globalThis.sessionStorage?.removeItem(STORAGE_KEY);
    else globalThis.sessionStorage?.setItem(STORAGE_KEY, id);
  } catch {
    // storage is blocked or full: the in-memory value carries the session
  }
}

export function getUser(): User | null {
  if (!loaded) {
    loaded = true;
    current = readStored();
  }
  return DEMO_USERS.find((u) => u.id === current) ?? null;
}

function emitChange(): void {
  listeners.forEach((l) => l());
}

export function signIn(id: string): void {
  if (!DEMO_USERS.some((u) => u.id === id)) return;
  loaded = true;
  current = id;
  writeStored(id);
  emitChange();
}

export function signOut(): void {
  loaded = true;
  current = null;
  writeStored(null);
  emitChange();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useUser(): User | null {
  return useSyncExternalStore(subscribe, getUser, () => null);
}

/** Where to send a visitor instead of `path`, or null when they may stay. */
export function guard(path: string, user: User | null): string | null {
  if (user || path === SIGN_IN_PATH) return null;
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(path)}`;
}

/** A `next` target is only followed when it stays inside Hermes; anything else lands on the home page. */
export function safeNext(next: string | null): string {
  const home = `${HERMES_ROOT}/`;
  if (!next || !next.startsWith(home) || next.includes('//') || next.includes('\\')) return home;
  try {
    const url = new URL(next, 'http://hermes.invalid');
    return url.origin === 'http://hermes.invalid' && url.pathname.startsWith(home) ? next : home;
  } catch {
    return home;
  }
}
