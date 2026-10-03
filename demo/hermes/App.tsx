// The Hermes site: the signed-in guard, the header, the page router and the one assistant provider that lives across page changes.

import { ReactNode, useEffect, useRef } from 'react';
import { AskBar } from '../assistant/AskBar';
import { AssistantProvider } from '../assistant/AssistantProvider';
import { Dock } from '../assistant/Dock';
import { Panel } from '../assistant/Panel';
import { ErrorBoundary } from '../site/ErrorBoundary';
import { Link, navigate, useLocation, useScrollManagement } from '../site/router';
import { guard, useUser } from './auth';
import { HERMES_NAME, HERMES_ROOT } from './config';
import { hermesAgent } from './agent/definition';
import { Connections } from './pages/Connections';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { Project } from './pages/Project';
import { Projects } from './pages/Projects';
import { SignIn } from './pages/SignIn';
import { Team } from './pages/Team';
import { visibleProjectIds } from './policy';
import { hermesPageMeta, hermesProjectId } from './routes';
import { COMPANY, hermesNow } from './store';
import { UserMenu } from './UserMenu';
import type { User } from '../assistant/protocol';

const SIGN_IN = `${HERMES_ROOT}/sign-in`;

function setDescription(content: string) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.name = 'description';
    document.head.append(el);
  }
  el.content = content;
}

/** The project a path shows, when the user may see it. Another team's project is not found, the same as one that doesn't exist. */
function visibleProject(path: string, user: User | null): string | null {
  const id = hermesProjectId(path);
  return id && user && visibleProjectIds(user, COMPANY).has(id) ? id : null;
}

function page(path: string, user: User): ReactNode {
  if (path === HERMES_ROOT) return <Home />;
  if (path === `${HERMES_ROOT}/team`) return <Team />;
  if (path === `${HERMES_ROOT}/projects`) return <Projects />;
  if (path === `${HERMES_ROOT}/connections`) return <Connections />;
  const project = visibleProject(path, user);
  if (project) return <Project id={project} />;
  return <NotFound />;
}

function Brand() {
  return (
    <Link to={HERMES_ROOT} className="brand" aria-label={`${HERMES_NAME} home`}>
      <span className="brand-mark" aria-hidden="true" />
      <span>{HERMES_NAME}</span>
    </Link>
  );
}

function Header({ user }: { user: User }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Brand />
        <nav className="topnav" aria-label="Main">
          <Link to={HERMES_ROOT}>Home</Link>
          <Link to={`${HERMES_ROOT}/team`} section>
            Team
          </Link>
          <Link to={`${HERMES_ROOT}/projects`} section>
            Projects
          </Link>
          <Link to={`${HERMES_ROOT}/connections`} section>
            Connections
          </Link>
        </nav>
        <AskBar />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

export function App() {
  const loc = useLocation();
  const user = useUser();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const redirect = guard(loc.path, user);
  useScrollManagement(loc);

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  // a project the user can't see is titled as not found too; switching user can change that without a navigation
  const hidden = hermesProjectId(loc.path) !== null && !visibleProject(loc.path, user);
  useEffect(() => {
    const meta = hidden ? null : hermesPageMeta(loc.path);
    document.title = meta?.title ?? `Page not found · ${HERMES_NAME}`;
    if (meta) setDescription(meta.description);
  }, [loc.path, hidden]);

  useEffect(() => {
    // after an in-app navigation, start screen readers and keyboard users at the new page
    if (first.current) first.current = false;
    else if (!loc.hash) main.current?.focus({ preventScroll: true });
  }, [loc.path, loc.hash]);

  if (redirect) return null;

  if (loc.path === SIGN_IN) {
    return (
      <div className="site">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="topbar">
          <div className="topbar-inner">
            <Brand />
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} className="main">
          <div className="route" key={loc.path}>
            <SignIn />
          </div>
        </main>
      </div>
    );
  }

  // the guard has redirected every signed-out visitor, so a user is here
  if (!user) return null;
  return (
    <AssistantProvider agent={hermesAgent} user={user} now={hermesNow}>
      <div className="site">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Header user={user} />
        <main id="main" ref={main} tabIndex={-1} className="main">
          <ErrorBoundary key={loc.path}>
            <div className="route" key={loc.path}>
              {page(loc.path, user)}
            </div>
          </ErrorBoundary>
        </main>
      </div>
      <Dock />
      <Panel />
    </AssistantProvider>
  );
}
