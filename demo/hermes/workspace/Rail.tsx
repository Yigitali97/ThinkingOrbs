// The rail: the brand, New conversation, this session's conversations, the dashboards and the account menu at the foot.
// From 1024px it sits at the left and collapses to an icon strip; below that it is a modal drawer opened from the Menu button.

import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useAssistant } from '../../assistant/AssistantProvider';
import { focusComposer } from '../../assistant/Composer';
import type { User } from '../../assistant/protocol';
import { Link } from '../../site/router';
import { HERMES_NAME, HERMES_ROOT } from '../config';
import { UserMenu } from '../UserMenu';
import { trapTab } from './focus';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    className="rail-icon"
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const DASHBOARDS: { name: string; to: string; section?: boolean; icon: ReactNode }[] = [
  {
    name: 'Team',
    to: `${HERMES_ROOT}/team`,
    icon: (
      <Icon>
        <circle cx="7.5" cy="7" r="2.6" />
        <path d="M2.8 16c.5-2.6 2.4-4.2 4.7-4.2s4.2 1.6 4.7 4.2" />
        <circle cx="14" cy="7.8" r="2" />
        <path d="M13.6 11.8c1.8.1 3.2 1.4 3.6 3.6" />
      </Icon>
    ),
  },
  {
    name: 'Projects',
    to: `${HERMES_ROOT}/projects`,
    section: true,
    icon: (
      <Icon>
        <rect x="3" y="3.5" width="5.5" height="13" rx="1.6" />
        <rect x="11.5" y="3.5" width="5.5" height="8" rx="1.6" />
      </Icon>
    ),
  },
  {
    name: 'Connections',
    to: `${HERMES_ROOT}/connections`,
    icon: (
      <Icon>
        <circle cx="5" cy="10" r="2.2" />
        <circle cx="15" cy="5" r="2.2" />
        <circle cx="15" cy="15" r="2.2" />
        <path d="M7 9l6-3M7 11l6 3" />
      </Icon>
    ),
  },
];

export interface RailProps {
  user: User;
  /** `side` from 1024px, `drawer` below it */
  mode: 'side' | 'drawer';
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** closes the drawer; `refocus` sends focus back to the Menu button */
  onClose?: (refocus: boolean) => void;
}

export function Rail({ user, mode, collapsed = false, onToggleCollapsed, onClose }: RailProps) {
  const { snapshot, conversation } = useAssistant();
  const ref = useRef<HTMLDivElement>(null);
  const drawer = mode === 'drawer';
  const asked = snapshot.turns.filter((t) => !t.brief);
  const icons = collapsed && !drawer;

  // the drawer opens with focus inside it
  useLayoutEffect(() => {
    if (drawer) ref.current?.focus();
  }, [drawer]);

  const done = () => onClose?.(false);
  const newConversation = () => {
    conversation.clear();
    done();
    focusComposer();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!drawer) return;
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      onClose?.(true);
      return;
    }
    trapTab(e, ref.current);
  };

  const content = (
    <>
      <div className="rail-head">
        <Link to={HERMES_ROOT} className="brand" aria-label={`${HERMES_NAME}, the conversation`} onClick={done}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">{HERMES_NAME}</span>
        </Link>
        {drawer ? (
          <button type="button" className="icon-btn" onClick={() => onClose?.(true)} aria-label="Close menu" title="Close menu">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn rail-toggle"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="3.5" width="14" height="13" rx="2.5" />
              <path d="M8 3.5v13" />
            </svg>
          </button>
        )}
      </div>

      <button type="button" className="rail-new" onClick={newConversation} title={icons ? 'New conversation' : undefined}>
        <Icon>
          <path d="M10 4.5v11M4.5 10h11" />
        </Icon>
        <span className="rail-label">New conversation</span>
      </button>

      <div className="rail-scroll">
        {!icons && (
          <section className="rail-group" aria-labelledby="rail-conversations">
            <p className="rail-heading" id="rail-conversations">
              Conversations
            </p>
            {asked.length === 0 && snapshot.archive.length === 0 ? (
              <p className="rail-empty">Questions you ask this session are kept here.</p>
            ) : (
              <ul className="rail-list">
                {asked.length > 0 && (
                  <li>
                    <button type="button" className="rail-convo" aria-current="true" onClick={() => (done(), focusComposer())}>
                      <span className="rail-convo-title">{asked[0].question}</span>
                      <span className="rail-convo-meta">Current conversation</span>
                    </button>
                  </li>
                )}
                {snapshot.archive.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="rail-convo"
                      onClick={() => {
                        conversation.restore(a.id);
                        done();
                        focusComposer();
                      }}
                    >
                      <span className="rail-convo-title">{a.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <nav className="rail-group" aria-label="Dashboards">
          {!icons && (
            <p className="rail-heading" aria-hidden="true">
              Dashboards
            </p>
          )}
          <ul className="rail-list">
            {DASHBOARDS.map((d) => (
              <li key={d.to}>
                <Link to={d.to} section={d.section} className="rail-link" onClick={done} title={icons ? d.name : undefined}>
                  {d.icon}
                  <span className="rail-label">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="rail-foot">
        <UserMenu user={user} />
      </div>
    </>
  );

  return drawer ? (
    <div ref={ref} className="rail" data-rail="" data-mode="drawer" role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} onKeyDown={onKeyDown}>
      {content}
    </div>
  ) : (
    <header className="rail" data-rail="" data-mode="side" data-collapsed={collapsed || undefined}>
      {content}
    </header>
  );
}
