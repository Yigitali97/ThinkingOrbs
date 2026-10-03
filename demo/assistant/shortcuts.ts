// The assistant's keyboard shortcut and the dock orb's state: small pure rules the panel and dock share.

import type { AssistantState } from '../../src/orbs';
import type { ConversationSnapshot } from './conversation';

export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** `/` from anywhere you aren't typing, or Cmd/Ctrl+K from anywhere. */
export function isOpenShortcut(e: ShortcutEvent): boolean {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return true;
  if (e.key !== '/' || e.metaKey || e.ctrlKey) return false;
  const t = e.target;
  return !(t && (TYPING.has((t.tagName ?? '').toUpperCase()) || t.isContentEditable));
}

/** What the dock orb shows: the latest reply working, writing or failed; otherwise idle. */
export function dockState(s: ConversationSnapshot): AssistantState {
  const state = s.turns[s.turns.length - 1]?.reply.state;
  if (state === 'working') return 'thinking';
  if (state === 'writing') return 'speaking';
  if (state === 'error') return 'error';
  return 'idle';
}
