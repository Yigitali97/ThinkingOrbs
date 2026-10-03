import { Component, ErrorInfo, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps one broken page from blanking the whole site, and offers a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode; /** 2 inside a screen that already has its h1 */ level?: 1 | 2 }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // a stale chunk after a new deploy shows up as a failed dynamic import
    const stale = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
    const Heading = this.props.level === 2 ? 'h2' : 'h1';
    return (
      <div className="page page-narrow" role="alert">
        <Heading>{stale ? 'This page has been updated' : 'This page failed to load'}</Heading>
        <p className="lede">{stale ? 'A newer version of the site is available. Reload to get it.' : error.message}</p>
        <div className="actions actions-start">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
