import { CSSProperties, lazy, ReactNode, Suspense, useEffect, useRef } from 'react';
import { StatusOrb } from '../../src/orbs';
import { ComponentsPage } from './pages/Components';
import { NotFound } from './pages/NotFound';
import { Link, Location, useLocation, useScrollManagement } from './router';
import { COMPONENTS, isHome, pageMeta, SITE_NAME } from './routes';
import { ErrorBoundary } from './ErrorBoundary';

const ExamplesPage = lazy(() => import('./pages/Examples').then((m) => ({ default: m.ExamplesPage })));
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })));

export const REPO_URL = 'https://github.com/Yigitali97/ThinkingOrbs';
const inComponents = (path: string) => isHome(path) || path.startsWith('/components/');

/**
 * The page for a path. `key` names the page, so moving between paths of the same page
 * doesn't remount it; `anchor` is the section a path stands for (/components/tool-orb).
 */
function route(loc: Location): { page: ReactNode; key: string; anchor?: string; tint?: string } {
  const { path } = loc;
  if (path === '/examples') return { page: <ExamplesPage />, key: path };
  if (path === '/playground') return { page: <PlaygroundPage />, key: path, tint: '#a78bfa' };
  // the site opens on the components, all on one page
  if (isHome(path)) return { page: <ComponentsPage />, key: 'components' };
  const c = COMPONENTS.find((m) => path === `/components/${m.slug}`);
  if (c) return { page: <ComponentsPage />, key: 'components', anchor: c.slug };
  return { page: <NotFound />, key: path };
}

function setMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.append(el);
  }
  el.content = content;
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label={`${SITE_NAME} home`}>
          <StatusOrb variant="reasoning · twins" size={22} label={null} />
          <span>{SITE_NAME}</span>
        </Link>
        <nav className="topnav" aria-label="Main">
          <Link to="/" section match={inComponents}>
            Components
          </Link>
          <Link to="/examples" section>
            Examples
          </Link>
          <Link to="/playground" section>
            Playground
          </Link>
          <a className="topnav-icon" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source on GitHub">
            <GitHubIcon />
          </a>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p>
        {SITE_NAME}: fourteen React components with no dependencies beyond React. The orbs live in <code>src/orbs/</code>; copy the folder into your app.
      </p>
      <nav aria-label="Footer">
        <Link to="/">Components</Link>
        <Link to="/examples">Examples</Link>
        <Link to="/playground">Playground</Link>
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </nav>
    </footer>
  );
}

export function App() {
  const loc = useLocation();
  const { page, key, anchor, tint } = route(loc);
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useScrollManagement(loc, anchor);

  useEffect(() => {
    const meta = pageMeta(loc.path);
    document.title = meta?.title ?? `Page not found · ${SITE_NAME}`;
    if (meta) setMeta('description', meta.description);
    // after an in-app navigation, start screen readers and keyboard users at the new page
    if (first.current) first.current = false;
    else if (!loc.hash) main.current?.focus({ preventScroll: true });
  }, [loc.path, loc.hash]);

  return (
    <div className="site" style={tint ? ({ '--tint': tint } as CSSProperties) : undefined}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" ref={main} tabIndex={-1} className="main">
        <ErrorBoundary key={key}>
          <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
            <div className="route" key={key}>
              {page}
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
