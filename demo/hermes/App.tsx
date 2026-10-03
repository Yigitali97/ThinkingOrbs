// The Hermes site: the signed-in guard, the header, the page router and the one assistant provider that lives across page changes.

import { ReactNode, useEffect, useRef } from 'react';
import { AssistantProvider } from '../assistant/AssistantProvider';
import { ErrorBoundary } from '../site/ErrorBoundary';
import { Link, navigate, useLocation, useScrollManagement } from '../site/router';
import { guard, useUser } from './auth';
import { HERMES_NAME, HERMES_ROOT } from './config';
import { hermesAgent } from './agent/definition';
import { NotFound } from './pages/NotFound';
import { SignIn } from './pages/SignIn';
import { HERMES_PROJECTS, hermesPageMeta } from './routes';
import { hermesNow } from './store';
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

// Heading-only pages until the real ones replace them.
function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <h1>{children}</h1>
    </div>
  );
}

function page(path: string): ReactNode {
  if (path === HERMES_ROOT) return <Heading>Home</Heading>;
  if (path === `${HERMES_ROOT}/team`) return <Heading>Team</Heading>;
  if (path === `${HERMES_ROOT}/projects`) return <Heading>Projects</Heading>;
  if (path === `${HERMES_ROOT}/connections`) return <Heading>Connections</Heading>;
  const project = path.match(/^\/hermes\/projects\/([a-z-]+)$/);
  const found = project && HERMES_PROJECTS.find((p) => p.id === project[1]);
  if (found) return <Heading>{found.name}</Heading>;
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

  useEffect(() => {
    const meta = hermesPageMeta(loc.path);
    document.title = meta?.title ?? `Page not found · ${HERMES_NAME}`;
    if (meta) setDescription(meta.description);
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
              {page(loc.path)}
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </AssistantProvider>
  );
}
