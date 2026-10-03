// The rail's account control, at its foot: who is signed in, a way to switch to another demo user, and sign out.
// The menu opens upward from the button. Arrow keys move through the items, Escape closes it and returns focus to the button.

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import type { User } from '../assistant/protocol';
import { navigate } from '../site/router';
import { DEMO_USERS, signIn, signOut } from './auth';
import { HERMES_ROOT } from './config';

/** "Maya Chen" → "MC". */
export const initials = (name: string): string =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('');

export function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const others = DEMO_USERS.filter((u) => u.id !== user.id);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  // click or focus moving outside the menu closes it
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
    };
  }, [open]);

  // opening the menu puts focus on its first item
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...root.current!.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };

  return (
    <div className="user-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={button}
        className="user-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'user-menu-list' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar avatar-sm" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="user-button-text">
          <span className="user-button-name">{user.name}</span>
          <span className="user-button-meta">
            <span className="user-button-title">{user.title}</span>
            <span className="demo-tag">Demo user</span>
          </span>
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="chevron">
          <path d="M2.5 7.5 6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="menu" id="user-menu-list" role="menu" aria-label="Account">
          <p className="menu-label" aria-hidden="true">
            Switch demo user
          </p>
          {others.map((u) => (
            <button
              type="button"
              role="menuitem"
              key={u.id}
              className="menu-item"
              onClick={() => {
                signIn(u.id);
                close();
              }}
            >
              <span className="sr-only">Switch demo user: </span>
              <span className="menu-item-name">{u.name}</span>
              <span className="menu-item-title">{u.title}</span>
            </button>
          ))}
          <hr className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              signOut();
              navigate(`${HERMES_ROOT}/sign-in`);
            }}
          >
            <span className="menu-item-name">Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
